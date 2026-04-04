import { supabase } from './supabase'
import type { MealPlan } from '@/types'

export async function getMealPlans(circleId: string, startDate: string, endDate: string): Promise<MealPlan[]> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*, recipe:recipes(id, title, prep_time_min, cook_time_min, tags), menu:meal_menus(id, name)')
    .eq('circle_id', circleId)
    .gte('plan_date', startDate)
    .lte('plan_date', endDate)
    .order('plan_date')

  if (error) throw error
  return data as MealPlan[]
}

export async function setMealPlan(
  circleId: string,
  planDate: string,
  mealType: string,
  recipeId?: string,
  menuId?: string,
  notes?: string
): Promise<MealPlan> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('meal_plans')
    .upsert(
      {
        circle_id: circleId,
        plan_date: planDate,
        meal_type: mealType,
        recipe_id: recipeId || null,
        menu_id: menuId || null,
        notes: notes || null,
        created_by: user.id,
      },
      { onConflict: 'circle_id,plan_date,meal_type' }
    )
    .select('*, recipe:recipes(id, title, prep_time_min, cook_time_min, tags)')
    .single()

  if (error) throw error
  return data as MealPlan
}

export async function removeMealPlan(planId: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('id', planId)
  if (error) throw error
}

// Copy a week's meal plan to another week
export async function copyWeekPlan(
  circleId: string,
  sourceDates: string[],
  targetDates: string[]
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: sourcePlans } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('circle_id', circleId)
    .in('plan_date', sourceDates)

  if (!sourcePlans?.length) return

  const newPlans = sourcePlans.map((plan) => {
    const sourceIdx = sourceDates.indexOf(plan.plan_date)
    return {
      circle_id: circleId,
      plan_date: targetDates[sourceIdx],
      meal_type: plan.meal_type,
      recipe_id: plan.recipe_id,
      menu_id: plan.menu_id,
      notes: plan.notes,
      created_by: user.id,
    }
  })

  const { error } = await supabase
    .from('meal_plans')
    .upsert(newPlans, { onConflict: 'circle_id,plan_date,meal_type' })

  if (error) throw error
}

// Helper to get date range for a week
export function getWeekDates(referenceDate: Date = new Date()): { start: string; end: string; dates: string[] } {
  const d = new Date(referenceDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  const monday = new Date(d.setDate(diff))

  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    dates.push(date.toISOString().split('T')[0])
  }

  return {
    start: dates[0],
    end: dates[6],
    dates,
  }
}
