import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, UtensilsCrossed, BookOpen, Trash2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { getMealMenus, createMealMenu, addRecipeToMenu, removeRecipeFromMenu, deleteMealMenu } from '@/services/mealMenus'
import { getRecipes } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'
import type { Recipe, MealMenu } from '@/types'

export function MealMenusPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showAddRecipe, setShowAddRecipe] = useState<string | null>(null) // menuId
  const [showDelete, setShowDelete] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')

  const { data: menus = [], isLoading } = useQuery({
    queryKey: ['meal-menus', activeCircle?.id],
    queryFn: () => getMealMenus(activeCircle?.id),
  })

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
    enabled: !!showAddRecipe,
  })

  const createMutation = useMutation({
    mutationFn: () => createMealMenu(name.trim(), description.trim(), activeCircle?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-menus'] })
      setShowCreate(false)
      setName('')
      setDescription('')
    },
  })

  const addRecipeMutation = useMutation({
    mutationFn: (recipeId: string) => addRecipeToMenu(showAddRecipe!, recipeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-menus'] })
    },
  })

  const removeRecipeMutation = useMutation({
    mutationFn: ({ menuId, recipeId }: { menuId: string; recipeId: string }) =>
      removeRecipeFromMenu(menuId, recipeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-menus'] })
    },
  })

  const deleteMenuMutation = useMutation({
    mutationFn: (menuId: string) => deleteMealMenu(menuId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-menus'] })
      setShowDelete(null)
    },
  })

  const filteredRecipes = search
    ? recipes.filter((r: Recipe) => r.title.toLowerCase().includes(search.toLowerCase()))
    : recipes

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">Meal Templates</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        Create meal templates like "Taco Night" with multiple recipes. Add them to your meal plan or shopping list as a group.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : menus.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="h-12 w-12" />}
          title="No meal templates yet"
          description="Create a template like 'Taco Night' and add your favorite recipes to it"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Create Template
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {menus.map((menu: MealMenu & { recipes: Recipe[] }) => (
            <Card key={menu.id} variant="elevated" className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-900 dark:text-white">{menu.name}</h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddRecipe(menu.id); setSearch('') }}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDelete(menu.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                </div>
              </div>
              {menu.description && (
                <p className="text-xs text-slate-400 mb-2">{menu.description}</p>
              )}
              {menu.recipes.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No recipes yet. Tap + to add.</p>
              ) : (
                <div className="space-y-1.5">
                  {menu.recipes.map((recipe: Recipe) => (
                    <div key={recipe.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-surface-dark-overlay">
                      <BookOpen className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                      <span
                        className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate cursor-pointer"
                        onClick={() => navigate(`/recipes/${recipe.id}`)}
                      >
                        {recipe.title}
                      </span>
                      <button
                        onClick={() => removeRecipeMutation.mutate({ menuId: menu.id, recipeId: recipe.id })}
                        className="text-slate-400 hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Menu Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              New Meal Template
            </Dialog.Title>
            <div className="space-y-3">
              <Input label="Name" placeholder="e.g., Taco Night" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
              <Input label="Description (optional)" placeholder="Our favorite Mexican spread" value={description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button className="flex-1" onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Recipe to Menu Dialog */}
      <Dialog.Root open={!!showAddRecipe} onOpenChange={() => setShowAddRecipe(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto max-h-[60vh] overflow-y-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-3">
              Add Recipe
            </Dialog.Title>
            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-3"
            />
            {filteredRecipes.map((recipe: Recipe) => (
              <button
                key={recipe.id}
                onClick={() => addRecipeMutation.mutate(recipe.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-surface-dark-overlay active:scale-[0.98] transition-all"
              >
                <BookOpen className="h-4 w-4 text-brand-500 shrink-0" />
                <span className="text-sm text-slate-800 dark:text-slate-200 flex-1 truncate">{recipe.title}</span>
                <Plus className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Menu Confirmation */}
      <Dialog.Root open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Delete Template
            </Dialog.Title>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Are you sure? The recipes themselves won't be deleted.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDelete(null)}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={() => showDelete && deleteMenuMutation.mutate(showDelete)} disabled={deleteMenuMutation.isPending}>
                {deleteMenuMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
