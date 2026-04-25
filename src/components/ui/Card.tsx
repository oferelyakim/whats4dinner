import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass'
}

export function Card({ className, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200 bg-rp-card text-rp-ink border-rp-hairline',
        {
          default: '',
          elevated: 'shadow-sm hover:shadow-md',
          glass: 'backdrop-blur-lg shadow-lg bg-rp-card/70',
        }[variant],
        className
      )}
      {...props}
    />
  )
}
