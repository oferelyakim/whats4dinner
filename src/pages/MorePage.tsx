import { useNavigate } from 'react-router-dom'
import {
  Users,
  Store,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  User,
  UtensilsCrossed,
  CalendarDays,
  Crown,
  Calendar,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useAppStore } from '@/stores/appStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { useI18n, type Locale } from '@/lib/i18n'
import { useSubscription } from '@/lib/subscription'
import { UpgradePrompt, useFeatureGate } from '@/components/ui/UpgradePrompt'

export function MorePage() {
  const navigate = useNavigate()
  const { theme, setTheme, profile } = useAppStore()
  const { signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const { tier } = useSubscription()
  const gate = useFeatureGate()

  const menuItems = [
    {
      icon: Users,
      label: t('circle.myCircles'),
      description: 'Family & friend groups',
      onClick: () => navigate('/more/circles'),
    },
    {
      icon: Calendar,
      label: 'Activities',
      description: 'Schedules, sports, lessons, chores',
      onClick: () => navigate('/more/activities'),
    },
    {
      icon: CalendarDays,
      label: t('plan.mealPlan'),
      description: 'Weekly meal planning',
      onClick: () => navigate('/plan'),
    },
    {
      icon: UtensilsCrossed,
      label: t('more.mealTemplates'),
      description: 'Taco Night, BBQ, etc.',
      onClick: () => navigate('/more/menus'),
    },
    {
      icon: Store,
      label: t('more.myStores'),
      description: 'Sort shopping by aisle',
      onClick: () => navigate('/more/stores'),
    },
    {
      icon: User,
      label: t('more.profile'),
      description: profile?.email ?? 'Manage your account',
      onClick: () => navigate('/more/profile'),
    },
  ]

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('more.more')}</h2>

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
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
          </button>
        ))}
      </Card>

      {/* Subscription */}
      {tier === 'free' ? (
        <Card
          variant="elevated"
          className="p-4 cursor-pointer bg-gradient-to-r from-brand-500/10 to-pink-500/10 border-brand-500/30 active:scale-[0.98] transition-transform"
          onClick={() => gate.setShowUpgrade(true)}
        >
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-brand-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Upgrade to Premium</p>
              <p className="text-xs text-slate-500">Create circles, organize events, AI features & more</p>
            </div>
            <ChevronRight className="h-4 w-4 text-brand-500" />
          </div>
        </Card>
      ) : (
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-brand-500" />
            <span className="text-sm font-medium text-brand-500 capitalize">{tier} Plan</span>
          </div>
        </Card>
      )}

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
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
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
            {([{ code: 'en', label: 'English' }, { code: 'he', label: 'עברית' }] as const).map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLocale(lang.code as Locale)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
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

      <UpgradePrompt
        open={gate.showUpgrade}
        onOpenChange={gate.setShowUpgrade}
        feature={gate.upgradeFeature}
      />
    </div>
  )
}
