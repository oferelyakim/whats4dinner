import { callOp } from '../ai/client'
import { z } from 'zod'
import type { Recipe } from '../types'

// Lenient on numeric + url fields — see schemas.ts for rationale.
// `composed` is the v1.16.0 last-resort source flag (Sonnet-generated when
// web search yields nothing usable).
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

const ServerRecipeSchema = z.object({
  title: z.string().min(1),
  source: z.enum(['web', 'ai-fallback', 'composed']),
  url: z.string().url().optional().catch(undefined),
  sourceDomain: z.string().optional(),
  ingredients: z
    .array(z.object({ item: z.string().min(1), quantity: z.string().optional() }))
    .min(1),
  steps: z.array(z.string().min(1)).min(1),
  prepTimeMin: z.coerce.number().int().nonnegative().max(1440).optional().catch(undefined),
  cookTimeMin: z.coerce.number().int().nonnegative().max(1440).optional().catch(undefined),
  servings: z.coerce.number().int().positive().max(100).optional().catch(undefined),
  imageUrl: SafeImageUrl.optional().catch(undefined),
})

const FetchResponseSchema = z.object({
  recipe: ServerRecipeSchema,
})

export interface FetchRecipeInput {
  dishName: string
  searchKeywords: string[]
  dietaryConstraints?: string[]
  notes?: string
}

export type ServerRecipe = z.infer<typeof ServerRecipeSchema>

export async function findAndFetchRecipe(
  input: FetchRecipeInput,
  signal?: AbortSignal,
): Promise<Omit<Recipe, 'id' | 'fetchedAt'>> {
  const res = await callOp('find-recipe', input, FetchResponseSchema, signal)
  return {
    title: res.recipe.title,
    source: res.recipe.source,
    url: res.recipe.url,
    sourceDomain: res.recipe.sourceDomain,
    ingredients: res.recipe.ingredients,
    steps: res.recipe.steps,
    prepTimeMin: res.recipe.prepTimeMin,
    cookTimeMin: res.recipe.cookTimeMin,
    servings: res.recipe.servings,
    imageUrl: res.recipe.imageUrl,
  }
}
