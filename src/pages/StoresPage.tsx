import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Store as StoreIcon, MapPin, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { getStores, createStore } from '@/services/stores'
import { useAppStore } from '@/stores/appStore'

export function StoresPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: getStores,
  })

  const createMutation = useMutation({
    mutationFn: () => createStore(name.trim(), address.trim(), activeCircle?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      setShowCreate(false)
      setName('')
      setAddress('')
    },
  })

  return (
    <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400 rtl-flip" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1">My Stores</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon className="h-12 w-12" />}
          title="No stores yet"
          description="Add your favorite stores and customize the aisle order for faster shopping"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Add Store
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {stores.map((store) => (
            <Card
              key={store.id}
              variant="elevated"
              className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => navigate(`/food/stores/${store.id}`)}
            >
              <div className="flex items-center gap-3">
                <StoreIcon className="h-5 w-5 text-brand-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{store.name}</p>
                  {store.address && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3" />
                      {store.address}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Store Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Add Store
            </Dialog.Title>
            <div className="space-y-4">
              <Input
                label="Store Name"
                placeholder="e.g., Whole Foods Market"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              />
              <Input
                label="Address (optional)"
                placeholder="123 Main St"
                value={address}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
              />
              <p className="text-xs text-slate-400">
                Default department order will be added. You can customize the aisle order after creating.
              </p>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => createMutation.mutate()}
                  disabled={!name.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Add Store'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
