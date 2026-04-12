import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, Users, ExternalLink, BookOpen } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getSharedRecipe } from '@/services/recipes'
import { useAuth } from '@/hooks/useAuth'
import { formatQuantity } from '@/lib/format'

export function SharedRecipePage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()

  const { data: recipe, isLoading, error } = useQuery({
    queryKey: ['shared-recipe', code],
    queryFn: () => getSharedRecipe(code!),
    enabled: !!code,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-light dark:bg-surface-dark">
        <div className="h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-surface-light dark:bg-surface-dark text-center">
        <BookOpen className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Recipe not found
        </h1>
        <p className="text-sm text-slate-500">
          This share link may have expired or the recipe was removed.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 space-y-5 animate-page-enter">
        {/* Header */}
        <div className="flex items-center gap-2 text-brand-500">
          <img src="/logo-icon.png" alt="Replanish" className="h-5 w-5" />
          <span className="text-sm font-medium">Replanish</span>
        </div>

        {/* Recipe title */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              {recipe.description}
            </p>
          )}
        </div>

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

        {/* Source */}
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
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
              Ingredients ({recipe.ingredients.length})
            </h2>
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {recipe.ingredients.map((ing) => (
                <div key={ing.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {ing.quantity && <strong>{formatQuantity(ing.quantity)}</strong>}
                    {ing.unit && ` ${ing.unit}`}
                    {' '}{ing.name}
                    {ing.notes && <span className="text-slate-400"> ({ing.notes})</span>}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions && (
          <section>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">
              Instructions
            </h2>
            <Card className="p-4">
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {recipe.instructions}
              </div>
            </Card>
          </section>
        )}

        {/* CTA */}
        <Card variant="elevated" className="p-4 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {session ? 'Save this recipe to your collection' : 'Sign up to save recipes, plan meals, and build shopping lists'}
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate(session ? '/recipes' : '/')}
          >
            {session ? 'Save to My Recipes' : 'Get Started Free'}
          </Button>
        </Card>
      </div>
    </div>
  )
}
