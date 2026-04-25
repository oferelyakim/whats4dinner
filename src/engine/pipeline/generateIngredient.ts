import { callOp } from '../ai/client'
import { IngredientResultSchema, type IngredientResult } from '../ai/schemas'
import type { SlotEnvelopeSnapshot } from '../types'

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
  envelope: SlotEnvelopeSnapshot
}

export async function generateIngredient(
  input: IngredientInput,
  signal?: AbortSignal,
): Promise<IngredientResult> {
  return await callOp('ingredient', input, IngredientResultSchema, signal)
}
