import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, ShoppingCart, Copy, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { getMyCircles } from '@/services/circles'
import type { Circle } from '@/types'
import { getMealPlans, setMealPlan, removeMealPlan, getWeekDates, copyWeekPlan, addMenuToPlan } from '@/services/mealPlans'
import { getRecipes } from '@/services/recipes'
import { getMealMenus } from '@/services/mealMenus'
import type { MealMenu, Recipe as RecipeType } from '@/types'
import { getShoppingLists, createShoppingList, addMealPlansToList } from '@/services/shoppingLists'
import { MEAL_TYPES, type MealType } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'
import { exportMealPlanToCalendar } from '@/lib/calendar'
import type { MealPlan, Recipe } from '@/types'

// MEAL_LABELS moved inside component for i18n access

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  lunch: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  dinner: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  snack: 'bg-green-500/20 text-green-700 dark:text-green-400',
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function PlanPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle, setActiveCircle } = useAppStore()
  const { t } = useI18n()

  const MEAL_LABELS: Record<MealType, string> = {
    breakfast: t('plan.breakfast'),
    lunch: t('plan.lunch'),
    dinner: t('plan.dinner'),
    snack: t('plan.snack'),
  }
  const [weekOffset, setWeekOffset] = useState(0)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner')
  const [search, setSearch] = useState('')
  const [addSource, setAddSource] = useState<'recipes' | 'templates'>('recipes')
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

  const { data: menus = [] } = useQuery({
    queryKey: ['meal-menus', activeCircle?.id],
    queryFn: () => getMealMenus(activeCircle?.id),
    enabled: showAddMeal && addSource === 'templates',
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

  const addMenuMutation = useMutation({
    mutationFn: (menuId: string) =>
      addMenuToPlan(activeCircle!.id, selectedDate, selectedMealType, menuId),
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

  const { data: allCircles = [] } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
    enabled: !activeCircle,
  })

  // Auto-select first circle if none active
  if (!activeCircle && allCircles.length > 0) {
    setActiveCircle(allCircles[0])
  }

  if (!activeCircle) {
    return (
      <div className="px-4 py-4 space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('plan.mealPlan')}</h2>
        {allCircles.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-12 w-12" />}
            title="Create a circle first"
            description="Meal plans are shared within circles. Create one for your family to start planning."
            action={
              <Button onClick={() => navigate('/more/circles')}>
                Go to Circles
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Select a circle to plan meals for:</p>
            {allCircles.map((circle: Circle) => (
              <Card
                key={circle.id}
                variant="elevated"
                className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => setActiveCircle(circle)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{circle.icon}</span>
                  <p className="font-semibold text-slate-900 dark:text-white">{circle.name}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
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
              {t('plan.backToThisWeek')}
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
            {t('plan.addWeekToList')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending}
          >
            <Copy className="h-4 w-4" />
            {copyMutation.isPending ? t('common.loading') : t('plan.copyToNextWeek')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => exportMealPlanToCalendar(plans)}
          >
            <Download className="h-4 w-4" />
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
                    {t('plan.today')}
                  </span>
                )}
              </div>

              {/* Meal slots */}
              <div className="space-y-1.5">
                {MEAL_TYPES.map((mealType) => {
                  const slotPlans = dayPlans.filter((p) => p.meal_type === mealType)

                  return (
                    <div key={mealType}>
                      {slotPlans.length > 0 ? (
                        <div className="space-y-0.5">
                          {slotPlans.map((plan, idx) => (
                            <div
                              key={plan.id}
                              className={cn(
                                'flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs',
                                MEAL_COLORS[mealType]
                              )}
                            >
                              {idx === 0 && <span className="font-medium shrink-0">{MEAL_LABELS[mealType]}:</span>}
                              {idx > 0 && <span className="shrink-0 w-[calc(3ch+0.5rem)]" />}
                              <span className="flex-1 truncate">
                                {plan.recipe?.title ?? plan.menu?.name ?? plan.notes ?? ''}
                              </span>
                              <button
                                onClick={() => removeMutation.mutate(plan.id)}
                                className="shrink-0 opacity-60 hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {/* Add more to this slot */}
                          <button
                            onClick={() => openAddMeal(date, mealType)}
                            className="flex items-center gap-1 px-2.5 py-0.5 text-[10px] text-slate-400 hover:text-brand-500 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            add more
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => openAddMeal(date, mealType)}
                          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          <span>{MEAL_LABELS[mealType]}</span>
                        </button>
                      )}
                    </div>
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

            {/* Recipes / Templates toggle */}
            <div className="flex gap-1 bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5 mb-3">
              <button
                onClick={() => setAddSource('recipes')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                  addSource === 'recipes' ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                )}
              >
                Recipes
              </button>
              <button
                onClick={() => setAddSource('templates')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                  addSource === 'templates' ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                )}
              >
                Templates
              </button>
            </div>

            <input
              type="text"
              placeholder={t('recipe.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-3"
            />

            {addSource === 'recipes' ? (
              <>
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
              </>
            ) : (
              <>
                {menus.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No templates yet. Create one in More &gt; Meal Templates.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {menus
                      .filter((m: MealMenu & { recipes: RecipeType[] }) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
                      .map((menu: MealMenu & { recipes: RecipeType[] }) => (
                      <button
                        key={menu.id}
                        onClick={() => addMenuMutation.mutate(menu.id)}
                        disabled={addMenuMutation.isPending}
                        className="w-full flex items-start gap-3 p-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-surface-dark-overlay active:scale-[0.98] transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {menu.name}
                          </p>
                          {menu.recipes?.length > 0 && (
                            <p className="text-[10px] text-slate-400 truncate">
                              {menu.recipes.map((r: RecipeType) => r.title).join(', ')}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {menu.recipes?.length || 0} recipes - adds all to this slot
                          </p>
                        </div>
                        <Plus className="h-4 w-4 text-slate-400 shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                )}
              </>
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
