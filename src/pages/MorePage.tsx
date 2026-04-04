import { useNavigate } from 'react-router-dom'
import {
  Users,
  Store,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  User,
  PartyPopper,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useAppStore } from '@/stores/appStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'

export function MorePage() {
  const navigate = useNavigate()
  const { theme, setTheme, profile } = useAppStore()
  const { signOut } = useAuth()

  const menuItems = [
    {
      icon: Users,
      label: 'My Circles',
      description: 'Manage family & friend groups',
      onClick: () => navigate('/more/circles'),
    },
    {
      icon: PartyPopper,
      label: 'Events',
      description: 'Potlucks & dinner parties',
      onClick: () => navigate('/events'),
    },
    {
      icon: Store,
      label: 'My Stores',
      description: 'Store routes & aisle order',
      onClick: () => navigate('/more/stores'),
    },
    {
      icon: User,
      label: 'Profile',
      description: profile?.email ?? 'Manage your account',
      onClick: () => navigate('/more/profile'),
    },
  ]

  return (
    <div className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">More</h2>

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
              Theme
            </span>
          </div>
          <div className="flex bg-slate-100 dark:bg-surface-dark-overlay rounded-lg p-0.5">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                  theme === t
                    ? 'bg-white dark:bg-surface-dark-elevated text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {t}
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
        Sign Out
      </button>
    </div>
  )
}
