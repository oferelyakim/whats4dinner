import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ShoppingCart, CalendarDays, Users, Plus, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/cn'
import { getShoppingLists } from '@/services/shoppingLists'
import { getRecipes } from '@/services/recipes'

const QUICK_ACTIONS = [
  { icon: ShoppingCart, label: 'New List', path: '/lists/new', color: 'text-emerald-500' },
  { icon: BookOpen, label: 'Add Recipe', path: '/recipes/new', color: 'text-blue-500' },
  { icon: CalendarDays, label: 'Plan Week', path: '/plan', color: 'text-purple-500' },
  { icon: Users, label: 'My Circles', path: '/more/circles', color: 'text-brand-500' },
]

export function HomePage() {
  const navigate = useNavigate()
  const { profile, activeCircle } = useAppStore()

  const { data: lists = [] } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', activeCircle?.id],
    queryFn: () => getRecipes(activeCircle?.id),
  })

  const activeLists = lists.filter((l) => l.status === 'active').slice(0, 3)
  const recentRecipes = recipes.slice(0, 3)
  const greeting = getGreeting()

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          {greeting}, {profile?.display_name?.split(' ')[0] ?? 'there'}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {activeCircle
            ? `Managing ${activeCircle.name}`
            : "Let's plan some meals"}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map(({ icon: Icon, label, path, color }) => (
          <Card
            key={path}
            variant="elevated"
            className="p-4 cursor-pointer active:scale-[0.97] transition-transform"
            onClick={() => navigate(path)}
          >
            <Icon className={cn('h-6 w-6 mb-2', color)} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
          </Card>
        ))}
      </div>

      {/* Active Shopping Lists */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Active Lists
          </h3>
          <button
            onClick={() => navigate('/lists')}
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {activeLists.length === 0 ? (
          <Card className="p-4 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/lists/new')}>
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-brand-500" />
              <p className="text-sm text-slate-500">Create your first shopping list</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeLists.map((list) => (
              <Card
                key={list.id}
                variant="elevated"
                className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/lists/${list.id}`)}
              >
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{list.name}</p>
                    <p className="text-xs text-slate-400">{list.item_count ?? 0} items</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent Recipes */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Recent Recipes
          </h3>
          <button
            onClick={() => navigate('/recipes')}
            className="text-brand-500 text-sm font-medium flex items-center gap-0.5"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {recentRecipes.length === 0 ? (
          <Card className="p-4 cursor-pointer active:scale-[0.98]" onClick={() => navigate('/recipes/new')}>
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-brand-500" />
              <p className="text-sm text-slate-500">Add your first recipe</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentRecipes.map((recipe) => (
              <Card
                key={recipe.id}
                className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/recipes/${recipe.id}`)}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{recipe.title}</p>
                    {recipe.tags?.length > 0 && (
                      <p className="text-xs text-slate-400 truncate">{recipe.tags.join(', ')}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
