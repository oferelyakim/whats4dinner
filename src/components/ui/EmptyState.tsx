import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-400 dark:bg-brand-500/10 dark:text-brand-400">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
