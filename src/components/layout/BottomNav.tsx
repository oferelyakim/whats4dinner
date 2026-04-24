import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import {
  HearthIcon,
  PotIcon,
  TableIcon,
  HouseCircleIcon,
  PersonIcon,
} from '@/components/ui/hearth'

const NAV_ITEMS = [
  { path: '/',          key: 'nav.home',   Icon: HearthIcon },
  { path: '/food',      key: 'nav.food',   Icon: PotIcon },
  { path: '/events',    key: 'nav.gather', Icon: TableIcon },
  { path: '/household', key: 'nav.house',  Icon: HouseCircleIcon },
  { path: '/profile',   key: 'nav.me',     Icon: PersonIcon },
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
        'bg-rp-bg/85 backdrop-blur-xl',
        'border-t border-rp-hairline'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, key, Icon }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)

          return (
            <motion.button
              key={path}
              onClick={() => navigate(path)}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(key)}
              className={cn(
                'relative flex flex-col items-center gap-1 px-2.5 py-1.5 min-w-[56px]',
                isActive ? 'text-rp-brand' : 'text-rp-ink-mute'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center h-9 w-9 rounded-[10px] transition-colors',
                  isActive ? 'bg-rp-brand-soft' : 'bg-transparent'
                )}
              >
                <Icon width={22} height={22} strokeWidth={isActive ? 1.9 : 1.6} />
              </span>
              <span
                className={cn(
                  'text-[10px] leading-none',
                  isActive ? 'font-semibold' : 'font-medium'
                )}
              >
                {t(key)}
              </span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
