import Dexie, { type Table } from 'dexie'
import type { MealPlan, Day, Meal, Slot, Recipe, Preset, MealType, UserPreferences } from './types'

export class MealEngineDB extends Dexie {
  plans!: Table<MealPlan, string>
  days!: Table<Day, string>
  meals!: Table<Meal, string>
  slots!: Table<Slot, string>
  recipes!: Table<Recipe, string>
  presets!: Table<Preset, string>
  mealTypes!: Table<MealType, string>
  prefs!: Table<UserPreferences, string>

  constructor() {
    super('replanish-meal-engine')
    this.version(1).stores({
      plans: 'id, weekStart, updatedAt',
      days: 'id, planId, date, position',
      meals: 'id, dayId, type, position',
      slots: 'id, mealId, status, position, recipeId, locked, updatedAt',
      recipes: 'id, sourceDomain, fetchedAt',
      presets: 'id, scope, source, name',
      mealTypes: 'id, name',
      prefs: 'id',
    })
  }
}

export const db = new MealEngineDB()
