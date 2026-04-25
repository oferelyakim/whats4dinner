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
import { getMyCircles, joinCircleByInviteCode } from '@/services/circles'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { CircleSetupWizard } from '@/components/circle/CircleSetupWizard'
import type { Circle } from '@/types'

export function CirclesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeCircle, setActiveCircle } = useAppStore()
  const { t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: circles = [], isLoading } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
  })

  function handleCreated(circle: Circle | null) {
    if (circle) {
      queryClient.invalidateQueries({ queryKey: ['circles'] })
      setActiveCircle(circle)
    }
    setShowCreate(false)
  }

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
    <div className="px-4 sm:px-6 py-4 space-y-4 animate-page-enter">
      <div className="flex items-center justify-between">
        <h2 className="font-display italic tracking-rp-tight text-[26px] text-rp-ink">{t('circle.myCircles')}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setShowJoin(true); setError('') }}>
            <Link2 className="h-4 w-4" />
            {t('circle.join')}
          </Button>
          <Button size="sm" onClick={() => { setShowCreate(true); setError('') }}>
            <Plus className="h-4 w-4" />
            {t('common.create')}
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
          title={t('circle.noCircles')}
          description={t('circle.noCirclesDesc')}
          action={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('circle.create')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {circles.map((circle) => {
            const isActive = activeCircle?.id === circle.id
            return (
              <Card
                key={circle.id}
                variant={isActive ? 'elevated' : 'default'}
                className={cn(
                  'p-4 cursor-pointer active:scale-[0.98] transition-all',
                  isActive && 'ring-2 ring-brand-500',
                )}
                onClick={() => {
                  setActiveCircle(circle)
                  navigate(`/more/circles/${circle.id}`)
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{circle.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-rp-ink truncate">
                      {circle.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {isActive ? t('circle.activeCircle') : t('circle.tapToSelect')}
                    </p>
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 text-brand-500 shrink-0" />
                  )}
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
            )
          })}
        </div>
      )}

      {/* Create Circle — full wizard */}
      <Dialog.Root open={showCreate} onOpenChange={setShowCreate}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed inset-0 z-50 bg-rp-bg overflow-hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{t('circle.create')}</Dialog.Title>
            <CircleSetupWizard
              variant="optional"
              onDone={handleCreated}
              onClose={() => setShowCreate(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Join Circle Dialog */}
      <Dialog.Root open={showJoin} onOpenChange={setShowJoin}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-rp-ink mb-4">
              {t('circle.join')}
            </Dialog.Title>
            <div className="space-y-4">
              <Input
                label={t('circle.inviteCode')}
                placeholder={t('circle.inviteCodePlaceholder')}
                value={inviteCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteCode(e.target.value)}
              />
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowJoin(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => joinMutation.mutate()}
                  disabled={!inviteCode.trim() || joinMutation.isPending}
                >
                  {joinMutation.isPending ? t('common.loading') : t('circle.join')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
