import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Copy, Check, CalendarDays, MapPin, Trash2,
  UtensilsCrossed, Package, ListTodo, Users, Crown, X, Download, Edit3, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { formatQuantity } from '@/lib/format'
import {
  getEvent, getEventParticipants, getEventItems, getEventOrganizers,
  addEventItem, claimItem, unclaimItem, updateItemStatus, deleteEventItem,
  deleteEvent, addOrganizer, cloneEvent, updateItemNotes,
  assignItem, respondToAssignment,
  type EventItem, type EventParticipant, type EventOrganizer,
} from '@/services/events'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { exportEventToCalendar } from '@/lib/calendar'
import { EventAIPlanDialog } from '@/components/ui/EventAIPlanDialog'
import type { EventAIPlanRequest } from '@/components/ui/EventAIPlanDialog'
import { useAIAccess } from '@/hooks/useAIAccess'
import { useToast } from '@/components/ui/Toast'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { supabase } from '@/services/supabase'
import { logAIUsage } from '@/services/ai-usage'

// TABS moved inside component for i18n

type Tab = 'overview' | 'menu' | 'supplies' | 'tasks' | 'mine'

const DISH_CATEGORIES = [
  { value: 'appetizer', label: 'Appetizer', emoji: '🥗' },
  { value: 'main', label: 'Main', emoji: '🍖' },
  { value: 'side', label: 'Side', emoji: '🥘' },
  { value: 'dessert', label: 'Dessert', emoji: '🍰' },
  { value: 'drink', label: 'Drink', emoji: '🥤' },
  { value: 'other', label: 'Other', emoji: '🍽️' },
]

