import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, CalendarDays, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import {
  PageTitle,
  MonoLabel,
  HandAccent,
  PhotoPlaceholder,
  TableIcon,
} from '@/components/ui/hearth'
import * as Dialog from '@radix-ui/react-dialog'
import { getEvents, createEvent, type Event } from '@/services/events'
import { useI18n } from '@/lib/i18n'

export function EventsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const circleId = searchParams.get('circle')
  const queryClient = useQueryClient()
  const { t, locale } = useI18n()
  const toast = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

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
      queryClient.setQueryData(['event', event.id], event)
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setShowCreate(false)
      setName('')
      setDescription('')
      setEventDate('')
      setLocation('')
      navigate(`/events/${event.id}`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Filter and sort events
  const filtered = search
    ? events.filter((e: Event) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.location?.toLowerCase().includes(search.toLowerCase()) ||
        e.description?.toLowerCase().includes(search.toLowerCase())
      )
    : events

  const upcoming = filtered
    .filter((e: Event) => !e.event_date || new Date(e.event_date) >= new Date())
    .sort((a: Event, b: Event) => {
      if (!a.event_date) return 1
      if (!b.event_date) return -1
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    })

  const past = filtered
    .filter((e: Event) => e.event_date && new Date(e.event_date) < new Date())
    .sort((a: Event, b: Event) => {
      return new Date(b.event_date!).getTime() - new Date(a.event_date!).getTime()
    })

  const featured = upcoming[0]
  const rest = upcoming.slice(1)
  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'

  return (
    <div className="px-5 py-6 space-y-6 animate-page-enter">
      <div className="flex items-end justify-between">
        <div>
          <MonoLabel>gatherings</MonoLabel>
          <PageTitle className="mt-1.5">{t('event.events')}</PageTitle>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('event.newEvent')}
        </Button>
      </div>

      {/* Search */}
      {events.length > 0 && (
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rp-ink-mute" />
          <label className="sr-only" htmlFor="event-search">{t('common.search')}</label>
          <input
            id="event-search"
            type="text"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-10 pe-4 py-2.5 rounded-rp-sm text-sm bg-rp-card border border-rp-hairline text-rp-ink placeholder:text-rp-ink-mute focus:outline-none"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-rp-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<TableIcon width={48} height={48} />}
          title={t('event.noEvents')}
          description={t('event.noEventsDesc')}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('event.newEvent')}
            </Button>
          }
        />
      ) : (
        <>
          {/* Featured — the next upcoming event as a photo-hero card */}
          {featured && (
            <button
              onClick={() => navigate(`/events/${featured.id}`)}
              className="block w-full text-start active:scale-[0.99] transition-transform"
            >
              <PhotoPlaceholder aspect="hero" label={`${featured.name.toLowerCase()} · coming up`} />
              <div className="rp-card -mt-6 mx-3 p-4 relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display italic tracking-rp-tight text-[24px] text-rp-ink leading-tight">
                      {featured.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-rp-ink-soft">
                      {featured.event_date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(featured.event_date).toLocaleDateString(dateLocale, {
                            weekday: 'short', month: 'short', day: 'numeric',
                          })}
                        </span>
                      )}
                      {featured.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {featured.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Rest of upcoming */}
          {rest.length > 0 && (
            <section className="space-y-2">
              <MonoLabel>{t('event.upcoming')} · {rest.length}</MonoLabel>
              <div className="mt-2 space-y-2">
                {rest.map((event: Event) => (
                  <button
                    key={event.id}
                    onClick={() => navigate(`/events/${event.id}`)}
                    className="w-full text-start rp-card p-4 active:scale-[0.98] transition-transform"
                  >
                    <p className="font-display italic text-[20px] text-rp-ink leading-tight">
                      {event.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-rp-ink-soft">
                      {event.event_date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(event.event_date).toLocaleDateString(dateLocale, {
                            weekday: 'short', month: 'short', day: 'numeric',
                          })}
                        </span>
                      )}
                      {event.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section>
              <MonoLabel>{t('event.past')} · {past.length}</MonoLabel>
              <div className="space-y-2 opacity-70 mt-2">
                {past.map((event: Event) => (
                  <button
                    key={event.id}
                    onClick={() => navigate(`/events/${event.id}`)}
                    className="w-full text-start rp-card p-3 active:scale-[0.98] transition-transform"
                  >
                    <p className="text-sm text-rp-ink-soft">{event.name}</p>
                    {event.event_date && (
                      <p className="text-[11px] text-rp-ink-mute mt-0.5">
                        {new Date(event.event_date).toLocaleDateString(dateLocale, {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {search && upcoming.length === 0 && past.length === 0 && (
            <p className="text-sm text-rp-ink-mute text-center py-8">No gatherings matching "{search}"</p>
          )}

          <div className="text-center pt-2">
            <HandAccent rotate={-3}>~ the table was always the app ~</HandAccent>
          </div>
        </>
      )}

      {/* Create Event Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-rp-lg p-6 max-w-lg mx-auto">
            <Dialog.Title asChild>
              <PageTitle className="text-[24px] mb-4">{t('event.newEvent')}</PageTitle>
            </Dialog.Title>
            <div className="space-y-3">
              <Input label="Event Name" placeholder="e.g., Christmas Dinner 2026" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
              <Input label="Description (optional)" placeholder="Bring your best dish!" value={description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} />
              <Input label="Date & Time" type="datetime-local" value={eventDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEventDate(e.target.value)} />
              <Input label="Location (optional)" placeholder="Grandma's house" value={location} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)} />
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
