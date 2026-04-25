import { z } from 'zod'

export const IngredientResultSchema = z.object({
  ingredient: z.string().min(1),
  rationale: z.string().optional().default(''),
})
export type IngredientResult = z.infer<typeof IngredientResultSchema>

export const DishResultSchema = z.object({
  dishName: z.string().min(1),
  searchKeywords: z.array(z.string().min(1)).min(1).max(8),
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
