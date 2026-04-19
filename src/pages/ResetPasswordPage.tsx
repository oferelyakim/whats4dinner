import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/services/supabase'
import { useI18n } from '@/lib/i18n'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)

  const { updatePassword } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session) {
        setReady(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true)
        setLinkInvalid(false)
      }
    })

    const timeout = window.setTimeout(() => {
      if (!mounted) return
      setReady((prevReady) => {
        if (!prevReady) setLinkInvalid(true)
        return prevReady
      })
    }, 2500)

    return () => {
      mounted = false
      window.clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError(t('auth.password') + ': min 6')
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }

    setLoading(true)
    const { error: updateError } = await updatePassword(password)
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    window.setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
            {success ? (
              <CheckCircle2 className="h-9 w-9 text-success" />
            ) : (
              <KeyRound className="h-9 w-9 text-brand-500" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center">
            {success ? t('auth.passwordUpdated') : t('auth.forgotTitle')}
          </h1>
        </div>

        {linkInvalid && !ready ? (
          <div className="text-center">
            <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-3 mb-4">
              {t('auth.resetLinkInvalid')}
            </p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => navigate('/', { replace: true })}
            >
              {t('auth.backToSignIn')}
            </Button>
          </div>
        ) : success ? null : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label={t('auth.newPassword')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
            <Input
              label={t('auth.confirmPassword')}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />

            {error && (
              <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading || !ready}>
              {loading ? t('common.loading') : t('auth.updatePassword')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
