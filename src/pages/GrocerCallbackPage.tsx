import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/ui/Toast'
import { handleKrogerCallback } from '@/services/grocers/service'
import type { GrocerProviderName } from '@/types'

export function GrocerCallbackPage() {
  const { provider } = useParams<{ provider: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const toast = useToast()
  const hasRun = useRef(false)

  useEffect(() => {
    // Guard against double-fire in StrictMode
    if (hasRun.current) return
    hasRun.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')
    const storedState = sessionStorage.getItem('grocer_oauth_state')

    async function processCallback() {
      // Validate provider
      const validProviders: GrocerProviderName[] = ['kroger', 'walmart', 'instacart']
      if (!provider || !validProviders.includes(provider as GrocerProviderName)) {
        toast.error(t('grocer.connectError'))
        navigate('/profile', { replace: true })
        return
      }

      // Validate state
      if (!code || !returnedState || returnedState !== storedState) {
        toast.error(t('grocer.oauthStateMismatch'))
        navigate('/profile', { replace: true })
        return
      }

      sessionStorage.removeItem('grocer_oauth_state')

      try {
        if (provider === 'kroger') {
          await handleKrogerCallback(code, returnedState)
        } else {
          throw new Error('not implemented')
        }

        toast.success(t('grocer.connectSuccess'))
      } catch (err) {
        const message = err instanceof Error ? err.message : t('grocer.connectError')
        toast.error(message)
      } finally {
        navigate('/profile', { replace: true })
      }
    }

    processCallback()
  }, [provider, navigate, t, toast])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      <p className="text-sm">{t('grocer.connecting')}</p>
    </div>
  )
}
