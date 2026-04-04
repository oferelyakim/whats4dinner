import { useState } from 'react'
import { ChefHat, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const { signInWithEmail, signUpWithEmail } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

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

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark">
        <div className="w-full max-w-sm text-center">
          <div className="h-16 w-16 rounded-2xl bg-success/20 flex items-center justify-center mb-4 mx-auto">
            <Mail className="h-9 w-9 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Check your email
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            We sent a confirmation link to
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {email}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
            Click the link in the email to activate your account. Check your spam/junk folder if you don't see it.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setEmailSent(false)
              setMode('login')
            }}
          >
            Back to Sign In
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
          <div className="h-16 w-16 rounded-2xl bg-brand-500 flex items-center justify-center mb-4 shadow-lg">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            What's4Dinner
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Meal planning made easy
          </p>
        </div>

        {/* TODO: Enable Google Sign In after configuring OAuth in Supabase */}

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <Input
              label="Name"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && (
            <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError('')
            }}
            className="text-brand-500 font-medium hover:underline"
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  )
}
