import { useEffect, useState } from 'react'
import { db } from '../db'
import type { DayView } from '../types'
import { RecipeView } from './RecipeView'
import { useI18n } from '@/lib/i18n'

interface Props {
  day: DayView
}

// Compact read-only day card for "Use" mode. Shows what's on the menu;
// tapping a dish opens RecipeView in read-only mode.
export function DayCardUse({ day }: Props) {
  const t = useI18n((s) => s.t)
  const locale = useI18n((s) => s.locale)
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null)

  // Map app locale → BCP-47 tag for toLocaleDateString
  const bcp47 = locale === 'he' ? 'he-IL' : locale === 'es' ? 'es-ES' : 'en-US'

  const date = new Date(day.date + 'T12:00:00')
  const dayShort = date.toLocaleDateString(bcp47, { weekday: 'short' })
  const dayNum = date.toLocaleDateString(bcp47, { month: 'short', day: 'numeric' })

  // Only meals that have at least one ready slot.
  const mealsWithSlots = day.meals
    .map((meal) => ({
      meal,
      readySlots: meal.slots.filter((s) => s.status === 'ready' && s.recipeId),
    }))
    .filter(({ readySlots }) => readySlots.length > 0)

  const hasContent = mealsWithSlots.length > 0

  return (
    <div className="rounded-2xl bg-rp-card border border-rp-hairline p-4 space-y-3">
      {/* Day header */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-rp-ink-mute">
          {dayShort}
        </span>
        <span className="text-xs text-rp-ink-mute">·</span>
        <span className="text-xs text-rp-ink-mute">{dayNum}</span>
      </div>

      {!hasContent && (
        <p className="text-xs text-rp-ink-mute italic">{t('plan.use.dayEmpty')}</p>
      )}

      {mealsWithSlots.map(({ meal, readySlots }) => (
        <div key={meal.id} className="space-y-1.5">
          {/* Meal type label */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rp-ink-mute">
            {meal.type}
          </p>
          {readySlots.map((slot) => (
            <SlotRow
              key={slot.id}
              recipeId={slot.recipeId!}
              onOpen={setOpenRecipeId}
            />
          ))}
        </div>
      ))}

      <RecipeView
        recipeId={openRecipeId}
        onClose={() => setOpenRecipeId(null)}
        readOnly
      />
    </div>
  )
}

// ── Inner row ─────────────────────────────────────────────────────────────────

interface SlotRowProps {
  recipeId: string
  onOpen: (recipeId: string) => void
}

function SlotRow({ recipeId, onOpen }: SlotRowProps) {
  const [title, setTitle] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Resolve title + image from Dexie (already cached, no network).
  useEffect(() => {
    db.recipes.get(recipeId).then((r) => {
      if (r) {
        setTitle(r.title)
        setImageUrl(r.imageUrl ?? null)
      } else {
        setTitle('')
      }
    }).catch(() => setTitle(''))
  }, [recipeId])

  if (title === null) {
    // Loading — render a thin placeholder to avoid layout shift.
    return (
      <div className="w-full flex items-center gap-3 rounded-xl bg-rp-bg-soft p-2">
        <div className="h-10 w-10 rounded-lg bg-rp-hairline shrink-0 animate-pulse" />
        <div className="h-4 w-32 rounded bg-rp-hairline animate-pulse" />
      </div>
    )
  }

  if (title === '') {
    // Recipe not in local Dexie — skip silently.
    return null
  }

  return (
    <button
      onClick={() => onOpen(recipeId)}
      className="w-full flex items-center gap-3 rounded-xl bg-rp-bg-soft hover:bg-rp-bg transition-colors text-left p-2"
    >
      {/* Thumbnail */}
      <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 bg-rp-hairline">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-rp-ink-mute text-base font-semibold">
            —
          </div>
        )}
      </div>
      {/* Title */}
      <span className="font-display italic text-base text-rp-ink leading-tight line-clamp-2 min-w-0">
        {title}
      </span>
    </button>
  )
}
