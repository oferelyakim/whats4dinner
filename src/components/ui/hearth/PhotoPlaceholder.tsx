import { cn } from '@/lib/cn'

export interface PhotoPlaceholderProps {
  label?: string
  className?: string
  aspect?: 'square' | 'wide' | 'hero'
}

/**
 * Warm gradient placeholder with subtle grain. Lowercase mono label bottom-left.
 * Use where a photo *should* eventually live but doesn't yet.
 */
export function PhotoPlaceholder({ label = 'photo · here', className, aspect = 'wide' }: PhotoPlaceholderProps) {
  const aspectClass =
    aspect === 'square' ? 'aspect-square' :
    aspect === 'hero'   ? 'h-[220px] w-full' :
    'aspect-[16/10] w-full'
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-rp-md',
        aspectClass,
        className
      )}
      style={{
        background:
          'linear-gradient(135deg, var(--rp-brand-soft) 0%, var(--rp-glow-soft) 45%, var(--rp-accent-soft) 100%)',
      }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 mix-blend-multiply opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(rgba(40,20,10,0.25) 1px, transparent 1px)',
          backgroundSize: '4px 4px',
        }}
      />
      <span
        className="absolute bottom-2 left-3 font-mono uppercase text-[9.5px] tracking-rp-label text-rp-ink-soft opacity-80"
      >
        {label}
      </span>
    </div>
  )
}
