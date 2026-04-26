/**
 * PresetConfirmDialog — shown AFTER the user picks a preset in PresetPicker
 * and BEFORE the preset is applied.
 *
 * Lets the user adjust per-role dish counts (increase / decrease / zero-out)
 * then either "Add to plan" (structure only) or "Generate all" (structure +
 * AI/bank fill). The adjusted shape is rebuilt as a derivative of the original
 * preset's slots so notes / cuisineId constraints are preserved.
 *
 * Design: Radix Dialog. Mobile bottom-sheet, desktop centered. bg-rp-* tokens
 * only — never dark:bg-surface-dark-* (clashes with skin system).
 */

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Plus, X, Loader2 } from 'lucide-react'
import type { Preset, PresetSlot } from '@/engine/types'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Adjusted payload for meal-scope presets: flat list of slots with duplicated
 * entries for count > 1 (identical role + preserved notes/cuisineId).
 */
type MealAdjusted = PresetSlot[]

/**
 * Adjusted payload for day-scope presets: per-meal-type slot lists.
 */
type DayAdjusted = { mealShapes: { type: string; slots: PresetSlot[] }[] }

export interface PresetConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: Preset
  scope: 'meal' | 'day'
  /** Fires when user clicks "Add to plan" — apply preset structure only. */
  onAddToPlan: (adjusted: MealAdjusted | DayAdjusted) => Promise<void>
  /** Fires when user clicks "Generate all" — apply preset + trigger AI bank fill. */
  onGenerateAll: (adjusted: MealAdjusted | DayAdjusted) => Promise<void>
}

// ─── Role label helpers ──────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  main: 'Main',
  veg_side: 'Veg side',
  starch_side: 'Starch side',
  side: 'Side',
  salad: 'Salad',
  soup: 'Soup',
  bread: 'Bread',
  drink: 'Drink',
  tapas: 'Tapas',
  dessert: 'Dessert',
  starter: 'Starter',
  snack: 'Snack',
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ')
}

// ─── Shape helpers ───────────────────────────────────────────────────────────

/**
 * Aggregate a flat slot list into {role → count} while preserving the first
 * occurrence of each role as the template for rebuilding (notes / cuisineId).
 */
interface RoleEntry {
  role: string
  count: number
  /** Reference slot used to preserve notes/cuisineId when rebuilding. */
  template: PresetSlot
}

function aggregateSlots(slots: PresetSlot[]): RoleEntry[] {
  const map = new Map<string, RoleEntry>()
  for (const slot of slots) {
    const existing = map.get(slot.role)
    if (existing) {
      existing.count += 1
    } else {
      map.set(slot.role, { role: slot.role, count: 1, template: slot })
    }
  }
  return Array.from(map.values())
}

/**
 * Rebuild a flat PresetSlot[] from role entries by repeating the template
 * `count` times (count=0 slots are excluded).
 */
