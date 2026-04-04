import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, ShoppingCart, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { getMealPlans, setMealPlan, removeMealPlan, getWeekDates, copyWeekPlan } from '@/services/mealPlans'
import { getRecipes } from '@/services/recipes'
import { getShoppingLists, createShoppingList, addMealPlansToList } from '@/services/shoppingLists'
import { MEAL_TYPES, type MealType } from '@/lib/constants'
import type { MealPlan, Recipe } from '@/types'

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  lunch: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  dinner: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  snack: 'bg-green-500/20 text-green-700 dark:text-green-400',
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function PlanPage() {
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const [weekOffset, setWeekOffset] = useState(0)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner')
  const [search, setSearch] = useState('')
  const [showAddToList, setShowAddToList] = useState(false)
  const [addingToList, setAddingToList] = useState(false)

  const week = useMemo(() => {
    const ref = new Date()
    ref.setDate(ref.getDate() + weekOffset * 7)
    return getWeekDates(ref)
  }, [weekOffset])

  const { data: plans = [] } = useQuery({
    queryKey: ['meal-plans', activeCircle?.id, week.start, week.end],
    queryFn: () => getMealPlans(activeCircle!.id, week.start, week.end),
    enabled: !!activeCircle,
  })

  const { data: lists = [] } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
    enabled: showAddToList,
  })

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
    enabled: showAddMeal,
  })

  const addMutation = useMutation({
    mutationFn: (recipeId: string) =>
      setMealPlan(activeCircle!.id, selectedDate, selectedMealType, recipeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
      setShowAddMeal(false)
      setSearch('')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (planId: string) => removeMealPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
    },
  })

  const copyMutation = useMutation({
    mutationFn: () => {
      const nextWeek = getWeekDates(new Date(new Date().setDate(new Date().getDate() + (weekOffset + 1) * 7)))
      return copyWeekPlan(activeCircle!.id, week.dates, nextWeek.dates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
      setWeekOffset((w) => w + 1)
    },
  })

  async function handleAddWeekToList(listId: string) {
    setAddingToList(true)
    const planIds = plans.filter((p) => p.recipe_id).map((p) => p.id)
    if (planIds.length) {
      await addMealPlansToList(listId, planIds)
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
    }
    setAddingToList(false)
    setShowAddToList(false)
  }

  async function handleAddWeekToNewList() {
    if (!activeCircle) return
    setAddingToList(true)
    const list = await createShoppingList(`${weekLabel} Groceries`, activeCircle.id)
    const planIds = plans.filter((p) => p.recipe_id).map((p) => p.id)
    if (planIds.length) {
      await addMealPlansToList(list.id, planIds)
    }
    queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
    setAddingToList(false)
    setShowAddToList(false)
  }

  function openAddMeal(date: string, mealType: MealType) {
    setSelectedDate(date)
    setSelectedMealType(mealType)
    setShowAddMeal(true)
    setSearch('')
  }

  // Group plans by date
  const plansByDate = plans.reduce<Record<string, MealPlan[]>>((acc, plan) => {
    if (!acc[plan.plan_date]) acc[plan.plan_date] = []
    acc[plan.plan_date].push(plan)
    return acc
  }, {})

  const today = new Date().toISOString().split('T')[0]
  const weekLabel = formatWeekLabel(week.dates[0], week.dates[6])

  const filteredRecipes = search
    ? recipes.filter((r: Recipe) => r.title.toLowerCase().includes(search.toLowerCase()))
    : recipes

  if (!activeCircle) {
    return (
      <div className="px-4 py-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Meal Plan</h2>
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title="Select a circle first"
          description="Go to More > My Circles and create or select a circle to start planning meals"
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{weekLabel}</h2>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-brand-500 font-medium"
            >
              Back to this week
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Action buttons */}
      {plans.length > 0 && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => setShowAddToList(true)}
          >
            <ShoppingCart className="h-4 w-4" />
            Add Week to List
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
          >
            <Copy className="h-4 w-4" />
            {copyMutation.isPending ? 'Copying...' : 'Copy to Next Week'}
          </Button>
        </div>
      )}

      {/* Day columns */}
      <div className="space-y-3">
        {week.dates.map((date, i) => {
          const dayPlans = plansByDate[date] ?? []
          const isToday = date === today
          const dayNum = new Date(date + 'T12:00:00').getDate()

          return (
            <Card
              key={date}
              className={cn('p-3', isToday && 'ring-2 ring-brand-500')}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    'text-xs font-bold w-8',
                    isToday ? 'text-brand-500' : 'text-slate-400'
                  )}
                >
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={cn(
                    'text-xs',
                    isToday ? 'text-brand-500 font-bold' : 'text-slate-500'
                  )}
                >
                  {dayNum}
                </span>
                {isToday && (
                  <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                    Today
                  </span>
                )}
              </div>

              {/* Meal slots */}
              <div className="space-y-1.5">
                {MEAL_TYPES.map((mealType) => {
                  const plan = dayPlans.find((p) => p.meal_type === mealType)

                  return plan ? (
                    <div
                      key={mealType}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs',
                        MEAL_COLORS[mealType]
                      )}
                    >
                      <span className="font-medium shrink-0">{MEAL_LABELS[mealType]}:</span>
                      <span className="flex-1 truncate">
                        {plan.recipe?.title ?? plan.menu?.name ?? plan.notes ?? ''}
                      </span>
                      <button
                        onClick={() => removeMutation.mutate(plan.id)}
                        className="shrink-0 opacity-60 hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      key={mealType}
                      onClick={() => openAddMeal(date, mealType)}
                      className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{MEAL_LABELS[mealType]}</span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Add Meal Dialog */}
      <Dialog.Root open={showAddMeal} onOpenChange={setShowAddMeal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[70vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Add {MEAL_LABELS[selectedMealType]}
            </Dialog.Title>
            <p className="text-xs text-slate-400 mb-4">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>

            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-3"
            />

            {filteredRecipes.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                {recipes.length === 0 ? 'No recipes yet. Add some first!' : 'No matching recipes'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filteredRecipes.map((recipe: Recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => addMutation.mutate(recipe.id)}
                    disabled={addMutation.isPending}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-surface-dark-overlay active:scale-[0.98] transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {recipe.title}
                      </p>
                      {recipe.tags?.length > 0 && (
                        <p className="text-[10px] text-slate-400 truncate">
                          {recipe.tags.join(', ')}
                        </p>
                      )}
                    </div>
                    <Plus className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Week to List Dialog */}
      <Dialog.Root open={showAddToList} onOpenChange={setShowAddToList}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Add Week's Ingredients to List
            </Dialog.Title>
            <p className="text-xs text-slate-400 mb-4">
              All ingredients from {plans.filter((p) => p.recipe_id).length} planned recipes will be added and deduplicated.
            </p>
            <div className="space-y-2">
              {lists.filter((l) => l.status === 'active').map((list) => (
                <button
                  key={list.id}
                  onClick={() => handleAddWeekToList(list.id)}
                  disabled={addingToList}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-left active:scale-[0.98] transition-all hover:border-brand-500"
                >
                  <ShoppingCart className="h-5 w-5 text-slate-400 shrink-0" />
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1 truncate">{list.name}</p>
                  <Plus className="h-4 w-4 text-slate-400" />
                </button>
              ))}
              <button
                onClick={handleAddWeekToNewList}
                disabled={addingToList}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-left active:scale-[0.98]"
              >
                <Plus className="h-5 w-5 text-brand-500" />
                <p className="text-sm font-medium text-brand-500">Create "{weekLabel} Groceries" list</p>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function formatWeekLabel(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' })

  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()} - ${e.getDate()}`
  }
  return `${sMonth} ${s.getDate()} - ${eMonth} ${e.getDate()}`
}
