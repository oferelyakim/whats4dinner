import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  BookOpen, ShoppingCart, CalendarDays, PartyPopper, Plus,
  ChevronRight, Users, MapPin, Bell, Sparkles, Send,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { supabase } from '@/services/supabase'
import { logAIUsage } from '@/services/ai-usage'
import { getShoppingLists } from '@/services/shoppingLists'
import { getRecipes } from '@/services/recipes'
import { getEvents, type Event } from '@/services/events'
import { getActivities, activityOccursOnDate, formatTimeRange, getUpcomingReminders, type Activity } from '@/services/activities'
import { getChores, type Chore } from '@/services/chores'

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

export function HomePage() {
  const navigate = useNavigate()
  const { profile, activeCircle } = useAppStore()
  const { t, locale } = useI18n()
  const ai = useAIAccess()
  const [nlpInput, setNlpInput] = useState('')
  const [nlpResult, setNlpResult] = useState<{ action: string; confirmation: string } | null>(null)

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'

  const nlpMutation = useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.functions.invoke('nlp-action', {
        body: { text, circleId: activeCircle?.id },
      })
      if (error) throw error
      if (data?._ai_usage) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await logAIUsage(user.id, 'nlp_action', data._ai_usage.model, data._ai_usage.tokens_in, data._ai_usage.tokens_out, data._ai_usage.cost_usd)
        }
      }
      return data as { action: string; confirmation: string; params: Record<string, unknown> }
    },
    onSuccess: (data) => {
      setNlpResult(data)
      setNlpInput('')
    },
  })

  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  const { data: recipes = [], isLoading: recipesLoading } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
  })

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: getEvents,
  })

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const { data: chores = [], isLoading: choresLoading } = useQuery({
    queryKey: ['chores', activeCircle?.id],
    queryFn: () => getChores(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const isLoading = listsLoading || recipesLoading || eventsLoading || activitiesLoading || choresLoading

  const today = new Date().toISOString().split('T')[0]
  const todayActivities = activities.filter((a: Activity) => activityOccursOnDate(a, today))
  const todayChores = chores.filter((c: Chore) => {
    if (c.frequency === 'daily') return true
    if (c.frequency === 'weekly' && c.recurrence_days?.includes(new Date().getDay())) return true
    return false
  })

  const upcomingReminders = getUpcomingReminders(activities, 7)

  const activeLists = lists.filter((l) => l.status === 'active').slice(0, 3)
  const upcomingEvents = events
    .filter((e: Event) => !e.event_date || new Date(e.event_date) >= new Date())
    .sort((a: Event, b: Event) => {
      if (!a.event_date) return 1
      if (!b.event_date) return -1
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    })
    .slice(0, 3)
  const recentRecipes = recipes.slice(0, 5)
  const greeting = getGreeting(t)

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* Greeting skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* Quick action cards skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-xl bg-white dark:bg-surface-dark-elevated border border-slate-100 dark:border-slate-800">
              <Skeleton className="h-10 w-10 rounded-xl mb-2" />
              <Skeleton className="h-4 w-3/4 mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>

        {/* Section skeletons */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
      {/* Greeting */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {greeting}, {profile?.display_name?.split(' ')[0] ?? 'there'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {activeCircle ? activeCircle.name : t('home.letsPlan')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions - 2x2 grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
        <button
          role="button"
          onClick={() => navigate('/events')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/events') } }}
          className="text-start"
        >
          <Card
            variant="elevated"
            className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-pink-50/50 dark:from-surface-dark-elevated dark:to-pink-950/10"
          >
            <div className="h-10 w-10 rounded-xl bg-pink-500/10 flex items-center justify-center mb-2">
              <PartyPopper className="h-5 w-5 text-pink-500" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t('home.planEvent')}            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('home.planEventDesc')}            </p>
          </Card>
        </button>
        <button
          role="button"
          onClick={() => navigate('/lists/new')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/lists/new') } }}
          className="text-start"
        >
          <Card
            variant="elevated"
            className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-emerald-50/50 dark:from-surface-dark-elevated dark:to-emerald-950/10"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2">
              <ShoppingCart className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.newList')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('home.shopTogether')}            </p>
          </Card>
        </button>
        <button
          role="button"
          onClick={() => navigate('/recipes/new')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/recipes/new') } }}
          className="text-start"
        >
          <Card
            variant="elevated"
            className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-blue-50/50 dark:from-surface-dark-elevated dark:to-blue-950/10"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.addRecipe')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('home.saveAndShare')}            </p>
          </Card>
        </button>
        <button
          role="button"
          onClick={() => navigate('/plan')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/plan') } }}
          className="text-start"
        >
          <Card
            variant="elevated"
            className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-purple-50/50 dark:from-surface-dark-elevated dark:to-purple-950/10"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-2">
              <CalendarDays className="h-5 w-5 text-purple-500" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.planWeek')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('home.mealsForTheWeek')}            </p>
          </Card>
        </button>
      </motion.div>

      {/* NLP Quick Actions */}
      <motion.div variants={fadeUp}>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark-elevated overflow-hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!nlpInput.trim() || nlpMutation.isPending) return
              if (!ai.checkAIAccess()) return
              nlpMutation.mutate(nlpInput.trim())
            }}
            className="flex items-center gap-2 p-2"
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-brand-500 flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <input
              type="text"
              value={nlpInput}
              onChange={(e) => setNlpInput(e.target.value)}
              placeholder={t('ai.nlpPlaceholder')}
              className="flex-1 text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              disabled={nlpMutation.isPending}
            />
            <button
              type="submit"
              disabled={!nlpInput.trim() || nlpMutation.isPending}
              className="h-11 w-11 rounded-lg bg-brand-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
            >
              {nlpMutation.isPending ? (
                <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
          {nlpResult && (
            <div className="px-3 pb-3">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-surface-dark-overlay">
                <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-300">{nlpResult.confirmation}</p>
              </div>
            </div>
          )}
          {!ai.hasAI && !nlpInput && (
            <div className="px-3 pb-2">
              <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full font-medium">
                AI
              </span>
            </div>
          )}
        </div>
        <AIUpgradeModal
          open={ai.showUpgradeModal}
          onOpenChange={ai.setShowUpgradeModal}
          isLimitReached={ai.isLimitReached}
        />
      </motion.div>

      {/* Today's Schedule */}
      {(todayActivities.length > 0 || todayChores.length > 0) && (
        <motion.section variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('home.today')}            </h3>
            <span className="text-xs text-slate-400">
              {new Date().toLocaleDateString(dateLocale, { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Activities */}
          {todayActivities.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {todayActivities.map((activity: Activity) => (
                <Card key={activity.id} className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/household/activities')}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-sm">
                      {CATEGORIES_EMOJI[activity.category] || '📌'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{activity.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        {formatTimeRange(activity) && <span>{formatTimeRange(activity)}</span>}
                        {activity.assigned_name && <span>• {activity.assigned_name}</span>}
                        {activity.location && <span>• {activity.location}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Chores */}
          {todayChores.length > 0 && (
            <div className="space-y-1.5">
              {todayChores.map((chore: Chore) => (
                <Card key={chore.id} className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/household/chores')}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{chore.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{chore.name}</p>
                      {chore.assigned_name && (
                        <p className="text-[10px] text-slate-400">{chore.assigned_name}</p>
                      )}
                    </div>
                    {chore.points > 0 && (
                      <span className="text-xs text-brand-500 font-medium">{chore.points} pts</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Upcoming Reminders */}
      {upcomingReminders.length > 0 && (
        <motion.section variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('reminder.upcoming')}
            </h3>
          </div>
          <div className="space-y-1.5">
            {upcomingReminders.slice(0, 5).map(({ activity, reminder, triggerDate }, i) => (
              <Card key={`${activity.id}-${i}`} className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/household/activities')}>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Bell className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{activity.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {reminder.amount} {t(`reminder.${reminder.unit}`)} {t('reminder.before')}
                      {triggerDate === today ? ` — ${t('calendar.today')}` : ''}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </motion.section>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <motion.section variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('home.upcomingEvents')}            </h3>
            <button
              onClick={() => navigate('/events')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
            </button>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event: Event) => (
              <Card
                key={event.id}
                variant="elevated"
                className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                    <PartyPopper className="h-5 w-5 text-pink-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{event.name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {event.event_date && (
                        <span className="flex items-center gap-0.5">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(event.event_date).toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
                </div>
              </Card>
            ))}
          </div>
        </motion.section>
      )}

      {/* Active Shopping Lists */}
      <motion.section variants={fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {t('home.activeLists')}
          </h3>
          <button
            onClick={() => navigate('/lists')}
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
          >
            {t('home.viewAll')}
            <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
          </button>
        </div>

        {activeLists.length === 0 ? (
          <Card className="p-4 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate('/lists/new')}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
                <Plus className="h-4 w-4 text-brand-500" />
              </div>
              <p className="text-sm text-slate-500">{t('home.createFirstList')} {/* TODO: add i18n key */}</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeLists.map((list) => (
              <Card
                key={list.id}
                className="p-3.5 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/lists/${list.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{list.name}</p>
                    <p className="text-xs text-slate-400">{list.item_count ?? 0} {t('common.items')} {/* TODO: add i18n key */}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </motion.section>

      {/* Recent Recipes - horizontal scroll */}
      {recentRecipes.length > 0 && (
        <motion.section variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('home.recentRecipes')}
            </h3>
            <button
              onClick={() => navigate('/recipes')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
            </button>
          </div>
          <div className="horizontal-scroll -mx-4 px-4">
            {recentRecipes.map((recipe) => (
              <Card
                key={recipe.id}
                variant="elevated"
                className="w-40 p-3 cursor-pointer active:scale-[0.97] transition-transform shrink-0"
                onClick={() => navigate(`/recipes/${recipe.id}`)}
              >
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{recipe.title}</p>
                {recipe.tags?.length > 0 && (
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{recipe.tags.join(', ')}</p>
                )}
              </Card>
            ))}
          </div>
        </motion.section>
      )}

      {/* Circles */}
      <motion.section variants={fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {t('action.myCircles')}
          </h3>
          <button
            onClick={() => navigate('/profile/circles')}
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
          >
            {t('common.create')}
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <Card className="p-3.5 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate('/profile/circles')}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-brand-500" />
            </div>
            <p className="text-sm text-slate-500 flex-1">{t('home.manageCircles')} {/* TODO: add i18n key */}</p>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
          </div>
        </Card>
      </motion.section>
    </motion.div>
  )
}

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours()
  if (hour < 12) return t('home.goodMorning')
  if (hour < 17) return t('home.goodAfternoon')
  return t('home.goodEvening')
}
