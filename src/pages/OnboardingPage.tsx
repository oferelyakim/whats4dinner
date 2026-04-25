import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { supabase } from '@/services/supabase'
import { CircleSetupWizard } from '@/components/circle/CircleSetupWizard'
import type { Circle } from '@/types'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { profile, setProfile, setActiveCircle } = useAppStore()

  async function markOnboarded() {
    if (!profile) return
    await supabase
      .from('profiles')
      .update({ has_onboarded: true })
      .eq('id', profile.id)
    setProfile({ ...profile, has_onboarded: true })
  }

  async function handleDone(circle: Circle | null) {
    if (circle) setActiveCircle(circle)
    await markOnboarded()
    navigate('/', { replace: true })
  }

  async function handleSkip() {
    await markOnboarded()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-rp-bg">
      <CircleSetupWizard variant="first-run" onDone={handleDone} onSkip={handleSkip} />
    </div>
  )
}
