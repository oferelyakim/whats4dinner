import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, Plus, Trash2, Square, CheckSquare, ShoppingCart, Share2, Check, UserPlus, GripVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { getShoppingList, addListItem, toggleListItem, removeListItem, shareListWithUser, deleteShoppingList } from '@/services/shoppingLists'
import { getStores, getStoreRoutes } from '@/services/stores'
import { getCircleMembers } from '@/services/circles'
import { supabase } from '@/services/supabase'
import type { ShoppingListItem } from '@/types'
import { DEPARTMENTS, type Department } from '@/lib/constants'
import { useI18n } from '@/lib/i18n'

export function ShoppingListPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()

  const [showAdd, setShowAdd] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showDeleteList, setShowDeleteList] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<Department>('Other')
  const [sortBy, setSortBy] = useState<'default' | 'department' | 'route'>('default')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [sharedUsers, setSharedUsers] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['shopping-list', id],
    queryFn: () => getShoppingList(id!),
    enabled: !!id,
  })

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: getStores,
  })

  const { data: storeRoutes = [] } = useQuery({
    queryKey: ['store-routes', selectedStoreId],
    queryFn: () => getStoreRoutes(selectedStoreId),
    enabled: !!selectedStoreId && sortBy === 'route',
  })

  const { data: members = [] } = useQuery({
    queryKey: ['circle-members', data?.circle_id],
    queryFn: () => getCircleMembers(data!.circle_id),
    enabled: showShare && !!data?.circle_id,
  })

  // Real-time subscription for list items
  useEffect(() => {
    if (!id) return

    const channel = supabase
      .channel(`list-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `list_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['shopping-list', id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, queryClient])

  const [mutationError, setMutationError] = useState('')

  const addMutation = useMutation({
    mutationFn: () =>
      addListItem(id!, {
        name: newItemName.trim(),
        quantity: newItemQty ? parseFloat(newItemQty) : undefined,
        category: newItemCategory,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shopping-list', id] })
      setNewItemName('')
      setNewItemQty('')
      setNewItemCategory('Other')
      setShowAdd(false)
      setMutationError('')
    },
    onError: (err: Error) => setMutationError(err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      toggleListItem(itemId, checked),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ['shopping-list', id] })
      queryClient.setQueryData(['shopping-list', id], (old: typeof data) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((item: ShoppingListItem) =>
            item.id === itemId ? { ...item, is_checked: checked } : item
          ),
        }
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', id] })
    },
    onError: (err: Error) => setMutationError(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removeListItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', id] })
    },
    onError: (err: Error) => setMutationError(err.message),
  })

  const deleteListMutation = useMutation({
    mutationFn: () => deleteShoppingList(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      navigate('/lists')
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !data) return

    const uncheckedItems = items.filter((i) => !i.is_checked)
    const oldIndex = uncheckedItems.findIndex((i) => i.id === active.id)
    const newIndex = uncheckedItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(uncheckedItems, oldIndex, newIndex)

    // Optimistic update
    queryClient.setQueryData(['shopping-list', id], {
      ...data,
      items: [...reordered, ...items.filter((i) => i.is_checked)],
    })

    // Persist sort order
    const updates = reordered.map((item, i) =>
      supabase.from('shopping_list_items').update({ sort_order: i }).eq('id', item.id)
    )
    Promise.all(updates)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated mb-4">
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <p className="text-center text-slate-500">List not found</p>
      </div>
    )
  }

  const items = data.items ?? []
  const unchecked = items.filter((i) => !i.is_checked)
  const checked = items.filter((i) => i.is_checked)

  // Build route order map for store-based sorting
  const routeOrderMap = storeRoutes.reduce<Record<string, number>>((acc, r, i) => {
    acc[r.department] = i
    return acc
  }, {})

  // Sort unchecked items
  const sortedUnchecked =
    sortBy === 'route' && storeRoutes.length > 0
      ? [...unchecked].sort((a, b) => {
          const aOrder = routeOrderMap[a.category] ?? 999
          const bOrder = routeOrderMap[b.category] ?? 999
          return aOrder - bOrder
        })
      : sortBy === 'department'
        ? [...unchecked].sort((a, b) => a.category.localeCompare(b.category))
        : unchecked

  // Group by department for display
  const grouped =
    sortBy === 'department' || (sortBy === 'route' && storeRoutes.length > 0)
      ? sortedUnchecked.reduce<Record<string, ShoppingListItem[]>>((acc, item) => {
          const cat = item.category || 'Other'
          if (!acc[cat]) acc[cat] = []
          acc[cat].push(item)
          return acc
        }, {})
      : null

  const totalCount = items.length
  const checkedCount = checked.length

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/lists')}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
            {data.name}
          </h2>
          <p className="text-xs text-slate-400">
            {checkedCount}/{totalCount} {t('list.itemsDone')}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowDeleteList(true)}>
          <Trash2 className="h-4 w-4 text-slate-400" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowShare(true)}>
          <Share2 className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          {t('list.addItem')}
        </Button>
      </div>

      {/* Error banner */}
      {mutationError && (
        <button
          onClick={() => setMutationError('')}
          className="w-full text-left text-sm text-danger bg-danger/10 rounded-lg px-3 py-2"
        >
          {mutationError} (tap to dismiss)
        </button>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-slate-200 dark:bg-surface-dark-overlay rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all duration-300"
            style={{ width: `${(checkedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Sort toggle */}
      {unchecked.length > 1 && (
        <div className="space-y-2">
          <div className="flex gap-1 bg-slate-100 dark:bg-surface-dark-elevated rounded-lg p-0.5">
            {(['default', 'department', 'route'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortBy(mode)}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                  sortBy === mode
                    ? 'bg-white dark:bg-surface-dark-overlay text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                )}
              >
                {mode === 'default' ? 'Added' : mode === 'department' ? 'Dept' : 'Route'}
              </button>
            ))}
          </div>
          {sortBy === 'route' && stores.length > 0 && (
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full text-xs bg-white dark:bg-surface-dark-elevated border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300"
            >
              <option value="">Select a store...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {sortBy === 'route' && stores.length === 0 && (
            <p className="text-xs text-slate-400 text-center">
              Add a store in More &gt; My Stores to sort by route
            </p>
          )}
        </div>
      )}

      {/* Items */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <ShoppingCart className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-400">{t('list.noItems')}</p>
          <p className="text-xs text-slate-400 mt-1">Tap "Add" or add items from a recipe</p>
        </div>
      ) : (
        <>
          {/* Unchecked items */}
          {grouped ? (
            // Grouped by department
            Object.entries(grouped).map(([dept, deptItems]) => (
              <div key={dept}>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 px-1">
                  {dept}
                </p>
                <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                  {deptItems.map((item) => (
                    <div key={item.id} className="px-3 py-2.5">
                      <ListItemRow
                        item={item}
                        onToggle={() => toggleMutation.mutate({ itemId: item.id, checked: true })}
                        onRemove={() => removeMutation.mutate(item.id)}
                      />
                    </div>
                  ))}
                </Card>
              </div>
            ))
          ) : (
            // Flat list with drag-and-drop
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedUnchecked.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedUnchecked.map((item) => (
                    <SortableListItem
                      key={item.id}
                      item={item}
                      onToggle={() => toggleMutation.mutate({ itemId: item.id, checked: true })}
                      onRemove={() => removeMutation.mutate(item.id)}
                    />
                  ))}
                </Card>
              </SortableContext>
            </DndContext>
          )}

          {/* Checked items */}
          {checked.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 px-1">
                Done ({checked.length})
              </p>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800 opacity-60">
                {checked.map((item) => (
                  <div key={item.id} className="px-3 py-2.5">
                    <ListItemRow
                      item={item}
                      onToggle={() => toggleMutation.mutate({ itemId: item.id, checked: false })}
                      onRemove={() => removeMutation.mutate(item.id)}
                    />
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}

      {/* Quick Add bar (fixed at bottom above nav) */}
      {showAdd && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pb-2">
          <Card variant="elevated" className="p-3 shadow-lg border-brand-500/30">
            <div className="flex gap-2 mb-2">
              <input
                autoFocus
                placeholder="Item name..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemName.trim()) addMutation.mutate()
                }}
                className="flex-1 text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 pb-1 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
              />
              <input
                placeholder="Qty"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                className="w-14 text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 pb-1 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 text-center"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value as Department)}
                className="flex-1 text-xs bg-white dark:bg-surface-dark-overlay border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={!newItemName.trim() || addMutation.isPending}
              >
                {addMutation.isPending ? '...' : t('list.addItem')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Share Dialog */}
      <Dialog.Root open={showShare} onOpenChange={setShowShare}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {t('list.share')}
            </Dialog.Title>
            <p className="text-xs text-slate-400 mb-4">
              Circle members you share with can view and add items to this list.
            </p>
            <div className="space-y-1.5">
              {members
                .filter((m) => m.user_id !== data?.created_by)
                .map((member) => {
                  const isShared = sharedUsers.has(member.user_id)
                  return (
                    <button
                      key={member.user_id}
                      onClick={async () => {
                        await shareListWithUser(id!, member.user_id, 'edit')
                        setSharedUsers((prev) => new Set([...prev, member.user_id]))
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors"
                    >
                      <div className="h-9 w-9 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-sm shrink-0">
                        {member.profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {member.profile?.display_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {member.profile?.email || ''}
                        </p>
                      </div>
                      {isShared ? (
                        <Check className="h-5 w-5 text-success" />
                      ) : (
                        <UserPlus className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  )
                })}
              {members.filter((m) => m.user_id !== data?.created_by).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  No other members in this circle yet. Invite some first!
                </p>
              )}
            </div>
            <Button variant="secondary" className="w-full mt-4" onClick={() => setShowShare(false)}>
              {t('common.done')}
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete List Dialog */}
      <Dialog.Root open={showDeleteList} onOpenChange={setShowDeleteList}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {t('list.delete')}
            </Dialog.Title>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Are you sure you want to delete <strong>{data?.name}</strong> and all its items? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteList(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => deleteListMutation.mutate()} disabled={deleteListMutation.isPending}>
                {deleteListMutation.isPending ? t('common.loading') : t('common.delete')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function SortableListItem({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingListItem
  onToggle: () => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 px-2 py-2.5 group bg-white dark:bg-surface-dark-elevated">
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing p-1"
      >
        <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600" />
      </button>
      <ListItemRow item={item} onToggle={onToggle} onRemove={onRemove} />
    </div>
  )
}

function ListItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingListItem
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <button onClick={onToggle} className="shrink-0 active:scale-90 transition-transform">
        {item.is_checked ? (
          <CheckSquare className="h-5 w-5 text-success" />
        ) : (
          <Square className="h-5 w-5 text-slate-300 dark:text-slate-600" />
        )}
      </button>
      <div className="flex-1 min-w-0" onClick={onToggle}>
        <p
          className={cn(
            'text-sm transition-colors',
            item.is_checked
              ? 'line-through text-slate-400 dark:text-slate-500'
              : 'text-slate-800 dark:text-slate-200'
          )}
        >
          {item.quantity && (
            <span className="font-semibold">{item.quantity} </span>
          )}
          {item.unit && (
            <span className="text-slate-500">{item.unit} </span>
          )}
          {item.name}
        </p>
        {item.notes && item.notes.startsWith('From:') && (
          <p className="text-[10px] text-brand-400">{item.notes}</p>
        )}
        {item.category && item.category !== 'Other' && !item.notes?.startsWith('From:') && (
          <p className="text-[10px] text-slate-400">{item.category}</p>
        )}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-danger hover:bg-danger/10 active:text-danger active:bg-danger/10 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
