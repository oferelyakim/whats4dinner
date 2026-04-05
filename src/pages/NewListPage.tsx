import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createShoppingList } from '@/services/shoppingLists'
import { getMyCircles } from '@/services/circles'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'

export function NewListPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const [name, setName] = useState('')
  const [selectedCircleId, setSelectedCircleId] = useState(activeCircle?.id ?? '')

  const { data: circles = [] } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
  })

  // Auto-select first circle if none active
  const circleId = selectedCircleId || circles[0]?.id || ''

  const createMutation = useMutation({
    mutationFn: () => createShoppingList(name.trim(), circleId),
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] })
      navigate(`/lists/${list.id}`)
    },
  })

  return (
    <div className="px-4 py-4 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('list.newList')}</h2>
      </div>

      <div className="space-y-4">
        <Input
          label="List Name"
          placeholder="e.g., Weekend Groceries"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          required
        />

        {circles.length > 1 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Circle
            </label>
            <select
              value={circleId}
              onChange={(e) => setSelectedCircleId(e.target.value)}
              className="w-full rounded-xl border px-4 py-2.5 text-sm bg-white dark:bg-surface-dark-elevated border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {circles.length === 0 && (
          <p className="text-sm text-warning bg-warning/10 rounded-lg px-3 py-2">
            You need to create a circle first. Shopping lists are shared within circles.
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="flex-1"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || !circleId || createMutation.isPending}
          >
            {createMutation.isPending ? t('common.loading') : t('list.createList')}
          </Button>
        </div>
      </div>
    </div>
  )
}
