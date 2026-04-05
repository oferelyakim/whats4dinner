import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Copy, Check, CalendarDays, MapPin, Trash2,
  UtensilsCrossed, Package, ListTodo, Users, Crown, X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import {
  getEvent, getEventParticipants, getEventItems, getEventOrganizers,
  addEventItem, claimItem, unclaimItem, updateItemStatus, deleteEventItem,
  deleteEvent, addOrganizer,
  type EventItem, type EventParticipant, type EventOrganizer,
} from '@/services/events'
import { useAppStore } from '@/stores/appStore'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Users },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'supplies', label: 'Supplies', icon: Package },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
] as const

type Tab = (typeof TABS)[number]['id']

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

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showAddItem, setShowAddItem] = useState(false)
  const [showDeleteEvent, setShowDeleteEvent] = useState(false)
  const [copied, setCopied] = useState(false)

  // Add item form
  const [addType, setAddType] = useState<'dish' | 'supply' | 'task'>('dish')
  const [addName, setAddName] = useState('')
  const [addCategory, setAddCategory] = useState('other')
  const [addQuantity, setAddQuantity] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [addDueAt, setAddDueAt] = useState('')
  const [error, setError] = useState('')

  const { data: event } = useQuery({
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

  if (!event) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated mb-4">
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <p className="text-center text-slate-500">Event not found</p>
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
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0">
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{event.name}</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {event.event_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {new Date(event.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
      <div className="flex gap-1 bg-slate-100 dark:bg-surface-dark-elevated rounded-xl p-1">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
              activeTab === tabId
                ? 'bg-white dark:bg-surface-dark-overlay text-slate-900 dark:text-white shadow-sm'
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
            <p className="text-sm text-slate-600 dark:text-slate-400">{event.description}</p>
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-brand-500">{attending.length}</p>
              <p className="text-[10px] text-slate-400">Attending</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-emerald-500">{items.filter((i: EventItem) => i.status === 'claimed' || i.status === 'done').length}/{items.length}</p>
              <p className="text-[10px] text-slate-400">Claimed</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-purple-500">{tasks.filter((t: EventItem) => t.status === 'done').length}/{tasks.length}</p>
              <p className="text-[10px] text-slate-400">Tasks Done</p>
            </Card>
          </div>

          {/* Attendees */}
          <section>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Attending ({attending.length})
            </h3>
            <div className="space-y-1.5">
              {attending.map((p: EventParticipant) => {
                const isOrg = organizers.some((o: EventOrganizer) => o.user_id === p.user_id)
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-surface-dark-elevated">
                    <div className="h-7 w-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-xs shrink-0">
                      {p.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">
                      {p.profile?.display_name || p.guest_name || 'Guest'}
                    </span>
                    {isOrg && <Crown className="h-3.5 w-3.5 text-yellow-500" />}
                    {isOrganizer && !isOrg && p.user_id && (
                      <button
                        onClick={() => makeOrganizerMutation.mutate(p.user_id!)}
                        className="text-[10px] text-slate-400 hover:text-brand-500"
                      >
                        Make host
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Delete */}
          {isOrganizer && (
            <button
              onClick={() => setShowDeleteEvent(true)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-danger hover:bg-danger/10 rounded-xl transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete Event
            </button>
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
          currentUserId={profile?.id}
          isOrganizer={isOrganizer}
          categories={TASK_CATEGORIES}
        />
      )}

      {/* Add Item Dialog */}
      <Dialog.Root open={showAddItem} onOpenChange={setShowAddItem}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Add {addType === 'dish' ? 'Dish' : addType === 'supply' ? 'Supply' : 'Task'}
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
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Category</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DISH_CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => setAddCategory(cat.value)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                          addCategory === cat.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
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
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">When</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {TASK_CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          onClick={() => setAddCategory(cat.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                            addCategory === cat.value ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
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
                <Button variant="secondary" className="flex-1" onClick={() => setShowAddItem(false)}>Cancel</Button>
                <Button className="flex-1" onClick={() => addItemMutation.mutate()} disabled={!addName.trim() || addItemMutation.isPending}>
                  {addItemMutation.isPending ? 'Adding...' : 'Add'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Event Dialog */}
      <Dialog.Root open={showDeleteEvent} onOpenChange={setShowDeleteEvent}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Event</Dialog.Title>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Are you sure you want to delete <strong>{event.name}</strong>? All dishes, supplies, tasks, and participant info will be removed.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteEvent(false)}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={() => deleteEventMutation.mutate()} disabled={deleteEventMutation.isPending}>
                {deleteEventMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

// Reusable item list component for Menu/Supplies/Tasks tabs
function ItemList({
  items, type, emptyMessage, onAdd, onClaim, onUnclaim, onStatusChange, onDelete,
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
  currentUserId?: string
  isOrganizer: boolean
  categories?: { value: string; label: string; emoji?: string }[]
}) {
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
        Add {type === 'dish' ? 'Dish' : type === 'supply' ? 'Supply' : 'Task'}
      </Button>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">{emptyMessage}</p>
      ) : (
        <>
          {/* Unclaimed */}
          {unclaimed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-1.5 px-1">
                Needs someone ({unclaimed.length})
              </p>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                {unclaimed.map((item) => (
                  <div key={item.id} className="px-3 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {item.quantity && <span className="text-slate-400">x{item.quantity} </span>}
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
                      {type === 'task' ? "I'll do it" : "I'll bring it"}
                    </Button>
                    {isOrganizer && (
                      <button onClick={() => onDelete(item.id)} className="text-slate-400 hover:text-danger">
                        <X className="h-3.5 w-3.5" />
                      </button>
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
  item, type, currentUserId, isOrganizer, onUnclaim, onStatusChange, onDelete,
}: {
  item: EventItem
  type: string
  currentUserId?: string
  isOrganizer: boolean
  onUnclaim: (id: string) => void
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const isMine = item.assigned_to === currentUserId
  const isDone = item.status === 'done'

  return (
    <div className="px-3 py-2.5 flex items-center gap-2">
      {/* Status toggle for tasks */}
      {type === 'task' && (
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
          isDone ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'
        )}>
          {item.quantity && <span className="text-slate-400">x{item.quantity} </span>}
          {item.name}
        </p>
        {item.notes && <p className="text-[10px] text-slate-400">{item.notes}</p>}
      </div>

      <span className={cn(
        'text-xs px-2 py-0.5 rounded-full shrink-0',
        isDone ? 'bg-success/20 text-success' : 'bg-brand-500/10 text-brand-500'
      )}>
        {item.profile?.display_name || item.guest_name || '?'}
      </span>

      {(isMine || isOrganizer) && !isDone && (
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
  )
}
