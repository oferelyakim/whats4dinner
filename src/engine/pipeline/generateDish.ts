import { callOp } from '../ai/client'
import { DishResultSchema, type DishResult } from '../ai/schemas'

export interface DishInput {
  mealType: string
  slotRole: string
  ingredient: string
  theme?: string
  dietaryConstraints: string[]
  notes?: string
}

export async function generateDish(input: DishInput): Promise<DishResult> {
  return await callOp('dish', input, DishResultSchema)
}