const TASK_CATEGORIES = [
  { value: 'setup', label: 'Setup' },
  { value: 'during', label: 'During' },
  { value: 'cleanup', label: 'Cleanup' },
  { value: 'other', label: 'Other' },
]

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAppStore()
  const { t, locale } = useI18n()

  const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: t('event.overview'), icon: Users },
    { id: 'mine', label: 'Mine', icon: Crown },
    { id: 'menu', label: t('event.menu'), icon: UtensilsCrossed },
    { id: 'supplies', label: t('event.supplies'), icon: Package },
    { id: 'tasks', label: t('event.tasks'), icon: ListTodo },
  ]

  const ai = useAIAccess()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showDeleteEvent, setShowDeleteEvent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAIPlanDialog, setShowAIPlanDialog] = useState(false)
  const [showAIUpgrade, setShowAIUpgrade] = useState(false)
  const [isAIPlanLoading, setIsAIPlanLoading] = useState(false)

  // Add item form
  const [addType, setAddType] = useState<'dish' | 'supply' | 'task'>('dish')
  const [addName, setAddName] = useState('')
  const [addCategory, setAddCategory] = useState('other')
  const [addQuantity, setAddQuantity] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [addDueAt, setAddDueAt] = useState('')
  const [error, setError] = useState('')

  const { data: event, isLoading: isEventLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEvent(id!),
    enabled: !!id,
  })

  const { data: participants = [] } = useQuery({
    queryKey: ['event-participants', id],
    queryFn: () => getEventParticipants(id!),
    enabled: !!id,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['event-items', id],
    queryFn: () => getEventItems(id!),
    enabled: !!id,
  })

  const { data: organizers = [] } = useQuery({
    queryKey: ['event-organizers', id],
    queryFn: () => getEventOrganizers(id!),
    enabled: !!id,
  })

  const isOrganizer = organizers.some((o: EventOrganizer) => o.user_id === profile?.id) || event?.created_by === profile?.id

  const addItemMutation = useMutation({
    mutationFn: () => addEventItem(id!, {
      type: addType,
      name: addName.trim(),
      category: addCategory,
      quantity: addQuantity ? parseInt(addQuantity) : undefined,
      notes: addNotes.trim() || undefined,
      due_at: addDueAt || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-items', id] })
      setShowAddItem(false)
      setAddName('')
      setAddNotes('')
      setAddQuantity('')
      setAddDueAt('')
    },
    onError: (err: Error) => setError(err.message),
  })

  const claimMutation = useMutation({
    mutationFn: (itemId: string) => claimItem(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
    onError: (err: Error) => setError(err.message),
  })

  const unclaimMutation = useMutation({
    mutationFn: (itemId: string) => unclaimItem(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) => updateItemStatus(itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteEventItem(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
  })

  const cloneEventMutation = useMutation({
    mutationFn: () => cloneEvent(id!, `${event?.name ?? 'Event'} (copy)`),
    onSuccess: (newEvent) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate(`/events/${newEvent.id}`)
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteEventMutation = useMutation({
    mutationFn: () => deleteEvent(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate('/events')
    },
  })

  const makeOrganizerMutation = useMutation({
    mutationFn: (userId: string) => addOrganizer(id!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-organizers', id] }),
  })

  const updateNotesMutation = useMutation({
    mutationFn: ({ itemId, notes }: { itemId: string; notes: string }) => updateItemNotes(itemId, notes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
  })

  const assignMutation = useMutation({
    mutationFn: ({ itemId, userId }: { itemId: string; userId: string }) => assignItem(itemId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
    onError: (err: Error) => setError(err.message),
  })

  const respondMutation = useMutation({
    mutationFn: ({ itemId, accept }: { itemId: string; accept: boolean }) => respondToAssignment(itemId, accept),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event-items', id] }),
  })

  async function handleAIPlanSubmit(request: EventAIPlanRequest) {
    setIsAIPlanLoading(true)
    try {
      const sessionId = localStorage.getItem('replanish_session_id') ?? crypto.randomUUID()
      const { data, error } = await supabase.functions.invoke('plan-event', {
        body: {
          eventId: id,
          description: request.description,
          headcountAdults: request.headcountAdults,
          headcountKids: request.headcountKids,
          budget: request.budget,
          helpNeeded: request.helpNeeded,
          keyRequirements: request.keyRequirements,
          session_id: sessionId,
          feature_context: 'event_detail',
        },
      })
      if (error) throw error
      if (data?._ai_usage) {
        const { data: authData } = await supabase.auth.getUser()
        if (authData.user) {
          await logAIUsage(
            authData.user.id,
            'meal_plan',
            data._ai_usage.model,
            data._ai_usage.tokens_in,
            data._ai_usage.tokens_out,
            data._ai_usage.cost_usd,
            {
              session_id: sessionId,
              feature_context: 'event_detail',
            }
          )
        }
      }
      setShowAIPlanDialog(false)
      toast.success(t('event.aiPlanSuccess'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
      setShowAIPlanDialog(false)
    } finally {
      setIsAIPlanLoading(false)
    }
  }

  if (isEventLoading) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="h-11 w-11 rounded-xl flex items-center justify-center bg-rp-bg-soft mb-4">
          <ArrowLeft className="h-5 w-5 text-rp-ink-soft rtl-flip" />
        </button>
        <div className="space-y-3 animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-lg w-2/3" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-1/3" />
          <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="h-11 w-11 rounded-xl flex items-center justify-center bg-rp-bg-soft mb-4">
          <ArrowLeft className="h-5 w-5 text-rp-ink-soft rtl-flip" />
        </button>
        <p className="text-center text-slate-500">{t('event.notFound')}</p>
      </div>
    )
  }

  const dishes = items.filter((i: EventItem) => i.type === 'dish')
  const supplies = items.filter((i: EventItem) => i.type === 'supply')
  const tasks = items.filter((i: EventItem) => i.type === 'task')
  const attending = participants.filter((p: EventParticipant) => p.status === 'attending')
  const inviteUrl = `${window.location.origin}/join-event/${event.invite_code}`

  function openAddItem(type: 'dish' | 'supply' | 'task') {
    setAddType(type)
    setAddCategory(type === 'dish' ? 'other' : type === 'task' ? 'other' : 'general')
    setShowAddItem(true)
    setError('')
  }

  return (
    <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="h-11 w-11 rounded-xl flex items-center justify-center bg-rp-bg-soft active:scale-90 transition-transform shrink-0">
          <ArrowLeft className="h-5 w-5 text-rp-ink-soft rtl-flip" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-rp-ink truncate">{event.name}</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {event.event_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {new Date(event.event_date).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <button onClick={() => setError('')} className="w-full text-left text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
          {error} (tap to dismiss)
        </button>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-rp-bg-soft rounded-xl p-1">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
              activeTab === tabId
                ? 'bg-white dark:bg-surface-dark-overlay text-rp-ink shadow-sm'
                : 'text-slate-500'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden min-[380px]:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {event.description && (
            <p className="text-sm text-rp-ink-soft">{event.description}</p>
          )}

          {/* Invite link */}
          <Card className="p-3">
            <p className="text-xs text-slate-400 mb-1.5">Share this link to invite people</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-100 dark:bg-surface-dark-overlay px-2 py-1.5 rounded-lg text-[10px] font-mono text-slate-500 truncate">
                {inviteUrl}
              </code>
              <Button size="sm" variant="secondary" onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </Card>

          {/* Add to Calendar */}
          {event.event_date && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => exportEventToCalendar(event)}
            >
              <Download className="h-4 w-4" />
              Add to Calendar
            </Button>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-brand-500">{attending.length}</p>
              <p className="text-[10px] text-slate-400">{t('event.attending')}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-emerald-500">{items.filter((i: EventItem) => i.status === 'claimed' || i.status === 'done').length}/{items.length}</p>
              <p className="text-[10px] text-slate-400">{t('event.claimed')}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-purple-500">{tasks.filter((tk: EventItem) => tk.status === 'done').length}/{tasks.length}</p>
              <p className="text-[10px] text-slate-400">{t('event.tasksDone')}</p>
            </Card>
          </div>

          {/* Attendees */}
          <section>
            <h3 className="text-sm font-semibold text-rp-ink mb-2">
              {t('event.attending')} ({attending.length})
            </h3>
            <div className="space-y-1.5">
              {attending.map((p: EventParticipant) => {
                const isOrg = organizers.some((o: EventOrganizer) => o.user_id === p.user_id)
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-surface-dark-elevated">
                    <div className="h-7 w-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-xs shrink-0">
                      {p.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm text-rp-ink-soft flex-1 truncate">
                      {p.profile?.display_name || p.guest_name || 'Guest'}
                    </span>
                    {isOrg && <Crown className="h-3.5 w-3.5 text-yellow-500" />}
                    {isOrganizer && !isOrg && p.user_id && (
                      <button
                        onClick={() => makeOrganizerMutation.mutate(p.user_id!)}
                        className="text-xs text-slate-400 hover:text-brand-500 py-2 px-3 min-h-[44px] inline-flex items-center"
                      >
                        {t('event.makeHost')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Hint about Mine tab */}
          {items.some((i: EventItem) => i.assigned_to === profile?.id) && (
            <button
              onClick={() => setActiveTab('mine')}
              className="w-full text-center text-xs text-brand-500 font-medium py-2"
            >
              You have items assigned - tap "Mine" tab to see them
            </button>
          )}

          {/* AI Plan Event — organizer + AI access only */}
          {isOrganizer && ai.hasAI && (
            <button
              onClick={() => setShowAIPlanDialog(true)}
              disabled={isAIPlanLoading}
              className={cn(
                'w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed transition-all text-start',
                'border-brand-300 dark:border-brand-700 bg-brand-500/5 hover:bg-brand-500/10',
                isAIPlanLoading && 'opacity-60'
              )}
            >
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center shrink-0">
                {isAIPlanLoading ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-white" />
                )}
              </div>
              <span className="text-sm font-semibold text-rp-ink">
                {isAIPlanLoading ? t('event.aiGenerating') : t('event.aiPlan')}
              </span>
            </button>
          )}

          {/* Clone & Delete */}
          {isOrganizer && (
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => cloneEventMutation.mutate()}
                disabled={cloneEventMutation.isPending}
              >
                {cloneEventMutation.isPending ? t('common.loading') : t('event.clone')}
              </Button>
              <button
                onClick={() => setShowDeleteEvent(true)}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-danger hover:bg-danger/10 rounded-xl transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {t('event.delete')}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'menu' && (
        <ItemList
          items={dishes}
          type="dish"
          emptyMessage="No dishes yet. Add what people should bring or cook."
          onAdd={() => openAddItem('dish')}
          onClaim={(itemId) => claimMutation.mutate(itemId)}
          onUnclaim={(itemId) => unclaimMutation.mutate(itemId)}
          onStatusChange={(itemId, status) => statusMutation.mutate({ itemId, status })}
          onDelete={(itemId) => deleteItemMutation.mutate(itemId)}
          onUpdateNotes={(itemId, notes) => updateNotesMutation.mutate({ itemId, notes })}
          onRespond={(itemId, accept) => respondMutation.mutate({ itemId, accept })}
          onAssign={(itemId, userId) => assignMutation.mutate({ itemId, userId })}
          participants={attending}
          currentUserId={profile?.id}
          isOrganizer={isOrganizer}
          categories={DISH_CATEGORIES}
        />
      )}

      {activeTab === 'supplies' && (
        <ItemList
          items={supplies}
          type="supply"
          emptyMessage="No supplies needed yet. Add items like chairs, cups, decorations."
          onAdd={() => openAddItem('supply')}
          onClaim={(itemId) => claimMutation.mutate(itemId)}
          onUnclaim={(itemId) => unclaimMutation.mutate(itemId)}
          onStatusChange={(itemId, status) => statusMutation.mutate({ itemId, status })}
          onDelete={(itemId) => deleteItemMutation.mutate(itemId)}
          onUpdateNotes={(itemId, notes) => updateNotesMutation.mutate({ itemId, notes })}
          onRespond={(itemId, accept) => respondMutation.mutate({ itemId, accept })}
          onAssign={(itemId, userId) => assignMutation.mutate({ itemId, userId })}
          participants={attending}
          currentUserId={profile?.id}
          isOrganizer={isOrganizer}
        />
      )}

      {activeTab === 'tasks' && (
        <ItemList
          items={tasks}
          type="task"
          emptyMessage="No tasks yet. Add things like setup, cleanup, or activities."
          onAdd={() => openAddItem('task')}
          onClaim={(itemId) => claimMutation.mutate(itemId)}
          onUnclaim={(itemId) => unclaimMutation.mutate(itemId)}
          onStatusChange={(itemId, status) => statusMutation.mutate({ itemId, status })}
          onDelete={(itemId) => deleteItemMutation.mutate(itemId)}
          onUpdateNotes={(itemId, notes) => updateNotesMutation.mutate({ itemId, notes })}
          onRespond={(itemId, accept) => respondMutation.mutate({ itemId, accept })}
          onAssign={(itemId, userId) => assignMutation.mutate({ itemId, userId })}
          participants={attending}
          currentUserId={profile?.id}
          isOrganizer={isOrganizer}
          categories={TASK_CATEGORIES}
        />
      )}

      {activeTab === 'mine' && (() => {
        const myDishes = items.filter((i: EventItem) => i.type === 'dish' && i.assigned_to === profile?.id)
        const mySupplies = items.filter((i: EventItem) => i.type === 'supply' && i.assigned_to === profile?.id)
        const myTasks = items.filter((i: EventItem) => i.type === 'task' && i.assigned_to === profile?.id)
        const hasItems = myDishes.length + mySupplies.length + myTasks.length > 0

        return (
          <div className="space-y-4">
            {!hasItems ? (
              <div className="text-center py-12">
                <Crown className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Nothing assigned to you yet</p>
                <p className="text-xs text-slate-400 mt-1">Volunteer for items or wait to be assigned</p>
              </div>
            ) : (
              <>
                {/* My Dishes */}
                {myDishes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                      🍽️ My Dishes ({myDishes.length})
                    </p>
                    <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                      {myDishes.map((item) => (
                        <div key={item.id} className="px-3 py-2.5 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-rp-ink flex-1">{item.name}</p>
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded-full',
                              item.status === 'done' ? 'bg-success/20 text-success' :
                              item.status === 'pending_approval' ? 'bg-warning/20 text-warning' :
                              'bg-brand-500/10 text-brand-500'
                            )}>
                              {item.status === 'pending_approval' ? 'Pending' : item.status}
                            </span>
                          </div>
                          {item.notes && <p className="text-[10px] text-slate-400">{item.notes}</p>}
                        </div>
                      ))}
                    </Card>
                  </div>
                )}

                {/* My Supplies */}
                {mySupplies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                      📦 My Supplies ({mySupplies.length})
                    </p>
                    <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mySupplies.map((item) => (
                        <div key={item.id} className="px-3 py-2.5 flex items-center gap-2">
                          <p className="text-sm text-rp-ink flex-1">
                            {item.quantity && <span className="text-slate-400">x{formatQuantity(item.quantity)}</span>}
                            {item.name}
                          </p>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            item.status === 'done' ? 'bg-success/20 text-success' : 'bg-brand-500/10 text-brand-500'
                          )}>
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </Card>
                  </div>
                )}

                {/* My Tasks */}
                {myTasks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                      ✅ My Tasks ({myTasks.length})
                    </p>
                    <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                      {myTasks.map((item) => (
                        <div key={item.id} className="px-3 py-2.5 flex items-center gap-2">
                          <button
                            onClick={() => statusMutation.mutate({ itemId: item.id, status: item.status === 'done' ? 'claimed' : 'done' })}
                            className={cn(
                              'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              item.status === 'done' ? 'bg-success border-success' : 'border-slate-300 dark:border-slate-600'
                            )}
                          >
                            {item.status === 'done' && <Check className="h-3 w-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm', item.status === 'done' ? 'line-through text-slate-400' : 'text-rp-ink')}>
                              {item.name}
                            </p>
                            {item.notes && <p className="text-[10px] text-slate-400">{item.notes}</p>}
                            {item.due_at && (
                              <p className="text-[10px] text-slate-400">
                                Due: {new Date(item.due_at).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

      {/* Add Item Dialog */}
      <Dialog.Root open={showAddItem} onOpenChange={setShowAddItem}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-rp-card rounded-t-2xl p-6 pb-10 max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-rp-ink mb-4">
              {addType === 'dish' ? t('event.addDish') : addType === 'supply' ? t('event.addSupply') : t('event.addTask')}
            </Dialog.Title>
            <div className="space-y-3">
              <Input
                label="Name"
                placeholder={addType === 'dish' ? 'e.g., Guacamole' : addType === 'supply' ? 'e.g., Folding chairs' : 'e.g., Set up tables at 2pm'}
                value={addName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddName(e.target.value)}
              />

              {addType === 'dish' && (
                <div>
                  <label className="text-sm font-medium text-rp-ink-soft mb-1.5 block">Category</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DISH_CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => setAddCategory(cat.value)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                          addCategory === cat.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-rp-ink-soft'
                        )}
                      >
                        {cat.emoji} {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {addType === 'supply' && (
                <Input
                  label="Quantity"
                  type="number"
                  placeholder="e.g., 24"
                  value={addQuantity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddQuantity(e.target.value)}
                />
              )}

              {addType === 'task' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-rp-ink-soft mb-1.5 block">When</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {TASK_CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          onClick={() => setAddCategory(cat.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                            addCategory === cat.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-rp-ink-soft'
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    label="Due date/time (optional)"
                    type="datetime-local"
                    value={addDueAt}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddDueAt(e.target.value)}
                  />
                </>
              )}

              <Input
                label="Notes (optional)"
                placeholder="Any details..."
                value={addNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddNotes(e.target.value)}
              />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowAddItem(false)}>{t('common.cancel')}</Button>
                <Button className="flex-1" onClick={() => addItemMutation.mutate()} disabled={!addName.trim() || addItemMutation.isPending}>
                  {addItemMutation.isPending ? t('common.loading') : t('common.add')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Event Dialog */}
      <Dialog.Root open={showDeleteEvent} onOpenChange={setShowDeleteEvent}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-rp-ink mb-2">{t('event.delete')}</Dialog.Title>
            <p className="text-sm text-rp-ink-mute mb-4">
              Are you sure you want to delete <strong>{event.name}</strong>? All dishes, supplies, tasks, and participant info will be removed.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteEvent(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" className="flex-1" onClick={() => deleteEventMutation.mutate()} disabled={deleteEventMutation.isPending}>
                {deleteEventMutation.isPending ? t('common.loading') : t('common.delete')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* AI Plan Event dialog */}
      <EventAIPlanDialog
        open={showAIPlanDialog}
        onOpenChange={setShowAIPlanDialog}
        eventTitle={event.name}
        onSubmit={handleAIPlanSubmit}
        isLoading={isAIPlanLoading}
      />

      {/* AI Upgrade modal — shown when user lacks AI access */}
      <AIUpgradeModal
        open={showAIUpgrade}
        onOpenChange={setShowAIUpgrade}
      />
    </div>
  )
}

// Reusable item list component for Menu/Supplies/Tasks tabs
function ItemList({
  items, type, emptyMessage, onAdd, onClaim, onUnclaim, onStatusChange, onDelete,
  onUpdateNotes, onRespond, onAssign, participants,
  currentUserId, isOrganizer, categories,
}: {
  items: EventItem[]
  type: 'dish' | 'supply' | 'task'
  emptyMessage: string
  onAdd: () => void
  onClaim: (id: string) => void
  onUnclaim: (id: string) => void
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  onRespond?: (id: string, accept: boolean) => void
  onAssign?: (itemId: string, userId: string) => void
  participants?: EventParticipant[]
  currentUserId?: string
  isOrganizer: boolean
  categories?: { value: string; label: string; emoji?: string }[]
}) {
  const { t } = useI18n()
  const unclaimed = items.filter((i) => i.status === 'unclaimed')
  const claimed = items.filter((i) => i.status !== 'unclaimed')

  // Group by category if categories provided
  const grouped = categories
    ? categories.map((cat) => ({
        ...cat,
        items: claimed.filter((i) => i.category === cat.value),
      })).filter((g) => g.items.length > 0)
    : null

  return (
    <div className="space-y-4">
      <Button size="sm" className="w-full" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        {type === 'dish' ? t('event.addDish') : type === 'supply' ? t('event.addSupply') : t('event.addTask')}
      </Button>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">{emptyMessage}</p>
      ) : (
        <>
          {/* Unclaimed */}
          {unclaimed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-1.5 px-1">
                {t('event.needsSomeone')} ({unclaimed.length})
              </p>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                {unclaimed.map((item) => (
                  <div key={item.id} className="px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-rp-ink">
                          {item.quantity && <span className="text-slate-400">x{formatQuantity(item.quantity)}</span>}
                          {item.name}
                        </p>
                        {item.notes && <p className="text-[10px] text-slate-400">{item.notes}</p>}
                        {item.due_at && (
                          <p className="text-[10px] text-slate-400">
                            Due: {new Date(item.due_at).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => onClaim(item.id)}>
                        {type === 'task' ? t('event.illDoIt') : t('event.illBringIt')}
                      </Button>
                      {isOrganizer && (
                        <button onClick={() => onDelete(item.id)} className="text-slate-400 hover:text-danger">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Assign to person (organizer only) */}
                    {isOrganizer && onAssign && participants && participants.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onAssign(item.id, e.target.value)
                            e.target.value = ''
                          }
                        }}
                        className="w-full text-xs bg-rp-bg-soft border border-rp-hairline rounded-lg px-2 py-1.5 text-rp-ink-soft"
                      >
                        <option value="">Assign to someone...</option>
                        {participants.map((p) => (
                          <option key={p.id} value={p.user_id || ''}>
                            {p.profile?.display_name || p.guest_name || 'Guest'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* Claimed/Done */}
          {grouped ? (
            grouped.map((group) => (
              <div key={group.value}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                  {group.emoji && `${group.emoji} `}{group.label}
                </p>
                <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      type={type}
                      currentUserId={currentUserId}
                      isOrganizer={isOrganizer}
                      onUnclaim={onUnclaim}
                      onStatusChange={onStatusChange}
                      onDelete={onDelete}
                      onUpdateNotes={onUpdateNotes}
                      onRespond={onRespond}
                    />
                  ))}
                </Card>
              </div>
            ))
          ) : claimed.length > 0 ? (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {claimed.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  type={type}
                  currentUserId={currentUserId}
                  isOrganizer={isOrganizer}
                  onUnclaim={onUnclaim}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                />
              ))}
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

function ItemRow({
  item, type, currentUserId, isOrganizer, onUnclaim, onStatusChange, onDelete, onUpdateNotes, onRespond,
}: {
  item: EventItem
  type: string
  currentUserId?: string
  isOrganizer: boolean
  onUnclaim: (id: string) => void
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
  onUpdateNotes?: (id: string, notes: string) => void
  onRespond?: (id: string, accept: boolean) => void
}) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [noteText, setNoteText] = useState(item.notes || '')
  const isMine = item.assigned_to === currentUserId
  const isDone = item.status === 'done'
  const isPendingApproval = item.status === 'pending_approval'

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Status toggle for tasks */}
        {type === 'task' && !isPendingApproval && (
          <button
            onClick={() => onStatusChange(item.id, isDone ? 'claimed' : 'done')}
            className={cn(
              'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
              isDone ? 'bg-success border-success' : 'border-slate-300 dark:border-slate-600'
            )}
          >
            {isDone && <Check className="h-3 w-3 text-white" />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm',
            isDone ? 'line-through text-slate-400' : 'text-rp-ink'
          )}>
            {item.quantity && <span className="text-slate-400">x{formatQuantity(item.quantity)}</span>}
            {item.name}
          </p>
        </div>

        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full shrink-0',
          isDone ? 'bg-success/20 text-success'
            : isPendingApproval ? 'bg-warning/20 text-warning'
            : 'bg-brand-500/10 text-brand-500'
        )}>
          {isPendingApproval ? 'Pending' : item.profile?.display_name || item.guest_name || '?'}
        </span>

        {isMine && !isDone && !isPendingApproval && onUpdateNotes && (
          <button onClick={() => setEditingNotes(!editingNotes)} className="text-slate-400 hover:text-brand-500 shrink-0">
            <Edit3 className="h-3 w-3" />
          </button>
        )}

        {(isMine || isOrganizer) && !isDone && !isPendingApproval && (
          <button onClick={() => onUnclaim(item.id)} className="text-slate-400 hover:text-danger shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {isOrganizer && (
          <button onClick={() => onDelete(item.id)} className="text-slate-400 hover:text-danger shrink-0">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Pending approval - accept/deny buttons */}
      {isPendingApproval && isMine && onRespond && (
        <div className="flex gap-2 ml-7">
          <button
            onClick={() => onRespond(item.id, true)}
            className="text-xs px-3 py-1 rounded-full bg-success/20 text-success font-medium"
          >
            Accept
          </button>
          <button
            onClick={() => onRespond(item.id, false)}
            className="text-xs px-3 py-1 rounded-full bg-danger/20 text-danger font-medium"
          >
            Decline
          </button>
        </div>
      )}

      {/* Notes display */}
      {item.notes && !editingNotes && (
        <p className="text-[10px] text-slate-400 ml-7">{item.notes}</p>
      )}

      {/* Notes editing */}
      {editingNotes && onUpdateNotes && (
        <div className="flex gap-2 ml-7">
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 text-xs bg-rp-bg-soft px-2 py-1 rounded border border-rp-hairline text-rp-ink-soft"
          />
          <button
            onClick={() => {
              onUpdateNotes(item.id, noteText)
              setEditingNotes(false)
            }}
            className="text-xs text-brand-500 font-medium"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}
