import { callOp } from '../ai/client'
import { DishResultSchema, type DishResult } from '../ai/schemas'
import type { SlotEnvelopeSnapshot } from '../types'

export interface DishInput {
  mealType: string
  slotRole: string
  ingredient: string
  theme?: string
  dietaryConstraints: string[]
  notes?: string
  recentDishes: string[]
  envelope: SlotEnvelopeSnapshot
}

export async function generateDish(input: DishInput, signal?: AbortSignal): Promise<DishResult> {
  return await callOp('dish', input, DishResultSchema, signal)
}
