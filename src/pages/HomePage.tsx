import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingCart, CalendarDays, ChefHat, PlusCircle,
  Sparkles, Camera, PenLine,
} from 'lucide-react'
import { motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Card } from '@/components/ui/Card'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { useAIAccess } from '@/hooks/useAIAccess'
import { getShoppingLists, getShoppingList } from '@/services/shoppingLists'
import { getActivities, activityOccursOnDate, formatTimeRange, type Activity } from '@/services/activities'
import { getMealPlans, getWeekDates } from '@/services/mealPlans'
import { cn } from '@/lib/cn'
import type { ShoppingListItem } from '@/types'

const CATEGORIES_EMOJI: Record<string, string> = {
  sports: '⚽', music: '🎵', arts: '🎨', education: '📚',
  social: '👥', chores: '🧹', carpool: '🚗', other: '📌',
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours()
  if (hour < 12) return t('home.goodMorning')
  if (hour < 17) return t('home.goodAfternoon')
  return t('home.goodEvening')
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium mb-2">
      {children}
    </p>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { profile, activeCircle } = useAppStore()
  const { t, locale } = useI18n()
  const ai = useAIAccess()
  const [recipePickerOpen, setRecipePickerOpen] = useState(false)

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'
  const today = new Date().toISOString().split('T')[0]

  // Shopping lists — metadata only
  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  // Activities
  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  // Meal plans for the week
  const weekDates = getWeekDates()
  const { data: mealPlans = [], isLoading: mealPlansLoading } = useQuery({
    queryKey: ['meal-plans', activeCircle?.id, weekDates.start, weekDates.end],
    queryFn: () => getMealPlans(activeCircle!.id, weekDates.start, weekDates.end),
    enabled: !!activeCircle,
  })

  // Primary active list — fetch items only for the most recently updated one
  const primaryList = lists
    .filter((l) => l.status === 'active')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

  const { data: primaryListDetail } = useQuery({
    queryKey: ['shopping-list', primaryList?.id],
    queryFn: () => getShoppingList(primaryList!.id),
    enabled: !!primaryList,
  })

  const isLoading = listsLoading || activitiesLoading || mealPlansLoading

  const todayActivities = activities.filter((a: Activity) => activityOccursOnDate(a, today))

  // Upcoming: next 7 days (excluding today). Surfaced so newly-created
  // activities are visible even when the earliest occurrence isn't today.
  const upcomingActivities = (() => {
    const result: Array<{ activity: Activity; date: string }> = []
    const start = new Date()
    for (let i = 1; i <= 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const ds = d.toISOString().split('T')[0]
      for (const a of activities) {
        if (activityOccursOnDate(a, ds)) {
          if (!result.some((r) => r.activity.id === a.id)) {
            result.push({ activity: a, date: ds })
          }
        }
      }
    }
    return result.slice(0, 5)
  })()

  // Meal plan index: date -> has entry
  const mealPlanByDate = new Set(mealPlans.map((mp) => mp.plan_date))

  const greeting = getGreeting(t)

  const formattedDate = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <SkeletonCard />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-12 rounded-xl shrink-0" />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="px-4 sm:px-6 py-6 space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* 1. Greeting header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500">{formattedDate}</p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {greeting}, {profile?.display_name?.split(' ')[0] ?? 'there'}! 👋
          </h2>
        </div>
        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
          {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
        </div>
      </motion.div>

      {/* 2. Today's Activities */}
      {todayActivities.length > 0 && (
        <motion.section variants={fadeUp}>
          <SectionLabel>{t('home.todaysActivities')}</SectionLabel>
          <div className="space-y-2">
            {todayActivities.map((activity: Activity) => (
              <button
                key={activity.id}
                onClick={() => navigate('/household/activities')}
                className="w-full text-start"
              >
                <Card className="px-3 py-2.5 flex items-center gap-3 active:scale-[0.98] transition-transform">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-base shrink-0">
                    {CATEGORIES_EMOJI[activity.category] || '📌'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {activity.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {[formatTimeRange(activity), activity.location]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
                </Card>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* 2b. Upcoming activities (next 7 days) */}
      {upcomingActivities.length > 0 && (
        <motion.section variants={fadeUp}>
          <SectionLabel>{t('home.upcomingActivities')}</SectionLabel>
          <div className="space-y-2">
            {upcomingActivities.map(({ activity, date }) => {
              const d = new Date(date + 'T12:00:00')
              const dayLabel = d.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <button
                  key={`${activity.id}-${date}`}
                  onClick={() => navigate('/household/activities')}
                  className="w-full text-start"
                >
                  <Card className="px-3 py-2.5 flex items-center gap-3 active:scale-[0.98] transition-transform">
                    <div className="h-9 w-9 rounded-xl bg-slate-500/10 flex items-center justify-center text-base shrink-0">
                      {CATEGORIES_EMOJI[activity.category] || '📌'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {activity.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {[dayLabel, formatTimeRange(activity), activity.assigned_name]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </Card>
                </button>
              )
            })}
          </div>
        </motion.section>
      )}

      {/* 3. Shopping List — primary active list with inline items */}
      {primaryList && (
        <motion.section variants={fadeUp}>
          <SectionLabel>{t('home.shoppingLists')}</SectionLabel>
          <button
            onClick={() => navigate(`/lists/${primaryList.id}`)}
            className="w-full text-start"
          >
            <Card className="p-4 active:scale-[0.98] transition-transform">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">
                {primaryList.name}
              </p>
              {primaryListDetail?.items && primaryListDetail.items.length > 0 ? (
                <ul className="space-y-2">
                  {primaryListDetail.items.slice(0, 5).map((item: ShoppingListItem) => (
                    <li key={item.id} className="flex items-center gap-2.5">
                      <div className={cn(
                        'h-4 w-4 rounded border shrink-0 flex items-center justify-center',
                        item.is_checked
                          ? 'border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-700'
                          : 'border-slate-300 dark:border-slate-600'
                      )}>
                        {item.is_checked && (
                          <div className="h-2 w-2 rounded-sm bg-slate-400" />
                        )}
                      </div>
                      <span className={cn(
                        'text-sm',
                        item.is_checked
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-800 dark:text-slate-200'
                      )}>
                        {item.name}
                      </span>
                    </li>
                  ))}
                  {primaryListDetail.items.length > 5 && (
                    <li className="text-xs text-slate-400 ps-6">
                      +{primaryListDetail.items.length - 5} {t('common.more')}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">{t('list.noItems')}</p>
              )}
            </Card>
          </button>
        </motion.section>
      )}

      {/* 4. This Week's Meals */}
      {activeCircle && (
        <motion.section variants={fadeUp}>
          <SectionLabel>{t('home.thisWeeksMeals')}</SectionLabel>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 no-scrollbar">
            {weekDates.dates.map((date) => {
              const isToday = date === today
              const hasMeal = mealPlanByDate.has(date)
              const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString(dateLocale, { weekday: 'short' })
              const dayNum = new Date(date + 'T12:00:00').getDate()

              return (
                <button
                  key={date}
                  onClick={() => navigate(`/plan?date=${date}`)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 shrink-0 min-w-[52px] transition-colors active:scale-95',
                    isToday
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 dark:bg-surface-dark-elevated text-slate-600 dark:text-slate-300'
                  )}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide">{dayLabel}</span>
                  <span className="text-base font-bold leading-none">{dayNum}</span>
                  {hasMeal ? (
                    <div className={cn(
                      'h-1.5 w-1.5 rounded-full mt-0.5',
                      isToday ? 'bg-white/70' : 'bg-brand-500'
                    )} />
                  ) : (
                    <div className="h-1.5 w-1.5 mt-0.5" />
                  )}
                </button>
              )
            })}
          </div>
        </motion.section>
      )}

      {/* 5. Quick Actions */}
      <motion.section variants={fadeUp}>
        <SectionLabel>{t('home.quickActions')}</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {/* Plan */}
          <button
            onClick={() => navigate('/plan')}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-elevated p-3 active:scale-95 transition-transform min-h-[72px]"
          >
            <div className="h-9 w-9 rounded-xl bg-teal-500/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-teal-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight text-center">
              {t('nav.plan')}
            </span>
          </button>

          {/* List */}
          <button
            onClick={() => navigate('/lists')}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-elevated p-3 active:scale-95 transition-transform min-h-[72px]"
          >
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight text-center">
              {t('nav.lists')}
            </span>
          </button>

          {/* Recipe — opens picker bottom sheet */}
          <button
            onClick={() => setRecipePickerOpen(true)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-elevated p-3 active:scale-95 transition-transform min-h-[72px]"
          >
            <div className="h-9 w-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <ChefHat className="h-5 w-5 text-brand-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight text-center">
              {t('home.addRecipe')}
            </span>
          </button>

          {/* Event */}
          <button
            onClick={() => navigate('/events')}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-elevated p-3 active:scale-95 transition-transform min-h-[72px]"
          >
            <div className="h-9 w-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
              <PlusCircle className="h-5 w-5 text-pink-500" />
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight text-center">
              {t('home.planEvent')}
            </span>
          </button>
        </div>
      </motion.section>

      {/* Recipe Picker Bottom Sheet */}
      <Dialog.Root open={recipePickerOpen} onOpenChange={setRecipePickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content
            className="fixed bottom-0 start-0 end-0 z-[60] bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-5 max-w-lg mx-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-4" />
            <Dialog.Title className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {t('home.addRecipe')}
            </Dialog.Title>

            <div className="space-y-2">
              {/* Create manually */}
              <button
                onClick={() => {
                  setRecipePickerOpen(false)
                  navigate('/recipes/new')
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-surface-dark-overlay hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] transition-transform text-start min-h-[56px]"
              >
                <div className="h-9 w-9 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
                  <PenLine className="h-5 w-5 text-teal-500" />
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t('home.recipe.createManually')}
                </span>
              </button>

              {/* Import from URL */}
              <button
                onClick={() => {
                  setRecipePickerOpen(false)
                  if (ai.checkAIAccess()) navigate('/recipes/import?mode=url')
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-surface-dark-overlay hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] transition-transform text-start min-h-[56px]"
              >
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-blue-500" />
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t('home.recipe.importUrl')}
                </span>
              </button>

              {/* Scan from photo */}
              <button
                onClick={() => {
                  setRecipePickerOpen(false)
                  if (ai.checkAIAccess()) navigate('/recipes/import?mode=photo')
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-surface-dark-overlay hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] transition-transform text-start min-h-[56px]"
              >
                <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Camera className="h-5 w-5 text-purple-500" />
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t('home.recipe.scanPhoto')}
                </span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </motion.div>
  )
}
