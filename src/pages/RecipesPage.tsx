import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, BookOpen, Clock, Users as UsersIcon, Link2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { getRecipes } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'
import type { Recipe } from '@/types'

export function RecipesPage() {
  const navigate = useNavigate()
  const { activeCircle } = useAppStore()
  const [search, setSearch] = useState('')

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
  })

  const filtered = search
    ? recipes.filter(
        (r: Recipe) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.tags?.some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : recipes

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white dark:bg-surface-dark-elevated border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title={search ? 'No recipes found' : 'No recipes yet'}
          description={
            search
              ? 'Try a different search term'
              : 'Add your favorite recipes and import them from links'
          }
          action={
            !search ? (
              <Button onClick={() => navigate('/recipes/new')}>
                <Plus className="h-4 w-4" />
                Add Recipe
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((recipe: Recipe) => (
            <Card
              key={recipe.id}
              variant="elevated"
              className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => navigate(`/recipes/${recipe.id}`)}
            >
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {recipe.title}
              </h3>
              {recipe.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  {recipe.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {(recipe.prep_time_min || recipe.cook_time_min) && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    {(recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)} min
                  </span>
                )}
                {recipe.servings && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <UsersIcon className="h-3 w-3" />
                    {recipe.servings}
                  </span>
                )}
                {recipe.ingredients && (
                  <span className="text-xs text-slate-400">
                    {recipe.ingredients.length} ingredients
                  </span>
                )}
              </div>
              {recipe.tags?.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {recipe.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* FAB menu */}
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
        <button
          onClick={() => navigate('/recipes/import')}
          className="h-11 flex items-center gap-2 px-4 rounded-full bg-surface-dark-elevated text-white shadow-lg active:scale-95 transition-transform text-sm font-medium"
        >
          <Link2 className="h-4 w-4" />
          Import from URL
        </button>
        <button
          onClick={() => navigate('/recipes/new')}
          className="h-14 w-14 rounded-full bg-brand-500 text-white shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <PenLine className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}
