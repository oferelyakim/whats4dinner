import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, ShoppingCart, Copy, Download, Sparkles, ArrowLeft, ChevronDown, ChevronUp, Clipboard, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { MealPlanPreferencesDialog } from '@/components/ui/MealPlanPreferencesDialog'
import type { MealPlanPreferences } from '@/components/ui/MealPlanPreferencesDialog'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { getMyCircles } from '@/services/circles'
import type { Circle } from '@/types'
import { getMealPlans, setMealPlan, removeMealPlan, getWeekDates, copyWeekPlan, addMenuToPlan } from '@/services/mealPlans'
import { getRecipes, createRecipe } from '@/services/recipes'
import { getMealMenus } from '@/services/mealMenus'
import type { MealMenu, Recipe as RecipeType } from '@/types'
import { getShoppingLists, createShoppingList, addMealPlansToList } from '@/services/shoppingLists'
import { MEAL_TYPES, type MealType } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'
import { exportMealPlanToCalendar } from '@/lib/calendar'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { supabase } from '@/services/supabase'
import { logAIUsage } from '@/services/ai-usage'
import type { MealPlan, Recipe } from '@/types'

interface AIMealIngredient {
  name: string
  quantity: number | null
  unit: string
}

interface AIMealSuggestion {
  date: string
  meal_type: string
  recipe_title: string
  recipe_id: string | null
  quick_description?: string
  estimated_time_min?: number | null
  ingredients?: AIMealIngredient[]
  instructions?: string
  tags?: string[]
  servings?: number | null
}

// MEAL_LABELS moved inside component for i18n access

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  lunch: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  dinner: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  snack: 'bg-green-500/20 text-green-700 dark:text-green-400',
}

