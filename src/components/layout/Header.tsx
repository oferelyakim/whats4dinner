import { useState, useEffect } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { NotificationCenter } from '@/components/ui/NotificationCenter'

interface HeaderProps {
  title?: string
  onCircleSelect?: () => void
}

export function Header({ title, onCircleSelect }: HeaderProps) {
  const { activeCircle } = useAppStore()
  const { t } = useI18n()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-white/80 dark:bg-surface-dark/80 backdrop-blur-xl transition-all duration-200',
        scrolled
          ? 'border-b border-slate-200/80 dark:border-slate-800/80 shadow-sm'
          : 'border-b border-transparent'
      )}
    >
      <div className="flex items-center justify-between h-12 px-4">
        <div className="flex items-center gap-2">
          <img src="/logo-icon.png" alt="Replanish" className="h-6 w-6" />
          <h1 className="text-base font-bold text-rp-ink">
            {title ?? 'Replanish'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <NotificationCenter />
          <button
            onClick={onCircleSelect}
            aria-label={activeCircle ? activeCircle.name : t('circle.chooseCircle')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs',
              'active:scale-95 transition-transform border',
              activeCircle
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300 border-brand-200/50 dark:border-brand-500/20'
                : 'bg-rp-bg-soft text-rp-ink border-rp-hairline'
            )}
          >
            {activeCircle ? (
              <>
                <span className="text-sm">{activeCircle.icon}</span>
                <span className="font-medium max-w-[100px] truncate">{activeCircle.name}</span>
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5" />
                <span className="font-medium">{t('circle.chooseCircle')}</span>
              </>
            )}
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    </header>
  )
}
