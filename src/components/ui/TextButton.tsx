import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'brand' | 'muted' | 'danger';
}

const variantClasses = {
  brand: 'text-brand-500 hover:text-brand-600',
  muted: 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
  danger: 'text-red-500 hover:text-red-600',
} as const;

const TextButton = forwardRef<HTMLButtonElement, TextButtonProps>(
  ({ children, variant = 'brand', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={`touch-target px-2 text-sm font-medium transition-colors ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

TextButton.displayName = 'TextButton';

export { TextButton };
export type { TextButtonProps };
