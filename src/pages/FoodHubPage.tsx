import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, ShoppingCart, CalendarDays, UtensilsCrossed, Store,
  ChevronRight, Package,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { getShoppingLists } from '@/services/shoppingLists'
import { getMealPlans, getWeekDates } from '@/services/mealPlans'
import { getMealMenus } from '@/services/mealMenus'
import type { MealPlan, ShoppingList } from '@/types'

const TABS = [
  { key: 'overview', icon: UtensilsCrossed, labelKey: 'nav.home' },
  { key: 'recipes', icon: BookOpen, labelKey: 'food.recipes', href: '/recipes' },
  { key: 'essentials', icon: Package, labelKey: 'essentials.essentials', href: '/recipes?view=essentials' },
  { key: 'plan', icon: CalendarDays, labelKey: 'food.mealPlan', href: '/plan' },
  { key: 'lists', icon: ShoppingCart, labelKey: 'food.lists', href: '/lists' },
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
  const { t, locale } = useI18n()

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'

  const { start, end, dates } = getWeekDates()

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

  // Derive locale-aware short day names from the week dates using Intl
  const dayNamesShort = dates.slice(0, 7).map((date) =>
    new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(new Date(date + 'T12:00:00'))
  )

  return (
    <motion.div
      className="px-4 py-4 space-y-4"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">
          {t('food.title')}
        </h2>
      </motion.div>

      {/* Tab pills */}
      <motion.div variants={fadeUp} className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
        {TABS.map(({ key, icon: Icon, labelKey, ...rest }) => (
          <button
            key={key}
            onClick={() => 'href' in rest && rest.href ? navigate(rest.href) : setActiveTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 min-h-[44px]',
              activeTab === key
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-surface-dark-overlay text-rp-ink-soft'
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
              className="p-3.5 cursor-pointer active:scale-[0.97] transition-transform"
              onClick={() => navigate('/recipes/new')}
            >
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2">
                <BookOpen className="h-4.5 w-4.5 text-blue-500" />
              </div>
              <p className="text-sm font-semibold text-rp-ink">{t('action.addRecipe')}</p>
            </Card>
            <Card
              variant="elevated"
              className="p-3.5 cursor-pointer active:scale-[0.97] transition-transform"
              onClick={() => navigate('/lists/new')}
            >
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2">
                <ShoppingCart className="h-4.5 w-4.5 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-rp-ink">{t('action.newList')}</p>
            </Card>
          </motion.div>

          {/* This Week meal plan preview */}
          <motion.section variants={fadeUp}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-base font-semibold text-rp-ink">
                {t('food.thisWeek')}
              </h3>
              <button
                onClick={() => navigate('/plan')}
                className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
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
                          <div className="text-[10px] uppercase">{dayNamesShort[i]}</div>
                          <div className="text-sm">{date.split('-')[2]}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-rp-ink-soft truncate">
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
                <h3 className="text-base font-semibold text-rp-ink">
                  {t('food.activeLists')}
                </h3>
                <button
                  onClick={() => navigate('/lists')}
                  className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
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
                        <p className="text-sm font-medium text-rp-ink truncate">{list.name}</p>
                        <p className="text-xs text-slate-400">{list.item_count ?? 0} {t('common.items')} {/* TODO: add i18n key */}</p>
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
                  <p className="text-sm font-medium text-rp-ink">{t('more.mealTemplates')}</p>
                  <p className="text-xs text-slate-400">
                    {templates.length} {t('food.templates')}                  </p>
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
                  <p className="text-sm font-medium text-rp-ink">{t('more.myStores')}</p>
                  <p className="text-xs text-slate-400">
                    {t('food.sortByAisle')}                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {/* Recipes, Essentials, Plan, Lists tabs now navigate directly to their full pages */}
    </motion.div>
  )
}
