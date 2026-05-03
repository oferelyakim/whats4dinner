import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { DEPARTMENTS, UNITS, type Department, type Unit } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import { createRecipe, getRecipe, updateRecipe, getIngredientSuggestions } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'

interface IngredientRow {
  id: string
  name: string
  quantity: string
  unit: Unit
  category: Department
  notes: string
}

let nextId = 1

export function RecipeFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const { t, locale } = useI18n()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [servings, setServings] = useState('')
  const [tags, setTags] = useState('')
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [loaded, setLoaded] = useState(!isEdit)

  const { data: ingredientSuggestions = [] } = useQuery({
    queryKey: ['ingredient-suggestions', locale],
    queryFn: () => getIngredientSuggestions(locale),
  })

  // Load existing recipe for editing
  const { data: existingRecipe } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existingRecipe && !loaded) {
      setTitle(existingRecipe.title)
      setDescription(existingRecipe.description ?? '')
      setInstructions(existingRecipe.instructions ?? '')
      setSourceUrl(existingRecipe.source_url ?? '')
      setPrepTime(existingRecipe.prep_time_min?.toString() ?? '')
      setCookTime(existingRecipe.cook_time_min?.toString() ?? '')
      setServings(existingRecipe.servings?.toString() ?? '')
      setTags(existingRecipe.tags?.join(', ') ?? '')
      setIngredients(
        (existingRecipe.ingredients ?? []).map((ing) => ({
          id: `ing-${nextId++}`,
          name: ing.name,
          quantity: ing.quantity?.toString() ?? '',
          unit: (ing.unit || '') as Unit,
          category: 'Other' as Department,
          notes: ing.notes ?? '',
        }))
      )
      setLoaded(true)
    }
  }, [existingRecipe, loaded])

  function addIngredient() {
    setIngredients((prev) => [
      ...prev,
      {
        id: `ing-${nextId++}`,
        name: '',
        quantity: '',
        unit: '' as Unit,
        category: 'Other' as Department,
        notes: '',
      },
    ])
    // scrollIntoView removed — it caused scroll jank and fought the user's scroll position
  }

  function updateIngredient(rowId: string, field: keyof IngredientRow, value: string) {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === rowId ? { ...ing, [field]: value } : ing))
    )
  }

  function removeIngredient(rowId: string) {
    setIngredients((prev) => prev.filter((ing) => ing.id !== rowId))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
        prep_time_min: prepTime ? parseInt(prepTime) : undefined,
        cook_time_min: cookTime ? parseInt(cookTime) : undefined,
        servings: servings ? parseInt(servings) : undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        circle_id: activeCircle?.id,
        ingredients: ingredients
          .filter((ing) => ing.name.trim())
          .map((ing) => ({
            name: ing.name.trim(),
            quantity: ing.quantity ? parseFloat(ing.quantity) : null,
            unit: ing.unit,
            sort_order: 0,
            notes: ing.notes || null,
            item_id: null,
          })),
      }
      return isEdit ? updateRecipe(id!, data) : createRecipe(data)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      if (isEdit) await queryClient.invalidateQueries({ queryKey: ['recipe', id] })
      navigate(isEdit ? `/recipes/${id}` : '/recipes')
    },
    onError: (err: Error) => setSaveError(err.message),
  })

  const [saveError, setSaveError] = useState('')

  function handleSave() {
    setSaveError('')
    saveMutation.mutate()
  }

  const isKit = existingRecipe?.type === 'supply_kit'

  if (isEdit && !loaded) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-4 space-y-5 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-11 w-11 rounded-xl flex items-center justify-center bg-rp-bg-soft active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-rp-ink-soft rtl-flip" />
        </button>
        <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">
          {isEdit ? (existingRecipe?.type === 'supply_kit' ? t('essentials.editEssentials') : t('recipe.edit')) : t('recipe.new')}
        </h2>
      </div>

      {/* Basic Info */}
      <div className="space-y-3">
        <Input
          label={t('recipe.title')}
          placeholder="e.g., Butter Chicken"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          required
        />
        <Input
          label={t('recipe.description')}
          placeholder="Brief description (optional)"
          value={description}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
        />
        {!isKit && (
          <Input
            label="Source URL"
            placeholder="Link to original recipe (optional)"
            value={sourceUrl}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSourceUrl(e.target.value)}
            type="url"
          />
        )}
        {!isKit && (
          <div className="grid grid-cols-3 gap-3">
            <Input
              label={t('recipe.prepTime')}
              type="number"
              placeholder="15"
              value={prepTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrepTime(e.target.value)}
            />
            <Input
              label={t('recipe.cookTime')}
              type="number"
              placeholder="30"
              value={cookTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCookTime(e.target.value)}
            />
            <Input
              label={t('recipe.servings')}
              type="number"
              placeholder="4"
              value={servings}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setServings(e.target.value)}
            />
          </div>
        )}
        {!isKit && (
          <Input
            label={t('recipe.tags')}
            placeholder="e.g., indian, dinner, spicy"
            value={tags}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTags(e.target.value)}
          />
        )}
      </div>

      {/* Ingredients */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-rp-ink">
            {t('recipe.ingredients')}
          </h3>
          <Button size="sm" variant="ghost" onClick={addIngredient}>
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>

        {ingredients.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-slate-400 text-center">
              No ingredients yet. Tap "Add" to start.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {ingredients.map((ing) => (
              <Card key={ing.id} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="p-2 min-h-[44px] min-w-[44px] shrink-0 cursor-grab touch-none flex items-center justify-center" aria-label="Drag to reorder">
                    <GripVertical className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <AutocompleteInput
                      placeholder="Ingredient name"
                      value={ing.name}
                      onChange={(val) => updateIngredient(ing.id, 'name', val)}
                      suggestions={ingredientSuggestions}
                    />
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor={`qty-${ing.id}`}>{t('recipe.quantity')}</label>
                      <input
                        id={`qty-${ing.id}`}
                        placeholder="Qty"
                        value={ing.quantity}
                        onChange={(e) => updateIngredient(ing.id, 'quantity', e.target.value)}
                        inputMode="decimal"
                        className="w-16 text-sm bg-transparent border-b border-rp-hairline pb-1 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                      />
                      <label className="sr-only" htmlFor={`unit-${ing.id}`}>{t('recipe.unit')}</label>
                      <select
                        id={`unit-${ing.id}`}
                        value={ing.unit}
                        onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}
                        className="min-w-[4rem] text-sm border-b border-rp-hairline pb-1 text-slate-900 dark:text-slate-100 bg-rp-card rounded focus:outline-none focus:border-brand-500"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u} className="bg-rp-card text-slate-900 dark:text-slate-100">
                            {u || 'Unit'}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`cat-${ing.id}`}>{t('recipe.category')}</label>
                      <select
                        id={`cat-${ing.id}`}
                        value={ing.category}
                        onChange={(e) => updateIngredient(ing.id, 'category', e.target.value)}
                        className="flex-1 text-sm border-b border-rp-hairline pb-1 text-slate-900 dark:text-slate-100 bg-rp-card rounded focus:outline-none focus:border-brand-500"
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d} className="bg-rp-card text-slate-900 dark:text-slate-100">
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={() => removeIngredient(ing.id)}
                    aria-label="Remove ingredient"
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
            <div />
          </div>
        )}
      </section>

      {/* Instructions (recipes only) */}
      {!isKit && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-rp-ink-soft">
            {t('recipe.instructions')}
          </label>
          <textarea
            placeholder="Step-by-step instructions..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            className={cn(
              'w-full rounded-xl border px-4 py-2.5 text-sm transition-colors resize-none',
              'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400',
              'dark:bg-surface-dark-elevated dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500'
            )}
          />
        </div>
      )}

      {saveError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {/* Save button */}
      <div className="flex gap-3 pt-2 pb-4">
        <Button variant="secondary" className="flex-1" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={!title.trim() || saveMutation.isPending}>
          {saveMutation.isPending ? t('common.loading') : isEdit ? t('recipe.update') : t('recipe.save')}
        </Button>
      </div>
    </div>
  )
}
