import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The icon element to render */
  children: ReactNode;
  /** Accessible label (required for icon-only buttons) */
  'aria-label': string;
  /** Visual size of the icon container. Touch target is always 44px minimum */
  size?: 'sm' | 'md' | 'lg';
  /** Visual variant */
  variant?: 'ghost' | 'filled' | 'danger';
}

const sizeClasses = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
} as const;

const variantClasses = {
  ghost: 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800',
  filled: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
  danger: 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950',
} as const;

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, size = 'md', variant = 'ghost', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={`touch-target rounded-xl transition-colors ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };
export type { IconButtonProps };
