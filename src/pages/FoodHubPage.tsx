import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, ShoppingCart, CalendarDays, UtensilsCrossed, Store,
  ChevronRight, Plus, Package,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { getRecipes } from '@/services/recipes'
import { getShoppingLists } from '@/services/shoppingLists'
import { getMealPlans, getWeekDates } from '@/services/mealPlans'
import { getMealMenus } from '@/services/mealMenus'
import type { MealPlan, ShoppingList } from '@/types'

const TABS = [
  { key: 'overview', icon: UtensilsCrossed, labelKey: 'nav.home' },
  { key: 'recipes', icon: BookOpen, labelKey: 'food.recipes' },
  { key: 'essentials', icon: Package, labelKey: 'essentials.essentials' },
  { key: 'plan', icon: CalendarDays, labelKey: 'food.mealPlan' },
  { key: 'lists', icon: ShoppingCart, labelKey: 'food.lists' },
] as const

type TabKey = typeof TABS[number]['key']

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

export function FoodHubPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const navigate = useNavigate()
  const { activeCircle } = useAppStore()
  const { t } = useI18n()

  const { start, end, dates } = getWeekDates()

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
  })

  const { data: lists = [] } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  const { data: mealPlans = [] } = useQuery({
    queryKey: ['meal-plans', activeCircle?.id, start, end],
    queryFn: () => getMealPlans(activeCircle!.id, start, end),
    enabled: !!activeCircle,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['meal-menus', activeCircle?.id],
    queryFn: () => getMealMenus(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const activeLists = lists.filter((l: ShoppingList) => l.status === 'active')
  const recentRecipes = recipes.slice(0, 6)
  const foodRecipes = recipes.filter(r => r.type !== 'supply_kit')
  const essentials = recipes.filter(r => r.type === 'supply_kit')

  const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <motion.div
      className="px-4 py-4 space-y-4"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {t('food.title')}
        </h2>
      </motion.div>

      {/* Tab pills */}
      <motion.div variants={fadeUp} className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
        {TABS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0',
              activeTab === key
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </motion.div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
          {/* Quick action cards */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
            <Card
              variant="elevated"
              className="p-3.5 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-blue-50/50 dark:from-surface-dark-elevated dark:to-blue-950/10"
              onClick={() => navigate('/recipes/new')}
            >
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2">
                <BookOpen className="h-4.5 w-4.5 text-blue-500" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.addRecipe')}</p>
            </Card>
            <Card
              variant="elevated"
              className="p-3.5 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-emerald-50/50 dark:from-surface-dark-elevated dark:to-emerald-950/10"
              onClick={() => navigate('/lists/new')}
            >
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2">
                <ShoppingCart className="h-4.5 w-4.5 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.newList')}</p>
            </Card>
          </motion.div>

          {/* This Week meal plan preview */}
          <motion.section variants={fadeUp}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                {t('food.thisWeek')}
              </h3>
              <button
                onClick={() => navigate('/plan')}
                className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
              >
                {t('home.viewAll')}
                <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
              </button>
            </div>
            {mealPlans.length === 0 ? (
              <Card className="p-4 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/plan')}>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <CalendarDays className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t('food.noMealsPlanned')}</p>
                    <p className="text-xs text-slate-400">{t('food.startPlanning')}</p>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {dates.slice(0, 5).map((date, i) => {
                  const dayMeals = mealPlans.filter((mp: MealPlan) => mp.plan_date === date)
                  if (dayMeals.length === 0) return null
                  const isToday = date === new Date().toISOString().split('T')[0]
                  return (
                    <Card
                      key={date}
                      className={cn(
                        'p-2.5 cursor-pointer active:scale-[0.98]',
                        isToday && 'ring-1 ring-brand-500/30'
                      )}
                      onClick={() => navigate('/plan')}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 text-center shrink-0',
                          isToday ? 'text-brand-500 font-bold' : 'text-slate-400'
                        )}>
                          <div className="text-[10px] uppercase">{DAY_NAMES_SHORT[i]}</div>
                          <div className="text-sm">{date.split('-')[2]}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                            {dayMeals.map((mp: MealPlan) => (mp as any).recipe?.title || mp.recipe_id).join(', ')}
                          </p>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </motion.section>

          {/* Active Lists */}
          {activeLists.length > 0 && (
            <motion.section variants={fadeUp}>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                  {t('food.activeLists')}
                </h3>
                <button
                  onClick={() => navigate('/lists')}
                  className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
                >
                  {t('home.viewAll')}
                  <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
                </button>
              </div>
              <div className="space-y-1.5">
                {activeLists.slice(0, 3).map((list: ShoppingList) => (
                  <Card key={list.id} className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate(`/lists/${list.id}`)}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <ShoppingCart className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{list.name}</p>
                        <p className="text-xs text-slate-400">{list.item_count ?? 0} items</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
                    </div>
                  </Card>
                ))}
              </div>
            </motion.section>
          )}

          {/* Templates & Stores row */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
            <Card
              className="p-3.5 cursor-pointer active:scale-[0.97] transition-transform"
              onClick={() => navigate('/food/templates')}
            >
              <div className="flex items-center gap-2.5">
                <UtensilsCrossed className="h-4.5 w-4.5 text-brand-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('more.mealTemplates')}</p>
                  <p className="text-xs text-slate-400">{templates.length} templates</p>
                </div>
              </div>
            </Card>
            <Card
              className="p-3.5 cursor-pointer active:scale-[0.97] transition-transform"
              onClick={() => navigate('/food/stores')}
            >
              <div className="flex items-center gap-2.5">
                <Store className="h-4.5 w-4.5 text-brand-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('more.myStores')}</p>
                  <p className="text-xs text-slate-400">Sort by aisle</p>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {activeTab === 'recipes' && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
          {/* Sub-sections for Recipes vs Supply Kits */}
          <motion.div variants={fadeUp} className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('food.recipes')} ({foodRecipes.length})
            </h3>
            <button
              onClick={() => navigate('/recipes')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
            </button>
          </motion.div>
          <motion.div variants={fadeUp} className="space-y-1.5">
            {recentRecipes.slice(0, 5).map((recipe) => (
              <Card key={recipe.id} className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate(`/recipes/${recipe.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    {recipe.type === 'supply_kit' ? (
                      <Package className="h-4 w-4 text-amber-500" />
                    ) : (
                      <BookOpen className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{recipe.title}</p>
                    {recipe.tags?.length > 0 && (
                      <p className="text-xs text-slate-400 truncate">{recipe.tags.join(', ')}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
                </div>
              </Card>
            ))}
          </motion.div>
          <motion.div variants={fadeUp}>
            <Card
              variant="elevated"
              className="p-3.5 cursor-pointer active:scale-[0.97] text-center"
              onClick={() => navigate('/recipes')}
            >
              <p className="text-sm font-medium text-brand-500">
                {t('home.viewAll')} {t('food.recipes')} →
              </p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {activeTab === 'essentials' && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
          <motion.div variants={fadeUp} className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('essentials.essentials')} ({essentials.length})
            </h3>
            <button
              onClick={() => navigate('/recipes?view=essentials')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
            </button>
          </motion.div>

          <motion.div variants={fadeUp}>
            <Card
              variant="elevated"
              className="p-3.5 cursor-pointer active:scale-[0.97] bg-gradient-to-br from-white to-amber-50/50 dark:from-surface-dark-elevated dark:to-amber-950/10"
              onClick={() => navigate('/recipes/new-kit')}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('essentials.newEssentials')}</p>
              </div>
            </Card>
          </motion.div>

          {essentials.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Card className="p-4">
                <p className="text-sm text-slate-400 text-center">{t('essentials.addFirst')}</p>
              </Card>
            </motion.div>
          ) : (
            essentials.slice(0, 6).map((kit) => (
              <motion.div key={kit.id} variants={fadeUp}>
                <Card className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate(`/recipes/${kit.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Package className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{kit.title}</p>
                      {kit.kit_category && (
                        <p className="text-xs text-slate-400">{kit.kit_category}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </motion.div>
      )}

      {activeTab === 'plan' && (
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          {/* Quick navigate to full planner */}
          <div className="space-y-3">
            <Card
              variant="elevated"
              className="p-4 cursor-pointer active:scale-[0.97] bg-gradient-to-br from-white to-purple-50/50 dark:from-surface-dark-elevated dark:to-purple-950/10"
              onClick={() => navigate('/plan')}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <CalendarDays className="h-5 w-5 text-purple-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('plan.mealPlan')}</p>
                  <p className="text-xs text-slate-400">Open weekly planner</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 rtl-flip" />
              </div>
            </Card>

            <Card
              className="p-4 cursor-pointer active:scale-[0.97]"
              onClick={() => navigate('/food/templates')}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <UtensilsCrossed className="h-5 w-5 text-brand-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('more.mealTemplates')}</p>
                  <p className="text-xs text-slate-400">Taco Night, BBQ, etc.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 rtl-flip" />
              </div>
            </Card>
          </div>
        </motion.div>
      )}

      {activeTab === 'lists' && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          <motion.div variants={fadeUp}>
            <Card
              variant="elevated"
              className="p-3.5 cursor-pointer active:scale-[0.97] bg-gradient-to-br from-white to-emerald-50/50 dark:from-surface-dark-elevated dark:to-emerald-950/10"
              onClick={() => navigate('/lists/new')}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.newList')}</p>
              </div>
            </Card>
          </motion.div>

          {activeLists.map((list: ShoppingList) => (
            <motion.div key={list.id} variants={fadeUp}>
              <Card className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate(`/lists/${list.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <ShoppingCart className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{list.name}</p>
                    <p className="text-xs text-slate-400">{list.item_count ?? 0} items</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
                </div>
              </Card>
            </motion.div>
          ))}

          <motion.div variants={fadeUp}>
            <Card className="p-3.5 cursor-pointer active:scale-[0.97]" onClick={() => navigate('/lists')}>
              <p className="text-sm font-medium text-brand-500 text-center">
                {t('home.viewAll')} {t('food.lists')} →
              </p>
            </Card>
          </motion.div>

          {/* Stores shortcut */}
          <motion.div variants={fadeUp}>
            <Card className="p-3.5 cursor-pointer active:scale-[0.97]" onClick={() => navigate('/food/stores')}>
              <div className="flex items-center gap-3">
                <Store className="h-4.5 w-4.5 text-slate-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{t('more.myStores')}</p>
                  <p className="text-xs text-slate-400">Sort shopping by aisle</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 rtl-flip" />
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