export function PlanPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle, setActiveCircle } = useAppStore()
  const { t, locale } = useI18n()
  const toast = useToast()

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'

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
  const ai = useAIAccess()
  const [aiPlan, setAiPlan] = useState<AIMealSuggestion[]>([])
  const [aiNotes, setAiNotes] = useState<string>('')
  const [aiShoppingSuggestions, setAiShoppingSuggestions] = useState<string[]>([])
  const [showAiReview, setShowAiReview] = useState(false)
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [copiedToClipboard, setCopiedToClipboard] = useState(false)
  const [acceptingPlan, setAcceptingPlan] = useState(false)

  const week = useMemo(() => {
    const ref = new Date()
    ref.setDate(ref.getDate() + weekOffset * 7)
    return getWeekDates(ref)
  }, [weekOffset])

  // Derive locale-aware short day names from week dates using Intl
  const dayNamesShort = week.dates.map((date) =>
    new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(new Date(date + 'T12:00:00'))
  )

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
    onError: (err: Error) => toast.error(err.message),
  })

  const addMenuMutation = useMutation({
    mutationFn: (menuId: string) =>
      addMenuToPlan(activeCircle!.id, selectedDate, selectedMealType, menuId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
      setShowAddMeal(false)
      setSearch('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: (planId: string) => removeMealPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
    },
    onError: (err: Error) => toast.error(err.message),
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
    onError: (err: Error) => toast.error(err.message),
  })

  async function handleAddWeekToList(listId: string) {
    setAddingToList(true)
    try {
      const planIds = plans.filter((p) => p.recipe_id).map((p) => p.id)
      if (planIds.length) {
        await addMealPlansToList(listId, planIds)
        queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setAddingToList(false)
      setShowAddToList(false)
    }
  }

  async function handleAddWeekToNewList() {
    if (!activeCircle) return
    setAddingToList(true)
    try {
      const list = await createShoppingList(`${weekLabel} Groceries`, activeCircle.id)
      const planIds = plans.filter((p) => p.recipe_id).map((p) => p.id)
      if (planIds.length) {
        await addMealPlansToList(list.id, planIds)
      }
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setAddingToList(false)
      setShowAddToList(false)
    }
  }

  // AI Meal Plan generation
  const generateAiPlan = useMutation({
    mutationFn: async (preferences: MealPlanPreferences) => {
      // Convert structured preferences into the format the edge function expects
      const dietaryString = preferences.dietary.length > 0 ? preferences.dietary.join(', ') : undefined
      const cuisineString = preferences.cuisines.length > 0 ? preferences.cuisines.join(', ') : undefined
      const skillLevel =
        preferences.cookingStyle === 'quick'
          ? 'beginner'
          : preferences.cookingStyle === 'gourmet'
            ? 'advanced'
            : preferences.cookingStyle === 'balanced'
              ? 'intermediate'
              : undefined
      const calorieTarget =
        preferences.calories === 'light'
          ? '~400 calories per meal'
          : preferences.calories === 'regular'
            ? '~600 calories per meal'
            : preferences.calories === 'hearty'
              ? '~800 calories per meal'
              : undefined

      const { data, error } = await supabase.functions.invoke('generate-meal-plan', {
        body: {
          circleId: activeCircle!.id,
          dates: week.dates,
          preferences: {
            dietary_restrictions: dietaryString,
            cuisine_preferences: cuisineString,
            skill_level: skillLevel,
            calorie_target: calorieTarget,
            special_requests: preferences.specialRequests || undefined,
          },
        },
      })
      if (error) throw error
      if (data?._ai_usage) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await logAIUsage(user.id, 'meal_plan', data._ai_usage.model, data._ai_usage.tokens_in, data._ai_usage.tokens_out, data._ai_usage.cost_usd)
        }
      }
      return {
        plan: data.plan as AIMealSuggestion[],
        notes: (data.notes as string) || '',
        shoppingSuggestions: (data.shopping_suggestions as string[]) || [],
      }
    },
    onSuccess: ({ plan, notes, shoppingSuggestions }) => {
      setAiPlan(plan)
      setAiNotes(notes)
      setAiShoppingSuggestions(shoppingSuggestions)
      setNotesExpanded(false)
      setCopiedToClipboard(false)
      setShowPreferencesDialog(false)
      setShowAiReview(true)
    },
    onError: (err: Error) => {
      setShowPreferencesDialog(false)
      toast.error(err.message)
    },
  })

  async function acceptAiPlan() {
    if (!activeCircle) return
    setAcceptingPlan(true)
    try {
      let newRecipesCreated = 0
      for (const item of aiPlan) {
        let recipeId = item.recipe_id

        // For AI-suggested new recipes (no existing recipe_id), create them first
        if (!recipeId) {
          const newRecipe = await createRecipe({
            title: item.recipe_title,
            instructions: item.instructions || '',
            tags: item.tags || [],
            servings: item.servings || undefined,
            circle_id: activeCircle.id,
            ingredients: (item.ingredients || []).map((ing, idx) => ({
              name: ing.name,
              quantity: ing.quantity ?? null,
              unit: (ing.unit || '') as import('@/lib/constants').Unit,
              sort_order: idx,
              notes: null,
              item_id: null,
            })),
          })
          recipeId = newRecipe.id
          newRecipesCreated++
        }

        await setMealPlan(activeCircle.id, item.date, item.meal_type as MealType, recipeId)
      }
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      setShowAiReview(false)
      setAiPlan([])
      setAiNotes('')
      setAiShoppingSuggestions([])

      if (newRecipesCreated > 0) {
        const message =
          newRecipesCreated === 1
            ? t('plan.createdNewRecipes').replace('{{count}}', '1')
            : t('plan.createdNewRecipesPlural').replace('{{count}}', String(newRecipesCreated))
        toast.success(message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setAcceptingPlan(false)
    }
  }

  async function handleAddShoppingSuggestionsToList() {
    if (!activeCircle || aiShoppingSuggestions.length === 0) return
    try {
      const list = await createShoppingList(`${weekLabel} AI Suggestions`, activeCircle.id)
      // Add each suggestion as a plain text item directly via supabase
      const { error: insertError } = await supabase.from('shopping_list_items').insert(
        aiShoppingSuggestions.map((suggestion, i) => ({
          list_id: list.id,
          name: suggestion,
          quantity: null,
          unit: '',
          checked: false,
          sort_order: i,
        }))
      )
      if (insertError) throw insertError
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      toast.success(t('plan.addedToList'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  async function handleCopyShoppingSuggestions() {
    const text = aiShoppingSuggestions.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedToClipboard(true)
      setTimeout(() => setCopiedToClipboard(false), 2000)
      toast.success(t('plan.copiedToClipboard'))
    } catch {
      toast.error(t('common.error'))
    }
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
  const weekLabel = formatWeekLabel(week.dates[0], week.dates[6], dateLocale)

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
      <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('plan.mealPlan')}</h2>
        {allCircles.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-12 w-12" />}
            title={t('plan.createCircleFirst')}
            description={t('plan.createCircleDesc')}
            action={
              <Button onClick={() => navigate('/profile/circles')}>
                {t('plan.goToCircles')}              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">{t('plan.selectCircle')}</p>
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
    <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">
          {t('plan.mealPlan')}
        </h2>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{weekLabel}</h2>
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
          <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
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

      {/* AI Meal Planning */}
      <button
        onClick={() => {
          if (!ai.checkAIAccess()) return
          setShowPreferencesDialog(true)
        }}
        disabled={generateAiPlan.isPending}
        className={cn(
          'w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-all text-start',
          'border-brand-300 dark:border-brand-700 bg-brand-500/5 hover:bg-brand-500/10',
          generateAiPlan.isPending && 'opacity-60'
        )}
      >
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center shrink-0">
          {generateAiPlan.isPending ? (
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {generateAiPlan.isPending ? t('common.loading') : t('ai.mealPlanPlaceholder')}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {generateAiPlan.isPending ? t('plan.generatingMeals') : t('ai.mealPlanPlaceholderDesc')}
          </p>
        </div>
        {!ai.hasAI && (
          <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full font-medium shrink-0">
            AI
          </span>
        )}
      </button>

      {/* Preferences dialog */}
      <MealPlanPreferencesDialog
        open={showPreferencesDialog}
        onOpenChange={setShowPreferencesDialog}
        loading={generateAiPlan.isPending}
        onGenerate={(prefs) => generateAiPlan.mutate(prefs)}
      />

      {/* AI Plan Review Dialog */}
      <Dialog.Root open={showAiReview} onOpenChange={setShowAiReview}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 start-0 end-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-3xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto focus:outline-none">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {t('plan.aiPlanTitle')}
            </Dialog.Title>
            <p className="text-sm text-slate-500 mb-4">{t('plan.aiPlanReviewDesc')}</p>

            {/* Collapsible notes section */}
            {aiNotes && (
              <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNotesExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-start"
                >
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-300 flex-1">
                    {t('plan.aiNotes')}
                  </span>
                  {notesExpanded
                    ? <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  }
                </button>
                {notesExpanded && (
                  <p className="px-3 pb-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    {aiNotes}
                  </p>
                )}
              </div>
            )}

            {/* Meal list */}
            <div className="space-y-2 mb-4">
              {aiPlan.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-surface-dark-overlay">
                  <div className="w-16 text-xs text-slate-400 shrink-0">
                    <div>{item.date.split('-')[2]}</div>
                    <div className="capitalize">{item.meal_type}</div>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">{item.recipe_title}</p>
                  {item.recipe_id ? (
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">
                      {t('plan.saved')}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full shrink-0">
                      {t('plan.newRecipe')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Shopping suggestions */}
            {aiShoppingSuggestions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {t('plan.aiShoppingSuggestions')}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={handleCopyShoppingSuggestions}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay transition-colors min-h-[32px]"
                    >
                      {copiedToClipboard
                        ? <Check className="h-3.5 w-3.5" />
                        : <Clipboard className="h-3.5 w-3.5" />
                      }
                      {t('plan.copyToClipboard')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddShoppingSuggestionsToList}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-500 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay transition-colors min-h-[32px]"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {t('plan.addToShoppingList')}
                    </button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {aiShoppingSuggestions.map((suggestion, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowAiReview(false)} disabled={acceptingPlan}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1" onClick={acceptAiPlan} loading={acceptingPlan}>
                {t('plan.acceptPlan')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AIUpgradeModal
        open={ai.showUpgradeModal}
        onOpenChange={ai.setShowUpgradeModal}
        isLimitReached={ai.isLimitReached}
      />

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
                  {dayNamesShort[i]}
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
                              {/* Issue 2: adequate touch target for X button */}
                              <button
                                onClick={() => removeMutation.mutate(plan.id)}
                                className="shrink-0 p-2 -m-2 opacity-60 hover:opacity-100 active:scale-90 transition-all"
                                aria-label={t('common.remove')}                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          {/* Issue 3: adequate touch target for "add more" button */}
                          <button
                            onClick={() => openAddMeal(date, mealType)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-brand-500 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            {t('plan.addMore')}                          </button>
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
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[70vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {t('plan.addMeal')} {MEAL_LABELS[selectedMealType]} {/* TODO: add i18n key for addMeal */}
            </Dialog.Title>
            <p className="text-xs text-slate-400 mb-4">
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(dateLocale, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })
                : ''}
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
                {t('plan.recipes')}              </button>
              <button
                onClick={() => setAddSource('templates')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                  addSource === 'templates' ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                )}
              >
                {t('plan.templates')}              </button>
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
                    {recipes.length === 0
                      ? t('plan.noRecipesYet') /* TODO: add i18n key */
                      : t('plan.noMatchingRecipes') /* TODO: add i18n key */}
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
                    {t('plan.noTemplatesYet')}                  </p>
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
                            {menu.recipes?.length || 0} {t('plan.recipesAddsAll')}                          </p>
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
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {t('plan.addIngredientsTitle')}            </Dialog.Title>
            <p className="text-xs text-slate-400 mb-4">
              {plans.filter((p) => p.recipe_id).length} {t('plan.plannedRecipesDedup')}            </p>
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
                <p className="text-sm font-medium text-brand-500">
                  {t('plan.createNewGroceryList')} "{weekLabel}"                </p>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function formatWeekLabel(start: string, end: string, dateLocale: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sMonth = s.toLocaleDateString(dateLocale, { month: 'short' })
  const eMonth = e.toLocaleDateString(dateLocale, { month: 'short' })

  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()} - ${e.getDate()}`
  }
  return `${sMonth} ${s.getDate()} - ${eMonth} ${e.getDate()}`
}
