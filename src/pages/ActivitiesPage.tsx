import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Calendar, MapPin, Clock, Repeat, Trash2, User,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import {
  getActivities, createActivity, deleteActivity,
  formatRecurrence, formatTimeRange,
  type Activity,
} from '@/services/activities'

const CATEGORIES = [
  { value: 'sports', label: 'Sports', emoji: '⚽' },
  { value: 'music', label: 'Music', emoji: '🎵' },
  { value: 'arts', label: 'Arts', emoji: '🎨' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'social', label: 'Social', emoji: '👥' },
  { value: 'chores', label: 'Chores', emoji: '🧹' },
  { value: 'carpool', label: 'Carpool', emoji: '🚗' },
  { value: 'other', label: 'Other', emoji: '📌' },
]

const DAYS = [
  { value: 0, label: 'Su' },
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
]

export function ActivitiesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const { t } = useI18n()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('other')
  const [location, setLocation] = useState('')
  const [assignedName, setAssignedName] = useState('')
  const [recurrenceType, setRecurrenceType] = useState('weekly')
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [excludeHolidays, setExcludeHolidays] = useState(false)
  const [notes, setNotes] = useState('')

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const createMutation = useMutation({
    mutationFn: () => createActivity({
      circle_id: activeCircle!.id,
      name: name.trim(),
      category,
      location: location.trim() || undefined,
      assigned_name: assignedName.trim() || undefined,
      recurrence_type: recurrenceType,
      recurrence_days: recurrenceDays,
      start_date: startDate,
      end_date: endDate || undefined,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      exclude_holidays: excludeHolidays,
      notes: notes.trim() || undefined,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      setShowCreate(false)
      resetForm()
    },
    onError: (err: Error) => alert(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  })

  function resetForm() {
    setName(''); setCategory('other'); setLocation(''); setAssignedName('')
    setRecurrenceType('weekly'); setRecurrenceDays([]); setStartDate('')
    setEndDate(''); setStartTime(''); setEndTime(''); setExcludeHolidays(false); setNotes('')
  }

  function toggleDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  // Group by person
  const byPerson = new Map<string, Activity[]>()
  for (const act of activities) {
    const key = act.assigned_name || act.profile?.display_name || 'Unassigned'
    if (!byPerson.has(key)) byPerson.set(key, [])
    byPerson.get(key)!.push(act)
  }

  if (!activeCircle) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated">
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Activities</h2>
        </div>
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title="Select a circle first"
          description="Go to Circles and select one to manage activities"
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0">
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">Activities</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('common.add')}
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        Schedule recurring activities, lessons, sports, carpooling, and chores for your family.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title="No activities yet"
          description="Add recurring schedules like soccer practice, piano lessons, or weekly chores"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Add Activity
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {[...byPerson.entries()].map(([person, acts]) => (
            <div key={person}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
                <User className="h-3 w-3" />
                {person}
              </p>
              <div className="space-y-2">
                {acts.map((activity) => {
                  const cat = CATEGORIES.find((c) => c.value === activity.category)
                  return (
                    <Card key={activity.id} variant="elevated" className="p-3">
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5">{cat?.emoji ?? '📌'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{activity.name}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Repeat className="h-3 w-3" />
                              {formatRecurrence(activity)}
                            </span>
                            {formatTimeRange(activity) && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="h-3 w-3" />
                                {formatTimeRange(activity)}
                              </span>
                            )}
                            {activity.location && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <MapPin className="h-3 w-3" />
                                {activity.location}
                              </span>
                            )}
                          </div>
                          {activity.end_date && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Until {new Date(activity.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                          {activity.notes && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{activity.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteMutation.mutate(activity.id)}
                          className="text-slate-400 hover:text-danger shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Activity Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              New Activity
            </Dialog.Title>
            <div className="space-y-3">
              <Input label="Activity Name" placeholder="e.g., Soccer Practice" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />

              <Input label="For whom" placeholder="e.g., Emma, Dad, Everyone" value={assignedName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssignedName(e.target.value)} />

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Category</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                        category === cat.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
                      )}
                    >
                      {cat.emoji} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <Input label="Location (optional)" placeholder="e.g., City Sports Center" value={location} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)} />

              {/* Recurrence */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Repeats</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: 'once', label: 'Once' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'biweekly', label: 'Bi-weekly' },
                    { value: 'daily', label: 'Daily' },
                  ].map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRecurrenceType(r.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        recurrenceType === r.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selector for weekly/biweekly */}
              {(recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'custom') && (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">On which days</label>
                  <div className="flex gap-1.5">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        onClick={() => toggleDay(day.value)}
                        className={cn(
                          'h-9 w-9 rounded-full text-xs font-medium transition-colors',
                          recurrenceDays.includes(day.value) ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date" type="date" value={startDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)} />
                <Input label="End Date (optional)" type="date" value={endDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Time" type="time" value={startTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value)} />
                <Input label="End Time" type="time" value={endTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value)} />
              </div>

              {/* Exclude holidays */}
              <label className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={excludeHolidays}
                  onChange={(e) => setExcludeHolidays(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Skip holidays & school breaks</span>
              </label>

              <Input label="Notes (optional)" placeholder="Any details..." value={notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
                <Button className="flex-1" onClick={() => createMutation.mutate()} disabled={!name.trim() || !startDate || createMutation.isPending}>
                  {createMutation.isPending ? t('common.loading') : t('common.create')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
