import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Check, Users, Sparkles, Salad, ChefHat, CalendarDays, Home, Heart, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import type { Circle, CircleContext, CircleType, CookTimePref } from '@/types'
import { createCircle, joinCircleByInviteCode } from '@/services/circles'

type Mode = 'create' | 'join'

interface Props {
  // First-run mode forces the user to either create or join. Optional mode (from CirclesPage) allows close.
  variant?: 'first-run' | 'optional'
  onDone: (circle: Circle | null) => void
  onSkip?: () => void
  onClose?: () => void
}

const CIRCLE_ICONS = ['🏠', '👨‍👩‍👧‍👦', '🍽️', '❤️', '🌟', '🏡', '👪', '🫶', '🎉', '🎂', '🏕️', '🔥']

const TYPE_OPTIONS: { value: CircleType; label: string; sub: string; icon: typeof Home }[] = [
  { value: 'family', label: 'Family', sub: 'Daily meals, chores, household life', icon: Home },
  { value: 'event', label: 'Event', sub: 'Party, potluck, gathering', icon: CalendarDays },
  { value: 'roommates', label: 'Roommates', sub: 'Shared groceries & chores', icon: Users },
  { value: 'friends', label: 'Friends', sub: 'Recurring hangouts & dinners', icon: Heart },
  { value: 'other', label: 'Other', sub: 'Something else', icon: MoreHorizontal },
]

const DIET_OPTIONS = [
  { value: 'none', label: 'No restrictions', emoji: '🍽️' },
  { value: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { value: 'vegan', label: 'Vegan', emoji: '🌱' },
  { value: 'pescatarian', label: 'Pescatarian', emoji: '🐟' },
  { value: 'kosher', label: 'Kosher', emoji: '✡️' },
  { value: 'halal', label: 'Halal', emoji: '☪️' },
  { value: 'gluten-free', label: 'Gluten-free', emoji: '🌾' },
  { value: 'dairy-free', label: 'Dairy-free', emoji: '🥛' },
  { value: 'nut-free', label: 'Nut-free', emoji: '🥜' },
  { value: 'low-carb', label: 'Low-carb', emoji: '🥩' },
]

const COOK_TIME_OPTIONS: { value: CookTimePref; label: string; sub: string }[] = [
  { value: 'quick', label: 'Quick', sub: '< 20m' },
  { value: 'medium', label: 'Medium', sub: '20–45m' },
  { value: 'project', label: 'Project', sub: '45m+' },
]

const VENUE_OPTIONS: { value: 'indoor' | 'outdoor' | 'mixed'; label: string; emoji: string }[] = [
  { value: 'indoor', label: 'Indoor', emoji: '🏠' },
  { value: 'outdoor', label: 'Outdoor', emoji: '🌳' },
  { value: 'mixed', label: 'Both', emoji: '🌤️' },
]

const STYLE_OPTIONS: { value: 'potluck' | 'host_cooks' | 'catered' | 'mixed'; label: string; sub: string }[] = [
  { value: 'potluck', label: 'Potluck', sub: 'Everyone brings a dish' },
  { value: 'host_cooks', label: 'Host cooks', sub: 'I’ll handle the food' },
  { value: 'catered', label: 'Catered', sub: 'Order in or hire' },
  { value: 'mixed', label: 'Mix', sub: 'Some of each' },
]

const AGE_MIX_OPTIONS: { value: 'kids' | 'adults' | 'mixed' | 'seniors'; label: string }[] = [
  { value: 'kids', label: 'Mostly kids' },
  { value: 'adults', label: 'Mostly adults' },
  { value: 'mixed', label: 'Mixed ages' },
  { value: 'seniors', label: 'Mostly seniors' },
]

const slide = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
}

