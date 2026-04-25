import { callOp } from '../ai/client'
import { IngredientResultSchema, type IngredientResult } from '../ai/schemas'

export interface IngredientInput {
  mealType: string
  slotRole: string
  theme?: string
  dietaryConstraints: string[]
  pantryItems: string[]
  dislikedIngredients: string[]
  recentDishes: string[]
  notes?: string
  siblingSlots: { role: string; ingredient?: string }[]
}

export async function generateIngredient(input: IngredientInput): Promise<IngredientResult> {
  return await callOp('ingredient', input, IngredientResultSchema)
}
