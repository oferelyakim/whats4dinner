import { useState, useEffect } from 'react'
import { ChefHat, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/cn'

interface HeaderProps {
  title?: string
  onCircleSelect?: () => void
}

export function Header({ title, onCircleSelect }: HeaderProps) {
  const { activeCircle } = useAppStore()
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
          <ChefHat className="h-5 w-5 text-brand-500" />
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            {title ?? 'OurTable'}
          </h1>
        </div>

        {activeCircle && (
          <button
            onClick={onCircleSelect}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs',
              'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
              'active:scale-95 transition-transform border border-brand-200/50 dark:border-brand-500/20'
            )}
          >
            <span className="text-sm">{activeCircle.icon}</span>
            <span className="font-medium max-w-[100px] truncate">{activeCircle.name}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>
    </header>
  )
}
