import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, ArrowRight, ArrowLeft, Check, Sparkles, Salad, ChefHat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'
import { createCircle, joinCircleByInviteCode } from '@/services/circles'
import { supabase } from '@/services/supabase'
import { cn } from '@/lib/cn'
import type { CookTimePref, MealPreferences } from '@/types'

const CIRCLE_ICONS = ['🏠', '👨‍👩‍👧‍👦', '🍽️', '❤️', '🌟', '🏡', '👪', '🫶']

const DIET_OPTIONS: { value: string; labelKey: string; emoji: string }[] = [
  { value: 'none', labelKey: 'onboard.diet.none', emoji: '🍽️' },
  { value: 'vegetarian', labelKey: 'onboard.diet.vegetarian', emoji: '🥗' },
  { value: 'vegan', labelKey: 'onboard.diet.vegan', emoji: '🌱' },
  { value: 'pescatarian', labelKey: 'onboard.diet.pescatarian', emoji: '🐟' },
  { value: 'kosher', labelKey: 'onboard.diet.kosher', emoji: '✡️' },
  { value: 'halal', labelKey: 'onboard.diet.halal', emoji: '☪️' },
  { value: 'gluten-free', labelKey: 'onboard.diet.glutenFree', emoji: '🌾' },
  { value: 'dairy-free', labelKey: 'onboard.diet.dairyFree', emoji: '🥛' },
  { value: 'nut-free', labelKey: 'onboard.diet.nutFree', emoji: '🥜' },
  { value: 'low-carb', labelKey: 'onboard.diet.lowCarb', emoji: '🥩' },
]

const COOK_TIME_OPTIONS: { value: CookTimePref; labelKey: string; sub: string }[] = [
  { value: 'quick', labelKey: 'onboard.cookTime.quick', sub: '< 20m' },
  { value: 'medium', labelKey: 'onboard.cookTime.medium', sub: '20–45m' },
  { value: 'project', labelKey: 'onboard.cookTime.project', sub: '45m+' },
]

