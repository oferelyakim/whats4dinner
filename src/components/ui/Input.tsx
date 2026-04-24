import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="mb-1.5 block text-sm font-medium text-rp-ink-soft"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-xl border px-4 py-2.5 text-sm transition-all duration-150',
            'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400',
            'dark:bg-surface-dark-elevated dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
            'hover:border-slate-300 dark:hover:border-slate-600',
            error && 'border-danger focus:ring-danger/50 focus:border-danger',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
            <span className="inline-block h-1 w-1 rounded-full bg-danger" />
            {error}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
