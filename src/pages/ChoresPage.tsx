import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Trash2, Pencil, Check, Flame, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { EmptyState } from '@/components/ui/EmptyState'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import {
  getChores,
  createChore,
  updateChore,
  deleteChore,
  completeChore,
  getCompletionsForChores,
  getWeekCompletions,
  formatFrequency,
  type Chore,
} from '@/services/chores'
import { getCircleMembers } from '@/services/circles'

const PERSON_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-300' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-300' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-300' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-300' },
]
function getPersonColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length]
}

const EMOJI_OPTIONS = [
  '🧹', '🧽', '🍽️', '🗑️', '🧺', '🐕', '📚', '🛏️', '🚿', '🌿',
  '🚗', '💪', '🎯', '⭐', '🏠', '🧸', '👕', '🪥', '📦', '🎵',
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

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - dayOfWeek)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export function ChoresPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle, profile } = useAppStore()
  const { t } = useI18n()
  const myName = profile?.display_name || ''

  const [showDialog, setShowDialog] = useState(false)
  const [editingChore, setEditingChore] = useState<Chore | null>(null)
  const [showWeekSummary, setShowWeekSummary] = useState(false)
  const [justCompleted, setJustCompleted] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string>('me')

  // Form state
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🧹')
  const [assignedName, setAssignedName] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([])
  const [dueTime, setDueTime] = useState('')
  const [points, setPoints] = useState('0')
  const [description, setDescription] = useState('')

  const today = getToday()
  const week = getWeekRange()

  const { data: members = [] } = useQuery({
    queryKey: ['circle-members', activeCircle?.id],
    queryFn: () => getCircleMembers(activeCircle!.id),
    enabled: !!activeCircle,
  })
  const memberNames = members.map((m) => m.profile?.display_name).filter(Boolean) as string[]

  const { data: chores = [], isLoading } = useQuery({
    queryKey: ['chores', activeCircle?.id],
    queryFn: () => getChores(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const choreIds = chores.map((c) => c.id)

  const { data: todayCompletions = [] } = useQuery({
    queryKey: ['chore-completions-today', choreIds, today],
    queryFn: () => getCompletionsForChores(choreIds, today),
    enabled: choreIds.length > 0,
  })

  const { data: weekCompletions = [] } = useQuery({
    queryKey: ['chore-completions-week', choreIds, week.start, week.end],
    queryFn: () => getWeekCompletions(choreIds, week.start, week.end),
    enabled: choreIds.length > 0,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createChore({
        circle_id: activeCircle!.id,
        name: name.trim(),
        icon,
        assigned_name: assignedName.trim() || undefined,
        frequency,
        recurrence_days: recurrenceDays,
        due_time: dueTime || undefined,
        points: parseInt(points) || 0,
        description: description.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chores'] })
      closeDialog()
    },
    onError: (err: Error) => alert(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      updateChore(editingChore!.id, {
        name: name.trim(),
        icon,
        assigned_name: assignedName.trim() || undefined,
        frequency,
        recurrence_days: recurrenceDays,
        due_time: dueTime || null,
        points: parseInt(points) || 0,
        description: description.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chores'] })
      closeDialog()
    },
    onError: (err: Error) => alert(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChore(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chores'] }),
  })

  const completeMutation = useMutation({
    mutationFn: (choreId: string) => completeChore(choreId, today),
    onSuccess: async (_data, choreId) => {
      setJustCompleted(choreId)
      setTimeout(() => setJustCompleted(null), 1500)
      await queryClient.invalidateQueries({ queryKey: ['chore-completions-today'] })
      await queryClient.invalidateQueries({ queryKey: ['chore-completions-week'] })
    },
  })

  function openCreate() {
    setEditingChore(null)
    resetForm()
    setShowDialog(true)
  }

  function openEdit(chore: Chore) {
    setEditingChore(chore)
    setName(chore.name)
    setIcon(chore.icon)
    setAssignedName(chore.assigned_name || '')
    setFrequency(chore.frequency)
    setRecurrenceDays(chore.recurrence_days)
    setDueTime(chore.due_time?.slice(0, 5) || '')
    setPoints(String(chore.points))
    setDescription(chore.description || '')
    setShowDialog(true)
  }

  function closeDialog() {
    setShowDialog(false)
    setEditingChore(null)
    resetForm()
  }

  function resetForm() {
    setName('')
    setIcon('🧹')
    setAssignedName('')
    setFrequency('daily')
    setRecurrenceDays([])
    setDueTime('')
    setPoints('0')
    setDescription('')
  }

  function toggleDay(day: number) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    )
  }

  function isCompletedToday(choreId: string): boolean {
    return todayCompletions.some((c) => c.chore_id === choreId)
  }

  // Unique assignee names for filter chips
  const assigneeNames = useMemo(() => {
    const names = new Set<string>()
    for (const chore of chores) {
      names.add(chore.assigned_name || chore.profile?.display_name || t('chore.unassigned'))
    }
    return [...names]
  }, [chores, t])

  // Filter chores by assignee
  const filteredChores = useMemo(() => {
    if (assigneeFilter === 'all') return chores
    const filterName = assigneeFilter === 'me' ? myName : assigneeFilter
    return chores.filter((c) => {
      const name = c.assigned_name || c.profile?.display_name || t('chore.unassigned')
      return name === filterName
    })
  }, [chores, assigneeFilter, myName, t])

  // Group filtered chores by assigned person
  const byPerson = useMemo(() => {
    const map = new Map<string, Chore[]>()
    for (const chore of filteredChores) {
      const key = chore.assigned_name || chore.profile?.display_name || t('chore.unassigned')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(chore)
    }
    return map
  }, [filteredChores, t])

  // Weekly points by person
  const weeklyPoints = useMemo(() => {
    const pts = new Map<string, number>()
    for (const completion of weekCompletions) {
      const chore = chores.find((c) => c.id === completion.chore_id)
      if (!chore) continue
      const person = chore.assigned_name || chore.profile?.display_name || t('chore.unassigned')
      pts.set(person, (pts.get(person) || 0) + chore.points)
    }
    return pts
  }, [weekCompletions, chores, t])

  // Week summary stats
  const weekStats = useMemo(() => {
    const total = chores.length * 7 // rough estimate
    const completed = weekCompletions.length
    return { total, completed }
  }, [chores, weekCompletions])

  if (!activeCircle) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated">
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('chore.chores')}</h2>
        </div>
        <EmptyState
          icon={<span className="text-5xl">🧹</span>}
          title={t('circle.noCircles')}
          description={t('chore.selectCircle')}
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
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">{t('chore.chores')}</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('common.add')}
        </Button>
      </div>

      {/* Weekly Points Bar */}
      {weeklyPoints.size > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[...weeklyPoints.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([person, pts]) => (
              <div
                key={person}
                className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1"
              >
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {person}: {pts} {t('chore.points')}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Assignee filter chips */}
      {chores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          <button
            onClick={() => setAssigneeFilter('all')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0',
              assigneeFilter === 'all'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
            )}
          >
            {t('chore.all')}
          </button>
          <button
            onClick={() => setAssigneeFilter('me')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0',
              assigneeFilter === 'me'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
            )}
          >
            {t('chore.me')}
          </button>
          {assigneeNames.filter((n) => n !== myName).map((name) => (
            <button
              key={name}
              onClick={() => setAssigneeFilter(name)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0',
                assigneeFilter === name
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : chores.length === 0 ? (
        <EmptyState
          icon={<span className="text-5xl">🧹</span>}
          title={t('chore.noChores')}
          description={t('chore.addFirst')}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('chore.new')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {[...byPerson.entries()].map(([person, personChores]) => (
            <div key={person}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                  getPersonColor(person).bg, getPersonColor(person).text
                )}>
                  {person.charAt(0).toUpperCase()}
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {person}
                </p>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {personChores.map((chore) => {
                    const done = isCompletedToday(chore.id)
                    const completing = justCompleted === chore.id
                    return (
                      <motion.div
                        key={chore.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <Card
                          variant="elevated"
                          className={cn(
                            'p-3 transition-all',
                            done && 'opacity-60',
                            completing && 'ring-2 ring-green-400',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{chore.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  'font-semibold text-sm text-slate-900 dark:text-white',
                                  done && 'line-through',
                                )}
                              >
                                {chore.name}
                              </p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                <span className="text-[10px] text-slate-400">
                                  {formatFrequency(chore)}
                                </span>
                                {chore.due_time && (
                                  <span className="text-[10px] text-slate-400">
                                    {chore.due_time.slice(0, 5)}
                                  </span>
                                )}
                                {chore.points > 0 && (
                                  <span className="text-[10px] text-amber-500 font-medium">
                                    {chore.points} {t('chore.points')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {done ? (
                                <motion.div
                                  initial={completing ? { scale: 0 } : { scale: 1 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                >
                                  <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full">
                                    <Check className="h-3.5 w-3.5" />
                                    {t('chore.done')}
                                  </span>
                                </motion.div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => completeMutation.mutate(chore.id)}
                                  disabled={completeMutation.isPending}
                                  className="text-xs"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {t('chore.markDone')}
                                </Button>
                              )}
                              <button
                                onClick={() => openEdit(chore)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteMutation.mutate(chore.id)}
                                className="text-slate-400 hover:text-danger p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
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

      {/* Weekly Summary */}
      {chores.length > 0 && (
        <Card className="overflow-hidden">
          <button
            onClick={() => setShowWeekSummary((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <span>{t('chore.weekSummary')}</span>
            {showWeekSummary ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          <AnimatePresence>
            {showWeekSummary && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 space-y-2">
                  <p className="text-xs text-slate-400">
                    {t('chore.completed')}: {weekStats.completed} {t('chore.thisWeek')}
                  </p>
                  {[...weeklyPoints.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([person, pts]) => (
                      <div key={person} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300">{person}</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {pts} {t('chore.points')}
                        </span>
                      </div>
                    ))}
                  {weeklyPoints.size === 0 && (
                    <p className="text-xs text-slate-400 italic">{t('chore.noCompletions')}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog.Root open={showDialog} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {editingChore ? t('chore.edit') : t('chore.new')}
            </Dialog.Title>
            <div className="space-y-3">
              <Input
                label={t('chore.choreName')}
                placeholder={t('chore.choreNamePlaceholder')}
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />

              {/* Emoji Picker */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  {t('chore.icon')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setIcon(emoji)}
                      className={cn(
                        'h-9 w-9 rounded-lg text-lg flex items-center justify-center transition-all',
                        icon === emoji
                          ? 'bg-brand-500/20 ring-2 ring-brand-500 scale-110'
                          : 'bg-slate-100 dark:bg-surface-dark-overlay',
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  {t('chore.assignedTo')}
                </label>
                <AutocompleteInput
                  value={assignedName}
                  onChange={setAssignedName}
                  suggestions={memberNames}
                  placeholder={t('chore.assignedPlaceholder')}
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  {t('chore.frequency')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: 'daily', label: t('chore.daily') },
                    { value: 'weekly', label: t('chore.weekly') },
                    { value: 'biweekly', label: t('chore.biweekly') },
                    { value: 'monthly', label: t('chore.monthly') },
                    { value: 'once', label: t('chore.once') },
                  ].map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        frequency === f.value
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selector */}
              {(frequency === 'weekly' || frequency === 'biweekly') && (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                    {t('chore.onDays')}
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
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('chore.dueTime')}
                  type="time"
                  value={dueTime}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDueTime(e.target.value)}
                />
                <Input
                  label={t('chore.points')}
                  type="number"
                  value={points}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPoints(e.target.value)}
                />
              </div>

              <Input
                label={t('chore.description')}
                placeholder={t('chore.descriptionPlaceholder')}
                value={description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={closeDialog}>
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => (editingChore ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? t('common.loading')
                    : editingChore
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
