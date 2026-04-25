import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CalendarDays, MapPin, PartyPopper, ShoppingCart, UtensilsCrossed, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { PageTitle } from '@/components/ui/hearth'
import { supabase } from '@/services/supabase'
import { useAuth } from '@/hooks/useAuth'
import { joinEventByInvite } from '@/services/events'
import { useI18n } from '@/lib/i18n'
import { maybeRequestReview } from '@/lib/reviewPrompt'

export function JoinEventPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { session, loading: authLoading, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth()
  const { t, locale } = useI18n()

  const [eventName, setEventName] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState<string | null>(null)
  const [eventLocation, setEventLocation] = useState<string | null>(null)
  const [eventDesc, setEventDesc] = useState<string | null>(null)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authLoading2, setAuthLoading2] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, code])

  async function handleJoin() {
    if (!code) return
    setJoining(true)
    setError('')
    try {
      const event = await joinEventByInvite(code)
      setJoined(true)
      maybeRequestReview()
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
    if (authMode === 'forgot') {
      const { error: resetError } = await sendPasswordReset(email, code ? `/join-event/${code}` : undefined)
      if (resetError) setError(resetError.message)
      else setResetSent(true)
      setAuthLoading2(false)
      return
    }
    if (authMode === 'login') {
      const { error: signInError } = await signInWithEmail(email, password)
      if (signInError) setError(signInError.message)
      setAuthLoading2(false)
      return
    }
    const { error: signUpError, isDuplicate } = await signUpWithEmail(email, password, displayName)
    if (signUpError) setError(signUpError.message)
    else if (isDuplicate) setError('DUPLICATE_EMAIL')
    else setEmailSent(true)
    setAuthLoading2(false)
  }

  if (authLoading || loadingEvent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rp-bg">
        <div className="h-8 w-8 border-3 border-rp-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (joined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-rp-bg text-center">
        <PartyPopper className="h-12 w-12 text-rp-brand mb-4" />
        <h1 className="text-2xl font-bold text-rp-ink mb-2">You're in!</h1>
        <p className="text-sm text-rp-ink-soft">Redirecting to the event...</p>
      </div>
    )
  }

  if (emailSent || resetSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-rp-bg text-center">
        <h1 className="text-2xl font-bold text-rp-ink mb-2">{t('auth.checkEmail')}</h1>
        <p className="text-sm text-rp-ink-soft mb-1">{resetSent ? t('auth.resetEmailSent') : t('auth.emailSent')} <strong>{email}</strong></p>
        <p className="text-xs text-rp-ink-mute mb-6">{t('auth.checkSpam')}</p>
        <Button variant="secondary" onClick={() => { setEmailSent(false); setResetSent(false); setAuthMode('login') }}>{t('auth.backToSignIn')}</Button>
      </div>
    )
  }

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US'

  return (
    <div className="min-h-screen bg-rp-bg flex flex-col">
      <div className="flex-1 flex flex-col items-center px-5 pt-10 pb-6">
        <div className="w-full max-w-sm">
          {/* ABOVE THE FOLD — event info, claim CTA */}
          <div className="flex flex-col items-center text-center mb-6">
            <PartyPopper className="h-10 w-10 text-rp-brand mb-3" />
            {eventName ? (
              <>
                <p className="text-xs text-rp-ink-mute uppercase tracking-wider mb-1.5">{t('join.youreInvitedTo')}</p>
                <PageTitle className="text-[28px]">{eventName}</PageTitle>
                <div className="flex items-center gap-3 mt-3 text-xs text-rp-ink-soft">
                  {eventDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(eventDate).toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {eventLocation && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {eventLocation}
                    </span>
                  )}
                </div>
                {eventDesc && <p className="text-sm text-rp-ink-soft mt-3">{eventDesc}</p>}
              </>
            ) : (
              <p className="text-sm text-rp-ink-soft">Event invite</p>
            )}
          </div>

          {/* What's needed teaser */}
          {eventName && (
            <Card className="p-3 mb-4 text-center">
              <p className="text-xs uppercase tracking-wider text-rp-ink-mute mb-1">{t('join.whatsNeeded')}</p>
              <p className="text-sm text-rp-ink-soft">
                <Users className="h-3.5 w-3.5 inline-block me-1 -mt-0.5" />
                {authMode === 'signup' ? t('join.claimCta') : t('join.signinClaimCta')}
              </p>
            </Card>
          )}

          <form onSubmit={handleAuth} className="space-y-3">
            {authMode === 'signup' && (
              <Input label={t('auth.name')} placeholder="How others see you" value={displayName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)} required />
            )}
            <Input label={t('auth.email')} type="email" placeholder="you@example.com" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} required />
            {authMode !== 'forgot' && (
              <Input label={t('auth.password')} type="password" placeholder="Min 6 characters" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required minLength={6} />
            )}
            {authMode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setAuthMode('forgot'); setError('') }}
                  className="text-sm text-rp-brand hover:underline"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>
            )}
            {error === 'DUPLICATE_EMAIL' ? (
              <div className="text-sm bg-rp-brand/10 border border-rp-brand/30 rounded-lg px-3 py-2 space-y-2">
                <p className="text-rp-ink">{t('auth.emailAlreadyRegistered')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setError('') }}
                    className="flex-1 text-sm font-medium text-white bg-rp-brand rounded-md px-3 py-1.5 hover:opacity-90"
                  >
                    {t('auth.signInInstead')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setError('') }}
                    className="flex-1 text-sm font-medium text-rp-brand border border-rp-brand rounded-md px-3 py-1.5 hover:bg-rp-brand/10"
                  >
                    {t('auth.resetPasswordInstead')}
                  </button>
                </div>
              </div>
            ) : error ? (
              <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={authLoading2 || joining}>
              {authLoading2
                ? 'Please wait...'
                : joining
                  ? 'Joining...'
                  : authMode === 'signup'
                    ? t('join.claimCta')
                    : authMode === 'forgot'
                      ? t('auth.sendResetLink')
                      : t('join.signinClaimCta')}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-rp-ink-soft">
            {authMode === 'forgot' ? (
              <button onClick={() => { setAuthMode('login'); setError('') }} className="text-rp-brand font-medium hover:underline">
                {t('auth.backToSignIn')}
              </button>
            ) : (
              <>
                {authMode === 'signup' ? t('auth.hasAccount') + ' ' : t('auth.noAccount') + ' '}
                <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError('') }} className="text-rp-brand font-medium hover:underline">
                  {authMode === 'signup' ? t('auth.signIn') : t('auth.signUp')}
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* UNDER THE FOLD — social proof + 3-icon preview + sign-up nudge */}
      <div className="border-t border-rp-hairline bg-rp-bg-soft px-5 py-8">
        <div className="max-w-sm mx-auto text-center">
          <p className="text-xs text-rp-ink-mute mb-4">{t('join.poweredBy')}</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-10 w-10 rounded-full bg-rp-card border border-rp-hairline flex items-center justify-center">
                <UtensilsCrossed className="h-4 w-4 text-rp-brand" />
              </div>
              <span className="text-[11px] text-rp-ink-soft">{t('join.featureMeals')}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-10 w-10 rounded-full bg-rp-card border border-rp-hairline flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-rp-brand" />
              </div>
              <span className="text-[11px] text-rp-ink-soft">{t('join.featureShopping')}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-10 w-10 rounded-full bg-rp-card border border-rp-hairline flex items-center justify-center">
                <PartyPopper className="h-4 w-4 text-rp-brand" />
              </div>
              <span className="text-[11px] text-rp-ink-soft">{t('join.featureEvents')}</span>
            </div>
          </div>
          <p className="text-sm font-medium text-rp-ink mb-1">{t('join.organizeOwnTitle')}</p>
          <p className="text-xs text-rp-ink-soft mb-3">{t('join.organizeOwnCta')}</p>
        </div>
      </div>
    </div>
  )
}
