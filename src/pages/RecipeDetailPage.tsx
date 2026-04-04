import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Users, Share2, ExternalLink, ShoppingCart, Plus, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { getRecipe } from '@/services/recipes'
import { getShoppingLists, createShoppingList, addRecipeToList } from '@/services/shoppingLists'
import { getMyCircles } from '@/services/circles'

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
    enabled: showNewList,
  })

  const addToListMutation = useMutation({
    mutationFn: (listId: string) => addRecipeToList(listId, id!),
    onSuccess: (_data, listId) => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      setAddedToList(listId)
      setTimeout(() => {
        setShowAddToList(false)
        setAddedToList(null)
      }, 1000)
    },
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
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <p className="text-center text-slate-500">Recipe not found</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1 min-w-0 truncate">
          {recipe.title}
        </h2>
        <Button size="sm" variant="ghost">
          <Share2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Description */}
      {recipe.description && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{recipe.description}</p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 flex-wrap">
        {(recipe.prep_time_min || recipe.cook_time_min) && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <Clock className="h-4 w-4" />
            {recipe.prep_time_min ? `${recipe.prep_time_min}m prep` : ''}
            {recipe.prep_time_min && recipe.cook_time_min ? ' + ' : ''}
            {recipe.cook_time_min ? `${recipe.cook_time_min}m cook` : ''}
          </span>
        )}
        {recipe.servings && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <Users className="h-4 w-4" />
            {recipe.servings} servings
          </span>
        )}
      </div>

      {/* Tags */}
      {recipe.tags?.length > 0 && (
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

      {/* Source link */}
      {recipe.source_url && (
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
            Ingredients ({recipe.ingredients.length})
          </h3>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {recipe.ingredients.map((ing) => (
              <div key={ing.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
                  {ing.quantity && <strong>{ing.quantity}</strong>}
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
      {recipe.instructions && (
        <section>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
            Instructions
          </h3>
          <Card className="p-4">
            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {recipe.instructions}
            </div>
          </Card>
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-4">
        <Button variant="secondary" className="flex-1" onClick={() => navigate(`/recipes/${id}/edit`)}>
          Edit
        </Button>
        <Button className="flex-1" onClick={() => setShowAddToList(true)}>
          <ShoppingCart className="h-4 w-4" />
          Add to List
        </Button>
      </div>

      {/* Add to List Dialog */}
      <Dialog.Root open={showAddToList} onOpenChange={setShowAddToList}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Add to Shopping List
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
                    Back
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
              <div className="space-y-3">
                {lists.length > 0 && lists.filter((l) => l.status === 'active').map((list) => (
                  <button
                    key={list.id}
                    onClick={() => addToListMutation.mutate(list.id)}
                    disabled={addToListMutation.isPending}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-left active:scale-[0.98] transition-all hover:border-brand-500"
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
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-left active:scale-[0.98] transition-all"
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
