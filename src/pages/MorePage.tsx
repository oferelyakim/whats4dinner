import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  LogOut,
  ChevronRight,
  User,
  Sparkles,
  Type,
  MonitorSmartphone,
  Palette,
  X,
  Plus,
  Mail,
  Bell,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { SkinPicker } from '@/components/skins/SkinPicker'
import { getSkin } from '@/lib/skins'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAppStore } from '@/stores/appStore'
import type { NotificationPrefs } from '@/stores/appStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { useI18n, type Locale } from '@/lib/i18n'
import { useAIAccess } from '@/hooks/useAIAccess'
import { useGrocerFlag } from '@/hooks/useGrocerFlag'
import { AIUpgradeModal, UsageMeter } from '@/components/ui/UpgradePrompt'
import { ConnectedStoresSection } from '@/components/grocers/ConnectedStoresSection'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { APP_VERSION } from '@/lib/version'
import { AI_PRICING, SEAT_CAP } from '@/lib/subscription'
import {
  listMySeats,
  addSeatByUserId,
  inviteSeatByEmail,
  removeSeat,
  SeatCapReachedError,
  type Seat,
} from '@/services/subscription-seats'
import { getMyCircles, getCircleMembers } from '@/services/circles'
import type { CircleMember } from '@/types'

// ─── Seats section ──────────────────────────────────────────────────────────

