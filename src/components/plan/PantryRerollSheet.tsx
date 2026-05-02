// v3.0.0 — Pantry / leftover reroll sheet (paid AI hook).
//
// User types ingredients they have on hand → sheet calls match_recipes_by_ingredients
// → renders ranked candidates → Add picks one into a slot.

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Refrigerator, Plus, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { matchByPantry, type PantryMatch } from '@/services/recipe-bank'
import { MonoLabel, PhotoPlaceholder } from '@/components/ui/hearth'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (match: PantryMatch) => void
}

export function PantryRerollSheet({ open, onClose, onAdd }: Props) {
  const t = useI18n((s) => s.t)
  const [items, setItems] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [matches, setMatches] = useState<PantryMatch[] | null>(null)
  const [loading, setLoading] = useState(false)

  function addItem() {
    const v = draft.trim().toLowerCase()
    if (!v || items.includes(v)) {
      setDraft('')
      return
    }
    setItems([...items, v])
    setDraft('')
  }

  function removeItem(item: string) {
    setItems(items.filter((i) => i !== item))
  }

  async function runMatch() {
    if (items.length === 0) return
    setLoading(true)
    try {
      const rows = await matchByPantry(items, { limit: 8 })
      setMatches(rows)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-rp-ink/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 bg-rp-bg rounded-t-3xl flex flex-col"
          style={{ maxHeight: '85dvh', boxShadow: '0 -20px 40px -10px rgba(40,20,10,0.3)' }}
        >
          <div className="pt-2 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-rp-hairline" />
          </div>

          <div className="px-5 pt-2 pb-2 flex items-start justify-between shrink-0">
            <div>
              <MonoLabel>{t('pantry.eyebrow')}</MonoLabel>
              <Dialog.Title asChild>
                <h2 className="font-display italic text-[24px] text-rp-ink leading-[1.05] mt-0.5 flex items-center gap-2">
                  <Refrigerator className="h-5 w-5 text-rp-brand" /> {t('pantry.title')}
                </h2>
              </Dialog.Title>
              <p className="text-[12px] text-rp-ink-soft mt-0.5">{t('pantry.subtitle')}</p>
            </div>
            <button onClick={onClose} aria-label={t('common.close')} className="text-rp-ink-mute p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* item input */}
          <div className="px-5 pt-2 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addItem()
                  }
                }}
                placeholder={t('pantry.placeholder')}
                className="flex-1 h-10 px-3 rounded-xl bg-rp-card border border-rp-hairline text-[13px] text-rp-ink placeholder:text-rp-ink-mute outline-none focus:ring-2 focus:ring-rp-brand/30"
              />
              <button
                onClick={addItem}
                className="h-10 w-10 rounded-xl bg-rp-card border border-rp-hairline flex items-center justify-center text-rp-ink-soft hover:bg-rp-bg-soft"
                aria-label={t('pantry.addItem')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {items.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {items.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-rp-bg-soft border border-rp-hairline-soft rounded-full text-rp-ink"
                  >
                    {item}
                    <button onClick={() => removeItem(item)} className="text-rp-ink-mute hover:text-rp-ink">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={runMatch}
              disabled={items.length === 0 || loading}
              className="mt-3 w-full h-11 rounded-full text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: '#c4522d' }}
            >
              {loading ? t('pantry.searching') : t('pantry.findRecipes')}
            </button>
          </div>

          {/* results */}
          <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">
            {matches === null && (
              <p className="text-rp-ink-mute text-[12px] italic">{t('pantry.empty')}</p>
            )}
            {matches !== null && matches.length === 0 && (
              <p className="text-rp-ink-mute text-[12px] italic">{t('pantry.noMatches')}</p>
            )}
            {matches !== null && matches.length > 0 && (
              <div className="space-y-2">
                <MonoLabel>{t('pantry.matches').replace('{count}', String(matches.length))}</MonoLabel>
                {matches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-2.5 py-2 bg-rp-card border border-rp-hairline rounded-xl"
                  >
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <div className="w-11 h-11 shrink-0">
                        <PhotoPlaceholder aspect="square" className="rounded-lg" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-rp-ink truncate">{m.title}</div>
                      <div className="text-[11px] text-rp-ink-soft">
                        {m.prepTimeMin ? `${m.prepTimeMin}m · ` : ''}
                        {t('pantry.matchScore').replace('{n}', m.matchScore.toFixed(0))}
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(m)}
                      className="border border-rp-brand text-rp-brand bg-transparent rounded-full px-3 py-1 text-[11px] font-semibold hover:bg-rp-brand/5"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
