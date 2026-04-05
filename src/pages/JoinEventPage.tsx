import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CalendarDays, MapPin, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/services/supabase'
import { useAuth } from '@/hooks/useAuth'
import { joinEventByInvite } from '@/services/events'

export function JoinEventPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { session, loading: authLoading, signInWithEmail, signUpWithEmail } = useAuth()

  const [eventName, setEventName] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState<string | null>(null)
  const [eventLocation, setEventLocation] = useState<string | null>(null)
  const [eventDesc, setEventDesc] = useState<string | null>(null)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authLoading2, setAuthLoading2] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    if (!code) { setLoadingEvent(false); return }
    async function fetchEvent() {
      const { data } = await supabase.rpc('get_event_by_invite_code', { p_code: code })
      if (data && data.length > 0) {
        setEventName(data[0].name)
        setEventDate(data[0].event_date)
        setEventLocation(data[0].location)
        setEventDesc(data[0].description)
      }
      setLoadingEvent(false)
    }
    fetchEvent()
  }, [code])

  useEffect(() => {
    if (session && code && !joined && !joining) handleJoin()
  }, [session, code])

  async function handleJoin() {
    if (!code) return
    setJoining(true)
    setError('')
    try {
      const event = await joinEventByInvite(code)
      setJoined(true)
      setTimeout(() => navigate(`/events/${event.id}`), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    }
    setJoining(false)
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAuthLoading2(true)
    const result = authMode === 'login'
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password, displayName)
    if (result.error) setError(result.error.message)
    else if (authMode === 'signup') setEmailSent(true)
    setAuthLoading2(false)
  }

  if (authLoading || loadingEvent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-light dark:bg-surface-dark">
        <div className="h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (joined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark text-center">
        <PartyPopper className="h-12 w-12 text-brand-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">You're in!</h1>
        <p className="text-sm text-slate-500">Redirecting to the event...</p>
      </div>
    )
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h1>
        <p className="text-sm text-slate-500 mb-1">We sent a confirmation link to <strong>{email}</strong></p>
        <p className="text-xs text-slate-400 mb-6">After confirming, come back to this link to join the event.</p>
        <Button variant="secondary" onClick={() => { setEmailSent(false); setAuthMode('login') }}>Back to Sign In</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark">
      <div className="w-full max-w-sm">
        {/* Event info */}
        <div className="flex flex-col items-center mb-8">
          <PartyPopper className="h-10 w-10 text-brand-500 mb-3" />
          {eventName ? (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">You're invited to</p>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{eventName}</h1>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                {eventDate && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {new Date(eventDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {eventLocation && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {eventLocation}
                  </span>
                )}
              </div>
              {eventDesc && <p className="text-xs text-slate-400 mt-2 text-center">{eventDesc}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">Event invite</p>
          )}
          <p className="text-xs text-slate-400 mt-3">
            {authMode === 'signup' ? 'Create an account to join' : 'Sign in to join'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          {authMode === 'signup' && (
            <Input label="Your Name" placeholder="How others see you" value={displayName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)} required />
          )}
          <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} required />
          <Input label="Password" type="password" placeholder="Min 6 characters" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required minLength={6} />
          {error && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={authLoading2 || joining}>
            {authLoading2 ? 'Please wait...' : joining ? 'Joining...' : authMode === 'signup' ? 'Sign Up & Join' : 'Sign In & Join'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {authMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError('') }} className="text-brand-500 font-medium hover:underline">
            {authMode === 'signup' ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  )
}
