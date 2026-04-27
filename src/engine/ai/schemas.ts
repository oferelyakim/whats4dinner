import { z } from 'zod'

export const IngredientResultSchema = z.object({
  ingredient: z.string().min(1),
  rationale: z.string().optional().default(''),
})
export type IngredientResult = z.infer<typeof IngredientResultSchema>

// Lenient: dedup + fall back to dishName if zero keywords. Server-side
// edge function also dedups — this is belt-and-braces.
export const DishResultSchema = z
  .object({
    dishName: z.string().min(1),
    searchKeywords: z.array(z.string().min(1)).default([]),
  })
  .transform(({ dishName, searchKeywords }) => {
    const seen = new Set<string>()
    const dedup: string[] = []
    for (const s of searchKeywords) {
      const k = s.trim().toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k)
      dedup.push(s.trim())
    }
    const finalKeywords = dedup.length > 0 ? dedup.slice(0, 5) : [dishName]
    return { dishName, searchKeywords: finalKeywords }
  })
export type DishResult = z.infer<typeof DishResultSchema>

export const RankResultSchema = z.object({
  bestIndex: z.number().int().min(0),
  reason: z.string().optional().default(''),
})
export type RankResult = z.infer<typeof RankResultSchema>

// v1.19.0 — day-plan op output: one entry per slot, in input order.
// Lenient on searchKeywords (mirrors DishResultSchema).
export const DayPlanResultSchema = z.object({
  slots: z
    .array(
      z.object({
        slotId: z.string().min(1),
        ingredient: z.string().min(1),
        dishName: z.string().min(1),
        searchKeywords: z.array(z.string().min(1)).default([]),
        rationale: z.string().optional().default(''),
      }),
    )
    .default([]),
})
export type DayPlanResult = z.infer<typeof DayPlanResultSchema>

// Lenient on numeric + url fields: any malformed value collapses to `undefined`
// instead of failing the whole-recipe parse. Server should normalize first
// (see `repairAndValidate` in supabase/functions/meal-engine/index.ts), but
// this is the client-side last line of defence.
//
// imageUrl additionally rejects unsafe schemes (javascript:, vbscript:,
// file:, data: > 16KB) — defence-in-depth even if the server were ever
// compromised. http, https, and small data URIs pass through.
const SafeImageUrl = z
  .string()
  .url()
  .refine(
    (s) => {
      const lower = s.toLowerCase()
      if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('file:')) {
        return false
      }
      if (lower.startsWith('data:') && s.length > 16_000) return false
      return true
    },
    { message: 'unsafe scheme' },
  )

export const ExtractRecipeSchema = z.object({
  title: z.string().min(1),
  ingredients: z
    .array(
      z.object({
        item: z.string().min(1),
        quantity: z.string().optional(),
      }),
    )
    .min(1),
  steps: z.array(z.string().min(1)).min(1),
  prepTimeMin: z.coerce.number().int().nonnegative().max(1440).optional().catch(undefined),
  cookTimeMin: z.coerce.number().int().nonnegative().max(1440).optional().catch(undefined),
  servings: z.coerce.number().int().positive().max(100).optional().catch(undefined),
  imageUrl: SafeImageUrl.optional().catch(undefined),
})
export type ExtractedRecipe = z.infer<typeof ExtractRecipeSchema>

export const SearchUrlsSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().url(),
        snippet: z.string().optional().default(''),
      }),
    )
    .max(12),
})
export type SearchUrlsResult = z.infer<typeof SearchUrlsSchema>

// ─── v2.0.0 — Interview ops ────────────────────────────────────────────────
//
// The MealPlannerInterview makes at most TWO Anthropic calls per session:
// 1. parse-intake — turns the user's freeform blurb into a skip-list +
//    prefilled answers so we don't re-ask what they already said.
// 2. propose-plan — turns the final answer map into per-slot dish-name
//    candidates that the engine looks up against the bank.

export const SKIPPABLE_QUESTION_IDS = [
  'q_headcount',
  'q_dietary',
  'q_dislikes',
  'q_prep_time',
  'q_calories',
  'q_cooking_skill',
  'q_themes',
  'q_preset_per_day',
] as const
export type SkippableQuestionId = (typeof SKIPPABLE_QUESTION_IDS)[number]

export const THEME_PRESET_IDS = [
  'meatless-monday',
  'taco-tuesday',
  'pasta-wednesday',
  'pizza-friday',
  'slow-cooker',
  'one-pot',
  'burger',
  'greek',
  'asian',
] as const
export type ThemePresetId = (typeof THEME_PRESET_IDS)[number]

/**
 * parse-intake op output. All fields lenient — model may return partial /
 * empty objects when freeform is sparse; the runtime falls back to asking
 * the question rather than inventing answers.
 */
export const IntakeParseResultSchema = z.object({
  skip: z
    .array(z.string())
    .default([])
    .transform((arr) => arr.filter((s): s is SkippableQuestionId =>
      (SKIPPABLE_QUESTION_IDS as readonly string[]).includes(s),
    )),
  prefill: z
    .object({
      headcountAdults: z.coerce.number().int().min(1).max(50).optional().catch(undefined),
      headcountKids: z.coerce.number().int().min(0).max(20).optional().catch(undefined),
      diets: z.array(z.string().min(1)).default([]),
      dislikes: z.array(z.string().min(1)).default([]),
      maxPrepMin: z.coerce.number().int().min(5).max(240).optional().catch(undefined),
      calories: z.enum(['light', 'balanced', 'hearty']).optional().catch(undefined),
      skill: z.enum(['easy', 'normal', 'challenge']).optional().catch(undefined),
      themes: z
        .array(z.string())
        .default([])
        .transform((arr) => arr.filter((s): s is ThemePresetId =>
          (THEME_PRESET_IDS as readonly string[]).includes(s),
        )),
    })
    .default({ diets: [], dislikes: [], themes: [] }),
})
export type IntakeParseResult = z.infer<typeof IntakeParseResultSchema>

/**
 * propose-plan op output. Per-slot candidate dish names (1-3 each). The
 * engine matches each candidate against the bank with `tryFillSlotFromBank`
 * using the candidate as a `replaceHint`. First hit wins. Misses fall through
 * to the existing async worker queue.
 */
export const ProposePlanResultSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().min(1),
        theme: z.string().nullable().optional().catch(null),
        // v2.5.0: tighten — `meals` and `slots` MUST be non-empty. v2.3 + v2.4
        // guarded these at runtime but the schema kept them lax, so a malformed
        // Anthropic response (e.g. `meals: [{type:'Dinner', slots: []}]`) would
        // pass parse, slip past the meal-level guard, and render a blank
        // dialog (day header + meal type label + zero rows). Strict at parse
        // time → fails into the catch block + retry CTA cleanly.
        meals: z
          .array(
            z.object({
              type: z.string().min(1),
              slots: z
                .array(
                  z.object({
                    role: z.string().min(1),
                    candidates: z.array(z.string().min(1)).min(1).max(3),
                  }),
                )
                .min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
})
export type ProposePlanResult = z.infer<typeof ProposePlanResultSchema>
