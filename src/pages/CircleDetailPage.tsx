import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, UserPlus, Copy, Check, Crown, Shield, User, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import * as Dialog from '@radix-ui/react-dialog'
import { getMyCircles, getCircleMembers, inviteByEmail, leaveCircle, deleteCircle } from '@/services/circles'
import { useAppStore } from '@/stores/appStore'
import type { CircleMember } from '@/types'

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
}

const ROLE_COLORS = {
  owner: 'text-yellow-500',
  admin: 'text-blue-500',
  member: 'text-slate-400',
}

export function CircleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showLeave, setShowLeave] = useState(false)
  const { activeCircle, setActiveCircle } = useAppStore()

  const { data: circles = [] } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
  })
  const circle = circles.find((c) => c.id === id)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['circle-members', id],
    queryFn: () => getCircleMembers(id!),
    enabled: !!id,
  })

  const inviteMutation = useMutation({
    mutationFn: () => inviteByEmail(id!, inviteEmail.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circle-members', id] })
      setShowInvite(false)
      setInviteEmail('')
      setError('')
    },
    onError: (err: Error) => setError(err.message),
  })

  const leaveMutation = useMutation({
    mutationFn: () => leaveCircle(id!),
    onSuccess: () => {
      if (activeCircle?.id === id) setActiveCircle(null)
      queryClient.invalidateQueries({ queryKey: ['circles'] })
      navigate('/more/circles')
    },
  })

  const deleteCircleMutation = useMutation({
    mutationFn: () => deleteCircle(id!),
    onSuccess: () => {
      if (activeCircle?.id === id) setActiveCircle(null)
      queryClient.invalidateQueries({ queryKey: ['circles'] })
      navigate('/more/circles')
    },
  })

  // Check if current user is owner
  const isOwner = circle?.created_by === members.find((m) => m.role === 'owner')?.user_id

  async function copyInviteCode() {
    if (!circle) return
    await navigator.clipboard.writeText(circle.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!circle) {
    return (
      <div className="px-4 py-4">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated mb-4">
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <p className="text-center text-slate-500">Circle not found</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-surface-dark-elevated active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
        <span className="text-2xl">{circle.icon}</span>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex-1 truncate">
          {circle.name}
        </h2>
      </div>

      {/* Invite code */}
      <Card className="p-4">
        <p className="text-xs text-slate-400 mb-2">Share this code to invite members</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-slate-100 dark:bg-surface-dark-overlay px-3 py-2 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300">
            {circle.invite_code}
          </code>
          <Button size="sm" variant="secondary" onClick={copyInviteCode}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      {/* Members */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Members ({members.length})
          </h3>
          <Button size="sm" onClick={() => { setShowInvite(true); setError('') }}>
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((member: CircleMember) => {
              const RoleIcon = ROLE_ICONS[member.role as keyof typeof ROLE_ICONS] || User
              const roleColor = ROLE_COLORS[member.role as keyof typeof ROLE_COLORS] || 'text-slate-400'
              const profile = member.profile

              return (
                <div key={member.user_id} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 font-bold text-sm shrink-0">
                    {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {profile?.display_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {profile?.email || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={`h-4 w-4 ${roleColor}`} />
                    <span className={`text-xs capitalize ${roleColor}`}>{member.role}</span>
                  </div>
                </div>
              )
            })}
          </Card>
        )}
      </section>

      {/* Invite Dialog */}
      <Dialog.Root open={showInvite} onOpenChange={setShowInvite}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              Invite Member
            </Dialog.Title>
            <div className="space-y-4">
              {/* Share invite link */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Share invite link
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-100 dark:bg-surface-dark-overlay px-3 py-2 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
                    {window.location.origin}/join/{circle.invite_code}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/join/${circle.invite_code}`)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                  >
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Anyone with this link can sign up and join. Share via text or WhatsApp.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400">or add by email</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* Add by email */}
              <Input
                label="Email address"
                type="email"
                placeholder="family@example.com"
                value={inviteEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteEmail(e.target.value)}
              />
              <p className="text-xs text-slate-400">
                If they already have an account, they'll be added instantly.
              </p>
              {error && (
                <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowInvite(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => inviteMutation.mutate()}
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? 'Adding...' : 'Add'}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Leave / Delete button */}
      <button
        onClick={() => setShowLeave(true)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-danger hover:bg-danger/10 rounded-xl transition-colors"
      >
        <LogOut className="h-4 w-4" />
        {isOwner ? 'Delete Circle' : 'Leave Circle'}
      </button>

      {/* Leave/Delete Confirmation */}
      <Dialog.Root open={showLeave} onOpenChange={setShowLeave}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-2xl p-6 max-w-lg mx-auto">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {isOwner ? 'Delete Circle' : 'Leave Circle'}
            </Dialog.Title>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {isOwner
                ? <>Are you sure you want to delete <strong>{circle.name}</strong>? All shared recipes, lists, and meal plans will be removed for all members. This cannot be undone.</>
                : <>Are you sure you want to leave <strong>{circle.name}</strong>? You'll lose access to shared recipes, lists, and meal plans.</>
              }
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowLeave(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => isOwner ? deleteCircleMutation.mutate() : leaveMutation.mutate()}
                disabled={leaveMutation.isPending || deleteCircleMutation.isPending}
              >
                {(leaveMutation.isPending || deleteCircleMutation.isPending) ? 'Please wait...' : isOwner ? 'Delete' : 'Leave'}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
