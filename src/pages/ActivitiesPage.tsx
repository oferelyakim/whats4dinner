import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Calendar, MapPin, Clock, Repeat, Trash2, User,
  Pencil, Users, PackageCheck, ChevronDown, ChevronUp, X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { EmptyState } from '@/components/ui/EmptyState'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import {
  getActivities, createActivity, updateActivity, deleteActivity,
  activityOccursOnDate,
  formatRecurrence, formatTimeRange,
  type Activity, type Participant, type BringItem,
} from '@/services/activities'
import { getCircleMembers } from '@/services/circles'

const CATEGORIES = [
  { value: 'sports', label: 'activity.cat.sports', emoji: '⚽' },
  { value: 'music', label: 'activity.cat.music', emoji: '🎵' },
  { value: 'arts', label: 'activity.cat.arts', emoji: '🎨' },
  { value: 'education', label: 'activity.cat.education', emoji: '📚' },
  { value: 'social', label: 'activity.cat.social', emoji: '👥' },
  { value: 'chores', label: 'activity.cat.chores', emoji: '🧹' },
  { value: 'carpool', label: 'activity.cat.carpool', emoji: '🚗' },
  { value: 'other', label: 'activity.cat.other', emoji: '📌' },
]

const PARTICIPANT_ROLES: Array<{ value: Participant['role']; labelKey: string }> = [
  { value: 'participant', labelKey: 'activity.participant' },
  { value: 'escort', labelKey: 'activity.escort' },
  { value: 'driver', labelKey: 'activity.driver' },
  { value: 'supervisor', labelKey: 'activity.supervisor' },
]

const DAYS = [
  { value: 0, label: 'activity.day.su' },
  { value: 1, label: 'activity.day.mo' },
  { value: 2, label: 'activity.day.tu' },
  { value: 3, label: 'activity.day.we' },
  { value: 4, label: 'activity.day.th' },
  { value: 5, label: 'activity.day.fr' },
  { value: 6, label: 'activity.day.sa' },
]

function getWeekDates(): { date: Date; dateStr: string }[] {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - dayOfWeek)
  const dates: { date: Date; dateStr: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    dates.push({ date: d, dateStr: d.toISOString().split('T')[0] })
  }
  return dates
}

