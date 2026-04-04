import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.97]',
          'disabled:opacity-50 disabled:pointer-events-none',
          {
            primary:
              'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
            secondary:
              'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-surface-dark-elevated dark:text-slate-100 dark:hover:bg-surface-dark-overlay',
            ghost:
              'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-surface-dark-elevated',
            danger:
              'bg-danger text-white hover:bg-red-600',
          }[variant],
          {
            sm: 'h-8 px-3 text-sm',
            md: 'h-10 px-4 text-sm',
            lg: 'h-12 px-6 text-base',
          }[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
