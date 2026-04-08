import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated'
}

export function Card({ className, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200',
        {
          default:
            'bg-white border-slate-200 dark:bg-surface-dark-elevated dark:border-slate-700/50',
          elevated:
            'bg-white border-slate-200 shadow-sm hover:shadow-md dark:bg-surface-dark-elevated dark:border-slate-700/50',
        }[variant],
        className
      )}
      {...props}
    />
  )
}
