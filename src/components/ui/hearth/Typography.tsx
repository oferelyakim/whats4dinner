import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Instrument Serif italic wrapper — every page title uses this. */
export function PageTitle({
  children,
  className,
  as: As = 'h1',
  ...rest
}: { children: ReactNode; as?: 'h1' | 'h2' | 'h3' } & HTMLAttributes<HTMLHeadingElement>) {
  return (
    <As
      className={cn(
        'font-display italic text-rp-ink tracking-rp-tight',
        'text-[30px] leading-[1.05]',
        className
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

/** Serif italic display hero — onboarding, ad moments. */
export function DisplayTitle({
  children,
  className,
  as: As = 'h1',
  ...rest
}: { children: ReactNode; as?: 'h1' | 'h2' } & HTMLAttributes<HTMLHeadingElement>) {
  return (
    <As
      className={cn(
        'font-display italic text-rp-ink tracking-rp-tight',
        'text-[44px] leading-[1.02]',
        className
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

/** Mono uppercase section label — the little caption above a block. */
export function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono uppercase text-rp-ink-mute font-semibold',
        'text-[10.5px] tracking-rp-label',
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * Caveat handwritten accent — one per screen, slightly rotated.
 * Use for warmth-adjacent taglines.
 */
export function HandAccent({
  children,
  className,
  rotate = -2,
}: {
  children: ReactNode
  className?: string
  rotate?: number
}) {
  return (
    <span
      className={cn('font-hand text-rp-brand-deep text-lg inline-block', className)}
      style={{ transform: `rotate(${rotate}deg)`, opacity: 0.92 }}
    >
      {children}
    </span>
  )
}
