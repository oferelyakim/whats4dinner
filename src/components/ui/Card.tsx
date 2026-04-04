import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated'
}

export function Card({ className, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border transition-colors',
        {
          default:
            'bg-white border-slate-200 dark:bg-surface-dark-elevated dark:border-slate-800',
          elevated:
            'bg-white border-slate-200 shadow-sm dark:bg-surface-dark-elevated dark:border-slate-700',
        }[variant],
        className
      )}
      {...props}
    />
  )
}
