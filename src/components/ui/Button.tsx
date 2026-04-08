import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, loading, children, ...props }, ref) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150',
          'active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          {
            primary:
              'bg-brand-500 text-white hover:bg-brand-600 shadow-sm hover:shadow-md',
            secondary:
              'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-surface-dark-elevated dark:text-slate-100 dark:hover:bg-surface-dark-overlay border border-slate-200 dark:border-slate-700/50',
            ghost:
              'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-surface-dark-elevated',
            danger:
              'bg-danger text-white hover:bg-red-600 shadow-sm',
          }[variant],
          {
            sm: 'h-8 px-3 text-sm',
            md: 'h-10 px-4 text-sm',
            lg: 'h-12 px-6 text-base',
          }[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
