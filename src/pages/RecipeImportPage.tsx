import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Link2, Loader2, Check, ChefHat, Camera, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { importRecipeFromUrl, importRecipeFromImage } from '@/services/recipeImport'
import { createRecipe } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { formatQuantity } from '@/lib/format'
import { useI18n } from '@/lib/i18n'

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
  const ai = useAIAccess()
  const { t } = useI18n()

  const [mode, setMode] = useState<'url' | 'image'>('url')
  const [url, setUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
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
    tags?: string[]
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

  const imageMutation = useMutation({
    mutationFn: () => {
      if (!imageFile) throw new Error('No image selected')
      return importRecipeFromImage(imageFile)
    },
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
        tags: imported.tags,
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

  function handleImportUrl() {
    if (!ai.checkRecipeImportAccess()) return
    fetchMutation.mutate()
  }

  function handleImportImage() {
    if (!ai.checkRecipeImportAccess()) return
    imageMutation.mutate()
  }

  function toggleIngredient(index: number) {
    if (!imported) return
    setImported({
      ...imported,
      ingredients: imported.ingredients.map((ing, i) =>
        i === index ? { ...ing, include: !ing.include } : ing
      ),
    })
  }

  const resetDate = ai.subscription?.current_period_end
    ? new Date(ai.subscription.current_period_end).toLocaleDateString()
    : undefined

  return (
    <div className="px-4 sm:px-6 py-4 space-y-5 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-rp-bg-soft active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-rp-ink-soft rtl-flip" />
        </button>
        <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">Import Recipe</h2>
        <Sparkles className="h-4 w-4 text-brand-500" />
      </div>

      {/* AI warning banner */}
      {ai.hasAI && ai.isWarning && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-2">
          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
            {t('ai.warningUsage')}
          </p>
        </div>
      )}

      {/* AI limit reached banner */}
      {ai.hasAI && ai.isLimitReached && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">
            {t('ai.limitReachedShort')}{resetDate ? ` ${t('ai.resetsOn')} ${resetDate}.` : ''}
          </p>
        </div>
      )}

      {/* Import options */}
      {!imported && (
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-rp-bg-soft rounded-lg p-0.5">
            <button
              onClick={() => setMode('url')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'url'
                  ? 'bg-white dark:bg-surface-dark-overlay text-rp-ink shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Link2 className="h-4 w-4" />
              From URL
            </button>
            <button
              onClick={() => setMode('image')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === 'image'
                  ? 'bg-white dark:bg-surface-dark-overlay text-rp-ink shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              <Camera className="h-4 w-4" />
              From Photo
            </button>
          </div>

          {mode === 'url' ? (
            <>
              <div className="flex flex-col items-center py-4">
                <p className="text-sm text-rp-ink-mute text-center max-w-xs">
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
                onClick={handleImportUrl}
                disabled={!url.trim() || fetchMutation.isPending || (ai.hasAI && ai.isLimitReached)}
              >
                {fetchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting recipe...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Import Recipe
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center py-4">
                <p className="text-sm text-rp-ink-mute text-center max-w-xs">
                  Take a photo of a recipe card, cookbook page, or screenshot. We'll extract the text and ingredients.
                </p>
              </div>

              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Recipe"
                    className="w-full rounded-xl max-h-64 object-cover"
                    onError={() => {
                      // HEIC/HEIF or other unsupported format — still keep the file for upload
                      setImagePreview(null)
                    }}
                  />
                  <button
                    onClick={() => {
                      if (imagePreview) URL.revokeObjectURL(imagePreview)
                      setImageFile(null)
                      setImagePreview(null)
                    }}
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ) : imageFile ? (
                // File selected but preview failed (e.g. HEIC format)
                <div className="flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed border-brand-500 bg-brand-50 dark:bg-brand-950/20">
                  <Camera className="h-8 w-8 text-brand-500 mb-2" />
                  <span className="text-sm text-brand-600 dark:text-brand-400 font-medium">{imageFile.name}</span>
                  <span className="text-xs text-slate-400 mt-1">Preview not available, but the image will be processed</span>
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(null) }}
                    className="mt-2 text-xs text-red-500 underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Hidden file inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setImageFile(file)
                        setImagePreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setImageFile(file)
                        setImagePreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:border-brand-500 active:scale-[0.98] transition-all"
                  >
                    <Camera className="h-8 w-8 text-slate-400 mb-2" />
                    <span className="text-sm text-slate-500">Take a photo</span>
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center justify-center w-full h-12 rounded-xl border border-rp-hairline text-sm text-slate-500 hover:border-brand-500 active:scale-[0.98] transition-all"
                  >
                    Choose from gallery or files
                  </button>
                </div>
              )}

              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!imageFile || imageMutation.isPending || (ai.hasAI && ai.isLimitReached)}
                onClick={handleImportImage}
              >
                {imageMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading recipe...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Extract from Photo
                  </>
                )}
              </Button>

              <p className="text-xs text-slate-400 text-center">
                Uses AI to read recipe text from photos. Works best with clear, well-lit images.
              </p>
            </>
          )}
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
            <h3 className="text-lg font-bold text-rp-ink">
              {imported.title}
            </h3>
            {imported.description && (
              <p className="text-sm text-rp-ink-mute line-clamp-3">
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
                <h4 className="text-sm font-semibold text-rp-ink">
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
                    <span className={`text-sm flex-1 ${ing.include ? 'text-rp-ink' : 'text-slate-400 line-through'}`}>
                      {ing.quantity && <strong>{formatQuantity(ing.quantity)} </strong>}
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
              <h4 className="text-sm font-semibold text-rp-ink mb-2">
                Instructions
              </h4>
              <Card className="p-3">
                <p className="text-xs text-rp-ink-mute whitespace-pre-wrap line-clamp-6">
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

      <AIUpgradeModal
        open={ai.showUpgradeModal}
        onOpenChange={ai.setShowUpgradeModal}
        isLimitReached={ai.hasAI && ai.isLimitReached}
        isImportCapReached={ai.upgradeReason === 'recipe_import_cap'}
        importsUsed={ai.importsUsed}
        importsLimit={ai.importsLimit}
        resetDate={resetDate}
      />
    </div>
  )
}
