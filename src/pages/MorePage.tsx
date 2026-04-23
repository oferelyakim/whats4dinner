import { useNavigate } from 'react-router-dom'
import {
  Users,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  User,
  Sparkles,
  Type,
  MonitorSmartphone,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAppStore } from '@/stores/appStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { useI18n, type Locale } from '@/lib/i18n'
import { useAIAccess } from '@/hooks/useAIAccess'
import { useGrocerFlag } from '@/hooks/useGrocerFlag'
import { AIUpgradeModal, UsageMeter, cancelSubscription } from '@/components/ui/UpgradePrompt'
import { ConnectedStoresSection } from '@/components/grocers/ConnectedStoresSection'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'

export function MorePage() {
  const navigate = useNavigate()
  const { theme, setTheme, fontSize, setFontSize, keepScreenOn, setKeepScreenOn, profile } = useAppStore()
  const { session, signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const ai = useAIAccess()
  const grocerFlag = useGrocerFlag()
  const queryClient = useQueryClient()
  const toast = useToast()

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription(session!.user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

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

  const resetDate = ai.subscription?.current_period_end
    ? new Date(ai.subscription.current_period_end).toLocaleDateString()
    : undefined

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('more.profile')}</h2>

      {/* Profile card */}
      <Card variant="elevated" className="p-4 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-lg">
          {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white truncate">
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
            <Icon className="h-5 w-5 text-slate-500 dark:text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
              <p className="text-xs text-slate-400 truncate">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 rtl-flip" />
          </button>
        ))}
      </Card>

      {/* AI Subscription */}
      {ai.hasAI ? (
        <Card variant="elevated" className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-500" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('ai.plan')}
              </span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                {t('ai.planActive')}
              </span>
            </div>
            <span className="text-xs text-slate-400 capitalize">
              {ai.subscription?.plan === 'ai_individual' ? 'Individual' : 'Family'}
            </span>
          </div>
          <UsageMeter
            usageDollars={ai.usageDollars}
            limitDollars={ai.limitDollars}
            percentUsed={ai.usagePercent}
            isWarning={ai.isWarning}
            isLimitReached={ai.isLimitReached}
          />
          {/* TODO: Replace with Stripe portal */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-400"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            {t('ai.cancelPlan')}
          </Button>
        </Card>
      ) : (
        <Card
          variant="elevated"
          className="p-4 cursor-pointer bg-gradient-to-r from-brand-500/10 to-purple-500/10 border-brand-500/30 active:scale-[0.98] transition-transform"
          onClick={() => ai.setShowUpgradeModal(true)}
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-brand-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('ai.upgradeToAI')}</p>
              <p className="text-xs text-slate-500">{t('ai.upgradeDesc')}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-brand-500 rtl-flip" />
          </div>
        </Card>
      )}

      {/* Grocer integrations (feature flagged) */}
      {grocerFlag.enabled && <ConnectedStoresSection />}

      {/* Theme toggle */}
      <Card className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 text-slate-500" />
            ) : (
              <Sun className="h-5 w-5 text-slate-500" />
            )}
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {t('more.theme')}
            </span>
          </div>
          <div className="flex bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5">
            {(['light', 'dark', 'system'] as const).map((themeOption) => (
              <button
                key={themeOption}
                onClick={() => setTheme(themeOption)}
                className={cn(
                  'px-4 py-3 rounded-md text-sm font-medium transition-colors capitalize min-h-[44px]',
                  theme === themeOption
                    ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {t(`more.${themeOption}`)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Font size */}
      <Card className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Type className="h-5 w-5 text-slate-500 shrink-0" />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
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
                    ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
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
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {t('more.keepScreenOn')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
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
                    ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
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
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
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
                    ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
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

      <AIUpgradeModal
        open={ai.showUpgradeModal}
        onOpenChange={ai.setShowUpgradeModal}
        isLimitReached={ai.isLimitReached}
        resetDate={resetDate}
      />
    </div>
  )
}
