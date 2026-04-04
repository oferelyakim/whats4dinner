import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Link2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { getMyCircles, createCircle, joinCircleByInviteCode } from '@/services/circles'
import { useAppStore } from '@/stores/appStore'

const CIRCLE_ICONS = ['👨‍👩‍👧‍👦', '👪', '🏠', '❤️', '🍽️', '👫', '🫂', '✨']

export function CirclesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle, setActiveCircle } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('👨‍👩‍👧‍👦')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: circles = [], isLoading } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
  })

  const createMutation = useMutation({
    mutationFn: () => createCircle(newName.trim(), selectedIcon),
    onSuccess: (circle) => {
      queryClient.invalidateQueries({ queryKey: ['circles'] })
      setActiveCircle(circle)
      setShowCreate(false)
      setNewName('')
      setError('')
    },
    onError: (err: Error) => setError(err.message),
  })

  const joinMutation = useMutation({
    mutationFn: () => joinCircleByInviteCode(inviteCode),
    onSuccess: (circle) => {
      queryClient.invalidateQueries({ queryKey: ['circles'] })
      setActiveCircle(circle)
      setShowJoin(false)
      setInviteCode('')
      setError('')
    },
    onError: (err: Error) => setError(err.message),
  })


  async function copyInviteCode(code: string, id: string) {
    await navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Circles</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setShowJoin(true); setError('') }}>
            <Link2 className="h-4 w-4" />
            Join
          </Button>
          <Button size="sm" onClick={() => { setShowCreate(true); setError('') }}>
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : circles.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No circles yet"
          description="Create a circle for your family or join one with an invite code"
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Create Circle
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {circles.map((circle) => (
            <Card
              key={circle.id}
              variant={activeCircle?.id === circle.id ? 'elevated' : 'default'}
              className={cn(
                'p-4 cursor-pointer active:scale-[0.98] transition-all',
                activeCircle?.id === circle.id && 'ring-2 ring-brand-500'
              )}
              onClick={() => navigate(`/more/circles/${circle.id}`)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{circle.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {circle.name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    Tap to manage members
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyInviteCode(circle.invite_code, circle.id)
                  }}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay transition-colors"
                >
                  {copiedId === circle.id ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Circle Dialog */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Create Circle
            </Dialog.Title>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Choose an icon
                </label>
                <div className="flex gap-2 flex-wrap">
                  {CIRCLE_ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setSelectedIcon(icon)}
                      className={cn(
                        'h-10 w-10 rounded-xl flex items-center justify-center text-xl transition-all',
                        selectedIcon === icon
                          ? 'bg-brand-500/20 ring-2 ring-brand-500 scale-110'
                          : 'bg-slate-100 dark:bg-surface-dark-overlay hover:bg-slate-200 dark:hover:bg-slate-600'
                      )}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="Circle Name"
                placeholder="e.g., The Elyakims"
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              />
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => createMutation.mutate()}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Join Circle Dialog */}
      <Dialog.Root open={showJoin} onOpenChange={setShowJoin}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Join Circle
            </Dialog.Title>
            <div className="space-y-4">
              <Input
                label="Invite Code"
                placeholder="Paste the invite code"
                value={inviteCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteCode(e.target.value)}
              />
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowJoin(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => joinMutation.mutate()}
                  disabled={!inviteCode.trim() || joinMutation.isPending}
                >
                  {joinMutation.isPending ? 'Joining...' : 'Join'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
