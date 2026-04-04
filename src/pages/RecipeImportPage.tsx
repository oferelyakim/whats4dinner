import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Link2, Loader2, Check, ChefHat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { importRecipeFromUrl } from '@/services/recipeImport'
import { createRecipe } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'

interface ImportedIngredient {
  name: string
  quantity?: number
  unit?: string
  include: boolean
}

export function RecipeImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()

  const [url, setUrl] = useState('')
  const [imported, setImported] = useState<{
    title: string
    description?: string
    instructions?: string
    image_url?: string
    prep_time_min?: number
    cook_time_min?: number
    servings?: number
    source_url: string
    ingredients: ImportedIngredient[]
  } | null>(null)
  const [error, setError] = useState('')

  const fetchMutation = useMutation({
    mutationFn: () => importRecipeFromUrl(url.trim()),
    onSuccess: (data) => {
      setImported({
        ...data,
        ingredients: data.ingredients.map((i) => ({ ...i, include: true })),
      })
      setError('')
    },
    onError: (err: Error) => setError(err.message),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!imported) throw new Error('No recipe data')
      return createRecipe({
        title: imported.title,
        description: imported.description,
        instructions: imported.instructions,
        source_url: imported.source_url,
        prep_time_min: imported.prep_time_min,
        cook_time_min: imported.cook_time_min,
        servings: imported.servings,
        circle_id: activeCircle?.id,
        ingredients: imported.ingredients
          .filter((i) => i.include && i.name)
          .map((i) => ({
            name: i.name,
            quantity: i.quantity ?? null,
            unit: (i.unit ?? '') as import('@/lib/constants').Unit,
            sort_order: 0,
            notes: null,
            item_id: null,
          })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate('/recipes')
    },
  })

  function toggleIngredient(index: number) {
    if (!imported) return
    setImported({
      ...imported,
      ingredients: imported.ingredients.map((ing, i) =>
        i === index ? { ...ing, include: !ing.include } : ing
      ),
    })
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Import Recipe</h2>
      </div>

      {/* URL input */}
      {!imported && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-6">
            <div className="h-14 w-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-3">
              <Link2 className="h-7 w-7 text-brand-500" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs">
              Paste a link to a recipe from any website. We'll extract the title, ingredients, and instructions.
            </p>
          </div>

          <Input
            label="Recipe URL"
            type="url"
            placeholder="https://www.example.com/recipe/..."
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          />

          {error && (
            <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={() => fetchMutation.mutate()}
            disabled={!url.trim() || fetchMutation.isPending}
          >
            {fetchMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting recipe...
              </>
            ) : (
              'Import Recipe'
            )}
          </Button>
        </div>
      )}

      {/* Preview imported recipe */}
      {imported && (
        <div className="space-y-4">
          {/* Title & meta */}
          <Card variant="elevated" className="p-4 space-y-2">
            {imported.image_url && (
              <img
                src={imported.image_url}
                alt={imported.title}
                className="w-full h-40 object-cover rounded-xl mb-3"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {imported.title}
            </h3>
            {imported.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">
                {imported.description}
              </p>
            )}
            <div className="flex gap-3 text-xs text-slate-400">
              {imported.prep_time_min && <span>Prep: {imported.prep_time_min}min</span>}
              {imported.cook_time_min && <span>Cook: {imported.cook_time_min}min</span>}
              {imported.servings && <span>Serves: {imported.servings}</span>}
            </div>
          </Card>

          {/* Ingredients */}
          {imported.ingredients.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Ingredients ({imported.ingredients.filter((i) => i.include).length}/{imported.ingredients.length})
                </h4>
              </div>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                {imported.ingredients.map((ing, i) => (
                  <button
                    key={i}
                    onClick={() => toggleIngredient(i)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                      ing.include
                        ? 'bg-brand-500 border-brand-500'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {ing.include && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className={`text-sm flex-1 ${ing.include ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'}`}>
                      {ing.quantity && <strong>{ing.quantity} </strong>}
                      {ing.unit && <span>{ing.unit} </span>}
                      {ing.name}
                    </span>
                  </button>
                ))}
              </Card>
            </div>
          )}

          {imported.ingredients.length === 0 && (
            <Card className="p-4 text-center">
              <ChefHat className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                No ingredients were found. You can add them manually after saving.
              </p>
            </Card>
          )}

          {/* Instructions preview */}
          {imported.instructions && (
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Instructions
              </h4>
              <Card className="p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap line-clamp-6">
                  {imported.instructions}
                </p>
              </Card>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 pb-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => { setImported(null); setError('') }}
            >
              Try Another
            </Button>
            <Button
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Recipe'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
