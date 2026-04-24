import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/lib/i18n'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const { signInWithEmail, signUpWithEmail, signInWithGoogle, sendPasswordReset } = useAuth()
  const { t } = useI18n()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'forgot') {
      const { error: resetError } = await sendPasswordReset(email)
      if (resetError) {
        setError(resetError.message)
      } else {
        setResetSent(true)
      }
      setLoading(false)
      return
    }

    const result =
      mode === 'login'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, displayName)

    if (result.error) {
      setError(result.error.message)
    } else if (mode === 'signup') {
      setEmailSent(true)
    }
    setLoading(false)
  }

  if (emailSent || resetSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark">
        <div className="w-full max-w-sm text-center">
          <div className="h-16 w-16 rounded-2xl bg-success/20 flex items-center justify-center mb-4 mx-auto">
            <Mail className="h-9 w-9 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-rp-ink mb-2">
            {t('auth.checkEmail')}
          </h1>
          <p className="text-sm text-rp-ink-mute mb-2">
            {resetSent ? t('auth.resetEmailSent') : t('auth.emailSent')}
          </p>
          {!resetSent && (
            <p className="text-sm font-semibold text-rp-ink mb-4">
              {email}
            </p>
          )}
          <p className="text-xs text-rp-ink-mute mb-6">
            {t('auth.checkSpam')}
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setEmailSent(false)
              setResetSent(false)
              setMode('login')
            }}
          >
            {t('auth.backToSignIn')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg overflow-hidden">
            <img src="/logo-icon.png" alt="Replanish" className="h-16 w-16" />
          </div>
          <h1 className="text-2xl font-bold text-rp-ink">
            {t('app.name')}
          </h1>
          <p className="text-sm text-rp-ink-mute mt-1">
            {t('app.tagline')}
          </p>
        </div>

        {mode === 'forgot' && (
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold text-rp-ink mb-1">
              {t('auth.forgotTitle')}
            </h2>
            <p className="text-sm text-rp-ink-mute">
              {t('auth.forgotSubtitle')}
            </p>
          </div>
        )}

        {/* Google Sign In — hidden in forgot mode */}
        {mode !== 'forgot' && (
          <>
            <Button
              variant="secondary"
              size="lg"
              className="w-full mb-4"
              onClick={async () => {
                setError('')
                const { error } = await signInWithGoogle()
                if (error) setError(error.message)
              }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {t('auth.continueWithGoogle')}
            </Button>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs text-slate-400">{t('auth.or')}</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
          </>
        )}

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <Input
              label={t('auth.name')}
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          <Input
            label={t('auth.email')}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {mode !== 'forgot' && (
            <Input
              label={t('auth.password')}
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          )}

          {mode === 'login' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                }}
                className="text-sm text-brand-500 hover:underline"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading
              ? t('common.loading')
              : mode === 'login'
                ? t('auth.signIn')
                : mode === 'signup'
                  ? t('auth.signUp')
                  : t('auth.sendResetLink')}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === 'forgot' ? (
            <button
              onClick={() => {
                setMode('login')
                setError('')
              }}
              className="text-brand-500 font-medium hover:underline"
            >
              {t('auth.backToSignIn')}
            </button>
          ) : (
            <>
              {mode === 'login' ? t('auth.noAccount') + ' ' : t('auth.hasAccount') + ' '}
              <button
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login')
                  setError('')
                }}
                className="text-brand-500 font-medium hover:underline"
              >
                {mode === 'login' ? t('auth.signUp') : t('auth.signIn')}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
