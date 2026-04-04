import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Copy, Check, CalendarDays, MapPin, UtensilsCrossed,
  User, HandPlatter,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import {
  getEvent, getEventParticipants, getEventAssignments,
  addAssignment, claimAssignment,
  type EventAssignment, type EventParticipant,
} from '@/services/events'
const CATEGORIES = [
  { value: 'appetizer', label: 'Appetizer', emoji: '🥗' },
  { value: 'main', label: 'Main', emoji: '🍖' },
  { value: 'side', label: 'Side', emoji: '🥘' },
  { value: 'dessert', label: 'Dessert', emoji: '🍰' },
  { value: 'drink', label: 'Drink', emoji: '🥤' },
  { value: 'other', label: 'Other', emoji: '🍽️' },
]

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showAddDish, setShowAddDish] = useState(false)
  const [dishName, setDishName] = useState('')
  const [dishCategory, setDishCategory] = useState('main')
  const [dishNotes, setDishNotes] = useState('')
  const [copied, setCopied] = useState(false)

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

  const { data: assignments = [] } = useQuery({
    queryKey: ['event-assignments', id],
    queryFn: () => getEventAssignments(id!),
    enabled: !!id,
  })

  const addDishMutation = useMutation({
    mutationFn: () => addAssignment(id!, {
      dish_name: dishName.trim(),
      category: dishCategory,
      notes: dishNotes.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-assignments', id] })
      setShowAddDish(false)
      setDishName('')
      setDishNotes('')
    },
  })

  const claimMutation = useMutation({
    mutationFn: (assignmentId: string) => claimAssignment(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-assignments', id] })
    },
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

  const unclaimed = assignments.filter((a: EventAssignment) => !a.assigned_to && !a.guest_name)
  const claimed = assignments.filter((a: EventAssignment) => a.assigned_to || a.guest_name)
  const attending = participants.filter((p: EventParticipant) => p.status === 'attending')
  const inviteUrl = `${window.location.origin}/join-event/${event.invite_code}`

  // Group claimed by category
  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    items: claimed.filter((a: EventAssignment) => a.category === cat.value),
  })).filter((cat) => cat.items.length > 0)

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{event.name}</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {event.event_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {new Date(event.event_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
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

      {event.description && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{event.description}</p>
      )}

      {/* Invite link */}
      <Card className="p-3">
        <p className="text-xs text-slate-400 mb-1.5">Share this link to invite people</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-slate-100 dark:bg-surface-dark-overlay px-2 py-1.5 rounded-lg text-xs font-mono text-slate-500 truncate">
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

      {/* Attending */}
      <section>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
          <User className="h-4 w-4" />
          Attending ({attending.length})
        </h3>
        <div className="flex gap-2 flex-wrap">
          {attending.map((p: EventParticipant) => (
            <span
              key={p.id}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-500/10 text-brand-600 dark:text-brand-400"
            >
              {p.profile?.display_name || p.guest_name || 'Guest'}
            </span>
          ))}
        </div>
      </section>

      {/* Unclaimed dishes */}
      {unclaimed.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
            <HandPlatter className="h-4 w-4" />
            Still needed ({unclaimed.length})
          </h3>
          <div className="space-y-2">
            {unclaimed.map((a: EventAssignment) => {
              const cat = CATEGORIES.find((c) => c.value === a.category)
              return (
                <Card key={a.id} className="p-3 flex items-center gap-3">
                  <span className="text-lg">{cat?.emoji ?? '🍽️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.dish_name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{a.category}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => claimMutation.mutate(a.id)}
                    disabled={claimMutation.isPending}
                  >
                    I'll bring it
                  </Button>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Claimed dishes by category */}
      {byCategory.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" />
            Menu
          </h3>
          {byCategory.map((cat) => (
            <div key={cat.value} className="mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                {cat.emoji} {cat.label}
              </p>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                {cat.items.map((a: EventAssignment) => (
                  <div key={a.id} className="px-3 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-slate-200">{a.dish_name}</p>
                      {a.notes && <p className="text-[10px] text-slate-400">{a.notes}</p>}
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full',
                      a.status === 'confirmed' ? 'bg-success/20 text-success' : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-400'
                    )}>
                      {a.profile?.display_name || a.guest_name || 'Unclaimed'}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </section>
      )}

      {/* Add dish button */}
      <Button className="w-full" onClick={() => setShowAddDish(true)}>
        <Plus className="h-4 w-4" />
        Add a Dish
      </Button>

      {/* Add Dish Dialog */}
      <Dialog.Root open={showAddDish} onOpenChange={setShowAddDish}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Add a Dish
            </Dialog.Title>
            <div className="space-y-3">
              <Input label="Dish Name" placeholder="e.g., Caesar Salad" value={dishName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDishName(e.target.value)} />

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Category</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setDishCategory(cat.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        dishCategory === cat.value
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-100 dark:bg-surface-dark-overlay text-slate-600 dark:text-slate-400'
                      )}
                    >
                      {cat.emoji} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <Input label="Notes (optional)" placeholder="Enough for 6 people" value={dishNotes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDishNotes(e.target.value)} />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowAddDish(false)}>Cancel</Button>
                <Button className="flex-1" onClick={() => addDishMutation.mutate()} disabled={!dishName.trim() || addDishMutation.isPending}>
                  {addDishMutation.isPending ? 'Adding...' : 'Add Dish'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
