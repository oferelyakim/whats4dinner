import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, BookOpen, Clock, Users as UsersIcon, PenLine, Package, Camera, Sparkles, ArrowLeft } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { getRecipes } from '@/services/recipes'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/cn'
import { SkeletonList } from '@/components/ui/Skeleton'
import { SpeedDial } from '@/components/ui/SpeedDial'
import { useAIAccess } from '@/hooks/useAIAccess'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import type { Recipe } from '@/types'

export function RecipesPage() {
  const navigate = useNavigate()
  const { activeCircle } = useAppStore()
  const { t } = useI18n()
  const ai = useAIAccess()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [viewType, setViewType] = useState<'recipe' | 'supply_kit'>(
    searchParams.get('view') === 'essentials' ? 'supply_kit' : 'recipe'
  )

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
  })

  const recipes = allItems.filter((r: Recipe) => (r.type || 'recipe') === viewType)

  // Multi-word search: "carrot chicken" matches recipes containing both words
  // in title, tags, or ingredient names
  const filtered = search
    ? (() => {
        const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
        return recipes.filter((r: Recipe) => {
          const searchable = [
            r.title.toLowerCase(),
            ...(r.tags ?? []).map((t: string) => t.toLowerCase()),
            ...(r.ingredients ?? []).map((i) => i.name.toLowerCase()),
            r.description?.toLowerCase() ?? '',
          ].join(' ')
          return terms.every((term) => searchable.includes(term))
        })
      })()
    : recipes

  return (
    <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">
          {viewType === 'recipe' ? t('nav.recipes') : t('essentials.essentials')}
        </h2>
      </div>

      {/* Type toggle */}
      <div className="flex gap-1 bg-slate-100 dark:bg-surface-dark-elevated rounded-lg p-0.5">
        <button
          onClick={() => setViewType('recipe')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors',
            viewType === 'recipe'
              ? 'bg-white dark:bg-surface-dark-overlay text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500'
          )}
        >
          <BookOpen className="h-4 w-4" />
          {t('nav.recipes')}
        </button>
        <button
          onClick={() => setViewType('supply_kit')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors',
            viewType === 'supply_kit'
              ? 'bg-white dark:bg-surface-dark-overlay text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500'
          )}
        >
          <Package className="h-4 w-4" />
          {t('essentials.essentials')}
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder={t('recipe.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white dark:bg-surface-dark-elevated border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        />
      </div>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={viewType === 'recipe' ? <BookOpen className="h-12 w-12" /> : <Package className="h-12 w-12" />}
          title={search ? 'Nothing found' : viewType === 'recipe' ? t('recipe.noRecipes') : t('essentials.noEssentials')}
          description={
            search
              ? 'Try a different search term'
              : viewType === 'recipe'
                ? t('recipe.addFirst')
                : t('essentials.addFirst')
          }
          action={
            !search ? (
              <Button onClick={() => navigate(viewType === 'recipe' ? '/recipes/new' : '/recipes/new-kit')}>
                <Plus className="h-4 w-4" />
                {viewType === 'recipe' ? t('action.addRecipe') : t('essentials.newEssentials')}
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
              <div className="flex items-start gap-3">
                {viewType === 'supply_kit' && (
                  <Package className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {recipe.title}
                  </h3>
                  {recipe.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {recipe.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {viewType === 'recipe' && (recipe.prep_time_min || recipe.cook_time_min) && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {(recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)} min
                      </span>
                    )}
                    {viewType === 'recipe' && recipe.servings && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <UsersIcon className="h-3 w-3" />
                        {recipe.servings}
                      </span>
                    )}
                    {recipe.kit_category && (
                      <span className="text-xs text-brand-400">{recipe.kit_category}</span>
                    )}
                    {recipe.ingredients && (
                      <span className="text-xs text-slate-400">
                        {recipe.ingredients.length} items
                      </span>
                    )}
                  </div>
                </div>
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

      {/* FAB */}
      {viewType === 'recipe' ? (
        <>
          <SpeedDial
            items={[
              { icon: Sparkles, label: t('recipe.importUrl'), onClick: () => { if (ai.checkAIAccess()) navigate('/recipes/import') }, color: '#3b82f6' },
              { icon: Camera, label: t('recipe.importPhoto'), onClick: () => { if (ai.checkAIAccess()) navigate('/recipes/import') }, color: '#8b5cf6' },
              { icon: PenLine, label: t('recipe.writeManually'), onClick: () => navigate('/recipes/new'), color: '#f97316' },
            ]}
          />
          <AIUpgradeModal
            open={ai.showUpgradeModal}
            onOpenChange={ai.setShowUpgradeModal}
            isLimitReached={ai.isLimitReached}
          />
        </>
      ) : (
        <div className="fixed bottom-20 end-4 z-50">
          <button
            onClick={() => navigate('/recipes/new-kit')}
            className="h-14 w-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  )
}
