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
  prepTimeMin: z.number().int().nonnegative().optional(),
  cookTimeMin: z.number().int().nonnegative().optional(),
  servings: z.number().int().positive().optional(),
  imageUrl: z.string().url().optional(),
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
