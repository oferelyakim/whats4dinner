// v3.0.0 — Recipe / template picker bottom sheet (88% screen height).
//
// Mode = 'recipe' lists from the user's saved recipes (and bank search by query).
// Mode = 'template' lists meal templates from the user's circle.
// Both modes share the same shell — handle, header, search, filter chips, list.

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { PhotoPlaceholder, MonoLabel } from '@/components/ui/hearth'
import { searchBank, type BankSearchHit } from '@/services/recipe-bank'
import { getRecipes } from '@/services/recipes'
import { getMealMenus } from '@/services/mealMenus'
import type { Recipe as DbRecipe, MealMenu } from '@/types'

type Mode = 'recipe' | 'template'

interface Props {
  open: boolean
  mode: Mode
  mealLabel: string
  dayLabel: string
  onClose: () => void
  onAddRecipe: (recipe: DbRecipe | BankSearchHit) => void
  onAddTemplate: (template: MealMenu & { recipes: DbRecipe[] }) => void
}

const RECIPE_FILTERS = ['All', 'Saved', 'Bank', 'Quick (<30m)', 'Vegan', 'GF'] as const
const TEMPLATE_FILTERS = ['All', 'Mine', 'Family-friendly'] as const

export function PickADishSheet({ open, mode, mealLabel, dayLabel, onClose, onAddRecipe, onAddTemplate }: Props) {
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('All')
  const [savedRecipes, setSavedRecipes] = useState<DbRecipe[] | null>(null)
  const [bankHits, setBankHits] = useState<BankSearchHit[]>([])
  const [templates, setTemplates] = useState<(MealMenu & { recipes: DbRecipe[] })[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setFilter('All')
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    if (mode === 'recipe') {
      void getRecipes(activeCircle?.id).then(setSavedRecipes).catch(() => setSavedRecipes([]))
    } else {
      setLoading(true)
      void getMealMenus(activeCircle?.id)
        .then(setTemplates)
        .catch(() => setTemplates([]))
        .finally(() => setLoading(false))
    }
  }, [open, mode, activeCircle?.id])

  // Bank search — debounced, only when filter is 'Bank' or query is non-empty.
  useEffect(() => {
    if (!open || mode !== 'recipe') return
    if (!query.trim() && filter !== 'Bank') {
      setBankHits([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      void searchBank({
        query: query.trim() || undefined,
        diets: filter === 'Vegan' ? ['vegan'] : filter === 'GF' ? ['gluten-free'] : undefined,
        maxPrepMin: filter === 'Quick (<30m)' ? 29 : undefined,
        limit: 30,
      })
        .then((rows) => {
          if (!ctrl.signal.aborted) setBankHits(rows)
        })
        .catch(() => undefined)
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [open, mode, query, filter])

  const filterList = mode === 'recipe' ? RECIPE_FILTERS : TEMPLATE_FILTERS

  const visibleRecipes = useMemo(() => {
    if (mode !== 'recipe') return []
    const q = query.trim().toLowerCase()
    let saved = savedRecipes ?? []
    if (q) saved = saved.filter((r) => r.title.toLowerCase().includes(q))
    if (filter === 'Saved') return saved
    if (filter === 'Bank') return [] // bank-only handled below
    if (filter === 'Vegan') saved = saved.filter((r) => r.tags?.includes('vegan'))
    if (filter === 'GF') saved = saved.filter((r) => r.tags?.includes('gluten-free'))
    if (filter === 'Quick (<30m)') saved = saved.filter((r) => (r.prep_time_min ?? 999) < 30)
    return saved
  }, [mode, savedRecipes, query, filter])

  const visibleTemplates = useMemo(() => {
    if (mode !== 'template') return []
    const q = query.trim().toLowerCase()
    return (templates ?? []).filter((tpl) => !q || tpl.name.toLowerCase().includes(q))
  }, [mode, templates, query])

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-rp-ink/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 bg-rp-bg rounded-t-3xl flex flex-col"
          style={{ height: '88dvh', boxShadow: '0 -20px 40px -10px rgba(40, 20, 10, 0.3)' }}
        >
          {/* handle */}
          <div className="pt-2 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-rp-hairline" />
          </div>

          {/* header */}
          <div className="px-5 pt-2 pb-2 flex items-start justify-between shrink-0">
            <div>
              <MonoLabel>{t('pick.eyebrow').replace('{meal}', mealLabel).replace('{day}', dayLabel)}</MonoLabel>
              <Dialog.Title asChild>
                <h2 className="font-display italic text-[24px] text-rp-ink leading-[1.05] mt-0.5">
                  {mode === 'recipe' ? t('pick.recipeTitle') : t('pick.templateTitle')}
                </h2>
              </Dialog.Title>
              <p className="text-[12px] text-rp-ink-soft mt-0.5">
                {mode === 'recipe' ? t('pick.recipeSubtitle') : t('pick.templateSubtitle')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-rp-ink-mute text-[13px] p-1"
              aria-label={t('common.cancel')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* search */}
          <div className="px-5 pt-1 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-rp-card border border-rp-hairline rounded-xl">
              <Search className="h-4 w-4 text-rp-ink-mute shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'recipe' ? t('pick.recipeSearchPlaceholder') : t('pick.templateSearchPlaceholder')}
                className="flex-1 text-[13px] text-rp-ink placeholder:text-rp-ink-mute bg-transparent outline-none"
              />
            </div>
          </div>

          {/* filter chips */}
          <div className="px-5 pt-2.5 pb-1 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {filterList.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                  filter === f
                    ? 'bg-rp-brand text-white border-rp-brand'
                    : 'bg-rp-bg-soft text-rp-ink-mute border-rp-hairline-soft',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6">
            {mode === 'recipe' ? (
              <div className="space-y-2">
                {filter === 'Bank'
                  ? bankHits.map((hit) => (
                      <PickRow
                        key={hit.id}
                        title={hit.title}
                        meta={`${hit.prepTimeMin ?? '?'}m · bank · ${hit.cuisineId}`}
                        imageUrl={hit.imageUrl}
                        onAdd={() => onAddRecipe(hit)}
                      />
                    ))
                  : visibleRecipes.map((r) => (
                      <PickRow
                        key={r.id}
                        title={r.title}
                        meta={`${r.prep_time_min ?? '?'}m · saved`}
                        imageUrl={r.image_url}
                        onAdd={() => onAddRecipe(r)}
                      />
                    ))}
                {/* Bank suggestions when query is non-empty regardless of filter */}
                {filter !== 'Bank' && query.trim() && bankHits.length > 0 && (
                  <>
                    <div className="pt-3 pb-1">
                      <MonoLabel>{t('pick.fromBank')}</MonoLabel>
                    </div>
                    {bankHits.slice(0, 8).map((hit) => (
                      <PickRow
                        key={hit.id}
                        title={hit.title}
                        meta={`${hit.prepTimeMin ?? '?'}m · bank`}
                        imageUrl={hit.imageUrl}
                        onAdd={() => onAddRecipe(hit)}
                      />
                    ))}
                  </>
                )}
                {savedRecipes !== null && visibleRecipes.length === 0 && bankHits.length === 0 && (
                  <p className="text-center text-rp-ink-mute text-[12px] italic py-6">
                    {t('pick.empty')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {loading && <p className="text-center text-rp-ink-mute text-[12px] py-6">…</p>}
                {!loading &&
                  visibleTemplates.map((tpl) => (
                    <PickRow
                      key={tpl.id}
                      title={tpl.name}
                      meta={
                        tpl.recipes.length === 0
                          ? t('pick.templateEmptyDishes')
                          : t('pick.templateDishCount').replace('{count}', String(tpl.recipes.length))
                      }
                      onAdd={() => onAddTemplate(tpl)}
                    />
                  ))}
                {!loading && visibleTemplates.length === 0 && (
                  <p className="text-center text-rp-ink-mute text-[12px] italic py-6">
                    {t('pick.emptyTemplates')}
                  </p>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PickRow({
  title,
  meta,
  imageUrl,
  onAdd,
}: {
  title: string
  meta: string
  imageUrl?: string | null
  onAdd: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-2.5 py-2 bg-rp-card border border-rp-hairline rounded-xl">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="w-11 h-11 shrink-0">
          <PhotoPlaceholder aspect="square" className="rounded-lg" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-rp-ink truncate">{title}</div>
        <div className="text-[11px] text-rp-ink-soft">{meta}</div>
      </div>
      <button
        onClick={onAdd}
        className="border border-rp-brand text-rp-brand bg-transparent rounded-full px-3 py-1 text-[11px] font-semibold hover:bg-rp-brand/5 transition-colors"
      >
        Add
      </button>
    </div>
  )
}
