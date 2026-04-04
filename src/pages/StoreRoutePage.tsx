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
import { ArrowLeft, GripVertical, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getStores, getStoreRoutes, updateRouteOrder } from '@/services/stores'
import type { StoreRoute } from '@/types'

export function StoreRoutePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: getStores,
  })
  const store = stores.find((s) => s.id === id)

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['store-routes', id],
    queryFn: () => getStoreRoutes(id!),
    enabled: !!id,
  })

  const [orderedDepts, setOrderedDepts] = useState<string[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (routes.length > 0) {
      setOrderedDepts(routes.map((r: StoreRoute) => r.department))
    }
  }, [routes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const saveMutation = useMutation({
    mutationFn: () => updateRouteOrder(id!, orderedDepts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-routes', id] })
      setHasChanges(false)
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = orderedDepts.indexOf(active.id as string)
    const newIndex = orderedDepts.indexOf(over.id as string)
    const newOrder = arrayMove(orderedDepts, oldIndex, newIndex)
    setOrderedDepts(newOrder)
    setHasChanges(true)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
            {store?.name ?? 'Store'} Route
          </h2>
          <p className="text-xs text-slate-400">Drag to reorder departments</p>
        </div>
        {hasChanges && (
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Arrange departments in the order you walk through this store. Your shopping list will sort items to match.
      </p>

      {/* Sortable department list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedDepts} strategy={verticalListSortingStrategy}>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {orderedDepts.map((dept, index) => (
              <SortableDepartment key={dept} id={dept} index={index} />
            ))}
          </Card>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableDepartment({ id, index }: { id: string; index: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-3 bg-white dark:bg-surface-dark-elevated"
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing p-1"
      >
        <GripVertical className="h-5 w-5 text-slate-300 dark:text-slate-600" />
      </button>
      <span className="text-xs font-mono text-slate-400 w-5 text-right">{index + 1}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200">{id}</span>
    </div>
  )
}
