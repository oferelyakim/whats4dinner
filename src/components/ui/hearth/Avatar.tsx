import { cn } from '@/lib/cn'

const MEMBER_COLORS = [
  { bg: 'var(--rp-mem-honey-bg)',   ink: 'var(--rp-mem-honey-ink)' },
  { bg: 'var(--rp-mem-coral-bg)',   ink: 'var(--rp-mem-coral-ink)' },
  { bg: 'var(--rp-mem-sage-bg)',    ink: 'var(--rp-mem-sage-ink)' },
  { bg: 'var(--rp-mem-sky-bg)',     ink: 'var(--rp-mem-sky-ink)' },
  { bg: 'var(--rp-mem-plum-bg)',    ink: 'var(--rp-mem-plum-ink)' },
  { bg: 'var(--rp-mem-mustard-bg)', ink: 'var(--rp-mem-mustard-ink)' },
] as const

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  }
  return h % MEMBER_COLORS.length
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-[22px] w-[22px] text-[10px]',
  sm: 'h-[26px] w-[26px] text-[11px]',
  md: 'h-[30px] w-[30px] text-xs',
  lg: 'h-[48px] w-[48px] text-base',
  xl: 'h-[72px] w-[72px] text-xl',
}

export interface AvatarProps {
  name: string
  size?: AvatarSize
  ring?: 'card' | 'bg' | 'none'
  className?: string
}

export function Avatar({ name, size = 'md', ring = 'none', className }: AvatarProps) {
  const color = MEMBER_COLORS[hashName(name || '?')]
  const ringClass =
    ring === 'card' ? 'ring-2 ring-[var(--rp-card)]' :
    ring === 'bg'   ? 'ring-2 ring-[var(--rp-bg)]'   : ''
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold select-none shrink-0',
        SIZE_CLASSES[size],
        ringClass,
        className
      )}
      style={{ background: color.bg, color: color.ink }}
    >
      {initials(name)}
    </span>
  )
}

export interface AvatarStackProps {
  names: string[]
  max?: number
  size?: AvatarSize
  ring?: 'card' | 'bg'
  className?: string
}

export function AvatarStack({ names, max = 4, size = 'sm', ring = 'card', className }: AvatarStackProps) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <div className={cn('flex items-center -space-x-2', className)} dir="ltr">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} ring={ring} />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full font-semibold shrink-0',
            SIZE_CLASSES[size],
            ring === 'card' ? 'ring-2 ring-[var(--rp-card)]' : 'ring-2 ring-[var(--rp-bg)]'
          )}
          style={{ background: 'var(--rp-bg-soft)', color: 'var(--rp-ink-soft)' }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
