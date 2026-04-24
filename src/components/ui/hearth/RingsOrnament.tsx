import { cn } from '@/lib/cn'

export interface RingsOrnamentProps {
  className?: string
  size?: number
  opacity?: number
}

/**
 * Four concentric hairline circles — decorative background behind hero blocks.
 * Position with absolute utilities so it bleeds off-canvas.
 */
export function RingsOrnament({ className, size = 520, opacity = 0.16 }: RingsOrnamentProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 520 520"
      aria-hidden="true"
      className={cn('pointer-events-none', className)}
      style={{ opacity }}
    >
      {[260, 200, 140, 80].map((r) => (
        <circle
          key={r}
          cx={260}
          cy={260}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        />
      ))}
    </svg>
  )
}
