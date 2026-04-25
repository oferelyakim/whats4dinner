import { callOp } from '../ai/client'
import { z } from 'zod'
import type { Recipe } from '../types'

const ServerRecipeSchema = z.object({
  title: z.string().min(1),
  source: z.enum(['web', 'ai-fallback']),
  url: z.string().url().optional(),
  sourceDomain: z.string().optional(),
  ingredients: z
    .array(z.object({ item: z.string().min(1), quantity: z.string().optional() }))
    .min(1),
  steps: z.array(z.string().min(1)).min(1),
  prepTimeMin: z.number().int().nonnegative().optional(),
  cookTimeMin: z.number().int().nonnegative().optional(),
  servings: z.number().int().positive().optional(),
  imageUrl: z.string().url().optional(),
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

export async function findAndFetchRecipe(input: FetchRecipeInput): Promise<Omit<Recipe, 'id' | 'fetchedAt'>> {
  const res = await callOp('find-recipe', input, FetchResponseSchema)
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
