import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, Calendar, ChevronRight, Plus,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { getActivities, activityOccursOnDate, formatTimeRange, type Activity } from '@/services/activities'
import { getChores, type Chore } from '@/services/chores'

const CATEGORIES_EMOJI: Record<string, string> = {
  sports: '⚽', music: '🎵', arts: '🎨', education: '📚',
  social: '👥', chores: '🧹', carpool: '🚗', other: '📌',
}

type Tab = 'chores' | 'activities'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

export function HouseholdHubPage() {
  const [activeTab, setActiveTab] = useState<Tab>('chores')
  const navigate = useNavigate()
  const { activeCircle, profile } = useAppStore()
  const { t, locale } = useI18n()

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

  const hasTodayItems = todayActivities.length > 0 || todayChores.length > 0

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
          {t('household.title')}
        </h2>
      </motion.div>

      {/* Today's summary banner */}
      <motion.div variants={fadeUp}>
        <Card
          variant="elevated"
          className={cn(
            'p-4 bg-gradient-to-br',
            hasTodayItems
              ? 'from-white to-brand-50/50 dark:from-surface-dark-elevated dark:to-brand-950/10'
              : 'from-white to-slate-50/50 dark:from-surface-dark-elevated dark:to-slate-950/10'
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-rp-ink">
              {t('household.today')}
            </h3>
            <span className="text-xs text-slate-400">
              {new Date().toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {!hasTodayItems ? (
            <p className="text-sm text-slate-400">{t('household.noToday')}</p>
          ) : (
            <div className="space-y-2">
              {todayActivities.map((activity: Activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => navigate('/household/activities')}
                >
                  <span className="text-sm">{CATEGORIES_EMOJI[activity.category] || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-rp-ink-soft truncate">{activity.name}</p>
                  </div>
                  {formatTimeRange(activity) && (
                    <span className="text-xs text-slate-400 shrink-0">{formatTimeRange(activity)}</span>
                  )}
                </div>
              ))}
              {todayChores.map((chore: Chore) => (
                <div
                  key={chore.id}
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => navigate('/household/chores')}
                >
                  <span className="text-sm">{chore.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-rp-ink-soft truncate">{chore.name}</p>
                  </div>
                  {chore.points > 0 && (
                    <span className="text-xs text-brand-500 font-medium shrink-0">{chore.points} pts</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Segmented control */}
      <motion.div variants={fadeUp}>
        <div className="flex bg-slate-100 dark:bg-surface-dark-overlay rounded-xl p-1">
          <button
            onClick={() => setActiveTab('chores')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px]',
              activeTab === 'chores'
                ? 'bg-rp-card text-rp-ink shadow-sm'
                : 'text-slate-500'
            )}
          >
            <Sparkles className="h-4 w-4" />
            {t('more.chores')}
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px]',
              activeTab === 'activities'
                ? 'bg-rp-card text-rp-ink shadow-sm'
                : 'text-slate-500'
            )}
          >
            <Calendar className="h-4 w-4" />
            {t('more.activities')}
          </button>
        </div>
      </motion.div>

      {/* Tab content */}
      {activeTab === 'chores' && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          <motion.div variants={fadeUp} className="flex items-center justify-between">
            <p className="text-sm font-medium text-rp-ink-soft">{t('chore.myChores')}</p>
            <button
              onClick={() => navigate('/household/chores')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
            </button>
          </motion.div>

          {chores.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Card className="p-4 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/household/chores')}>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-brand-500" />
                  </div>
                  <p className="text-sm text-slate-500">{t('chore.createFirst')}</p>
                </div>
              </Card>
            </motion.div>
          ) : (
            (() => {
              const myName = profile?.display_name || ''
              const myTodayChores = todayChores.filter((c: Chore) => {
                const name = c.assigned_name || c.profile?.display_name || ''
                return name === myName || !name
              })
              const displayChores = myTodayChores.length > 0 ? myTodayChores : chores.slice(0, 6)
              return displayChores.map((chore: Chore) => (
              <motion.div key={chore.id} variants={fadeUp}>
                <Card
                  className="p-3 cursor-pointer active:scale-[0.98]"
                  onClick={() => navigate('/household/chores')}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{chore.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-rp-ink truncate">{chore.name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {chore.assigned_name && <span>{chore.assigned_name}</span>}
                        <span className="capitalize">{chore.frequency}</span>
                      </div>
                    </div>
                    {chore.points > 0 && (
                      <span className="text-xs text-brand-500 font-medium">{chore.points} pts</span>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))
            })()
          )}

          {chores.length > 6 && (
            <motion.div variants={fadeUp}>
              <Card className="p-3 cursor-pointer active:scale-[0.97]" onClick={() => navigate('/household/chores')}>
                <p className="text-sm font-medium text-brand-500 text-center flex items-center justify-center gap-1">
                  {t('home.viewAll')} ({chores.length})
                  <ChevronRight className="h-4 w-4 rtl-flip" />
                </p>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}

      {activeTab === 'activities' && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          <motion.div variants={fadeUp} className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{t('more.activitiesDesc')}</p>
            <button
              onClick={() => navigate('/household/activities')}
              className="text-brand-500 text-sm font-medium flex items-center gap-0.5 min-h-[44px] px-2"
            >
              {t('home.viewAll')}
              <ChevronRight className="h-3.5 w-3.5 rtl-flip" />
            </button>
          </motion.div>

          {activities.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Card className="p-4 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/household/activities')}>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="text-sm text-slate-500">{t('activity.addFirst')}</p>
                </div>
              </Card>
            </motion.div>
          ) : (
            activities.slice(0, 6).map((activity: Activity) => (
              <motion.div key={activity.id} variants={fadeUp}>
                <Card
                  className="p-3 cursor-pointer active:scale-[0.98]"
                  onClick={() => navigate('/household/activities')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-sm">
                      {CATEGORIES_EMOJI[activity.category] || '📌'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-rp-ink truncate">{activity.name}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {activity.assigned_name && <span>{activity.assigned_name}</span>}
                        {activity.location && <span>• {activity.location}</span>}
                        {formatTimeRange(activity) && <span>• {formatTimeRange(activity)}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}

          {activities.length > 6 && (
            <motion.div variants={fadeUp}>
              <Card className="p-3 cursor-pointer active:scale-[0.97]" onClick={() => navigate('/household/activities')}>
                <p className="text-sm font-medium text-brand-500 text-center flex items-center justify-center gap-1">
                  {t('home.viewAll')} ({activities.length})
                  <ChevronRight className="h-4 w-4 rtl-flip" />
                </p>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}
