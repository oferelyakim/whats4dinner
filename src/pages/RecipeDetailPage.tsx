import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Users, Share2, ExternalLink, ShoppingCart, Plus, Check, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { formatQuantity } from '@/lib/format'
import { getRecipe, createRecipeShare, deleteRecipe, shareRecipeWithCircle } from '@/services/recipes'
import { getMyCircles } from '@/services/circles'
import type { Circle } from '@/types'
import { getShoppingLists, createShoppingList, addRecipeToList } from '@/services/shoppingLists'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/ui/Toast'

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const toast = useToast()
  const [showShare, setShowShare] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [sharedToCircles, setSharedToCircles] = useState<Set<string>>(new Set())
  const [showDelete, setShowDelete] = useState(false)
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set())
  const [showAddToList, setShowAddToList] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [addedToList, setAddedToList] = useState<string | null>(null)

  const { data: recipe, isLoading, error } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id!),
    enabled: !!id,
  })

  const { data: lists = [] } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
    enabled: showAddToList,
  })

  const { data: circles = [] } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
    enabled: showShare || showNewList,
  })

  const addToListMutation = useMutation({
    mutationFn: (listId: string) => addRecipeToList(listId, id!, selectedIngredients.size > 0 ? selectedIngredients : undefined),
    onSuccess: async (_data, listId) => {
      await queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      await queryClient.invalidateQueries({ queryKey: ['shopping-list', listId] })
      setAddedToList(listId)
      setTimeout(() => {
        setShowAddToList(false)
        setAddedToList(null)
      }, 1000)
    },
    onError: (err: Error) => toast.error(t('common.error'), err.message),
  })

  const createListMutation = useMutation({
    mutationFn: () => createShoppingList(newListName.trim(), circles[0]?.id),
    onSuccess: async (list) => {
      await addRecipeToList(list.id, id!)
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      setShowNewList(false)
      setShowAddToList(false)
      setNewListName('')
    },
    onError: (err: Error) => toast.error(t('common.error'), err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecipe(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate('/recipes')
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated mb-4">
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <p className="text-center text-slate-500">Recipe not found</p>
      </div>
    )
  }

  const isKit = recipe.type === 'supply_kit'

  return (
    <div className="px-4 sm:px-6 py-4 space-y-5 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => isKit ? navigate('/recipes?view=essentials') : navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1 min-w-0 truncate">
          {recipe.title}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowShare(true)}
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </div>


      {/* Description */}
      {recipe.description && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{recipe.description}</p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 flex-wrap">
        {isKit && recipe.kit_category && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
            {recipe.kit_category}
          </span>
        )}
        {!isKit && (recipe.prep_time_min || recipe.cook_time_min) && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <Clock className="h-4 w-4" />
            {recipe.prep_time_min ? `${recipe.prep_time_min}m prep` : ''}
            {recipe.prep_time_min && recipe.cook_time_min ? ' + ' : ''}
            {recipe.cook_time_min ? `${recipe.cook_time_min}m cook` : ''}
          </span>
        )}
        {!isKit && recipe.servings && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <Users className="h-4 w-4" />
            {recipe.servings} servings
          </span>
        )}
      </div>

      {/* Tags (recipes only) */}
      {!isKit && recipe.tags?.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {recipe.tags.map((tag: string) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Source link (recipes only) */}
      {!isKit && recipe.source_url && (
        <a
          href={recipe.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-brand-500 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          View original recipe
        </a>
      )}

      {/* Ingredients */}
      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            {isKit ? 'Items' : t('recipe.ingredients')} ({recipe.ingredients.length})
          </h3>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {recipe.ingredients.map((ing) => (
              <div key={ing.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
                  {ing.quantity && <strong>{formatQuantity(ing.quantity)}</strong>}
                  {ing.unit && ` ${ing.unit}`}
                  {' '}{ing.name}
                  {ing.notes && (
                    <span className="text-slate-400"> ({ing.notes})</span>
                  )}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Instructions */}
      {!isKit && recipe.instructions && (
        <section>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            {t('recipe.instructions')}
          </h3>
          <Card className="p-4">
            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {recipe.instructions}
            </div>
          </Card>
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="secondary" className="flex-1" onClick={() => navigate(`/recipes/${id}/edit`)}>
          {t('common.edit')}
        </Button>
        <Button className="flex-1" onClick={() => setShowAddToList(true)}>
          <ShoppingCart className="h-4 w-4" />
          {t('recipe.addToList')}
        </Button>
      </div>
      <button
        onClick={() => setShowDelete(true)}
        className="w-full flex items-center justify-center gap-2 py-3 mb-4 text-sm font-medium text-danger hover:bg-danger/10 rounded-xl transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        {isKit ? t('essentials.deleteEssentials') : t('recipe.delete')}
      </button>

      {/* Share Dialog */}
      <Dialog.Root open={showShare} onOpenChange={setShowShare}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[70vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Share Recipe
            </Dialog.Title>

            {/* Get link */}
            <div className="mb-4">
              <p className="text-xs text-slate-400 mb-2">Anyone with the link can view this recipe</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={!!shareUrl}
                  onClick={async () => {
                    try {
                      const code = await createRecipeShare(id!)
                      setShareUrl(`${window.location.origin}/r/${code}`)
                    } catch (err) {
                      toast.error(t('common.error'), err instanceof Error ? err.message : 'Failed')
                    }
                  }}
                >
                  {shareUrl ? <Check className="h-4 w-4 text-success" /> : null}
                  {shareUrl ? 'Link ready!' : 'Generate Link'}
                </Button>
                {shareUrl && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        await navigator.clipboard.writeText(shareUrl)
                      }}
                    >
                      Copy
                    </Button>
                    {navigator.share && (
                      <Button
                        onClick={() => navigator.share({ title: recipe?.title, url: shareUrl })}
                      >
                        Send
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs text-slate-400">or share with circles</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* Share with circles */}
            <div className="space-y-2">
              {circles.map((circle: Circle) => {
                const isShared = sharedToCircles.has(circle.id) || recipe?.circle_id === circle.id
                return (
                  <button
                    key={circle.id}
                    disabled={isShared}
                    onClick={async () => {
                      try {
                        await shareRecipeWithCircle(id!, circle.id)
                        setSharedToCircles((prev) => new Set([...prev, circle.id]))
                        queryClient.invalidateQueries({ queryKey: ['recipe', id] })
                      } catch (err) {
                        toast.error(t('common.error'), err instanceof Error ? err.message : 'Failed')
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-start hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors disabled:opacity-50"
                  >
                    <span className="text-xl">{circle.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{circle.name}</p>
                      <p className="text-[10px] text-slate-400">All members will see this recipe</p>
                    </div>
                    {isShared ? (
                      <Check className="h-5 w-5 text-success" />
                    ) : (
                      <Share2 className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                )
              })}
              {circles.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No circles yet</p>
              )}
            </div>

            <Button variant="secondary" className="w-full mt-4" onClick={() => setShowShare(false)}>
              Done
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation */}
      <Dialog.Root open={showDelete} onOpenChange={setShowDelete}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {isKit ? t('essentials.deleteEssentials') : t('recipe.delete')}
            </Dialog.Title>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Are you sure you want to delete <strong>{recipe?.title}</strong>? This will also remove it from any shopping lists and meal plans. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDelete(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? t('common.loading') : t('common.delete')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add to List Dialog - Step 1: Pick ingredients, Step 2: Pick list */}
      <Dialog.Root open={showAddToList} onOpenChange={(open) => {
        setShowAddToList(open)
        if (open && recipe?.ingredients) {
          setSelectedIngredients(new Set(recipe.ingredients.map((i) => i.id)))
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 pb-10 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {t('recipe.addToList')}
            </Dialog.Title>

            {showNewList ? (
              <div className="space-y-4">
                <Input
                  label="List Name"
                  placeholder="e.g., Weekend Groceries"
                  value={newListName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewListName(e.target.value)}
                />
                {circles.length === 0 && (
                  <p className="text-xs text-warning">
                    You need to create a circle first to make a shopping list.
                  </p>
                )}
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setShowNewList(false)}>
                    {t('common.back')}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => createListMutation.mutate()}
                    disabled={!newListName.trim() || circles.length === 0 || createListMutation.isPending}
                  >
                    {createListMutation.isPending ? 'Creating...' : 'Create & Add'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Ingredient picker */}
                {recipe?.ingredients && recipe.ingredients.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Select ingredients ({selectedIngredients.size}/{recipe.ingredients.length})
                      </p>
                      <button
                        onClick={() => {
                          if (selectedIngredients.size === recipe.ingredients!.length) {
                            setSelectedIngredients(new Set())
                          } else {
                            setSelectedIngredients(new Set(recipe.ingredients!.map((i) => i.id)))
                          }
                        }}
                        className="text-xs text-brand-500 font-medium"
                      >
                        {selectedIngredients.size === recipe.ingredients.length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {recipe.ingredients.map((ing) => {
                        const isChecked = selectedIngredients.has(ing.id)
                        const handleToggle = () => {
                          setSelectedIngredients((prev) => {
                            const next = new Set(prev)
                            if (next.has(ing.id)) next.delete(ing.id)
                            else next.add(ing.id)
                            return next
                          })
                        }
                        return (
                          <div
                            key={ing.id}
                            role="checkbox"
                            aria-checked={isChecked}
                            tabIndex={0}
                            onClick={handleToggle}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault()
                                handleToggle()
                              }
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-start hover:bg-slate-50 dark:hover:bg-surface-dark-overlay cursor-pointer"
                          >
                            <div className={cn(
                              'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              isChecked ? 'bg-brand-500 border-brand-500' : 'border-slate-300 dark:border-slate-600'
                            )}>
                              {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {ing.quantity && <strong>{formatQuantity(ing.quantity)} </strong>}
                              {ing.unit && `${ing.unit} `}
                              {ing.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* List picker */}
                <p className="text-xs text-slate-400">Add {selectedIngredients.size} ingredients to:</p>
                {lists.length > 0 && lists.filter((l) => l.status === 'active').map((list) => (
                  <button
                    key={list.id}
                    onClick={() => addToListMutation.mutate(list.id)}
                    disabled={addToListMutation.isPending || selectedIngredients.size === 0}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-start active:scale-[0.98] transition-all hover:border-brand-500 disabled:opacity-50"
                  >
                    <ShoppingCart className="h-5 w-5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {list.name}
                      </p>
                    </div>
                    {addedToList === list.id ? (
                      <Check className="h-5 w-5 text-success" />
                    ) : (
                      <Plus className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                ))}

                <button
                  onClick={() => setShowNewList(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-start active:scale-[0.98] transition-all"
                >
                  <Plus className="h-5 w-5 text-brand-500" />
                  <p className="text-sm font-medium text-brand-500">Create new list</p>
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