export function ActivitiesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const { t } = useI18n()

  const [showDialog, setShowDialog] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Form state
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
  const [participants, setParticipants] = useState<Participant[]>([])
  const [bringItems, setBringItems] = useState<BringItem[]>([])

  // Participant form
  const [newParticipantName, setNewParticipantName] = useState('')
  const [newParticipantRole, setNewParticipantRole] = useState<Participant['role']>('participant')

  // Bring item form
  const [newBringItem, setNewBringItem] = useState('')

  const weekDates = useMemo(() => getWeekDates(), [])
  const todayStr = new Date().toISOString().split('T')[0]

  const { data: members = [] } = useQuery({
    queryKey: ['circle-members', activeCircle?.id],
    queryFn: () => getCircleMembers(activeCircle!.id),
    enabled: !!activeCircle,
  })
  const memberNames = members.map((m) => m.profile?.display_name).filter(Boolean) as string[]

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  // Filter by selected date
  const filteredActivities = useMemo(() => {
    if (!selectedDate) return activities
    return activities.filter((a) => activityOccursOnDate(a, selectedDate))
  }, [activities, selectedDate])

  // Days with activities for the week calendar dots
  const daysWithActivities = useMemo(() => {
    const set = new Set<string>()
    for (const day of weekDates) {
      for (const activity of activities) {
        if (activityOccursOnDate(activity, day.dateStr)) {
          set.add(day.dateStr)
          break
        }
      }
    }
    return set
  }, [activities, weekDates])

  const createMutation = useMutation({
    mutationFn: () =>
      createActivity({
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
        participants,
        bring_items: bringItems,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      closeDialog()
    },
    onError: (err: Error) => alert(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      updateActivity(editingActivity!.id, {
        name: name.trim(),
        category,
        location: location.trim() || undefined,
        assigned_name: assignedName.trim() || undefined,
        recurrence_type: recurrenceType,
        recurrence_days: recurrenceDays,
        start_date: startDate,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        exclude_holidays: excludeHolidays,
        notes: notes.trim() || null,
        participants,
        bring_items: bringItems,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      closeDialog()
    },
    onError: (err: Error) => alert(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteActivity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  })

  // Update bring_items inline (toggle check)
  const toggleBringItemMutation = useMutation({
    mutationFn: ({ activityId, items }: { activityId: string; items: BringItem[] }) =>
      updateActivity(activityId, { bring_items: items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activities'] }),
  })

  function openCreate() {
    setEditingActivity(null)
    resetForm()
    setShowDialog(true)
  }

  function openEdit(activity: Activity) {
    setEditingActivity(activity)
    setName(activity.name)
    setCategory(activity.category)
    setLocation(activity.location || '')
    setAssignedName(activity.assigned_name || '')
    setRecurrenceType(activity.recurrence_type)
    setRecurrenceDays(activity.recurrence_days)
    setStartDate(activity.start_date)
    setEndDate(activity.end_date || '')
    setStartTime(activity.start_time?.slice(0, 5) || '')
    setEndTime(activity.end_time?.slice(0, 5) || '')
    setExcludeHolidays(activity.exclude_holidays)
    setNotes(activity.notes || '')
    setParticipants(activity.participants || [])
    setBringItems(activity.bring_items || [])
    setShowDialog(true)
  }

  function closeDialog() {
    setShowDialog(false)
    setEditingActivity(null)
    resetForm()
  }

  function resetForm() {
    setName('')
    setCategory('other')
    setLocation('')
    setAssignedName('')
    setRecurrenceType('weekly')
    setRecurrenceDays([])
    setStartDate('')
    setEndDate('')
    setStartTime('')
    setEndTime('')
    setExcludeHolidays(false)
    setNotes('')
    setParticipants([])
    setBringItems([])
    setNewParticipantName('')
    setNewBringItem('')
  }

  function toggleDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  function addParticipant() {
    if (!newParticipantName.trim()) return
    setParticipants((prev) => [...prev, { name: newParticipantName.trim(), role: newParticipantRole }])
    setNewParticipantName('')
    setNewParticipantRole('participant')
  }

  function removeParticipant(index: number) {
    setParticipants((prev) => prev.filter((_, i) => i !== index))
  }

  function addBringItem() {
    if (!newBringItem.trim()) return
    setBringItems((prev) => [...prev, { name: newBringItem.trim(), checked: false }])
    setNewBringItem('')
  }

  function removeBringItem(index: number) {
    setBringItems((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleBringItemInline(activity: Activity, itemIndex: number) {
    const items = [...(activity.bring_items || [])]
    items[itemIndex] = { ...items[itemIndex], checked: !items[itemIndex].checked }
    toggleBringItemMutation.mutate({ activityId: activity.id, items })
  }

  // Group by person
  const byPerson = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const act of filteredActivities) {
      const key = act.assigned_name || act.profile?.display_name || t('activity.unassigned')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(act)
    }
    return map
  }, [filteredActivities, t])

  if (!activeCircle) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated">
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('activity.activities')}</h2>
        </div>
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={t('activity.selectCircle')}
          description={t('activity.selectCircleDesc')}
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">{t('activity.activities')}</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('common.add')}
        </Button>
      </div>

      <p className="text-xs text-slate-400">{t('activity.subtitle')}</p>

      {/* Weekly Mini Calendar */}
      <div className="flex gap-1 justify-between">
        {weekDates.map(({ date, dateStr }) => {
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const hasActivity = daysWithActivities.has(dateStr)
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'narrow' })
          const dayNum = date.getDate()

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={cn(
                'flex flex-col items-center w-10 py-1.5 rounded-xl transition-all',
                isSelected
                  ? 'bg-brand-500 text-white'
                  : isToday
                    ? 'bg-brand-50 dark:bg-brand-900/30'
                    : 'bg-slate-50 dark:bg-surface-dark-overlay',
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isSelected ? 'text-white/80' : 'text-slate-400',
                )}
              >
                {dayLabel}
              </span>
              <span
                className={cn(
                  'text-sm font-bold mt-0.5',
                  isSelected
                    ? 'text-white'
                    : isToday
                      ? 'text-brand-500'
                      : 'text-slate-700 dark:text-slate-200',
                )}
              >
                {dayNum}
              </span>
              {hasActivity && (
                <span
                  className={cn(
                    'h-1 w-1 rounded-full mt-0.5',
                    isSelected ? 'bg-white' : 'bg-brand-500',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Selected date indicator */}
      {selectedDate && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-500 font-medium">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <button
            onClick={() => setSelectedDate(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredActivities.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title={t('activity.noActivities')}
          description={selectedDate ? t('activity.noActivitiesDate') : t('activity.noActivitiesDesc')}
          action={
            !selectedDate ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {t('activity.newActivity')}
              </Button>
            ) : undefined
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
                <AnimatePresence>
                  {acts.map((activity) => {
                    const cat = CATEGORIES.find((c) => c.value === activity.category)
                    const isExpanded = expandedId === activity.id
                    const hasParticipants = activity.participants && activity.participants.length > 0
                    const hasBringItems = activity.bring_items && activity.bring_items.length > 0

                    return (
                      <motion.div key={activity.id} layout>
                        <Card variant="elevated" className="overflow-hidden">
                          {/* Main card row - tappable to expand */}
                          <button
                            className="w-full p-3 text-left"
                            onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-xl mt-0.5">{cat?.emoji ?? '📌'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-slate-900 dark:text-white">
                                  {activity.name}
                                </p>
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
                                  {hasParticipants && (
                                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                      <Users className="h-3 w-3" />
                                      {activity.participants.length}
                                    </span>
                                  )}
                                  {hasBringItems && (
                                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                      <PackageCheck className="h-3 w-3" />
                                      {activity.bring_items.filter((i) => i.checked).length}/{activity.bring_items.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400" />
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Expanded detail */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                                  {/* End date */}
                                  {activity.end_date && (
                                    <p className="text-xs text-slate-500">
                                      {t('activity.until')}{' '}
                                      {new Date(activity.end_date + 'T12:00:00').toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </p>
                                  )}

                                  {/* Notes */}
                                  {activity.notes && (
                                    <p className="text-xs text-slate-500">{activity.notes}</p>
                                  )}

                                  {/* Participants grouped by role */}
                                  {hasParticipants && (
                                    <div>
                                      <p className="text-xs font-semibold text-slate-500 mb-1">
                                        {t('activity.participants')}
                                      </p>
                                      {PARTICIPANT_ROLES.filter((r) =>
                                        activity.participants.some((p) => p.role === r.value),
                                      ).map((role) => (
                                        <div key={role.value} className="mb-1.5">
                                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                                            {t(role.labelKey + 's')}
                                          </p>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {activity.participants
                                              .filter((p) => p.role === role.value)
                                              .map((p, i) => (
                                                <span
                                                  key={i}
                                                  className="text-xs bg-slate-100 dark:bg-surface-dark-overlay px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-300"
                                                >
                                                  {p.name}
                                                </span>
                                              ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Bring Items Checklist */}
                                  {hasBringItems && (
                                    <div>
                                      <p className="text-xs font-semibold text-slate-500 mb-1">
                                        {t('activity.whatToBring')}
                                      </p>
                                      <div className="space-y-1">
                                        {activity.bring_items.map((item, i) => (
                                          <label
                                            key={i}
                                            className="flex items-center gap-2 text-xs cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={item.checked}
                                              onChange={() => toggleBringItemInline(activity, i)}
                                              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                                            />
                                            <span
                                              className={cn(
                                                'text-slate-600 dark:text-slate-300',
                                                item.checked && 'line-through text-slate-400',
                                              )}
                                            >
                                              {item.name}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openEdit(activity)
                                      }}
                                      className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      {t('activity.edit')}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        deleteMutation.mutate(activity.id)
                                      }}
                                      className="flex items-center gap-1 text-xs text-danger hover:text-danger/80 font-medium"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      {t('common.delete')}
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </Card>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Activity Dialog */}
      <Dialog.Root open={showDialog} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {editingActivity ? t('activity.edit') : t('activity.newActivity')}
            </Dialog.Title>
            <div className="space-y-3">
              <Input
                label={t('activity.activityName')}
                placeholder={t('activity.activityNamePlaceholder')}
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  {t('activity.forWhom')}
                </label>
                <AutocompleteInput
                  value={assignedName}
                  onChange={setAssignedName}
                  suggestions={memberNames}
                  placeholder={t('activity.forWhomPlaceholder')}
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  {t('activity.category')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                        category === cat.value
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {cat.emoji} {t(cat.label)}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                label={t('activity.location')}
                placeholder={t('activity.locationPlaceholder')}
                value={location}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)}
              />

              {/* Recurrence */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  {t('activity.repeats')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: 'once', label: t('activity.once') },
                    { value: 'weekly', label: t('activity.weekly') },
                    { value: 'biweekly', label: t('activity.biweekly') },
                    { value: 'daily', label: t('activity.daily') },
                  ].map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRecurrenceType(r.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        recurrenceType === r.value
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selector */}
              {(recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'custom') && (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                    {t('activity.onDays')}
                  </label>
                  <div className="flex gap-1.5">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        onClick={() => toggleDay(day.value)}
                        className={cn(
                          'h-9 w-9 rounded-full text-xs font-medium transition-colors',
                          recurrenceDays.includes(day.value)
                            ? 'bg-brand-500 text-white'
                            : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400',
                        )}
                      >
                        {t(day.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input label={t('activity.startDate')} type="date" value={startDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)} />
                <Input label={t('activity.endDate')} type="date" value={endDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label={t('activity.startTime')} type="time" value={startTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value)} />
                <Input label={t('activity.endTime')} type="time" value={endTime} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value)} />
              </div>

              {/* Exclude holidays */}
              <label className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={excludeHolidays}
                  onChange={(e) => setExcludeHolidays(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{t('activity.skipHolidays')}</span>
              </label>

              <Input
                label={t('activity.notes')}
                placeholder={t('activity.notesPlaceholder')}
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
              />

              {/* Participants Section */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('activity.participants')}
                </p>
                {participants.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {participants.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-slate-50 dark:bg-surface-dark-overlay rounded-lg px-2 py-1"
                      >
                        <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {t(`activity.${p.role}`)}
                        </span>
                        <button onClick={() => removeParticipant(i)} className="text-slate-400 hover:text-danger">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 items-end">
                  <div className="flex-1">
                    <Input
                      placeholder={t('activity.participantNamePlaceholder')}
                      value={newParticipantName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewParticipantName(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addParticipant()}
                    />
                  </div>
                  <select
                    value={newParticipantRole}
                    onChange={(e) => setNewParticipantRole(e.target.value as Participant['role'])}
                    className="h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-surface-dark-overlay text-xs px-2 text-slate-700 dark:text-slate-300"
                  >
                    {PARTICIPANT_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {t(r.labelKey)}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={addParticipant}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Bring Items Section */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t('activity.whatToBring')}
                </p>
                {bringItems.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {bringItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-slate-50 dark:bg-surface-dark-overlay rounded-lg px-2 py-1"
                      >
                        <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">
                          {item.name}
                        </span>
                        <button onClick={() => removeBringItem(i)} className="text-slate-400 hover:text-danger">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <Input
                      placeholder={t('activity.addItemPlaceholder')}
                      value={newBringItem}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewBringItem(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addBringItem()}
                    />
                  </div>
                  <Button size="sm" variant="secondary" onClick={addBringItem}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={closeDialog}>
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => (editingActivity ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={!name.trim() || !startDate || createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? t('common.loading')
                    : editingActivity
                      ? t('common.save')
                      : t('common.create')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
