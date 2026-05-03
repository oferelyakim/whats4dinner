// Shared helper for the seed-recipe-bank-*.mjs scripts. Writes a row to
// `ai_usage` with `action_type='bank_seed'` and `user_id=NULL` so the spend
// shows up on the admin dashboard at replanish.app/admin.
//
// Requires migration 042 to be applied (drops NOT NULL on ai_usage.user_id
// and widens the action_type CHECK to include `bank_seed`).

const HAIKU_PRICE_IN  = 1.0   // USD per 1M input tokens (Haiku 4.5)
const HAIKU_PRICE_OUT = 5.0   // USD per 1M output tokens

export async function logBankSeedUsage(sb, {
  tokensIn,
  tokensOut,
  feature,
  model = 'claude-haiku-4-5-20251001',
}) {
  if (!tokensIn && !tokensOut) return
  const cost = (tokensIn / 1_000_000) * HAIKU_PRICE_IN
             + (tokensOut / 1_000_000) * HAIKU_PRICE_OUT
  const { error } = await sb.from('ai_usage').insert({
    user_id: null,
    action_type: 'bank_seed',
    api_cost_usd: cost,
    model_used: model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    period_start: new Date().toISOString(),
    feature_context: feature,
  })
  if (error) console.warn('[bank-seed] usage log failed:', error.message)
}