function expandEntries(entries: RoleEntry[]): PresetSlot[] {
  const result: PresetSlot[] = []
  for (const entry of entries) {
    for (let i = 0; i < entry.count; i++) {
      result.push({ ...entry.template })
    }
  }
  return result
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface CountRowProps {
  entry: RoleEntry
  onChange: (role: string, delta: number) => void
}

function CountRow({ entry, onChange }: CountRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-rp-hairline last:border-0">
      <span
        className={cn(
          'text-sm text-rp-ink flex-1',
          entry.count === 0 && 'line-through text-rp-ink-mute',
        )}
      >
        {roleLabel(entry.role)}
      </span>

      <div className="flex items-center gap-2">
        {/* Remove button — sets count to 0 */}
        <button
          onClick={() => onChange(entry.role, -entry.count)}
          aria-label={`Remove all ${roleLabel(entry.role)}`}
          disabled={entry.count === 0}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Stepper */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(entry.role, -1)}
            aria-label={`Decrease ${roleLabel(entry.role)}`}
            disabled={entry.count === 0}
            className="h-8 w-8 rounded-lg border border-rp-hairline flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold text-rp-ink tabular-nums">
            {entry.count}
          </span>
          <button
            onClick={() => onChange(entry.role, +1)}
            aria-label={`Increase ${roleLabel(entry.role)}`}
            disabled={entry.count >= 8}
            className="h-8 w-8 rounded-lg border border-rp-hairline flex items-center justify-center text-rp-ink-mute hover:bg-rp-bg-soft disabled:opacity-30 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PresetConfirmDialog({
  open,
  onOpenChange,
  preset,
  scope,
  onAddToPlan,
  onGenerateAll,
}: PresetConfirmDialogProps) {
  const t = useI18n((s) => s.t)

  /**
   * For meal-scope: flat RoleEntry[].
   * For day-scope: RoleEntry[][] (one array per mealShape).
   */
  const [mealEntries, setMealEntries] = useState<RoleEntry[]>([])
  const [dayShapes, setDayShapes] = useState<
    { type: string; entries: RoleEntry[] }[]
  >([])

  const [isPendingAdd, setIsPendingAdd] = useState(false)
  const [isPendingGenerate, setIsPendingGenerate] = useState(false)

  // Initialise state whenever the dialog opens (or the preset changes).
  useEffect(() => {
    if (!open) return
    if (scope === 'meal') {
      setMealEntries(aggregateSlots(preset.slots ?? []))
    } else {
      setDayShapes(
        (preset.mealShapes ?? []).map((shape) => ({
          type: shape.type,
          entries: aggregateSlots(shape.slots),
        })),
      )
    }
  }, [open, preset, scope])

  // ── Count change handlers ────────────────────────────────────────────────

  const handleMealChange = (role: string, delta: number) => {
    setMealEntries((prev) =>
      prev.map((e) =>
        e.role === role
          ? { ...e, count: Math.max(0, Math.min(8, e.count + delta)) }
          : e,
      ),
    )
  }

  const handleDayChange = (shapeIndex: number, role: string, delta: number) => {
    setDayShapes((prev) =>
      prev.map((shape, i) =>
        i !== shapeIndex
          ? shape
          : {
              ...shape,
              entries: shape.entries.map((e) =>
                e.role === role
                  ? { ...e, count: Math.max(0, Math.min(8, e.count + delta)) }
                  : e,
              ),
            },
      ),
    )
  }

  // ── Total slot count ─────────────────────────────────────────────────────

  const totalSlots =
    scope === 'meal'
      ? mealEntries.reduce((sum, e) => sum + e.count, 0)
      : dayShapes.reduce(
          (sum, shape) => sum + shape.entries.reduce((s, e) => s + e.count, 0),
          0,
        )

  // ── Build adjusted payload ───────────────────────────────────────────────

  const buildPayload = (): MealAdjusted | DayAdjusted => {
    if (scope === 'meal') {
      return expandEntries(mealEntries)
    }
    return {
      mealShapes: dayShapes.map((shape) => ({
        type: shape.type,
        slots: expandEntries(shape.entries),
      })),
    }
  }

  // ── Action handlers ──────────────────────────────────────────────────────

  const handleAddToPlan = async () => {
    if (isPendingAdd || isPendingGenerate) return
    setIsPendingAdd(true)
    try {
      await onAddToPlan(buildPayload())
    } finally {
      setIsPendingAdd(false)
      onOpenChange(false)
    }
  }

  const handleGenerateAll = async () => {
    if (isPendingAdd || isPendingGenerate) return
    setIsPendingGenerate(true)
    try {
      await onGenerateAll(buildPayload())
    } finally {
      setIsPendingGenerate(false)
      onOpenChange(false)
    }
  }

  const handleOpenChange = (value: boolean) => {
    if (isPendingAdd || isPendingGenerate) return
    onOpenChange(value)
  }

  // ── i18n ─────────────────────────────────────────────────────────────────

  const totalLabel =
    totalSlots === 1
      ? t('preset.confirm.totalDishes').replace('{count}', String(totalSlots))
      : t('preset.confirm.totalDishesPlural').replace('{count}', String(totalSlots))

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={cn(
            'fixed z-50 bg-rp-card flex flex-col',
            // Mobile: full-width bottom sheet
            'bottom-0 start-0 end-0 rounded-t-3xl max-h-[90vh]',
            // sm+: centered modal
            'sm:bottom-auto sm:top-1/2 sm:start-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-2xl sm:w-full sm:max-w-md sm:max-h-[85vh]',
          )}
        >
          {/* Drag handle — mobile only */}
          <div className="mx-auto mt-3 mb-1 h-1 w-10 rounded-full bg-rp-hairline sm:hidden shrink-0" />

          {/* Header */}
          <div className="px-5 pt-3 pb-2 shrink-0">
            <Dialog.Title className="text-base font-bold text-rp-ink">
              {t('preset.confirm.title').replace('{name}', preset.name)}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-rp-ink-mute mt-0.5">
              {t('preset.confirm.subtitle')}
            </Dialog.Description>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {scope === 'meal' && (
              <div>
                {mealEntries.length === 0 && (
                  <p className="text-sm text-rp-ink-mute italic py-4 text-center">
                    {t('preset.confirm.empty')}
                  </p>
                )}
                {mealEntries.map((entry) => (
                  <CountRow
                    key={entry.role}
                    entry={entry}
                    onChange={handleMealChange}
                  />
                ))}
              </div>
            )}

            {scope === 'day' && (
              <div className="space-y-4">
                {dayShapes.map((shape, shapeIndex) => (
                  <div key={shape.type}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-rp-ink-mute mb-1 capitalize">
                      {shape.type}
                    </p>
                    {shape.entries.map((entry) => (
                      <CountRow
                        key={`${shape.type}-${entry.role}`}
                        entry={entry}
                        onChange={(role, delta) =>
                          handleDayChange(shapeIndex, role, delta)
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pt-3 pb-5 sm:pb-4 shrink-0 border-t border-rp-hairline">
            {/* Total count summary */}
            <p className="text-xs text-rp-ink-mute text-center mb-3">
              {totalLabel}
            </p>

            {totalSlots === 0 && (
              <p className="text-xs text-amber-600 text-center mb-3 font-medium">
                {t('preset.confirm.empty')}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              {/* Cancel */}
              <button
                onClick={() => handleOpenChange(false)}
                disabled={isPendingAdd || isPendingGenerate}
                className="sm:flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-medium bg-rp-bg-soft text-rp-ink hover:bg-rp-bg transition-colors disabled:opacity-50 order-last sm:order-first"
              >
                {t('preset.confirm.cancel')}
              </button>

              {/* Add to plan */}
              <button
                onClick={() => void handleAddToPlan()}
                disabled={isPendingAdd || isPendingGenerate || totalSlots === 0}
                className="sm:flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold text-rp-brand border border-rp-brand hover:bg-rp-brand/10 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isPendingAdd && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('preset.confirm.addToPlan')}
              </button>

              {/* Generate all — primary CTA */}
              <button
                onClick={() => void handleGenerateAll()}
                disabled={isPendingAdd || isPendingGenerate || totalSlots === 0}
                className="sm:flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold bg-rp-brand text-white hover:bg-rp-brand/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isPendingGenerate && <Loader2 className="h-4 w-4 animate-spin animate-spin" />}
                {t('preset.confirm.generateAll')}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