const TOTAL_STEPS = 5 // 0 welcome, 1 circle, 2 diet, 3 prefs, 4 done

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

  // Diet + meal prefs state
  const [diet, setDiet] = useState<string[]>([])
  const [skillLevel, setSkillLevel] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [cookTime, setCookTime] = useState<CookTimePref>('medium')
  const [spiceLevel, setSpiceLevel] = useState<1 | 2 | 3 | 4 | 5>(2)

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  function toggleDiet(value: string) {
    setDiet((prev) => {
      if (value === 'none') return prev.includes('none') ? [] : ['none']
      const without = prev.filter((d) => d !== 'none')
      return without.includes(value) ? without.filter((d) => d !== value) : [...without, value]
    })
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

  async function persistAndFinish() {
    if (!profile) {
      navigate('/', { replace: true })
      return
    }
    const meal_preferences: MealPreferences = {
      skill_level: skillLevel,
      cook_time_pref: cookTime,
      spice_level: spiceLevel,
    }
    await supabase
      .from('profiles')
      .update({
        has_onboarded: true,
        diet,
        meal_preferences,
      })
      .eq('id', profile.id)
    setProfile({ ...profile, has_onboarded: true, diet, meal_preferences })
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-rp-bg to-rp-card">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-8 pb-4">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              i === step ? 'w-8 bg-rp-brand' : i < step ? 'w-2 bg-rp-brand/60' : 'w-2 bg-rp-hairline'
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-8">
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
                <h1 className="font-display italic text-[32px] leading-tight text-rp-ink">
                  {t('onboard.welcome')}
                </h1>
                <p className="text-sm text-rp-ink-mute leading-relaxed">
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
                  className="text-sm text-rp-ink-mute hover:text-rp-ink transition-colors min-h-[44px] inline-flex items-center justify-center"
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
                <div className="mx-auto h-14 w-14 rounded-2xl bg-rp-brand/10 flex items-center justify-center">
                  <Users className="h-7 w-7 text-rp-brand" />
                </div>
                <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">
                  {t('onboard.createCircle')}
                </h2>
                <p className="text-sm text-rp-ink-mute">
                  {t('onboard.createCircleDesc')}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-1 bg-rp-bg-soft rounded-lg p-0.5">
                <button
                  onClick={() => { setMode('create'); setError('') }}
                  className={cn(
                    'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                    mode === 'create'
                      ? 'bg-rp-card text-rp-ink shadow-sm'
                      : 'text-rp-ink-mute'
                  )}
                >
                  {t('onboard.create')}
                </button>
                <button
                  onClick={() => { setMode('join'); setError('') }}
                  className={cn(
                    'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                    mode === 'join'
                      ? 'bg-rp-card text-rp-ink shadow-sm'
                      : 'text-rp-ink-mute'
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
                    <label className="mb-1.5 block text-sm font-medium text-rp-ink-soft">
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
                              ? 'bg-rp-brand/20 ring-2 ring-rp-brand scale-110'
                              : 'bg-rp-bg-soft hover:bg-rp-hairline'
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
                  className="flex items-center gap-1 text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] inline-flex items-center"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
                  {t('onboard.back')}
                </button>
                <button
                  onClick={handleSkip}
                  className="text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] inline-flex items-center justify-center"
                >
                  {t('onboard.skip')}
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="diet"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-rp-accent/15 flex items-center justify-center">
                  <Salad className="h-7 w-7 text-rp-accent" />
                </div>
                <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">
                  {t('onboard.diet.title')}
                </h2>
                <p className="text-sm text-rp-ink-mute">
                  {t('onboard.diet.desc')}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {DIET_OPTIONS.map((opt) => {
                  const active = diet.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleDiet(opt.value)}
                      className={cn(
                        'px-3.5 py-2 rounded-full text-sm font-medium transition-all border',
                        active
                          ? 'bg-rp-brand text-white border-rp-brand shadow-rp-card'
                          : 'bg-rp-card text-rp-ink border-rp-hairline hover:border-rp-brand/50'
                      )}
                    >
                      <span className="me-1">{opt.emoji}</span>
                      {t(opt.labelKey)}
                    </button>
                  )
                })}
              </div>

              <Button className="w-full" onClick={() => goTo(3)}>
                {t('onboard.continue')}
                <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
              </Button>

              <div className="flex justify-between">
                <button
                  onClick={() => goTo(1)}
                  className="flex items-center gap-1 text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] inline-flex items-center"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
                  {t('onboard.back')}
                </button>
                <button
                  onClick={() => goTo(3)}
                  className="text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] inline-flex items-center justify-center"
                >
                  {t('onboard.skip')}
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="prefs"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-sm space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-rp-glow/20 flex items-center justify-center">
                  <ChefHat className="h-7 w-7 text-rp-glow" />
                </div>
                <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">
                  {t('onboard.prefs.title')}
                </h2>
                <p className="text-sm text-rp-ink-mute">
                  {t('onboard.prefs.desc')}
                </p>
              </div>

              {/* Skill level */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <label className="text-sm font-medium text-rp-ink-soft">
                    {t('onboard.prefs.skill')}
                  </label>
                  <span className="text-xs text-rp-ink-mute">
                    {t(`onboard.prefs.skill${skillLevel}`)}
                  </span>
                </div>
                <div className="flex gap-2">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => setSkillLevel(n)}
                      className={cn(
                        'flex-1 h-10 rounded-lg text-sm font-medium transition-all',
                        skillLevel === n
                          ? 'bg-rp-brand text-white'
                          : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cook time */}
              <div>
                <label className="block mb-2 text-sm font-medium text-rp-ink-soft">
                  {t('onboard.prefs.cookTime')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {COOK_TIME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCookTime(opt.value)}
                      className={cn(
                        'py-2.5 rounded-lg text-sm font-medium transition-all',
                        cookTime === opt.value
                          ? 'bg-rp-brand text-white'
                          : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline'
                      )}
                    >
                      <div>{t(opt.labelKey)}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Spice level */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <label className="text-sm font-medium text-rp-ink-soft">
                    {t('onboard.prefs.spice')}
                  </label>
                  <span className="text-xs text-rp-ink-mute">
                    {'🌶️'.repeat(spiceLevel)}
                  </span>
                </div>
                <div className="flex gap-2">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => setSpiceLevel(n)}
                      className={cn(
                        'flex-1 h-10 rounded-lg text-sm font-medium transition-all',
                        spiceLevel === n
                          ? 'bg-rp-brand text-white'
                          : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Button className="w-full" onClick={() => goTo(4)}>
                {t('onboard.continue')}
                <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
              </Button>

              <div className="flex justify-between">
                <button
                  onClick={() => goTo(2)}
                  className="flex items-center gap-1 text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] inline-flex items-center"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
                  {t('onboard.back')}
                </button>
                <button
                  onClick={() => goTo(4)}
                  className="text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] inline-flex items-center justify-center"
                >
                  {t('onboard.skip')}
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
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
                className="mx-auto h-20 w-20 rounded-full bg-rp-accent/15 flex items-center justify-center"
              >
                <Check className="h-10 w-10 text-rp-accent" />
              </motion.div>

              <div className="space-y-3">
                <h1 className="font-display italic text-[32px] leading-tight text-rp-ink">
                  {t('onboard.allSet')}
                </h1>
                <p className="text-sm text-rp-ink-mute leading-relaxed">
                  {t('onboard.allSetDesc')}
                </p>
              </div>

              <Card variant="elevated" className="p-4 text-start">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-rp-brand shrink-0" />
                  <div className="text-sm text-rp-ink-soft">
                    {t('onboard.tipInvite')}
                  </div>
                </div>
              </Card>

              <Button className="w-full" onClick={persistAndFinish}>
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
