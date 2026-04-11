import { useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  PartyPopper,
  UtensilsCrossed,
  CalendarCheck,
  UserCircle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'

const NAV_ITEMS = [
  { path: '/', key: 'nav.home', icon: Home },
  { path: '/food', key: 'nav.food', icon: UtensilsCrossed },
  { path: '/events', key: 'event.events', icon: PartyPopper },
  { path: '/household', key: 'nav.household', icon: CalendarCheck },
  { path: '/profile', key: 'nav.profile', icon: UserCircle },
] as const

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { bottomNavVisible } = useAppStore()
  const { t } = useI18n()

  if (!bottomNavVisible) return null

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-white/80 dark:bg-surface-dark/80 backdrop-blur-xl',
        'border-t border-slate-200/80 dark:border-slate-800/80'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, key, icon: Icon }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)

          return (
            <motion.button
              key={path}
              onClick={() => navigate(path)}
              whileTap={{ scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px]',
                isActive
                  ? 'text-brand-500'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={cn('text-[10px] leading-tight', isActive && 'font-semibold')}>
                {t(key)}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -bottom-0.5 h-1 w-5 rounded-full bg-brand-500"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
