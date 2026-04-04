import { useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  BookOpen,
  ShoppingCart,
  CalendarDays,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/recipes', label: 'Recipes', icon: BookOpen },
  { path: '/lists', label: 'Lists', icon: ShoppingCart },
  { path: '/plan', label: 'Plan', icon: CalendarDays },
  { path: '/more', label: 'More', icon: Menu },
] as const

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { bottomNavVisible } = useAppStore()

  if (!bottomNavVisible) return null

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-white/90 dark:bg-surface-dark/90 backdrop-blur-lg',
        'border-t border-slate-200 dark:border-slate-800'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive =
            path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px]',
                'active:scale-90 transition-transform',
                isActive
                  ? 'text-brand-500'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn('text-[10px]', isActive && 'font-semibold')}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