export function CircleSetupWizard({ variant = 'optional', onDone, onSkip, onClose }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('create')
  const [direction, setDirection] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Identity
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏠')
  const [type, setType] = useState<CircleType | null>(null)
  const [purpose, setPurpose] = useState('')

  // Join
  const [inviteCode, setInviteCode] = useState('')

  // Family/cooking context
  const [diet, setDiet] = useState<string[]>([])
  const [skill, setSkill] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [cookTime, setCookTime] = useState<CookTimePref>('medium')
  const [spice, setSpice] = useState<1 | 2 | 3 | 4 | 5>(2)
  const [adults, setAdults] = useState(2)
  const [kidsAges, setKidsAges] = useState<number[]>([])
  const [dislikes, setDislikes] = useState('')

  // Event context
  const [eventDate, setEventDate] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [venue, setVenue] = useState<'indoor' | 'outdoor' | 'mixed' | null>(null)
  const [headcount, setHeadcount] = useState(10)
  const [ageMix, setAgeMix] = useState<'kids' | 'adults' | 'mixed' | 'seniors'>('mixed')
  const [eventStyle, setEventStyle] = useState<'potluck' | 'host_cooks' | 'catered' | 'mixed'>('potluck')
  const [vibe, setVibe] = useState('')

  // Roommates/friends/other
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'monthly' | 'occasional'>('weekly')

  // Compute the active step list based on type. Step keys:
  //   identity = name + icon + type chooser (or Join screen if mode=join)
  //   purpose  = single-line "what is this circle about" (used for AI)
  //   diet     = diet chips
  //   cooking  = skill/time/spice
  //   household = adults + kids ages
  //   event_when_where = date + location + venue
  //   event_who = headcount + age mix
  //   event_food = style + needs-meal + vibe
  //   cadence = roommates/friends frequency
  //   review = final
  const stepKeys = useMemo<string[]>(() => {
    if (mode === 'join') return ['join']
    const base = ['identity']
    if (!type) return [...base, 'review']
    if (type === 'family') return [...base, 'purpose', 'household', 'diet', 'cooking', 'review']
    if (type === 'event') return [...base, 'purpose', 'event_when_where', 'event_who', 'event_food', 'review']
    // roommates/friends/other
    return [...base, 'purpose', 'diet', 'cadence', 'review']
  }, [type, mode])

  const [stepIdx, setStepIdx] = useState(0)
  const stepKey = stepKeys[Math.min(stepIdx, stepKeys.length - 1)]
  const totalSteps = stepKeys.length

  function go(delta: number) {
    setDirection(delta > 0 ? 1 : -1)
    setStepIdx((s) => Math.max(0, Math.min(stepKeys.length - 1, s + delta)))
  }

  function buildContext(): CircleContext {
    if (!type) return {}
    if (type === 'family') {
      return {
        diet: diet.length ? diet : undefined,
        dislikes: dislikes.trim() ? dislikes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        cooking: { skill, time_pref: cookTime, spice },
        household: { adults, kids_ages: kidsAges.length ? kidsAges : undefined },
      }
    }
    if (type === 'event') {
      return {
        event: {
          date: eventDate || undefined,
          location: eventLocation.trim() || undefined,
          venue: venue ?? undefined,
          headcount,
          age_mix: ageMix,
          style: eventStyle,
          vibe: vibe.trim() || undefined,
          needs_meal: eventStyle !== 'catered',
        },
      }
    }
    // roommates / friends / other
    return {
      diet: diet.length ? diet : undefined,
      cadence,
    }
  }

  async function handleCreate() {
    if (!name.trim() || !type) return
    setError('')
    setLoading(true)
    try {
      const circle = await createCircle({
        name: name.trim(),
        icon,
        purpose: purpose.trim() || null,
        circle_type: type,
        context: buildContext(),
      })
      onDone(circle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create circle')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return
    setError('')
    setLoading(true)
    try {
      const circle = await joinCircleByInviteCode(inviteCode.trim())
      onDone(circle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join circle')
    } finally {
      setLoading(false)
    }
  }

  function toggleDiet(value: string) {
    setDiet((prev) => {
      if (value === 'none') return prev.includes('none') ? [] : ['none']
      const without = prev.filter((d) => d !== 'none')
      return without.includes(value) ? without.filter((d) => d !== value) : [...without, value]
    })
  }

  const isLastStep = stepIdx === stepKeys.length - 1
  const showBack = stepIdx > 0

  return (
    <div className="min-h-full flex flex-col bg-gradient-to-b from-rp-bg to-rp-card">
      {/* Header: progress + close */}
      <div className="flex items-center justify-between pt-6 px-6 pb-2 gap-4">
        <div className="flex gap-1.5 flex-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300 flex-1',
                i === stepIdx ? 'bg-rp-brand' : i < stepIdx ? 'bg-rp-brand/60' : 'bg-rp-hairline',
              )}
            />
          ))}
        </div>
        {variant === 'optional' && onClose && (
          <button
            onClick={onClose}
            className="text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px] px-2"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mode toggle (only on identity/join step) */}
      {(stepKey === 'identity' || stepKey === 'join') && (
        <div className="px-6 pt-2">
          <div className="flex gap-1 bg-rp-bg-soft rounded-lg p-0.5 max-w-xs mx-auto">
            <button
              onClick={() => { setMode('create'); setStepIdx(0); setError('') }}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'create' ? 'bg-rp-card text-rp-ink shadow-sm' : 'text-rp-ink-mute',
              )}
            >
              Create new
            </button>
            <button
              onClick={() => { setMode('join'); setStepIdx(0); setError('') }}
              className={cn(
                'flex-1 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'join' ? 'bg-rp-card text-rp-ink shadow-sm' : 'text-rp-ink-mute',
              )}
            >
              Join existing
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex items-start justify-center px-6 py-8 overflow-y-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={stepKey}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full max-w-sm space-y-6"
          >
            {stepKey === 'join' && (
              <Section
                icon={<Users className="h-7 w-7 text-rp-brand" />}
                title="Join a circle"
                desc="Enter the invite code a member shared with you."
              >
                <Input
                  label="Invite code"
                  placeholder="e.g. a1b2c3"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
                <Button className="w-full" onClick={handleJoin} disabled={!inviteCode.trim() || loading}>
                  {loading ? t('common.loading') : 'Join'}
                </Button>
              </Section>
            )}

            {stepKey === 'identity' && mode === 'create' && (
              <Section
                icon={<Sparkles className="h-7 w-7 text-rp-brand" />}
                title="Let’s set up your circle"
                desc="A circle is your shared space — for a family, an event, or a group of friends."
              >
                <Input
                  label="Circle name"
                  placeholder="The Smiths, Sarah’s 40th, etc."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-rp-ink-soft">Icon</label>
                  <div className="flex gap-2 flex-wrap">
                    {CIRCLE_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setIcon(emoji)}
                        className={cn(
                          'h-10 w-10 rounded-xl flex items-center justify-center text-xl transition-all',
                          icon === emoji
                            ? 'bg-rp-brand/20 ring-2 ring-rp-brand scale-110'
                            : 'bg-rp-bg-soft hover:bg-rp-hairline',
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-rp-ink-soft">What kind of circle?</label>
                  <div className="grid gap-2">
                    {TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      const active = type === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setType(opt.value)}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border px-3 py-3 text-start transition-all',
                            active
                              ? 'bg-rp-brand/10 border-rp-brand ring-1 ring-rp-brand/40'
                              : 'bg-rp-card border-rp-hairline hover:border-rp-brand/40',
                          )}
                        >
                          <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', active ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink')}>
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-rp-ink">{opt.label}</div>
                            <div className="text-xs text-rp-ink-mute truncate">{opt.sub}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Button className="w-full" onClick={() => go(1)} disabled={!name.trim() || !type}>
                  Continue
                  <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
                </Button>
              </Section>
            )}

            {stepKey === 'purpose' && (
              <Section
                icon={<Sparkles className="h-7 w-7 text-rp-glow" />}
                title="What’s this circle about?"
                desc="One sentence helps the AI plan meals, events, and lists that actually fit."
              >
                <Input
                  label="Purpose"
                  placeholder={
                    type === 'event'
                      ? 'e.g. Sarah’s 40th — backyard BBQ for ~20 friends'
                      : type === 'family'
                        ? 'e.g. Weekly dinners for two parents + two kids'
                        : 'e.g. Roommates sharing groceries Sun–Thu'
                  }
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} skipLabel="Skip" onSkip={() => go(1)} />
              </Section>
            )}

            {stepKey === 'household' && (
              <Section
                icon={<Home className="h-7 w-7 text-rp-brand" />}
                title="Who’s in the household?"
                desc="So the AI sizes meal plans and lists right."
              >
                <NumberStepper label="Adults" value={adults} onChange={setAdults} min={1} max={12} />
                <KidsAgesEditor ages={kidsAges} onChange={setKidsAges} />
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} />
              </Section>
            )}

            {stepKey === 'diet' && (
              <Section
                icon={<Salad className="h-7 w-7 text-rp-accent" />}
                title="Any dietary needs?"
                desc="Pick all that apply — the AI will respect them in every recipe and plan."
              >
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
                            : 'bg-rp-card text-rp-ink border-rp-hairline hover:border-rp-brand/50',
                        )}
                      >
                        <span className="me-1">{opt.emoji}</span>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {type === 'family' && (
                  <Input
                    label="Anything to avoid? (comma separated, optional)"
                    placeholder="cilantro, mushrooms, very spicy"
                    value={dislikes}
                    onChange={(e) => setDislikes(e.target.value)}
                  />
                )}
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} skipLabel="Skip" onSkip={() => go(1)} />
              </Section>
            )}

            {stepKey === 'cooking' && (
              <Section
                icon={<ChefHat className="h-7 w-7 text-rp-glow" />}
                title="Cooking style"
                desc="So suggested recipes match what you actually want to cook."
              >
                <SegmentedScale label="Skill" value={skill} onChange={(n) => setSkill(n as 1 | 2 | 3 | 4 | 5)} />
                <div>
                  <label className="block mb-2 text-sm font-medium text-rp-ink-soft">Cook time</label>
                  <div className="grid grid-cols-3 gap-2">
                    {COOK_TIME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setCookTime(opt.value)}
                        className={cn(
                          'py-2.5 rounded-lg text-sm font-medium transition-all',
                          cookTime === opt.value ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline',
                        )}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[11px] opacity-75 mt-0.5">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <SegmentedScale label="Spice" value={spice} onChange={(n) => setSpice(n as 1 | 2 | 3 | 4 | 5)} suffix={'🌶️'.repeat(spice)} />
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} />
              </Section>
            )}

            {stepKey === 'event_when_where' && (
              <Section
                icon={<CalendarDays className="h-7 w-7 text-rp-brand" />}
                title="When & where?"
                desc="Helps the AI plan around weather, season, and venue."
              >
                <Input
                  label="Date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
                <Input
                  label="Location (optional)"
                  placeholder="Backyard, our place, the park…"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                />
                <div>
                  <label className="block mb-2 text-sm font-medium text-rp-ink-soft">Indoor or outdoor?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {VENUE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setVenue(opt.value)}
                        className={cn(
                          'py-3 rounded-lg text-sm font-medium transition-all',
                          venue === opt.value ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline',
                        )}
                      >
                        <div>{opt.emoji}</div>
                        <div className="text-[11px] mt-0.5">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} />
              </Section>
            )}

            {stepKey === 'event_who' && (
              <Section
                icon={<Users className="h-7 w-7 text-rp-accent" />}
                title="Who’s coming?"
                desc="Rough numbers are fine."
              >
                <NumberStepper label="Headcount" value={headcount} onChange={setHeadcount} min={1} max={500} step={1} />
                <div>
                  <label className="block mb-2 text-sm font-medium text-rp-ink-soft">Age mix</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AGE_MIX_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAgeMix(opt.value)}
                        className={cn(
                          'py-2.5 rounded-lg text-sm font-medium transition-all',
                          ageMix === opt.value ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} />
              </Section>
            )}

            {stepKey === 'event_food' && (
              <Section
                icon={<Salad className="h-7 w-7 text-rp-accent" />}
                title="How’s the food handled?"
                desc="And any vibe / theme to keep in mind?"
              >
                <div className="grid gap-2">
                  {STYLE_OPTIONS.map((opt) => {
                    const active = eventStyle === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setEventStyle(opt.value)}
                        className={cn(
                          'rounded-xl border px-3 py-3 text-start transition-all',
                          active ? 'bg-rp-brand/10 border-rp-brand ring-1 ring-rp-brand/40' : 'bg-rp-card border-rp-hairline hover:border-rp-brand/40',
                        )}
                      >
                        <div className="text-sm font-medium text-rp-ink">{opt.label}</div>
                        <div className="text-xs text-rp-ink-mute">{opt.sub}</div>
                      </button>
                    )
                  })}
                </div>
                <Input
                  label="Vibe / theme (optional)"
                  placeholder="Mediterranean, kid-friendly, casual…"
                  value={vibe}
                  onChange={(e) => setVibe(e.target.value)}
                />
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} />
              </Section>
            )}

            {stepKey === 'cadence' && (
              <Section
                icon={<CalendarDays className="h-7 w-7 text-rp-brand" />}
                title="How often do you get together?"
                desc="Tunes how aggressively the AI plans ahead."
              >
                <div className="grid grid-cols-2 gap-2">
                  {(['daily', 'weekly', 'monthly', 'occasional'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCadence(c)}
                      className={cn(
                        'py-2.5 rounded-lg text-sm font-medium transition-all capitalize',
                        cadence === c ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <NavRow onBack={() => go(-1)} onContinue={() => go(1)} />
              </Section>
            )}

            {stepKey === 'review' && (
              <Section
                icon={<Check className="h-7 w-7 text-rp-accent" />}
                title="Ready to go"
                desc="You can always update this later from circle settings."
              >
                <Card variant="elevated" className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-rp-bg-soft flex items-center justify-center text-xl">{icon}</div>
                    <div className="min-w-0">
                      <div className="font-medium text-rp-ink truncate">{name || 'Your circle'}</div>
                      <div className="text-xs text-rp-ink-mute capitalize">{type ?? '—'}</div>
                    </div>
                  </div>
                  {purpose && <div className="text-sm text-rp-ink-soft">{purpose}</div>}
                </Card>

                {error && <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>}

                <Button className="w-full" onClick={handleCreate} disabled={loading || !name.trim() || !type}>
                  {loading ? t('common.loading') : 'Create circle'}
                  <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
                </Button>
                {showBack && (
                  <button
                    onClick={() => go(-1)}
                    className="w-full text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 me-1 inline rtl-flip" />
                    Back
                  </button>
                )}
              </Section>
            )}

            {error && stepKey !== 'review' && (
              <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
            )}

            {variant === 'first-run' && onSkip && !isLastStep && stepKey !== 'review' && (
              <button
                onClick={onSkip}
                className="block mx-auto text-xs text-rp-ink-mute hover:text-rp-ink min-h-[44px]"
              >
                Skip onboarding
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-rp-brand/10 flex items-center justify-center">{icon}</div>
        <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">{title}</h2>
        <p className="text-sm text-rp-ink-mute">{desc}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function NavRow({ onBack, onContinue, onSkip, skipLabel }: { onBack: () => void; onContinue: () => void; onSkip?: () => void; skipLabel?: string }) {
  return (
    <>
      <Button className="w-full" onClick={onContinue}>
        Continue
        <ArrowRight className="h-4 w-4 ms-1 rtl-flip" />
      </Button>
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
          Back
        </button>
        {onSkip && (
          <button onClick={onSkip} className="text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px]">
            {skipLabel ?? 'Skip'}
          </button>
        )}
      </div>
    </>
  )
}

function NumberStepper({ label, value, onChange, min = 0, max = 99, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <label className="block mb-2 text-sm font-medium text-rp-ink-soft">{label}</label>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-10 w-10 rounded-lg bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline disabled:opacity-50"
          disabled={value <= min}
        >
          −
        </button>
        <div className="flex-1 text-center text-2xl font-display italic text-rp-ink tabular-nums">{value}</div>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="h-10 w-10 rounded-lg bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline disabled:opacity-50"
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  )
}

function KidsAgesEditor({ ages, onChange }: { ages: number[]; onChange: (next: number[]) => void }) {
  return (
    <div>
      <label className="block mb-2 text-sm font-medium text-rp-ink-soft">Kids&apos; ages (optional)</label>
      <div className="flex flex-wrap gap-2 items-center">
        {ages.map((age, i) => (
          <button
            key={i}
            onClick={() => onChange(ages.filter((_, j) => j !== i))}
            className="px-3 py-1.5 rounded-full bg-rp-brand text-white text-sm flex items-center gap-1"
            title="Tap to remove"
          >
            {age} <span className="opacity-70">✕</span>
          </button>
        ))}
        <button
          onClick={() => onChange([...ages, 8])}
          className="px-3 py-1.5 rounded-full bg-rp-bg-soft text-rp-ink text-sm hover:bg-rp-hairline"
        >
          + Add a kid
        </button>
      </div>
      {ages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ages.map((age, i) => (
            <input
              key={i}
              type="number"
              min={0}
              max={21}
              value={age}
              onChange={(e) => {
                const next = [...ages]
                next[i] = Number(e.target.value) || 0
                onChange(next)
              }}
              className="w-14 h-9 rounded-md bg-rp-card border border-rp-hairline px-2 text-sm text-rp-ink"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SegmentedScale({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-medium text-rp-ink-soft">{label}</label>
        {suffix && <span className="text-xs text-rp-ink-mute">{suffix}</span>}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-10 rounded-lg text-sm font-medium transition-all',
              value === n ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink hover:bg-rp-hairline',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
