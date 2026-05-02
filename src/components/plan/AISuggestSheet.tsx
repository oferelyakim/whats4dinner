// v3.0.0 — AI per-meal suggest sheet (paid only).
//
// Bottom sheet, auto-height, ~30% screen. Single-dish proposal with
// "Add to {meal}" + "Try another" + a "why this" rationale callout.
//
// Backend: calls match_recipes_by_ingredients via the recipe-bank service
// when the user has pantry items captured, or falls back to the existing
// meal-engine `dish` op for a per-slot AI rewrite.

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { matchByPantry, type PantryMatch } from '@/services/recipe-bank'
import { MonoLabel } from '@/components/ui/hearth'

interface Props {
  open: boolean
  mealLabel: string
  // Optional: pantry items the user has on hand (drives the rationale).
  pantry?: string[]
  diet?: string[]
  mealType?: 'breakfast' | 'lunch' | 'dinner'
  onClose: () => void
  onAdd: (match: PantryMatch) => void
}

export function AISuggestSheet({ open, mealLabel, pantry, diet, mealType, onClose, onAdd }: Props) {
  const t = useI18n((s) => s.t)
  const [matches, setMatches] = useState<PantryMatch[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void fetchMatches()
    setIdx(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mealType])

  async function fetchMatches() {
    setLoading(true)
    setErr(null)
    try {
      // If pantry is empty, use a tiny sentinel so the RPC still ranks by popularity.
      const ingredients = pantry?.length ? pantry : ['salt']
      const rows = await matchByPantry(ingredients, {
        diet,
        mealType,
        slotRole: 'main',
        limit: 5,
      })
      setMatches(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const current = matches?.[idx] ?? null

  function tryAnother() {
    if (!matches) return
    if (idx + 1 < matches.length) {
      setIdx(idx + 1)
    } else {
      void fetchMatches()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-rp-ink/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 bg-rp-bg rounded-t-3xl"
          style={{ boxShadow: '0 -20px 40px -10px rgba(40,20,10,0.3)' }}
        >
          <div className="px-5 pt-2 pb-7">
            <div className="flex justify-center pb-3">
              <div className="w-10 h-1 rounded-full bg-rp-hairline" />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ background: '#f2c14e', color: '#1f1612' }}
                >
                  <Sparkles className="h-2.5 w-2.5" /> AI
                </span>
                <MonoLabel>
                  {t('ai.suggestedFor').replace('{meal}', mealLabel)}
                </MonoLabel>
              </div>
              <button onClick={onClose} aria-label={t('common.close')} className="text-rp-ink-mute">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading && (
              <div className="mt-4 text-rp-ink-mute text-[13px] italic">{t('ai.thinking')}</div>
            )}

            {err && !loading && (
              <div className="mt-4 text-amber-700 text-[13px]">
                {t('ai.error')}: {err}
              </div>
            )}

            {!loading && current && (
              <>
                <Dialog.Title asChild>
                  <h2 className="font-display italic text-[26px] text-rp-ink leading-[1.05] mt-1.5">
                    {current.title}
                  </h2>
                </Dialog.Title>
                <p className="text-[12px] text-rp-ink-soft mt-1 leading-snug">
                  {current.prepTimeMin ? `${current.prepTimeMin}m · ` : ''}
                  {current.dietaryTags.length > 0 ? `${current.dietaryTags.join(', ')} · ` : ''}
                  {pantry?.length ? t('ai.pantryHint') : t('ai.cuisineHint').replace('{cuisine}', current.cuisineId)}
                </p>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => onAdd(current)}
                    className="flex-1 h-11 rounded-full text-[13px] font-semibold text-white transition-colors"
                    style={{ background: '#c4522d' }}
                  >
                    {t('ai.addToMeal').replace('{meal}', mealLabel)}
                  </button>
                  <button
                    onClick={tryAnother}
                    className="h-11 px-4 rounded-full text-[13px] font-medium text-rp-ink-soft border border-rp-hairline bg-rp-card hover:bg-rp-bg-soft transition-colors"
                  >
                    {t('ai.tryAnother')}
                  </button>
                </div>

                <div className="mt-3 px-3 py-2 bg-rp-card border border-dashed border-rp-hairline rounded-xl text-[11px] text-rp-ink-soft">
                  <strong className="text-rp-ink">{t('ai.whyThis')}</strong> {current.proteinFamily ? t('ai.proteinReason').replace('{protein}', current.proteinFamily) + '. ' : ''}
                  {current.matchScore > 5 ? t('ai.pantryMatch') : t('ai.popularPick')}
                </div>
              </>
            )}

            {!loading && !current && !err && (
              <p className="mt-4 text-rp-ink-mute text-[13px] italic">{t('ai.noMatches')}</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
