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
