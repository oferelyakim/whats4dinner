import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ExternalLink, Sparkles } from 'lucide-react'
import { db } from '../db'
import { getEngine } from '../MealPlanEngine'
import type { Recipe } from '../types'
import { Button } from '@/components/ui/Button'

interface Props {
  recipeId: string | null
  /**
   * v2.0.0: when the user opens a `link_ready` slot, parent passes the
   * slotId here. RecipeView calls `engine.hydrateLinkReadySlot` and
   * renders the result. Used instead of `recipeId` for link-first slots.
   */
  slotId?: string | null
  onClose: () => void
  /**
   * When true the dialog is read-only — any edit/delete/swap affordances
   * should be hidden. RecipeView currently has no such buttons, so this
   * prop is plumbed for forward-compatibility only.
   */
  readOnly?: boolean
}

export function RecipeView({ recipeId, slotId, onClose }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null | 'missing'>(null)

  useEffect(() => {
    if (recipeId) {
      // Direct recipe lookup (existing path).
      setRecipe(null)
      db.recipes.get(recipeId).then((r) => setRecipe(r ?? 'missing'))
      return
    }
    if (slotId) {
      // v2.0.0 lazy hydration path. The engine call:
      //   • returns the existing Recipe for already-`ready` slots
      //   • for `link_ready`: fetches URL or hydrates composed payload,
      //     creates a new Recipe row, flips slot to `ready`, returns it
      setRecipe(null)
      const engine = getEngine()
      engine
        .hydrateLinkReadySlot(slotId)
        .then((r) => setRecipe(r ?? 'missing'))
        .catch((err) => {
          console.warn('[RecipeView] hydrate failed:', err)
          setRecipe('missing')
        })
      return
    }
    setRecipe(null)
  }, [recipeId, slotId])

  const isOpen = !!recipeId || !!slotId

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-x-2 top-[5%] bottom-[5%] z-50 bg-rp-card rounded-2xl shadow-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg overflow-hidden flex flex-col">
          {recipe === null && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="h-6 w-6 border-2 border-rp-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {recipe === 'missing' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <p className="text-rp-ink">Recipe not found locally.</p>
              <p className="text-xs text-rp-ink-mute">Try regenerating this slot.</p>
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          )}
          {recipe && recipe !== 'missing' && (
            <>
              <div className="p-5 border-b border-rp-hairline">
                <Dialog.Title className="font-display italic text-2xl text-rp-ink">
                  {recipe.title}
                </Dialog.Title>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-rp-ink-mute flex-wrap">
                  {recipe.source === 'composed' || recipe.source === 'ai-fallback' ? (
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rp-brand/10 text-rp-brand"
                      title="Web search couldn't find a match for this dish, so AI composed a recipe based on the dish name and your preferences. Use 'Replace' to try again."
                    >
                      <Sparkles className="h-3 w-3" />
                      Composed by AI
                    </span>
                  ) : (
                    <>
                      <span>Saved from {recipe.sourceDomain ?? 'web'}</span>
                      {recipe.url && (
                        <a
                          href={recipe.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-0.5 hover:text-rp-brand"
                        >
                          <ExternalLink className="h-3 w-3" />
                          source
                        </a>
                      )}
                    </>
                  )}
                  {recipe.prepTimeMin != null && <span>· prep {recipe.prepTimeMin}m</span>}
                  {recipe.cookTimeMin != null && <span>· cook {recipe.cookTimeMin}m</span>}
                  {recipe.servings != null && <span>· serves {recipe.servings}</span>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <section>
                  <h3 className="text-xs uppercase tracking-wider text-rp-ink-mute font-semibold mb-2">
                    Ingredients
                  </h3>
                  <ul className="space-y-1 text-sm text-rp-ink">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i}>
                        {ing.quantity ? <span className="font-medium">{ing.quantity} </span> : null}
                        {ing.item}
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs uppercase tracking-wider text-rp-ink-mute font-semibold mb-2">
                    Steps
                  </h3>
                  <ol className="space-y-2 text-sm text-rp-ink list-decimal list-inside">
                    {recipe.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </section>
              </div>

              <div className="p-3 border-t border-rp-hairline">
                <Button variant="secondary" className="w-full" onClick={onClose}>
                  Close
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
