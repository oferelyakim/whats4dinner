import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
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
          'inline-flex items-center justify-center gap-2 rounded-rp-sm font-medium transition-all duration-150',
          'active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-rp-brand focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          {
            primary:
              'bg-rp-brand text-rp-card hover:bg-rp-brand-deep shadow-sm hover:shadow-md',
            secondary:
              'bg-rp-bg-soft text-rp-ink hover:bg-rp-brand-soft/60 border border-rp-hairline',
            outline:
              'bg-transparent text-rp-ink border border-rp-hairline hover:bg-rp-bg-soft',
            ghost:
              'text-rp-ink-soft hover:bg-rp-bg-soft',
            danger:
              'bg-rp-brand-deep text-rp-card hover:brightness-110 shadow-sm',
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
