import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, ShoppingCart, CalendarDays, PartyPopper, Plus,
  ChevronRight, Users, Crown, MapPin,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { canUse } from '@/lib/subscription'
import { getShoppingLists } from '@/services/shoppingLists'
import { getRecipes } from '@/services/recipes'
import { getEvents, type Event } from '@/services/events'
import { UpgradePrompt, useFeatureGate } from '@/components/ui/UpgradePrompt'

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

  const activeLists = lists.filter((l) => l.status === 'active').slice(0, 3)
  const upcomingEvents = events
    .filter((e: Event) => !e.event_date || new Date(e.event_date) >= new Date())
    .sort((a: Event, b: Event) => {
      if (!a.event_date) return 1
      if (!b.event_date) return -1
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    })
    .slice(0, 3)
  const recentRecipes = recipes.slice(0, 3)
  const greeting = getGreeting(t)

  function handleCreateEvent() {
    if (gate.checkFeature('Organizing events', canUse(gate.tier, 'canCreateEvents'))) {
      navigate('/events')
    }
  }

  function handleCreateCircle() {
    if (gate.checkFeature('Creating circles', canUse(gate.tier, 'canCreateCircles'))) {
      navigate('/more/circles')
    }
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {greeting}, {profile?.display_name?.split(' ')[0] ?? 'there'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {activeCircle ? activeCircle.name : t('home.letsPlan')}
          </p>
        </div>
        {gate.tier === 'free' && (
          <button
            onClick={() => gate.setShowUpgrade(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-brand-500 to-pink-500 text-white text-xs font-medium"
          >
            <Crown className="h-3 w-3" />
            Upgrade
          </button>
        )}
      </div>

      {/* Quick Actions - 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={handleCreateEvent}
        >
          <PartyPopper className="h-6 w-6 text-pink-500 mb-2" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Plan Event</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Gather, eat, celebrate</p>
        </Card>
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => navigate('/lists/new')}
        >
          <ShoppingCart className="h-6 w-6 text-emerald-500 mb-2" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('action.newList')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Shop together</p>
        </Card>
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => navigate('/recipes/new')}
        >
          <BookOpen className="h-6 w-6 text-blue-500 mb-2" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('action.addRecipe')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Save & share</p>
        </Card>
        <Card
          variant="elevated"
          className="p-4 cursor-pointer active:scale-[0.97] transition-transform"
          onClick={() => navigate('/plan')}
        >
          <CalendarDays className="h-6 w-6 text-purple-500 mb-2" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('action.planWeek')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Meals for the week</p>
        </Card>
      </div>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Upcoming Events
            </h3>
            <button
              onClick={() => navigate('/events')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5" />
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
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Active Shopping Lists */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {t('home.activeLists')}
          </h3>
          <button
            onClick={() => navigate('/lists')}
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
          >
            {t('home.viewAll')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {activeLists.length === 0 ? (
          <Card className="p-4 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/lists/new')}>
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-brand-500" />
              <p className="text-sm text-slate-500">Create your first shopping list</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeLists.map((list) => (
              <Card
                key={list.id}
                className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/lists/${list.id}`)}
              >
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{list.name}</p>
                    <p className="text-xs text-slate-400">{list.item_count ?? 0} items</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent Recipes */}
      {recentRecipes.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('home.recentRecipes')}
            </h3>
            <button
              onClick={() => navigate('/recipes')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {recentRecipes.map((recipe) => (
              <Card
                key={recipe.id}
                className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/recipes/${recipe.id}`)}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{recipe.title}</p>
                    {recipe.tags?.length > 0 && (
                      <p className="text-xs text-slate-400 truncate">{recipe.tags.join(', ')}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Circles */}
      <section>
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
        <Card className="p-3 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/more/circles')}>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-brand-500" />
            <p className="text-sm text-slate-500">Manage your family & friend groups</p>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </div>
        </Card>
      </section>

      <UpgradePrompt
        open={gate.showUpgrade}
        onOpenChange={gate.setShowUpgrade}
        feature={gate.upgradeFeature}
      />
    </div>
  )
}

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours()
  if (hour < 12) return t('home.goodMorning')
  if (hour < 17) return t('home.goodAfternoon')
  return t('home.goodEvening')
}
