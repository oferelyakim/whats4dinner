import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Camera, PenLine } from 'lucide-react'
import { motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import {
  PageTitle,
  MonoLabel,
  HandAccent,
  AvatarStack,
  RingsOrnament,
  PotIcon,
  HouseCircleIcon,
} from '@/components/ui/hearth'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { getShoppingLists, getShoppingList } from '@/services/shoppingLists'
import { getCircleMembers } from '@/services/circles'
import { getActivities, activityOccursOnDate, formatTimeRange, type Activity } from '@/services/activities'
import { getMealPlans, getWeekDates } from '@/services/mealPlans'
import { cn } from '@/lib/cn'
import type { ShoppingListItem } from '@/types'

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

const CATEGORY_DOT: Record<string, string> = {
  sports: 'var(--rp-accent)',
  music: 'var(--rp-glow)',
  arts: 'var(--rp-brand)',
  education: 'var(--rp-cool)',
  social: 'var(--rp-brand)',
  chores: 'var(--rp-ink-mute)',
  carpool: 'var(--rp-cool)',
  other: 'var(--rp-ink-mute)',
}

export function HomePage() {
  const navigate = useNavigate()
  const { profile, activeCircle } = useAppStore()
  const { t, locale } = useI18n()
  const ai = useAIAccess()
  const [recipePickerOpen, setRecipePickerOpen] = useState(false)

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'
  const today = new Date().toISOString().split('T')[0]

  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const weekDates = getWeekDates()
  const { data: mealPlans = [], isLoading: mealPlansLoading } = useQuery({
    queryKey: ['meal-plans', activeCircle?.id, weekDates.start, weekDates.end],
    queryFn: () => getMealPlans(activeCircle!.id, weekDates.start, weekDates.end),
    enabled: !!activeCircle,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['circle-members', activeCircle?.id],
    queryFn: () => getCircleMembers(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const primaryList = lists
    .filter((l) => l.status === 'active')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

  const { data: primaryListDetail } = useQuery({
    queryKey: ['shopping-list', primaryList?.id],
    queryFn: () => getShoppingList(primaryList!.id),
    enabled: !!primaryList,
  })

  const todayMealPlan = mealPlans.find((mp) => mp.plan_date === today)
  const memberNames = members
    .map((m) => m.profile?.display_name ?? '')
    .filter(Boolean)

  const isLoading = listsLoading || activitiesLoading || mealPlansLoading

  const todayActivities = activities.filter((a: Activity) => activityOccursOnDate(a, today))

  const upcomingActivities = (() => {
    const result: Array<{ activity: Activity; date: string }> = []
    const start = new Date()
    for (let i = 1; i <= 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const ds = d.toISOString().split('T')[0]
      for (const a of activities) {
        if (activityOccursOnDate(a, ds) && !result.some((r) => r.activity.id === a.id)) {
          result.push({ activity: a, date: ds })
        }
      }
    }
    return result.slice(0, 5)
  })()

  const mealPlanByDate = new Set(mealPlans.map((mp) => mp.plan_date))
  const firstName = profile?.display_name?.split(' ')[0] ?? 'friend'
  const greeting = getGreeting(t)

  if (isLoading) {
    return (
      <div className="px-5 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-56" />
          </div>
          <Skeleton className="h-14 w-14 rounded-full" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <motion.div
      className="relative px-5 py-6 space-y-7"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Decorative rings bleed off the right edge */}
      <RingsOrnament
        className="absolute -top-16 -right-40 text-rp-brand"
        opacity={0.14}
        size={420}
      />

      {/* 1 — Greeting + circle pulse */}
      <motion.header variants={fadeUp} className="relative flex items-start justify-between gap-4">
        <div>
          <MonoLabel>
            {new Date().toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' })}
          </MonoLabel>
          <PageTitle className="mt-2 text-[32px]">
            {greeting},{' '}
            <span className="text-rp-brand">{firstName}.</span>
          </PageTitle>
          {memberNames.length > 1 && (
            <p className="mt-2 text-sm text-rp-ink-soft">
              {t('home.todayTogether').replace('{count}', String(memberNames.length))}
            </p>
          )}
        </div>
        {memberNames.length > 0 && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <AvatarStack names={memberNames} size="md" max={4} ring="bg" />
            <MonoLabel>{activeCircle?.name ?? ''}</MonoLabel>
          </div>
        )}
      </motion.header>

      {/* 2 — Tonight at the table (hero) */}
      <motion.section variants={fadeUp}>
        <button
          onClick={() => navigate('/plan-v2')}
          className="group w-full text-start block"
        >
          <div
            className="relative overflow-hidden rounded-rp-lg p-5 shadow-rp-hero"
            style={{ background: 'var(--rp-bg-deep)', color: 'var(--rp-bg)' }}
          >
            <RingsOrnament
              className="absolute -bottom-20 -right-24"
              opacity={0.18}
              size={360}
            />
            <span className="rp-mono-label" style={{ color: 'rgba(250,246,239,0.6)' }}>
              {t('home.tonightAtTable')}
            </span>
            <h2 className="font-display italic tracking-rp-tight leading-[1.05] text-[28px] mt-2 pr-10">
              {todayMealPlan?.notes || todayMealPlan?.recipe_id
                ? todayMealPlan?.notes || t('home.mealsForTheWeek')
                : t('home.letsPlan')}
            </h2>
            <p className="mt-3 text-xs opacity-80 inline-flex items-center gap-1.5">
              <PotIcon width={14} height={14} />
              <span>{firstName}</span>
            </p>
          </div>
        </button>
      </motion.section>

      {/* 3 — Pulse row: shared list + next gathering */}
      <motion.section variants={fadeUp} className="grid grid-cols-2 gap-3">
        {primaryList ? (
          <button
            onClick={() => navigate(`/lists/${primaryList.id}`)}
            className="rp-card p-4 text-start active:scale-[0.98] transition-transform"
          >
            <MonoLabel>{t('home.sharedList')}</MonoLabel>
            <p className="font-display italic text-[18px] mt-1.5 text-rp-ink leading-tight">
              {primaryList.name}
            </p>
            <p className="text-[11px] text-rp-ink-mute mt-2">
              {primaryListDetail?.items?.length
                ? `${primaryListDetail.items.filter((i: ShoppingListItem) => !i.is_checked).length} ${t('common.more')}`
                : t('list.noItems')}
            </p>
          </button>
        ) : (
          <button
            onClick={() => navigate('/lists/new')}
            className="rp-card p-4 text-start border-dashed active:scale-[0.98] transition-transform"
            style={{ borderColor: 'var(--rp-brand-soft)' }}
          >
            <MonoLabel>{t('home.sharedList')}</MonoLabel>
            <p className="font-display italic text-[18px] mt-1.5 text-rp-ink-soft leading-tight">
              {t('home.createFirstList')}
            </p>
          </button>
        )}

        <button
          onClick={() => navigate('/household')}
          className="p-4 text-start active:scale-[0.98] transition-transform rounded-rp-md border border-rp-hairline shadow-rp-card"
          style={{ background: 'var(--rp-glow-soft)' }}
        >
          <MonoLabel>{t('home.householdLabel')}</MonoLabel>
          <p className="font-display italic text-[18px] mt-1.5 text-rp-ink leading-tight">
            {t('home.choresAndActivities')}
          </p>
          <p className="text-[11px] text-rp-ink-soft mt-2 inline-flex items-center gap-1">
            <HouseCircleIcon width={14} height={14} />
            {t('home.householdDesc')}
          </p>
        </button>
      </motion.section>

      {/* 4 — Today's beats timeline */}
      {(todayActivities.length > 0 || upcomingActivities.length > 0) && (
        <motion.section variants={fadeUp}>
          <MonoLabel>{t('home.todaysBeats')}</MonoLabel>
          <ul className="mt-3 space-y-2.5">
            {todayActivities.map((activity) => {
              const time = formatTimeRange(activity)
              return (
                <li key={activity.id}>
                  <button
                    onClick={() => navigate('/household/activities')}
                    className="w-full flex items-center gap-3 py-1.5 text-start"
                  >
                    <span className="font-mono text-[11px] text-rp-ink-mute w-14 tabular-nums">
                      {time || t('home.today')}
                    </span>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: CATEGORY_DOT[activity.category] ?? 'var(--rp-brand)' }}
                    />
                    <span className="flex-1 min-w-0">
                      <p className="text-sm text-rp-ink truncate">{activity.name}</p>
                      {activity.assigned_name && (
                        <p className="text-[11px] text-rp-ink-mute truncate">
                          {activity.assigned_name}
                        </p>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
            {upcomingActivities.slice(0, 3).map(({ activity, date }) => {
              const d = new Date(date + 'T12:00:00')
              const dayLabel = d.toLocaleDateString(dateLocale, { weekday: 'short' })
              return (
                <li key={`${activity.id}-${date}`}>
                  <button
                    onClick={() => navigate('/household/activities')}
                    className="w-full flex items-center gap-3 py-1.5 text-start"
                  >
                    <span className="font-mono text-[11px] text-rp-ink-mute w-14 tabular-nums uppercase">
                      {dayLabel}
                    </span>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: CATEGORY_DOT[activity.category] ?? 'var(--rp-cool)' }}
                    />
                    <span className="flex-1 min-w-0">
                      <p className="text-sm text-rp-ink-soft truncate">{activity.name}</p>
                      {activity.assigned_name && (
                        <p className="text-[11px] text-rp-ink-mute truncate">
                          {activity.assigned_name}
                        </p>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </motion.section>
      )}

      {/* 5 — Week rhythm */}
      {activeCircle && (
        <motion.section variants={fadeUp}>
          <MonoLabel>{t('home.thisWeeksMeals')}</MonoLabel>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 no-scrollbar">
            {weekDates.dates.map((date) => {
              const isToday = date === today
              const hasMeal = mealPlanByDate.has(date)
              const d = new Date(date + 'T12:00:00')
              const dayLabel = d.toLocaleDateString(dateLocale, { weekday: 'short' })
              const dayNum = d.getDate()
              return (
                <button
                  key={date}
                  onClick={() => navigate('/plan-v2')}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-rp-sm px-3 py-2.5 shrink-0 min-w-[54px] transition-colors active:scale-95 border',
                    isToday
                      ? 'bg-rp-brand text-rp-card border-rp-brand'
                      : 'bg-rp-card text-rp-ink-soft border-rp-hairline'
                  )}
                >
                  <span className="text-[10px] font-mono uppercase tracking-wider opacity-80">{dayLabel}</span>
                  <span className="font-display italic text-[20px] leading-none mt-0.5">{dayNum}</span>
                  <span
                    className={cn(
                      'h-1 w-1 rounded-full mt-1',
                      hasMeal
                        ? isToday ? 'bg-rp-card/80' : 'bg-rp-brand'
                        : 'opacity-0'
                    )}
                  />
                </button>
              )
            })}
          </div>
        </motion.section>
      )}

      {/* 6 — Quick actions (subtle, 3 tiles) */}
      <motion.section variants={fadeUp} className="grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/plan-v2')}
          className="rp-card p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
        >
          <span className="h-9 w-9 rounded-[10px] bg-rp-brand-soft flex items-center justify-center text-rp-brand-deep">
            <PotIcon width={20} height={20} />
          </span>
          <span className="text-[11px] font-medium text-rp-ink-soft">{t('nav.plan')}</span>
        </button>
        <button
          onClick={() => setRecipePickerOpen(true)}
          className="rp-card p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
        >
          <span className="h-9 w-9 rounded-[10px] bg-rp-glow-soft flex items-center justify-center text-rp-ink">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-[11px] font-medium text-rp-ink-soft">{t('home.addRecipe')}</span>
        </button>
        <button
          onClick={() => navigate('/household')}
          className="rp-card p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
        >
          <span className="h-9 w-9 rounded-[10px] bg-rp-accent-soft flex items-center justify-center text-rp-ink">
            <HouseCircleIcon width={20} height={20} />
          </span>
          <span className="text-[11px] font-medium text-rp-ink-soft">{t('nav.house')}</span>
        </button>
      </motion.section>

      {/* 7 — One handwritten accent */}
      <motion.div variants={fadeUp} className="pt-2 text-center">
        <HandAccent rotate={-2}>✶ {t('home.aGoodDay')} ✶</HandAccent>
      </motion.div>

      {/* Recipe Picker Bottom Sheet */}
      <Dialog.Root open={recipePickerOpen} onOpenChange={setRecipePickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
          <Dialog.Content
            className="fixed bottom-0 start-0 end-0 z-[60] bg-rp-card rounded-t-rp-lg p-5 max-w-lg mx-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 rounded-full bg-rp-hairline mx-auto mb-4" />
            <Dialog.Title asChild>
              <PageTitle className="text-[24px] mb-4">{t('home.addRecipe')}</PageTitle>
            </Dialog.Title>

            <div className="space-y-2">
              <button
                onClick={() => { setRecipePickerOpen(false); navigate('/recipes/new') }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-rp-sm bg-rp-bg-soft active:scale-[0.98] transition-transform text-start min-h-[56px]"
              >
                <div className="h-9 w-9 rounded-[10px] bg-rp-accent-soft flex items-center justify-center shrink-0">
                  <PenLine className="h-5 w-5 text-rp-ink" />
                </div>
                <span className="text-sm font-medium text-rp-ink">
                  {t('home.recipe.createManually')}
                </span>
              </button>

              <button
                onClick={() => {
                  setRecipePickerOpen(false)
                  if (ai.checkRecipeImportAccess()) navigate('/recipes/import?mode=url')
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-rp-sm bg-rp-bg-soft active:scale-[0.98] transition-transform text-start min-h-[56px]"
              >
                <div className="h-9 w-9 rounded-[10px] bg-rp-brand-soft flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-rp-brand-deep" />
                </div>
                <span className="text-sm font-medium text-rp-ink">
                  {t('home.recipe.importUrl')}
                </span>
              </button>

              <button
                onClick={() => {
                  setRecipePickerOpen(false)
                  if (ai.checkRecipeImportAccess()) navigate('/recipes/import?mode=photo')
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-rp-sm bg-rp-bg-soft active:scale-[0.98] transition-transform text-start min-h-[56px]"
              >
                <div className="h-9 w-9 rounded-[10px] bg-rp-glow-soft flex items-center justify-center shrink-0">
                  <Camera className="h-5 w-5 text-rp-ink" />
                </div>
                <span className="text-sm font-medium text-rp-ink">
                  {t('home.recipe.scanPhoto')}
                </span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AIUpgradeModal
        open={ai.showUpgradeModal}
        onOpenChange={ai.setShowUpgradeModal}
        isLimitReached={ai.hasAI && ai.isLimitReached}
        isImportCapReached={ai.upgradeReason === 'recipe_import_cap'}
        importsUsed={ai.importsUsed}
        importsLimit={ai.importsLimit}
      />
    </motion.div>
  )
}
