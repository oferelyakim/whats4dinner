// v3.1.0 — Three sheets that add a dish to a specific meal.
//
// Replaces the old "Apply preset / Generate all / +" pile on MealCard
// with three explicit add-from-source flows:
//
//   1. AddRecipeFromLibrarySheet — pulls user's circle recipes from Supabase,
//      sortable + filterable + searchable, single insert button per row.
//   2. AddRecipeFromTemplateSheet — pulls meal_menus, expandable accordion to
//      see contained recipes, per-recipe insert button.
//   3. AddRecipeFromWeekMenuSheet — pulls the visible week's drop, no photo
//      (compact list rows), filter chips for slot_role + dietary, search.
//
// All three call engine methods that scope to the supplied mealId, so we
// never accidentally route to "first day" / "Sunday" like the old global
// drop drawer did.

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronUp, X, Plus, Check } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useAppStore } from '@/stores/appStore'
import { getEngine } from '@/engine/MealPlanEngine'
import { getRecipes } from '@/services/recipes'
import { getMealMenus } from '@/services/mealMenus'
import { getWeeklyDropForWeek, type WeeklyDropEntry } from '@/services/recipe-bank'
import type { Recipe, MealMenu } from '@/types'

// ─── Shared sheet shell ────────────────────────────────────────────────────
function SheetShell(props: {
  open: boolean
  onOpenChange: (b: boolean) => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-rp-ink/40 backdrop-blur-sm z-40" />
        <Dialog.Content
          className="
            fixed inset-0 z-50 flex flex-col bg-rp-bg
            sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
            sm:h-[min(85vh,640px)] sm:w-[min(560px,92vw)] sm:rounded-2xl
            shadow-rp-hover overflow-hidden
          "
        >
          <div className="flex items-center justify-between border-b border-rp-ink/10 px-4 py-3">
            <Dialog.Title className="font-display italic text-lg text-rp-ink">
              {props.title}
            </Dialog.Title>
            <Dialog.Close
              className="rounded-full p-1 text-rp-ink/60 hover:bg-rp-ink/5 hover:text-rp-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          {props.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── 1. From Recipe Library ────────────────────────────────────────────────
type SortKey = 'recent' | 'title' | 'prepTime'

export function AddRecipeFromLibrarySheet(props: {
  open: boolean
  onOpenChange: (b: boolean) => void
  mealId: string
  onAdded?: () => void
}) {
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!props.open || recipes !== null) return
    setLoading(true)
    getRecipes(activeCircle?.id, 'recipe')
      .then((rows) => setRecipes(rows))
      .catch(() => setRecipes([]))
      .finally(() => setLoading(false))
  }, [props.open, recipes, activeCircle?.id])

  // Reset when closed so a future open re-fetches if user just imported a recipe.
  useEffect(() => {
    if (!props.open) {
      setSearch('')
      setAdded(new Set())
    }
  }, [props.open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let xs = (recipes ?? []).filter((r) => !q || r.title.toLowerCase().includes(q))
    if (sort === 'title') xs = [...xs].sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'prepTime')
      xs = [...xs].sort((a, b) => (a.prep_time_min ?? 999) - (b.prep_time_min ?? 999))
    // 'recent' is the default order from getRecipes (created_at desc)
    return xs
  }, [recipes, search, sort])

  async function add(r: Recipe) {
    setAdding(r.id)
    try {
      const eng = getEngine()
      await eng.addRecipeToMeal(props.mealId, {
        id: r.id,
        title: r.title,
        source_url: r.source_url ?? null,
        image_url: r.image_url ?? null,
        prep_time_min: r.prep_time_min ?? null,
        cook_time_min: r.cook_time_min ?? null,
        servings: r.servings ?? null,
        instructions: r.instructions ?? null,
        ingredients: ((r as Recipe & { ingredients?: { name: string; quantity?: number | null; unit?: string | null }[] }).ingredients ?? []).map(
          (ing) => ({ name: ing.name, quantity: ing.quantity ?? null, unit: ing.unit ?? null }),
        ),
      })
      setAdded((s) => new Set([...s, r.id]))
      props.onAdded?.()
    } finally {
      setAdding(null)
    }
  }

  return (
    <SheetShell open={props.open} onOpenChange={props.onOpenChange} title={t('plan.addToMeal.recipeLibrary')}>
      <div className="px-4 py-3 border-b border-rp-ink/5 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('plan.addToMeal.searchPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand text-sm"
        />
        <div className="flex gap-1.5">
          {(['recent', 'title', 'prepTime'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={
                'px-3 py-1 rounded-full text-xs font-medium transition ' +
                (sort === k ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink-mute')
              }
            >
              {t('plan.addToMeal.sort.' + k)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {loading && <p className="text-sm text-rp-ink/60 text-center py-8">…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-rp-ink/60 text-center py-8">
            {recipes?.length === 0 ? t('plan.addToMeal.recipeEmpty') : t('plan.addToMeal.noResults')}
          </p>
        )}
        {filtered.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-rp-ink/10 bg-rp-card px-3 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-rp-ink truncate">{r.title}</p>
              {r.prep_time_min != null && (
                <p className="text-xs text-rp-ink-mute">{r.prep_time_min}m prep</p>
              )}
            </div>
            <button
              disabled={adding === r.id || added.has(r.id)}
              onClick={() => void add(r)}
              className={
                'h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1 transition ' +
                (added.has(r.id)
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-rp-brand text-white hover:bg-rp-brand/90 disabled:opacity-50')
              }
            >
              {added.has(r.id) ? <><Check className="h-3 w-3" /> {t('plan.addToMeal.added')}</> : <><Plus className="h-3 w-3" /> {t('plan.addToMeal.insert')}</>}
            </button>
          </div>
        ))}
      </div>
    </SheetShell>
  )
}

// ─── 2. From Template ──────────────────────────────────────────────────────
export function AddRecipeFromTemplateSheet(props: {
  open: boolean
  onOpenChange: (b: boolean) => void
  mealId: string
  onAdded?: () => void
}) {
  const t = useI18n((s) => s.t)
  const { activeCircle } = useAppStore()
  const [templates, setTemplates] = useState<(MealMenu & { recipes: Recipe[] })[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!props.open || templates !== null) return
    setLoading(true)
    getMealMenus(activeCircle?.id ?? undefined)
      .then((rows) => setTemplates(rows))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [props.open, templates, activeCircle?.id])

  useEffect(() => {
    if (!props.open) {
      setSearch('')
      setExpanded(new Set())
      setAdded(new Set())
    }
  }, [props.open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (templates ?? []).filter((tpl) => {
      if (!q) return true
      if (tpl.name.toLowerCase().includes(q)) return true
      return tpl.recipes.some((r) => r.title.toLowerCase().includes(q))
    })
  }, [templates, search])

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addRecipe(r: Recipe, role: 'main' | 'side') {
    setAdding(r.id)
    try {
      const eng = getEngine()
      await eng.addRecipeToMeal(props.mealId, {
        id: r.id,
        title: r.title,
        source_url: r.source_url ?? null,
        image_url: r.image_url ?? null,
        prep_time_min: r.prep_time_min ?? null,
        cook_time_min: r.cook_time_min ?? null,
        servings: r.servings ?? null,
        instructions: r.instructions ?? null,
        ingredients: ((r as Recipe & { ingredients?: { name: string; quantity?: number | null; unit?: string | null }[] }).ingredients ?? []).map(
          (ing) => ({ name: ing.name, quantity: ing.quantity ?? null, unit: ing.unit ?? null }),
        ),
      }, role)
      setAdded((s) => new Set([...s, r.id]))
      props.onAdded?.()
    } finally {
      setAdding(null)
    }
  }

  return (
    <SheetShell open={props.open} onOpenChange={props.onOpenChange} title={t('plan.addToMeal.fromTemplate')}>
      <div className="px-4 py-3 border-b border-rp-ink/5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('plan.addToMeal.searchTemplates')}
          className="w-full px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <p className="text-sm text-rp-ink/60 text-center py-8">…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-rp-ink/60 text-center py-8">
            {templates?.length === 0 ? t('plan.addToMeal.templateEmpty') : t('plan.addToMeal.noResults')}
          </p>
        )}
        {filtered.map((tpl) => {
          const open = expanded.has(tpl.id)
          return (
            <div key={tpl.id} className="rounded-xl border border-rp-ink/10 bg-rp-card overflow-hidden">
              <button
                onClick={() => toggle(tpl.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-rp-bg-soft transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-rp-ink truncate">{tpl.name}</p>
                  <p className="text-xs text-rp-ink-mute">
                    {tpl.recipes.length === 1 ? '1 recipe' : `${tpl.recipes.length} recipes`}
                  </p>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-rp-ink-mute" /> : <ChevronDown className="h-4 w-4 text-rp-ink-mute" />}
              </button>
              {open && tpl.recipes.length > 0 && (
                <div className="border-t border-rp-ink/5 px-3 py-2 space-y-1.5 bg-rp-bg-soft/40">
                  {tpl.recipes.map((r, idx) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg bg-rp-card px-3 py-2">
                      <p className="flex-1 text-sm text-rp-ink truncate">{r.title}</p>
                      <button
                        disabled={adding === r.id || added.has(r.id)}
                        onClick={() => void addRecipe(r, idx === 0 ? 'main' : 'side')}
                        className={
                          'h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition ' +
                          (added.has(r.id)
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-rp-brand text-white hover:bg-rp-brand/90 disabled:opacity-50')
                        }
                      >
                        {added.has(r.id) ? <><Check className="h-3 w-3" /> {t('plan.addToMeal.added')}</> : <><Plus className="h-3 w-3" /> {t('plan.addToMeal.insert')}</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {open && tpl.recipes.length === 0 && (
                <p className="text-xs text-rp-ink-mute px-3 py-2 italic">No recipes in this template.</p>
              )}
            </div>
          )
        })}
      </div>
    </SheetShell>
  )
}

// ─── 3. From This Week's Menu ──────────────────────────────────────────────
type RoleFilter = 'all' | 'main' | 'side' | 'salad' | 'dessert'
const ROLE_FILTERS: RoleFilter[] = ['all', 'main', 'side', 'salad', 'dessert']

export function AddRecipeFromWeekMenuSheet(props: {
  open: boolean
  onOpenChange: (b: boolean) => void
  mealId: string
  weekStart: string
  onAdded?: () => void
}) {
  const t = useI18n((s) => s.t)
  const [drop, setDrop] = useState<WeeklyDropEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!props.open || drop !== null) return
    setLoading(true)
    getWeeklyDropForWeek(props.weekStart)
      .then((rows) => setDrop(rows))
      .catch(() => setDrop([]))
      .finally(() => setLoading(false))
  }, [props.open, drop, props.weekStart])

  useEffect(() => {
    if (!props.open) {
      setSearch('')
      setRoleFilter('all')
      setAdded(new Set())
    }
  }, [props.open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    // Dedup by recipeBankId — drop has 7 days × multiple meals so the same
    // recipe appears multiple times. We just want a unique browsable list.
    const seen = new Set<string>()
    const xs: WeeklyDropEntry[] = []
    for (const e of drop ?? []) {
      if (seen.has(e.recipeBankId)) continue
      seen.add(e.recipeBankId)
      xs.push(e)
    }
    return xs.filter((e) => {
      if (q && !e.title.toLowerCase().includes(q)) return false
      if (roleFilter === 'all') return true
      if (roleFilter === 'main') return e.slotRole === 'main'
      // Bank may not have salad/dessert in the drop yet — match by slot_role substring.
      if (roleFilter === 'side') return e.slotRole.includes('side') || e.slotRole === 'side'
      if (roleFilter === 'salad') return e.slotRole === 'salad'
      if (roleFilter === 'dessert') return e.slotRole === 'dessert'
      return true
    })
  }, [drop, search, roleFilter])

  async function add(e: WeeklyDropEntry) {
    setAdding(e.recipeBankId)
    try {
      const eng = getEngine()
      const role = e.slotRole === 'main' ? 'main' : e.slotRole.includes('side') ? 'side' : e.slotRole
      await eng.addBankRecipeToMeal(props.mealId, e.recipeBankId, role)
      setAdded((s) => new Set([...s, e.recipeBankId]))
      props.onAdded?.()
    } finally {
      setAdding(null)
    }
  }

  return (
    <SheetShell open={props.open} onOpenChange={props.onOpenChange} title={t('plan.addToMeal.thisWeekMenu')}>
      <div className="px-4 py-3 border-b border-rp-ink/5 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('plan.addToMeal.searchPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-rp-bg-soft text-rp-ink placeholder:text-rp-ink-mute focus:outline-none focus:ring-1 focus:ring-rp-brand text-sm"
        />
        <div className="flex gap-1.5 flex-wrap">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={
                'px-3 py-1 rounded-full text-xs font-medium transition ' +
                (roleFilter === r ? 'bg-rp-brand text-white' : 'bg-rp-bg-soft text-rp-ink-mute')
              }
            >
              {t('plan.addToMeal.role.' + r)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {loading && <p className="text-sm text-rp-ink/60 text-center py-8">…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-rp-ink/60 text-center py-8">{t('plan.addToMeal.noResults')}</p>
        )}
        {filtered.map((e) => (
          <div
            key={e.recipeBankId}
            className="flex items-center gap-3 rounded-xl border border-rp-ink/10 bg-rp-card px-3 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-rp-ink truncate">{e.title}</p>
              <p className="text-xs text-rp-ink-mute capitalize">
                {e.slotRole.replace('_', ' ')} · {e.cuisineId}
                {e.prepTimeMin != null ? ` · ${e.prepTimeMin}m` : ''}
              </p>
            </div>
            <button
              disabled={adding === e.recipeBankId || added.has(e.recipeBankId)}
              onClick={() => void add(e)}
              className={
                'h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1 transition ' +
                (added.has(e.recipeBankId)
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-rp-brand text-white hover:bg-rp-brand/90 disabled:opacity-50')
              }
            >
              {added.has(e.recipeBankId) ? <><Check className="h-3 w-3" /> {t('plan.addToMeal.added')}</> : <><Plus className="h-3 w-3" /> {t('plan.addToMeal.insert')}</>}
            </button>
          </div>
        ))}
      </div>
    </SheetShell>
  )
}
