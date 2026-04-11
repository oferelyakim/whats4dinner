import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, ShoppingCart, ChevronRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { getShoppingLists } from '@/services/shoppingLists'
import { useI18n } from '@/lib/i18n'

export function ListsPage() {
  const navigate = useNavigate()
  const { t } = useI18n()

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
  })

  const activeLists = lists.filter((l) => l.status === 'active')
  const completedLists = lists.filter((l) => l.status !== 'active')

  return (
    <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">{t('list.shoppingLists')}</h2>
        <Button size="sm" onClick={() => navigate('/lists/new')}>
          <Plus className="h-4 w-4" />
          {t('list.newList')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-12 w-12" />}
          title={t('list.noLists')}
          description="Create a list and add items from your recipes or manually"
          action={
            <Button onClick={() => navigate('/lists/new')}>
              <Plus className="h-4 w-4" />
              {t('list.createList')}
            </Button>
          }
        />
      ) : (
        <>
          {activeLists.length > 0 && (
            <div className="space-y-2">
              {activeLists.map((list) => (
                <Card
                  key={list.id}
                  variant="elevated"
                  className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => navigate(`/lists/${list.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="h-5 w-5 text-brand-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {list.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {list.item_count ?? 0} items
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 rtl-flip" />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {completedLists.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                Completed
              </p>
              <div className="space-y-2 opacity-60">
                {completedLists.map((list) => (
                  <Card
                    key={list.id}
                    className="p-3 cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => navigate(`/lists/${list.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="h-4 w-4 text-slate-400 shrink-0" />
                      <p className="text-sm text-slate-500 truncate flex-1">{list.name}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