function SeatRow({
  seat,
  currentUserId,
  onRemove,
  isRemoving,
}: {
  seat: Seat
  currentUserId: string
  onRemove: (seatId: string) => void
  isRemoving: boolean
}) {
  const { t } = useI18n()
  const isYou = seat.user_id === currentUserId
  const isPending = !seat.user_id && !!seat.pending_email
  const name = seat.profile?.full_name ?? seat.profile?.email ?? seat.pending_email ?? 'Member'
  const initial = name[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-8 w-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 text-sm font-bold shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-rp-ink truncate">{name}</span>
          {isYou && (
            <span className="text-[10px] text-rp-ink-mute">
              {t('subscription.seats.you_label')}
            </span>
          )}
          {isPending && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
              {t('subscription.seats.pending')}
            </span>
          )}
        </div>
        {isPending && (
          <p className="text-xs text-rp-ink-mute truncate">{seat.pending_email}</p>
        )}
      </div>
      {!isYou && seat.role !== 'owner' && (
        <button
          onClick={() => onRemove(seat.id)}
          disabled={isRemoving}
          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0 min-h-[44px] min-w-[44px]"
          aria-label={t('subscription.seats.remove')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  currentUserId,
  existingSeatUserIds,
  onAdded,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentUserId: string
  existingSeatUserIds: string[]
  onAdded: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'circles' | 'email'>('circles')
  const [emailInput, setEmailInput] = useState('')

  // Load all circle members (across all circles, deduplicated)
  const { data: circleMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: ['all-circle-members-for-seats', currentUserId],
    queryFn: async () => {
      const circles = await getMyCircles()
      const allMembers: CircleMember[] = []
      const seen = new Set<string>()
      for (const circle of circles) {
        const members = await getCircleMembers(circle.id)
        for (const member of members) {
          if (!seen.has(member.user_id)) {
            seen.add(member.user_id)
            allMembers.push(member)
          }
        }
      }
      return allMembers
    },
    enabled: open,
  })

  const addByUserIdMutation = useMutation({
    mutationFn: (userId: string) => addSeatByUserId(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-seats'] })
      onAdded()
      onOpenChange(false)
    },
    onError: (err: Error) => {
      if (err instanceof SeatCapReachedError) {
        toast.error(t('subscription.seats.cap_reached'))
      } else {
        toast.error(err.message)
      }
    },
  })

  const inviteByEmailMutation = useMutation({
    mutationFn: () => inviteSeatByEmail(emailInput.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-seats'] })
      setEmailInput('')
      onAdded()
      onOpenChange(false)
    },
    onError: (err: Error) => {
      if (err instanceof SeatCapReachedError) {
        toast.error(t('subscription.seats.cap_reached'))
      } else {
        toast.error(err.message)
      }
    },
  })

  // Circle members not already seated and not the current user
  const candidates = circleMembers.filter(
    (m) => m.user_id !== currentUserId && !existingSeatUserIds.includes(m.user_id)
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-[60] bg-rp-card rounded-t-2xl p-5 max-w-lg mx-auto max-h-[75vh] flex flex-col">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 shrink-0" />
          <Dialog.Title className="text-base font-bold text-rp-ink mb-4 shrink-0">
            {t('subscription.seats.add_member')}
          </Dialog.Title>

          {/* Tab toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-4 shrink-0">
            {(['circles', 'email'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px]',
                  activeTab === tab ? 'bg-rp-card text-rp-ink shadow-sm' : 'text-slate-500'
                )}
              >
                {tab === 'circles' ? t('subscription.seats.from_circles') : t('subscription.seats.by_email')}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'circles' ? (
              membersLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No circle members available to add.</p>
              ) : (
                <div className="space-y-1">
                  {candidates.map((member) => {
                    const displayName = member.profile?.display_name ?? member.profile?.email ?? 'Member'
                    const initial = displayName[0]?.toUpperCase() ?? '?'
                    return (
                      <button
                        key={member.user_id}
                        onClick={() => addByUserIdMutation.mutate(member.user_id)}
                        disabled={addByUserIdMutation.isPending}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-rp-bg-soft transition-colors text-start min-h-[44px]"
                      >
                        <div className="h-8 w-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 text-sm font-bold shrink-0">
                          {initial}
                        </div>
                        <span className="text-sm text-rp-ink">{displayName}</span>
                        <Plus className="h-4 w-4 text-rp-brand ms-auto shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-rp-hairline bg-rp-bg px-3 py-2">
                  <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    className="flex-1 bg-transparent text-sm text-rp-ink placeholder:text-slate-400 outline-none min-h-[36px]"
                    onKeyDown={(e) => { if (e.key === 'Enter' && emailInput.trim()) inviteByEmailMutation.mutate() }}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => inviteByEmailMutation.mutate()}
                  disabled={!emailInput.trim() || inviteByEmailMutation.isPending}
                >
                  {inviteByEmailMutation.isPending ? t('common.loading') : t('subscription.seats.send_invite')}
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Subscription card (active) ─────────────────────────────────────────────

function ActiveSubscriptionCard({
  subscription,
  currentUserId,
  usageDollars,
  limitDollars,
  usagePercent,
  isWarning,
  isLimitReached,
}: {
  subscription: NonNullable<ReturnType<typeof useAIAccess>['subscription']>
  currentUserId: string
  usageDollars: number
  limitDollars: number
  usagePercent: number
  isWarning: boolean
  isLimitReached: boolean
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [showAddMember, setShowAddMember] = useState(false)

  const billingPeriod: 'monthly' | 'annual' = subscription.billing_period ?? 'monthly'
  const planLabel = billingPeriod === 'annual'
    ? `${t('subscription.annual')} · $${AI_PRICING.annual.price.toFixed(0)}/yr`
    : `${t('subscription.monthly')} · $${AI_PRICING.monthly.price.toFixed(0)}/mo`

  const renewalDate = new Date(subscription.current_period_end).toLocaleDateString()
  const trialActive = subscription.trial_end && new Date(subscription.trial_end) > new Date()
  const trialEndDate = subscription.trial_end ? new Date(subscription.trial_end).toLocaleDateString() : ''

  const { data: seats = [], isLoading: seatsLoading } = useQuery({
    queryKey: ['my-seats', currentUserId],
    queryFn: listMySeats,
    enabled: !!currentUserId,
  })

  const removeSeatMutation = useMutation({
    mutationFn: removeSeat,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-seats'] }),
    onError: (err: Error) => toast.error(err.message),
  })

  const currentSeat = seats.find((s) => s.user_id === currentUserId)
  const isOwner = currentSeat?.role === 'owner'

  const existingSeatUserIds = seats
    .map((s) => s.user_id)
    .filter(Boolean) as string[]

  return (
    <Card variant="elevated" className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-rp-ink">
            Replanish AI
          </span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
            {t('ai.planActive')}
          </span>
        </div>
        <span className="text-xs text-slate-400">{planLabel}</span>
      </div>

      {/* Trial badge */}
      {trialActive && (
        <p className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-2">
          {t('subscription.trial_badge').replace('{{date}}', trialEndDate)}
        </p>
      )}

      {/* Renewal date */}
      {!trialActive && (
        <p className="text-xs text-slate-400">
          {t('ai.resetsOn')} {renewalDate}
        </p>
      )}

      {/* Usage meter */}
      <UsageMeter
        usageDollars={usageDollars}
        limitDollars={limitDollars}
        percentUsed={usagePercent}
        isWarning={isWarning}
        isLimitReached={isLimitReached}
      />

      {/* Manage in Stripe — placeholder */}
      {/* TODO: Connect real Stripe Customer Portal URL when STRIPE_* secrets are configured */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-slate-400 w-full"
        disabled
      >
        {t('subscription.manage_in_stripe')}
      </Button>

      {/* Share AI access — only shown to subscription owner */}
      {isOwner && (
        <div className="border-t border-rp-hairline pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-rp-ink">
              {t('subscription.seats.title')}
            </span>
            <span className="text-xs text-rp-ink-mute">
              {t('subscription.seats.used')
                .replace('{{used}}', String(seats.length))
                .replace('{{total}}', String(SEAT_CAP))}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${Math.min((seats.length / SEAT_CAP) * 100, 100)}%` }}
            />
          </div>

          {/* Seat list */}
          {seatsLoading ? (
            <div className="flex justify-center py-2">
              <div className="h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-rp-hairline">
              {seats.map((seat) => (
                <SeatRow
                  key={seat.id}
                  seat={seat}
                  currentUserId={currentUserId}
                  onRemove={(id) => removeSeatMutation.mutate(id)}
                  isRemoving={removeSeatMutation.isPending}
                />
              ))}
            </div>
          )}

          {/* Add member button */}
          {seats.length < SEAT_CAP && (
            <button
              onClick={() => setShowAddMember(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-rp-brand border border-dashed border-rp-brand/40 rounded-xl hover:bg-brand-500/5 transition-colors min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              {t('subscription.seats.add_member')}
            </button>
          )}
        </div>
      )}

      <AddMemberDialog
        open={showAddMember}
        onOpenChange={setShowAddMember}
        currentUserId={currentUserId}
        existingSeatUserIds={existingSeatUserIds}
        onAdded={() => queryClient.invalidateQueries({ queryKey: ['my-seats'] })}
      />
    </Card>
  )
}

// ─── Upgrade card (no subscription) ─────────────────────────────────────────

function UpgradeCard({ onOpenModal }: { onOpenModal: () => void }) {
  const { t } = useI18n()

  return (
    <Card
      variant="elevated"
      className="p-4 cursor-pointer bg-gradient-to-r from-brand-500/10 to-purple-500/10 border-brand-500/30 active:scale-[0.98] transition-transform"
      onClick={onOpenModal}
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-brand-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-rp-ink">{t('ai.upgradeToAI')}</p>
          <p className="text-xs text-slate-500">
            {t('subscription.start_trial')} — {t('subscription.save_pct')}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-brand-500 rtl-flip" />
      </div>
    </Card>
  )
}

// ─── Notifications card ──────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  // RTL-aware thumb position. In RTL the thumb visually starts on the right
  // and moves left when checked, so we flip the translate sign.
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  const thumbClass = isRtl
    ? checked
      ? '-translate-x-6'
      : '-translate-x-1'
    : checked
      ? 'translate-x-6'
      : 'translate-x-1'

  return (
    <div className={cn('flex items-center justify-between gap-3 py-2', disabled && 'opacity-50')}>
      <span className="text-sm text-rp-ink">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rp-brand shrink-0',
          checked ? 'bg-rp-brand' : 'bg-slate-200',
          disabled && 'cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            thumbClass
          )}
        />
      </button>
    </div>
  )
}

function NotificationsCard({
  prefs,
  onSetPref,
  permission,
  onPermissionChange,
}: {
  prefs: NotificationPrefs
  onSetPref: (key: keyof NotificationPrefs, value: boolean) => void
  permission: NotificationPermission
  onPermissionChange: (p: NotificationPermission) => void
}) {
  const { t } = useI18n()
  const toast = useToast()

  async function handleMasterToggle(enabled: boolean) {
    if (!enabled) {
      onSetPref('enabled', false)
      return
    }

    // Need permission first
    if (!('Notification' in window)) {
      toast.error('Notifications are not supported in this browser.')
      return
    }

    if (permission === 'denied') {
      toast.error(t('notifications.settings.deniedHelp'))
      return
    }

    if (permission !== 'granted') {
      const result = await Notification.requestPermission()
      onPermissionChange(result)
      if (result !== 'granted') {
        toast.error(t('notifications.settings.deniedHelp'))
        return
      }
    }

    onSetPref('enabled', true)
  }

  const permissionLabel =
    permission === 'granted'
      ? t('notifications.settings.granted')
      : permission === 'denied'
      ? t('notifications.settings.denied')
      : t('notifications.settings.notAsked')

  const permissionColor =
    permission === 'granted'
      ? 'text-emerald-600'
      : permission === 'denied'
      ? 'text-red-500'
      : 'text-rp-ink-mute'

  return (
    <Card className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-rp-ink">{t('notifications.settings.title')}</div>
          <div className="text-xs text-rp-ink-mute">{t('notifications.settings.subtitle')}</div>
        </div>
      </div>

      {/* Master enable toggle + permission badge */}
      <div className="space-y-1">
        <ToggleRow
          label={t('notifications.settings.enable')}
          checked={prefs.enabled}
          onChange={handleMasterToggle}
        />
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium', permissionColor)}>{permissionLabel}</span>
          {permission === 'denied' && (
            <span className="text-xs text-rp-ink-mute">— {t('notifications.settings.deniedHelp')}</span>
          )}
        </div>
      </div>

      {/* Per-category toggles */}
      <div className="border-t border-rp-hairline pt-2 space-y-0.5">
        <ToggleRow
          label={t('notifications.settings.chores')}
          checked={prefs.chores}
          onChange={(v) => onSetPref('chores', v)}
          disabled={!prefs.enabled}
        />
        <ToggleRow
          label={t('notifications.settings.activities')}
          checked={prefs.activities}
          onChange={(v) => onSetPref('activities', v)}
          disabled={!prefs.enabled}
        />
        <ToggleRow
          label={t('notifications.settings.lists')}
          checked={prefs.lists}
          onChange={(v) => onSetPref('lists', v)}
          disabled={!prefs.enabled}
        />
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-rp-ink-mute border-t border-rp-hairline pt-2">
        {t('notifications.settings.tabOpenNote')}
      </p>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function MorePage() {
  const navigate = useNavigate()
  const { fontSize, setFontSize, keepScreenOn, setKeepScreenOn, profile, activeCircle, personalSkinId, setPersonalSkinId, notificationPrefs, setNotificationPref } = useAppStore()
  const [showSkinPicker, setShowSkinPicker] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  )
  const { session, signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const ai = useAIAccess()
  const grocerFlag = useGrocerFlag()

  const menuItems = [
    {
      icon: Users,
      label: t('circle.myCircles'),
      description: 'Family & friend groups',
      onClick: () => navigate('/profile/circles'),
    },
    {
      icon: User,
      label: t('more.profile'),
      description: profile?.email ?? 'Manage your account',
      onClick: () => navigate('/profile/settings'),
    },
  ]

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">{t('more.profile')}</h2>

      {/* Profile card */}
      <Card variant="elevated" className="p-4 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-lg">
          {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-rp-ink truncate">
            {profile?.display_name ?? 'User'}
          </p>
          <p className="text-sm text-slate-500 truncate">
            {profile?.email ?? ''}
          </p>
        </div>
      </Card>

      {/* Menu items */}
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {menuItems.map(({ icon: Icon, label, description, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 dark:active:bg-surface-dark-overlay transition-colors"
          >
            <Icon className="h-5 w-5 text-rp-ink-mute shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-rp-ink">{label}</p>
              <p className="text-xs text-slate-400 truncate">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 rtl-flip" />
          </button>
        ))}
      </Card>

      {/* AI Subscription */}
      {ai.hasAI && ai.subscription ? (
        <ActiveSubscriptionCard
          subscription={ai.subscription}
          currentUserId={session?.user.id ?? ''}
          usageDollars={ai.usageDollars}
          limitDollars={ai.limitDollars}
          usagePercent={ai.usagePercent}
          isWarning={ai.isWarning}
          isLimitReached={ai.isLimitReached}
        />
      ) : (
        <UpgradeCard onOpenModal={() => ai.setShowUpgradeModal(true)} />
      )}

      {/* Grocer integrations (feature flagged) */}
      {grocerFlag.enabled && <ConnectedStoresSection />}

      {/* Notifications */}
      <NotificationsCard
        prefs={notificationPrefs}
        onSetPref={setNotificationPref}
        permission={notifPermission}
        onPermissionChange={setNotifPermission}
      />

      {/* Personal skin override (per device) */}
      <Card className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Palette className="h-5 w-5 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-rp-ink truncate">{t('more.personalSkin.title')}</div>
              <div className="text-xs text-rp-ink-mute truncate">{t('more.personalSkin.desc')}</div>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowSkinPicker(true)}>
            {getSkin(personalSkinId ?? activeCircle?.skin_id).name}
          </Button>
        </div>
        {personalSkinId && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-rp-brand-deep">{t('more.personalSkin.active')}</span>
            <button
              onClick={() => setPersonalSkinId(null)}
              className="text-rp-ink-mute hover:text-rp-ink underline underline-offset-2"
            >
              {t('more.personalSkin.useCircle')}
            </button>
          </div>
        )}
      </Card>

      <Dialog.Root open={showSkinPicker} onOpenChange={setShowSkinPicker}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-6 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-rp-ink mb-1 flex items-center gap-2">
              <Palette className="h-4 w-4 text-rp-brand" />
              {t('more.personalSkin.title')}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-rp-ink-mute mb-4">
              {t('more.personalSkin.desc')}
            </Dialog.Description>
            <SkinPicker
              selectedId={personalSkinId ?? activeCircle?.skin_id ?? 'hearth'}
              onSelect={(id) => {
                setPersonalSkinId(id === activeCircle?.skin_id ? null : id)
                setShowSkinPicker(false)
              }}
            />
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => { setPersonalSkinId(null); setShowSkinPicker(false) }}
                className="text-sm text-rp-ink-mute hover:text-rp-ink min-h-[44px]"
              >
                {t('more.personalSkin.useCircle')}
              </button>
              <Button variant="secondary" onClick={() => setShowSkinPicker(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Font size */}
      <Card className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Type className="h-5 w-5 text-slate-500 shrink-0" />
            <span className="text-sm font-medium text-rp-ink truncate">
              {t('more.fontSize')}
            </span>
          </div>
          <div className="flex bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5">
            {([
              { code: 'sm' as const, label: t('more.fontSizeSmall'), size: 'text-xs' },
              { code: 'md' as const, label: t('more.fontSizeMedium'), size: 'text-sm' },
              { code: 'lg' as const, label: t('more.fontSizeLarge'), size: 'text-base' },
            ]).map((opt) => (
              <button
                key={opt.code}
                onClick={() => setFontSize(opt.code)}
                aria-pressed={fontSize === opt.code}
                className={cn(
                  'px-3 py-3 rounded-md font-medium transition-colors min-h-[44px]',
                  opt.size,
                  fontSize === opt.code
                    ? 'bg-rp-card text-rp-ink shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Keep screen on */}
      <Card className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MonitorSmartphone className="h-5 w-5 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-rp-ink truncate">
                {t('more.keepScreenOn')}
              </div>
              <div className="text-xs text-rp-ink-mute truncate">
                {t('more.keepScreenOnHint')}
              </div>
            </div>
          </div>
          <div className="flex bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5 shrink-0">
            {([
              { value: false, label: t('common.off') },
              { value: true, label: t('common.on') },
            ]).map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setKeepScreenOn(opt.value)}
                aria-pressed={keepScreenOn === opt.value}
                className={cn(
                  'px-3 py-3 rounded-md text-sm font-medium transition-colors min-h-[44px]',
                  keepScreenOn === opt.value
                    ? 'bg-rp-card text-rp-ink shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Language toggle */}
      <Card className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">🌐</span>
            <span className="text-sm font-medium text-rp-ink">
              {t('more.language')}
            </span>
          </div>
          <div className="flex bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5">
            {([{ code: 'en', label: 'EN' }, { code: 'he', label: 'עב' }, { code: 'es', label: 'ES' }] as const).map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLocale(lang.code as Locale)}
                className={cn(
                  'px-3 py-3 rounded-md text-sm font-medium transition-colors min-h-[44px]',
                  locale === lang.code
                    ? 'bg-rp-card text-rp-ink shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-danger hover:bg-danger/10 rounded-xl transition-colors"
      >
        <LogOut className="h-4 w-4" />
        {t('auth.signOut')}
      </button>

      {/* Version */}
      <p className="text-center text-[11px] text-rp-ink-mute pt-2 pb-1">
        Replanish v{APP_VERSION}
      </p>

      <AIUpgradeModal
        open={ai.showUpgradeModal}
        onOpenChange={ai.setShowUpgradeModal}
        isLimitReached={ai.isLimitReached}
        resetDate={ai.subscription?.current_period_end
          ? new Date(ai.subscription.current_period_end).toLocaleDateString()
          : undefined}
      />
    </div>
  )
}
