import { cn } from '@/lib/cn'

interface SkeletonProps {
  className?: string
}

/** Animated shimmer placeholder */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse',
        className
      )}
    />
  )
}

/** Card-shaped skeleton for list items */
export function SkeletonCard() {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-surface-dark-elevated border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}

/** Full-page skeleton for list pages */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
