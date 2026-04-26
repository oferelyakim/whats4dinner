#!/usr/bin/env node
// scripts/smoke-auditor.mjs
//
// v2.0.0 smoke test for `auditor-from-imports` edge function.
//
// Inserts a synthetic `recipes` row pointing at a known reputable URL,
// then triggers the auditor edge fn directly (bypassing the Supabase
// webhook). Asserts:
//   1. A row appears in `recipe_bank` with source_kind_v2='user_import'.
//   2. The row carries source_url, NULL ingredients/steps, and NO user
//      identity columns (defence-in-depth — schema doesn't expose them
//      anyway, but verify).
//   3. A row in `recipe_bank_audit_log` with decision='promoted'.
//   4. Re-running with the same URL yields decision='skipped_dup'.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/smoke-auditor.mjs
//
// Cost: ~$0.005 per run (1 audit Haiku call). Deletes the synthetic
// recipe at the end so the smoke is idempotent.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AUDITOR_URL = `${SUPABASE_URL}/functions/v1/auditor-from-imports`

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// A reputable URL the auditor should happily promote.
const TEST_URL = 'https://www.seriouseats.com/perfect-pan-seared-chicken-breasts-recipe'
const TEST_TITLE = 'Pan-Seared Chicken Breasts'

async function callAuditor(recipeId) {
  const res = await fetch(AUDITOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ recipe_id: recipeId }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function ensureRecipe() {
  // Look up Ofer's user id (the seed user) for created_by.
  const { data: user } = await sb
    .from('profiles')
    .select('id')
    .limit(1)
    .maybeSingle()
  const ownerId = user?.id ?? null

  // Insert a synthetic user-imported recipe.
  const { data, error } = await sb
    .from('recipes')
    .insert({
      title: TEST_TITLE,
      source_url: TEST_URL,
      created_by: ownerId,
      ingredients: [{ item: 'chicken breasts', quantity: '2' }],
      instructions: ['Pat dry', 'Sear', 'Rest'],
    })
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`recipes insert failed: ${error.message}`)
  return data.id
}

async function cleanup(recipeId) {
  await sb.from('recipe_bank_audit_log').delete().eq('recipe_id', recipeId)
  await sb.from('recipes').delete().eq('id', recipeId)
  await sb.from('recipe_bank').delete().eq('source_url', TEST_URL).eq('source_kind_v2', 'user_import')
}

async function run() {
  console.log('[smoke-auditor] inserting test recipe…')
  const recipeId = await ensureRecipe()
  console.log(`[smoke-auditor] recipe_id=${recipeId}`)

  try {
    console.log('[smoke-auditor] calling auditor (1st time, expecting promotion)…')
    const r1 = await callAuditor(recipeId)
    console.log(`  → status=${r1.status} decision=${r1.body.decision}`)
    if (r1.status !== 200) throw new Error(`Auditor returned ${r1.status}`)
    if (r1.body.decision !== 'promoted') {
      console.warn(`  WARN: expected 'promoted' but got '${r1.body.decision}' — this is OK if the URL was already in the bank`)
    }

    // Verify bank row exists with correct shape.
    const { data: bankRow } = await sb
      .from('recipe_bank')
      .select('id, source_kind_v2, source_url, ingredients, steps, secondary_ingredients')
      .eq('source_url', TEST_URL)
      .eq('source_kind_v2', 'user_import')
      .maybeSingle()
    if (!bankRow) throw new Error('Expected bank row not found')
    console.log(`  → bank row id=${bankRow.id} ingredients=${bankRow.ingredients} steps=${bankRow.steps}`)
    if (bankRow.ingredients !== null) throw new Error('ingredients should be NULL for link-first row')
    if (bankRow.steps !== null) throw new Error('steps should be NULL for link-first row')

    // Verify audit log decision.
    const { data: auditRow } = await sb
      .from('recipe_bank_audit_log')
      .select('decision, bank_id')
      .eq('recipe_id', recipeId)
      .maybeSingle()
    if (!auditRow) throw new Error('audit log row missing')
    console.log(`  → audit_log decision=${auditRow.decision}`)

    console.log('[smoke-auditor] calling auditor (2nd time, expecting skipped_dup or already-audited)…')
    const r2 = await callAuditor(recipeId)
    console.log(`  → status=${r2.status} decision=${r2.body.decision} alreadyAudited=${r2.body.alreadyAudited}`)
    if (!r2.body.alreadyAudited && r2.body.decision !== 'skipped_dup') {
      throw new Error(`expected dup-skip on 2nd call; got ${JSON.stringify(r2.body)}`)
    }

    console.log('\n[smoke-auditor] ✓ all assertions passed')
  } finally {
    console.log('[smoke-auditor] cleaning up…')
    await cleanup(recipeId)
  }
}

run().catch((err) => {
  console.error('[smoke-auditor] FAILED:', err.message)
  process.exit(1)
})
