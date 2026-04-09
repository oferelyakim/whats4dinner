import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, ShoppingCart, CalendarDays, PartyPopper, Plus,
  ChevronRight, Users, Crown, MapPin,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { canUse } from '@/lib/subscription'
import { getShoppingLists } from '@/services/shoppingLists'
import { getRecipes } from '@/services/recipes'
import { getEvents, type Event } from '@/services/events'
import { getActivities, activityOccursOnDate, formatTimeRange, type Activity } from '@/services/activities'
import { getChores, type Chore } from '@/services/chores'
import { UpgradePrompt, useFeatureGate } from '@/components/ui/UpgradePrompt'

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
  const { t } = useI18n()
  const gate = useFeatureGate()

  const { data: lists = [] } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
  })

  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: getEvents,
  })

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const { data: chores = [] } = useQuery({
    queryKey: ['chores', activeCircle?.id],
    queryFn: () => getChores(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const today = new Date().toISOString().split('T')[0]
  const todayActivities = activities.filter((a: Activity) => activityOccursOnDate(a, today))
  const todayChores = chores.filter((c: Chore) => {
    if (c.frequency === 'daily') return true
    if (c.frequency === 'weekly' && c.recurrence_days?.includes(new Date().getDay())) return true
    return false
  })

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

  function handleCreateEvent() {
    if (gate.checkFeature('Organizing events', canUse(gate.tier, 'canCreateEvents'))) {
      navigate('/events')
    }
  }

  function handleCreateCircle() {
    if (gate.checkFeature('Creating circles', canUse(gate.tier, 'canCreateCircles'))) {
      navigate('/profile/circles')
    }
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
        {gate.tier === 'free' && (
          <button
            onClick={() => gate.setShowUpgrade(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-brand-500 to-pink-500 text-white text-xs font-medium shadow-sm hover:shadow-md transition-shadow"
          >
            <Crown className="h-3 w-3" />
            Upgrade
          </button>
        )}
      </motion.div>

      {/* Quick Actions - 2x2 grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-pink-50/50 dark:from-surface-dark-elevated dark:to-pink-950/10"
          onClick={handleCreateEvent}
        >
          <div className="h-10 w-10 rounded-xl bg-pink-500/10 flex items-center justify-center mb-2">
            <PartyPopper className="h-5 w-5 text-pink-500" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Plan Event</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Gather, eat, celebrate</p>
        </Card>
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-emerald-50/50 dark:from-surface-dark-elevated dark:to-emerald-950/10"
          onClick={() => navigate('/lists/new')}
        >
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2">
            <ShoppingCart className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.newList')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Shop together</p>
        </Card>
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-blue-50/50 dark:from-surface-dark-elevated dark:to-blue-950/10"
          onClick={() => navigate('/recipes/new')}
        >
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2">
            <BookOpen className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.addRecipe')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Save & share</p>
        </Card>
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform bg-gradient-to-br from-white to-purple-50/50 dark:from-surface-dark-elevated dark:to-purple-950/10"
          onClick={() => navigate('/plan')}
        >
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-2">
            <CalendarDays className="h-5 w-5 text-purple-500" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('action.planWeek')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Meals for the week</p>
        </Card>
      </motion.div>

      {/* Today's Schedule */}
      {(todayActivities.length > 0 || todayChores.length > 0) && (
        <motion.section variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Today
            </h3>
            <span className="text-xs text-slate-400">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
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

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <motion.section variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Upcoming Events
            </h3>
            <button
              onClick={() => navigate('/events')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
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
                          {new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
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
              <p className="text-sm text-slate-500">Create your first shopping list</p>
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
                    <p className="text-xs text-slate-400">{list.item_count ?? 0} items</p>
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
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
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
            onClick={handleCreateCircle}
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
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
            <p className="text-sm text-slate-500 flex-1">Manage your family & friend groups</p>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 rtl-flip" />
          </div>
        </Card>
      </motion.section>

      <UpgradePrompt
        open={gate.showUpgrade}
        onOpenChange={gate.setShowUpgrade}
        feature={gate.upgradeFeature}
      />
    </motion.div>
  )
}

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours()
  if (hour < 12) return t('home.goodMorning')
  if (hour < 17) return t('home.goodAfternoon')
  return t('home.goodEvening')
}
