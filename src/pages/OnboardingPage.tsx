import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'
import { createCircle, joinCircleByInviteCode } from '@/services/circles'
import { supabase } from '@/services/supabase'
import { cn } from '@/lib/cn'

const CIRCLE_ICONS = ['🏠', '👨‍👩‍👧‍👦', '🍽️', '❤️', '🌟', '🏡', '👪', '🫶']

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { profile, setProfile, setActiveCircle } = useAppStore()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  // Circle creation state
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [circleName, setCircleName] = useState('')
  const [circleIcon, setCircleIcon] = useState('🏠')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  async function handleCreateCircle() {
    if (!circleName.trim()) return
    setError('')
    setLoading(true)
    try {
      const circle = await createCircle(circleName.trim(), circleIcon)
      setActiveCircle(circle)
      goTo(2)
    } catch (err: any) {
      setError(err.message || 'Failed to create circle')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinCircle() {
    if (!inviteCode.trim()) return
    setError('')
    setLoading(true)
    try {
      const circle = await joinCircleByInviteCode(inviteCode.trim())
      setActiveCircle(circle)
      goTo(2)
    } catch (err: any) {
      setError(err.message || 'Failed to join circle')
    } finally {
      setLoading(false)
    }
  }

  async function handleComplete() {
    // Mark onboarding complete in DB
    if (profile) {
      await supabase
        .from('profiles')
        .update({ has_onboarded: true })
        .eq('id', profile.id)
      setProfile({ ...profile, has_onboarded: true })
    }
    navigate('/', { replace: true })
  }

  async function handleSkip() {
    if (profile) {
      await supabase
        .from('profiles')
        .update({ has_onboarded: true })
        .eq('id', profile.id)
      setProfile({ ...profile, has_onboarded: true })
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-50 to-white dark:from-surface-dark dark:to-surface-dark-elevated">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-8 pb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              i === step ? 'w-8 bg-brand-500' : i < step ? 'w-2 bg-brand-300' : 'w-2 bg-slate-300 dark:bg-slate-600'
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div
              key="welcome"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-sm text-center space-y-8"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center overflow-hidden"
              >
                <img src="/logo-icon.png" alt="Replanish" className="h-20 w-20" />
              </motion.div>

              <div className="space-y-3">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('onboard.welcome')}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t('onboard.welcomeDesc')}
                </p>
              </div>

              <div className="space-y-3">
                <Button className="w-full" onClick={() => goTo(1)}>
                  {t('onboard.getStarted')}
                  <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
                </Button>
                <button
                  onClick={handleSkip}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {t('onboard.skip')}
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="circle"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-7 w-7 text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {t('onboard.createCircle')}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('onboard.createCircleDesc')}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-1 bg-slate-100 dark:bg-surface-dark-elevated rounded-lg p-0.5">
                <button
                  onClick={() => { setMode('create'); setError('') }}
                  className={cn(
                    'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                    mode === 'create'
                      ? 'bg-white dark:bg-surface-dark-overlay text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  )}
                >
                  {t('onboard.create')}
                </button>
                <button
                  onClick={() => { setMode('join'); setError('') }}
                  className={cn(
                    'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                    mode === 'join'
                      ? 'bg-white dark:bg-surface-dark-overlay text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  )}
                >
                  {t('onboard.joinCircle')}
                </button>
              </div>

              {mode === 'create' ? (
                <div className="space-y-4">
                  <Input
                    label={t('onboard.circleName')}
                    placeholder={t('onboard.circleNamePlaceholder')}
                    value={circleName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCircleName(e.target.value)}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('onboard.circleIcon')}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {CIRCLE_ICONS.map((icon) => (
                        <button
                          key={icon}
                          onClick={() => setCircleIcon(icon)}
                          className={cn(
                            'h-10 w-10 rounded-xl flex items-center justify-center text-xl transition-all',
                            circleIcon === icon
                              ? 'bg-brand-500/20 ring-2 ring-brand-500 scale-110'
                              : 'bg-slate-100 dark:bg-surface-dark-elevated hover:bg-slate-200 dark:hover:bg-surface-dark-overlay'
                          )}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreateCircle}
                    disabled={!circleName.trim() || loading}
                  >
                    {loading ? t('common.loading') : t('onboard.create')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Input
                    label={t('onboard.inviteCode')}
                    placeholder={t('onboard.inviteCodePlaceholder')}
                    value={inviteCode}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteCode(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={handleJoinCircle}
                    disabled={!inviteCode.trim() || loading}
                  >
                    {loading ? t('common.loading') : t('onboard.join')}
                  </Button>
                </div>
              )}

              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => goTo(0)}
                  className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
                  {t('onboard.back')}
                </button>
                <button
                  onClick={handleSkip}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {t('onboard.skip')}
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="done"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-sm text-center space-y-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="mx-auto h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center"
              >
                <Check className="h-10 w-10 text-emerald-500" />
              </motion.div>

              <div className="space-y-3">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t('onboard.allSet')}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t('onboard.allSetDesc')}
                </p>
              </div>

              <Card variant="elevated" className="p-4 text-start">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-brand-500 shrink-0" />
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Tip: Invite family members from Profile → Circles to collaborate together.
                  </div>
                </div>
              </Card>

              <Button className="w-full" onClick={handleComplete}>
                {t('onboard.goHome')}
                <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
