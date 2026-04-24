import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { useAuth } from '@/hooks/useAuth'
import { joinCircleByInviteCode } from '@/services/circles'
import { useAppStore } from '@/stores/appStore'

export function JoinCirclePage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { session, loading: authLoading, signInWithEmail, signUpWithEmail } = useAuth()
  const { setActiveCircle } = useAppStore()

  const [circleName, setCircleName] = useState<string | null>(null)
  const [circleIcon, setCircleIcon] = useState<string>('👨‍👩‍👧‍👦')
  const [loadingCircle, setLoadingCircle] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authLoading2, setAuthLoading2] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // Fetch circle info by invite code (public-ish query)
  useEffect(() => {
    if (!code || !isSupabaseConfigured) {
      setLoadingCircle(false)
      return
    }

    async function fetchCircle() {
      const { data } = await supabase
        .rpc('get_circle_by_invite_code', { p_code: code })

      if (data && data.length > 0) {
        setCircleName(data[0].name)
        setCircleIcon(data[0].icon)
      }
      setLoadingCircle(false)
    }
    fetchCircle()
  }, [code])

  // Auto-join if user is already authenticated
  useEffect(() => {
    if (session && code && !joined && !joining) {
      handleJoin()
    }
  }, [session, code])

  async function handleJoin() {
    if (!code) return
    setJoining(true)
    setError('')
    try {
      const circle = await joinCircleByInviteCode(code)
      setActiveCircle(circle)
      setJoined(true)
      setTimeout(() => navigate('/'), 1500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join'
      if (msg.includes('Already a member')) {
        setJoined(true)
        setTimeout(() => navigate('/'), 1500)
      } else {
        setError(msg)
      }
    }
    setJoining(false)
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAuthLoading2(true)

    const result =
      authMode === 'login'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, displayName)

    if (result.error) {
      setError(result.error.message)
    } else if (authMode === 'signup') {
      setEmailSent(true)
    }
    // If login succeeds, the useEffect above will auto-join
    setAuthLoading2(false)
  }

  if (authLoading || loadingCircle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-light dark:bg-surface-dark">
        <div className="h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (joined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark text-center">
        <span className="text-5xl mb-4">{circleIcon}</span>
        <h1 className="text-2xl font-bold text-rp-ink mb-2">
          You're in!
        </h1>
        <p className="text-sm text-rp-ink-mute">
          Welcome to {circleName ?? 'the circle'}. Redirecting...
        </p>
      </div>
    )
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark text-center">
        <div className="h-16 w-16 rounded-2xl bg-success/20 flex items-center justify-center mb-4">
          <img src="/logo-icon.png" alt="Replanish" className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-bold text-rp-ink mb-2">
          Check your email
        </h1>
        <p className="text-sm text-rp-ink-mute mb-1">
          We sent a confirmation link to <strong>{email}</strong>
        </p>
        <p className="text-xs text-rp-ink-mute mb-6">
          After confirming, come back to this link to join {circleName ?? 'the circle'}.
        </p>
        <Button variant="secondary" onClick={() => { setEmailSent(false); setAuthMode('login') }}>
          Back to Sign In
        </Button>
      </div>
    )
  }

  // Not authenticated - show signup/login with circle context
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark">
      <div className="w-full max-w-sm">
        {/* Circle invite banner */}
        <div className="flex flex-col items-center mb-8">
          <span className="text-5xl mb-3">{circleIcon}</span>
          {circleName ? (
            <>
              <p className="text-sm text-rp-ink-mute">You've been invited to join</p>
              <h1 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">{circleName}</h1>
            </>
          ) : (
            <>
              <Users className="h-8 w-8 text-slate-400 mb-2" />
              <p className="text-sm text-slate-500">Circle invite</p>
            </>
          )}
          <p className="text-xs text-slate-400 mt-2">
            {authMode === 'signup' ? 'Create an account to join' : 'Sign in to join'}
          </p>
        </div>

        {/* Auth form */}
        <form onSubmit={handleAuth} className="space-y-3">
          {authMode === 'signup' && (
            <Input
              label="Your Name"
              placeholder="How your family sees you"
              value={displayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && (
            <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={authLoading2 || joining}>
            {authLoading2
              ? 'Please wait...'
              : joining
                ? 'Joining...'
                : authMode === 'signup'
                  ? 'Sign Up & Join'
                  : 'Sign In & Join'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {authMode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError('') }}
            className="text-brand-500 font-medium hover:underline"
          >
            {authMode === 'signup' ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  )
}
