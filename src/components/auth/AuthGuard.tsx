import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isSupabaseConfigured } from '@/services/supabase'
import { useAppStore } from '@/stores/appStore'
import { LoginPage } from './LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const { profile, setProfile } = useAppStore()

  // Dev mode: bypass auth when Supabase isn't configured
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setProfile({
        id: 'dev-user',
        display_name: 'Ofer (Dev)',
        avatar_url: null,
        email: 'dev@ourtable.app',
        preferences: { theme: 'dark' },
        has_onboarded: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }, [setProfile])

  if (!isSupabaseConfigured) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-light dark:bg-surface-dark">
        <div className="h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  // Show onboarding for new users who haven't completed it
  if (profile && !profile.has_onboarded) {
    return <OnboardingPage />
  }

  return <>{children}</>
}
