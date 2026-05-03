import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Plus, ChevronLeft, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { PageTitle, HandAccent, RingsOrnament } from '@/components/ui/hearth'
import { useI18n } from '@/lib/i18n'
import { usePantryPicksStore, type PantryPick } from '@/stores/pantryPicksStore'
import { matchByPantry } from '@/services/recipe-bank'
import { getIngredientSuggestions } from '@/services/recipes'
import { cn } from '@/lib/cn'

// ─── Pick card ────────────────────────────────────────────────────────────────

function PickCard({ pick, onRemove }: { pick: PantryPick; onRemove: () => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()

  function handleClick() {
    if (pick.source === 'user_recipe' && pick.recipeId) {
      navigate(`/recipes/${pick.recipeId}`)
    } else if (pick.sourceUrl) {
      window.open(pick.sourceUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const matchLabel = t('pantryPicks.matchedIngredients').replace(
    '{ingredients}',
    pick.matchedIngredients.join(', ')
  )

  return (
    <Card className="p-3 flex gap-3 items-start">
      {/* Thumbnail */}
      {pick.imageUrl && (
        <div
          className="w-14 h-14 rounded-xl shrink-0 bg-rp-bg-soft overflow-hidden cursor-pointer"
          onClick={handleClick}
        >
          <img
            src={pick.imageUrl}
            alt={pick.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )}
      {!pick.imageUrl && (
        <div
          className="w-14 h-14 rounded-xl shrink-0 bg-rp-bg-soft flex items-center justify-center cursor-pointer"
          onClick={handleClick}
        >
          <span className="text-2xl">🍳</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <button
          onClick={handleClick}
          className="text-sm font-semibold text-rp-ink text-start line-clamp-2 hover:text-rp-brand transition-colors"
        >
          {pick.title}
          {pick.source === 'bank' && pick.sourceUrl && (
            <ExternalLink className="inline ms-1 h-3 w-3 opacity-50" />
          )}
        </button>
        {pick.matchedIngredients.length > 0 && (
          <p className="text-xs text-rp-ink-mute mt-0.5 line-clamp-1">{matchLabel}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {pick.matchedIngredients.slice(0, 4).map((ing) => (
            <span
              key={ing}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-rp-brand/10 text-rp-brand font-medium"
            >
              {ing}
            </span>
          ))}
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        aria-label={t('pantryPicks.removePick')}
        className="p-1.5 rounded-lg text-rp-ink-mute hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </Card>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

interface ResultItem {
  id: string
  title: string
  imageUrl: string | null
  sourceUrl: string | null
  prepTimeMin: number | null
  cookTimeMin: number | null
  servings: number | null
  matchedIngredients: string[]
}

function ResultCard({
  item,
  alreadyAdded,
  onAdd,
}: {
  item: ResultItem
  alreadyAdded: boolean
  onAdd: () => void
}) {
  const { t } = useI18n()

  return (
    <Card className="p-3 flex gap-3 items-start">
      {/* Thumbnail */}
      {item.imageUrl ? (
        <div className="w-14 h-14 rounded-xl shrink-0 bg-rp-bg-soft overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-xl shrink-0 bg-rp-bg-soft flex items-center justify-center">
          <span className="text-2xl">🥘</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-rp-ink line-clamp-2">{item.title}</p>
        {item.matchedIngredients.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.matchedIngredients.map((ing) => (
              <span
                key={ing}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-rp-brand/10 text-rp-brand font-medium"
              >
                {ing}
              </span>
            ))}
          </div>
        )}
        {item.prepTimeMin && (
          <p className="text-xs text-rp-ink-mute mt-1">{item.prepTimeMin} min</p>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={onAdd}
        disabled={alreadyAdded}
        className={cn(
          'shrink-0 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors',
          alreadyAdded
            ? 'bg-rp-bg-soft text-rp-ink-mute cursor-default'
            : 'bg-rp-brand text-white hover:bg-rp-brand/90 active:scale-95'
        )}
      >
        {alreadyAdded ? t('pantryPicks.added') : t('pantryPicks.addToPicks')}
      </button>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PantryPicksPage() {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { picks, pantryIngredients, addPick, removePick, clearAllPicks, setPantryIngredients } =
    usePantryPicksStore()

  const [inputValue, setInputValue] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  // Generation counter — discards stale search results when the user kicks off
  // a newer search before the previous one resolves.
  const searchGenRef = useRef(0)

  // Ingredient autocomplete suggestions
  const { data: suggestions = [] } = useQuery({
    queryKey: ['ingredient-suggestions', locale],
    queryFn: () => getIngredientSuggestions(locale),
    staleTime: 5 * 60 * 1000,
  })

  // Track which bank ids are already in picks
  const addedBankIds = new Set(picks.filter((p) => p.bankId).map((p) => p.bankId))

  function addIngredient(value: string) {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return
    if (!pantryIngredients.includes(trimmed)) {
      setPantryIngredients([...pantryIngredients, trimmed])
    }
    setInputValue('')
  }

  function removeIngredient(ing: string) {
    setPantryIngredients(pantryIngredients.filter((i) => i !== ing))
  }

  function clearIngredients() {
    setPantryIngredients([])
    setResults([])
    setHasSearched(false)
  }

  async function handleFind() {
    if (pantryIngredients.length === 0) return
    const myGen = ++searchGenRef.current
    setIsSearching(true)
    setHasSearched(true)
    try {
      const matches = await matchByPantry(pantryIngredients, { limit: 20 })
      // Discard if a newer search has started since this one began.
      if (myGen !== searchGenRef.current) return
      setResults(
        matches.map((m) => ({
          id: m.id,
          title: m.title,
          imageUrl: m.imageUrl,
          sourceUrl: m.sourceUrl,
          prepTimeMin: m.prepTimeMin,
          cookTimeMin: m.cookTimeMin,
          servings: m.servings,
          // Ingredients that appear in the result's main ingredient + title
          matchedIngredients: pantryIngredients.filter(
            (ing) =>
              m.title.toLowerCase().includes(ing) ||
              m.ingredientMain?.toLowerCase().includes(ing)
          ),
        }))
      )
    } catch {
      if (myGen === searchGenRef.current) setResults([])
    } finally {
      if (myGen === searchGenRef.current) setIsSearching(false)
    }
  }

  function handleAddToPicks(item: ResultItem) {
    addPick({
      source: 'bank',
      bankId: item.id,
      title: item.title,
      imageUrl: item.imageUrl,
      sourceUrl: item.sourceUrl,
      prepTimeMin: item.prepTimeMin,
      cookTimeMin: item.cookTimeMin,
      servings: item.servings,
      matchedIngredients: item.matchedIngredients,
    })
  }

  const findLabel =
    pantryIngredients.length > 0
      ? t('pantryPicks.findRecipes.withCount').replace(
          '{count}',
          String(pantryIngredients.length)
        )
      : t('pantryPicks.findRecipes')

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-24 space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-rp-ink-soft mb-4 min-h-[44px] -ms-1 px-1"
        >
          <ChevronLeft className="h-4 w-4 rtl-flip" />
          {t('common.back')}
        </button>

        <div className="relative overflow-hidden rounded-rp-lg p-5 bg-rp-bg-soft">
          <RingsOrnament
            className="absolute -bottom-16 -end-16 opacity-[0.12]"
            size={240}
          />
          <PageTitle as="h1" className="text-[28px]">
            {t('pantryPicks.title')}
          </PageTitle>
          <HandAccent className="mt-1 text-base" rotate={-1}>
            {t('pantryPicks.tagline')}
          </HandAccent>
        </div>
      </div>

      {/* Saved picks */}
      {picks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-semibold text-rp-ink">
              {t('pantryPicks.yourPicks').replace('{count}', String(picks.length))}
            </h2>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-sm text-red-500 font-medium min-h-[44px] px-2 hover:text-red-600 transition-colors"
            >
              {t('pantryPicks.clearAll')}
            </button>
          </div>
          <div className="space-y-2">
            {picks.map((pick) => (
              <PickCard key={pick.id} pick={pick} onRemove={() => removePick(pick.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state when no picks */}
      {picks.length === 0 && !hasSearched && (
        <div className="text-center py-6">
          <p className="text-base font-medium text-rp-ink">{t('pantryPicks.empty.title')}</p>
          <p className="text-sm text-rp-ink-soft mt-1">{t('pantryPicks.empty.subtitle')}</p>
        </div>
      )}

      {/* Ingredients input section */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-rp-ink">
          {t('pantryPicks.ingredients.title')}
        </h2>

        {/* Chip list — fixed height scrollable, no overflow-hidden on parent */}
        {pantryIngredients.length > 0 && (
          <div className="max-h-32 overflow-y-auto pr-0.5">
            <div className="flex flex-wrap gap-1.5">
              {pantryIngredients.map((ing) => (
                <span
                  key={ing}
                  className="inline-flex items-center gap-1 min-w-0 px-2.5 py-1 rounded-full bg-rp-brand/10 text-rp-brand text-sm font-medium"
                >
                  <span className="truncate max-w-[140px]">{ing}</span>
                  <button
                    onClick={() => removeIngredient(ing)}
                    aria-label={`Remove ${ing}`}
                    className="shrink-0 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Input row — overflow-visible so dropdown can escape */}
        <div className="overflow-visible">
          <div
            className="flex gap-2 items-end"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addIngredient(inputValue)
              }
            }}
          >
            <div className="flex-1 min-w-0 overflow-visible">
              <AutocompleteInput
                value={inputValue}
                onChange={setInputValue}
                suggestions={suggestions}
                placeholder={t('pantryPicks.ingredients.placeholder')}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => addIngredient(inputValue)}
              disabled={!inputValue.trim()}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {pantryIngredients.length > 0 && (
          <button
            onClick={clearIngredients}
            className="text-xs text-rp-ink-mute hover:text-rp-ink-soft transition-colors"
          >
            {t('pantryPicks.ingredients.clear')}
          </button>
        )}
      </section>

      {/* Find CTA */}
      <button
        onClick={() => void handleFind()}
        disabled={pantryIngredients.length === 0 || isSearching}
        className={cn(
          'w-full min-h-[48px] rounded-rp-lg text-sm font-semibold transition-all',
          'flex items-center justify-center gap-2',
          pantryIngredients.length === 0
            ? 'bg-rp-bg-soft text-rp-ink-mute cursor-not-allowed'
            : 'bg-rp-brand text-white hover:bg-rp-brand/90 active:scale-[0.98] shadow-sm'
        )}
      >
        {isSearching ? t('pantryPicks.results.loading') : findLabel}
      </button>

      {/* Results */}
      {hasSearched && !isSearching && (
        <section className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-rp-ink-soft text-center py-4">
              {t('pantryPicks.results.empty')}
            </p>
          ) : (
            results.map((item) => (
              <ResultCard
                key={item.id}
                item={item}
                alreadyAdded={addedBankIds.has(item.id)}
                onAdd={() => handleAddToPicks(item)}
              />
            ))
          )}
        </section>
      )}

      {/* Clear picks confirm dialog */}
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title={t('pantryPicks.clearConfirm.title')}
        description={t('pantryPicks.clearConfirm.body')}
        confirmLabel={t('pantryPicks.clearAll')}
        cancelLabel={t('confirm.cancel')}
        onConfirm={() => {
          clearAllPicks()
        }}
      />

    </div>
  )
}
