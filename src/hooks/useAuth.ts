import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/services/supabase'
import { useAppStore } from '@/stores/appStore'
import type { Profile } from '@/types'

const CANONICAL_APP_URL = 'https://app.replanish.app'

function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return CANONICAL_APP_URL
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return window.location.origin
  }
  return CANONICAL_APP_URL
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const { profile, setProfile } = useAppStore()

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [setProfile])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data as Profile)
    }
    setLoading(false)
  }

  async function signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUpWithEmail(email: string, password: string, displayName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    })
    // Supabase anti-enumeration: when the email is already registered, signUp returns
    // a non-error response with an empty `user.identities` array and sends no email.
    // Surface this to callers so they can prompt the user to sign in or reset their password
    // instead of showing a misleading "check your email" screen.
    const isDuplicate = !error && !!data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
    return { data, error, isDuplicate }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    })
    return { error }
  }

  async function sendPasswordReset(email: string, nextPath?: string) {
    const base = `${getAuthRedirectUrl()}/reset-password`
    const redirectTo = nextPath ? `${base}?next=${encodeURIComponent(nextPath)}` : base
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error }
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return {
    session,
    profile,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    sendPasswordReset,
    updatePassword,
    signOut,
  }
}
