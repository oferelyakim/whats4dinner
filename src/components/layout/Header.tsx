import { ChefHat, ChevronDown } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/cn'

interface HeaderProps {
  title?: string
  onCircleSelect?: () => void
}

export function Header({ title, onCircleSelect }: HeaderProps) {
  const { activeCircle } = useAppStore()

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-surface-dark/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          <ChefHat className="h-6 w-6 text-brand-500" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {title ?? "What's4Dinner"}
          </h1>
        </div>

        {activeCircle && (
          <button
            onClick={onCircleSelect}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm',
              'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
              'active:scale-95 transition-transform'
            )}
          >
            <span>{activeCircle.icon}</span>
            <span className="font-medium max-w-[120px] truncate">{activeCircle.name}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </header>
  )
}
