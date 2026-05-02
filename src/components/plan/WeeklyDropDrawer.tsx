// v3.0.0 — Weekly drop drawer (bottom-pinned, 3 densities).
//
// Implements the design-handoff "drop drawer" pattern:
//   • quiet (52px) — handle + label + "pull up" hint
//   • medium (156px) — adds filter chips + horizontal card scroll
//   • hero (320px) — 2-col grid, shopping bar hides
//
// Cards are sourced from the shared weekly drop. By default uses
// `getCurrentWeeklyDrop()` (the earliest still-active drop). When the
// parent passes a `weekStart` prop (e.g. PlanV2View piping the visible
// week's Sunday), we switch to `getWeeklyDropForWeek(weekStart)` so the
// drawer follows the planner's week-nav.
//
// Tap a card → calls onAdd(entry) which the parent routes to a slot picker.
// (Drag-into-slot is a follow-up; tap-to-add is the v3.0 path.)

import { useEffect, useState } from 'react'
import { ChevronUp, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { PhotoPlaceholder, MonoLabel, RingsOrnament } from '@/components/ui/hearth'
import { getCurrentWeeklyDrop, getWeeklyDropForWeek, type WeeklyDropEntry } from '@/services/recipe-bank'

export type DrawerDensity = 'quiet' | 'medium' | 'hero'

const FILTERS = ['Dinner', 'Lunch', 'Breakfast', 'Vegan', 'GF', '<30m'] as const
type Filter = (typeof FILTERS)[number]

interface Props {
  density: DrawerDensity
  onDensityChange: (d: DrawerDensity) => void
  onAdd?: (entry: WeeklyDropEntry) => void
  /** ISO date string. When provided, the drawer fetches that week's drop. */
  weekStart?: string
}

export function WeeklyDropDrawer({ density, onDensityChange, onAdd, weekStart }: Props) {
  const t = useI18n((s) => s.t)
  const [drop, setDrop] = useState<WeeklyDropEntry[] | null>(null)
  const [activeFilter, setActiveFilter] = useState<Filter>('Dinner')

  useEffect(() => {
    let cancelled = false
    const fetcher = weekStart ? getWeeklyDropForWeek(weekStart) : getCurrentWeeklyDrop()
    void fetcher
      .then((rows) => {
        if (!cancelled) setDrop(rows)
      })
      .catch(() => {
        if (!cancelled) setDrop([])
      })
    return () => {
      cancelled = true
    }
  }, [weekStart])

  const collapsed = density === 'quiet'
  const open = density === 'hero'
  const heightPx = collapsed ? 52 : open ? 360 : 176

  const filtered = (drop ?? []).filter((e) => {
    if (activeFilter === 'Dinner') return e.mealType === 'dinner'
    if (activeFilter === 'Lunch') return e.mealType === 'lunch'
    if (activeFilter === 'Breakfast') return e.mealType === 'breakfast'
    if (activeFilter === 'Vegan') return e.dietaryTags.includes('vegan')
    if (activeFilter === 'GF') return e.dietaryTags.includes('gluten-free')
    if (activeFilter === '<30m') return (e.prepTimeMin ?? 999) < 30
    return true
  })

  function cycleDensity() {
    const next: DrawerDensity = density === 'quiet' ? 'medium' : density === 'medium' ? 'hero' : 'quiet'
    onDensityChange(next)
  }

  return (
    <div
      className="fixed inset-x-0 z-30 bg-rp-card border-t border-rp-hairline rounded-t-3xl overflow-hidden transition-[height] duration-200"
      style={{
        height: heightPx,
        bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -16px 30px -10px rgba(40, 20, 10, 0.14)',
      }}
    >
      <div className="px-4 pt-2">
        <button
          onClick={cycleDensity}
          aria-label={t('drop.toggleDensity')}
          className="block mx-auto w-10 h-1 rounded-full bg-rp-hairline"
        />
      </div>

      <div className="px-4 pt-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <RingsOrnament size={18} className="opacity-60 shrink-0" />
          <div className="min-w-0">
            <MonoLabel>{t('drop.thisWeek')}</MonoLabel>
            <div className="text-[12px] font-medium text-rp-ink truncate">
              {collapsed ? t('drop.pullUp') : t('drop.tapToAdd')}
            </div>
          </div>
        </div>
        {open ? (
          <button
            onClick={() => onDensityChange('medium')}
            className="text-rp-ink-mute"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => onDensityChange(density === 'quiet' ? 'medium' : 'hero')}
            className="text-[11px] text-rp-brand font-medium flex items-center gap-1"
          >
            {t('drop.openCta')} <ChevronUp className="h-3 w-3" />
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="px-4 mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  'shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                  activeFilter === f
                    ? 'bg-rp-brand text-white border-rp-brand'
                    : 'bg-rp-bg-soft text-rp-ink-mute border-rp-hairline-soft hover:bg-rp-bg',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mt-2 px-4 pb-4 overflow-y-auto" style={{ maxHeight: open ? 280 : 110 }}>
            {drop === null && (
              <div className="text-[11px] text-rp-ink-mute italic">{t('drop.loading')}</div>
            )}
            {drop !== null && filtered.length === 0 && (
              <div className="text-[11px] text-rp-ink-mute italic">{t('drop.empty')}</div>
            )}
            {filtered.length > 0 && (
              <div
                className={cn(
                  open
                    ? 'grid grid-cols-2 gap-2'
                    : 'flex gap-2 overflow-x-auto no-scrollbar',
                )}
              >
                {filtered.map((entry) => (
                  <DropCard key={`${entry.dayIdx}-${entry.recipeBankId}-${entry.position}`} entry={entry} onAdd={onAdd} compact={!open} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function DropCard({
  entry,
  onAdd,
  compact,
}: {
  entry: WeeklyDropEntry
  onAdd?: (entry: WeeklyDropEntry) => void
  compact: boolean
}) {
  const t = useI18n((s) => s.t)
  const tag = entry.dietaryTags[0] ?? entry.cuisineId.split('-')[0]
  return (
    <div
      className={cn(
        'rounded-xl border border-rp-hairline-soft bg-rp-bg-soft p-1.5',
        compact ? 'shrink-0 w-[110px]' : '',
      )}
    >
      {entry.imageUrl ? (
        <img src={entry.imageUrl} alt={entry.title} className="w-full h-[60px] object-cover rounded-md" loading="lazy" />
      ) : (
        <div className="h-[60px]">
          <PhotoPlaceholder aspect="wide" className="h-full" />
        </div>
      )}
      <div className="text-[11px] font-medium text-rp-ink mt-1 leading-tight line-clamp-2">{entry.title}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[8.5px] text-rp-ink-mute uppercase tracking-wider">
          {entry.prepTimeMin ? `${entry.prepTimeMin}m` : '—'}
        </span>
        <span className="text-[8.5px] uppercase font-mono text-rp-ink-soft px-1.5 py-0.5 rounded-full bg-rp-card border border-rp-hairline-soft">
          {tag}
        </span>
      </div>
      <button
        onClick={() => onAdd?.(entry)}
        aria-label={t('drop.addToPlan')}
        className="mt-1.5 w-full text-[10px] font-semibold text-rp-brand border border-rp-brand rounded-full py-1 hover:bg-rp-brand/5 transition-colors"
      >
        + {t('drop.add')}
      </button>
    </div>
  )
}
