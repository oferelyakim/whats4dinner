import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, PartyPopper, CalendarDays, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { getEvents, createEvent, type Event } from '@/services/events'
import { useI18n } from '@/lib/i18n'

export function EventsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const circleId = searchParams.get('circle')
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)

  // Auto-open create dialog if coming from a circle
  useEffect(() => {
    if (circleId) setShowCreate(true)
  }, [circleId])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: getEvents,
  })

  const createMutation = useMutation({
    mutationFn: () => createEvent({
      name: name.trim(),
      description: description.trim() || undefined,
      event_date: eventDate || undefined,
      location: location.trim() || undefined,
      circle_id: circleId || undefined,
    }),
    onSuccess: async (event) => {
      // Pre-populate the cache so the detail page has data immediately
      queryClient.setQueryData(['event', event.id], event)
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setShowCreate(false)
      setName('')
      setDescription('')
      setEventDate('')
      setLocation('')
      navigate(`/events/${event.id}`)
    },
  })

  const upcoming = events.filter((e: Event) => !e.event_date || new Date(e.event_date) >= new Date())
  const past = events.filter((e: Event) => e.event_date && new Date(e.event_date) < new Date())

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('event.events')}</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('event.newEvent')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<PartyPopper className="h-12 w-12" />}
          title="No events yet"
          description="Plan a potluck, dinner party, or any food event and coordinate who brings what"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Plan an Event
            </Button>
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              {upcoming.map((event: Event) => (
                <Card
                  key={event.id}
                  variant="elevated"
                  className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <p className="font-semibold text-slate-900 dark:text-white">{event.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {event.event_date && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(event.event_date).toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">Past</p>
              <div className="space-y-2 opacity-60">
                {past.map((event: Event) => (
                  <Card key={event.id} className="p-3 cursor-pointer" onClick={() => navigate(`/events/${event.id}`)}>
                    <p className="text-sm text-slate-500">{event.name}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Event Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {t('event.newEvent')}
            </Dialog.Title>
            <div className="space-y-3">
              <Input label="Event Name" placeholder="e.g., Friday Potluck" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
              <Input label="Description (optional)" placeholder="Bring your best dish!" value={description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} />
              <Input label="Date" type="datetime-local" value={eventDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEventDate(e.target.value)} />
              <Input label="Location (optional)" placeholder="Our place" value={location} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)} />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
                <Button className="flex-1" onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
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
