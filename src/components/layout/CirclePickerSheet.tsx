import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Settings } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { getMyCircles } from '@/services/circles'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'

interface CirclePickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CirclePickerSheet({ open, onOpenChange }: CirclePickerSheetProps) {
  const navigate = useNavigate()
  const { activeCircle, setActiveCircle } = useAppStore()
  const { t } = useI18n()

  const { data: circles = [] } = useQuery({
    queryKey: ['circles'],
    queryFn: getMyCircles,
    enabled: open,
  })

  function handleSelect(circle: typeof circles[0]) {
    setActiveCircle(circle)
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-5 max-w-lg mx-auto animate-page-enter max-h-[70vh] overflow-y-auto" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-4" />
          <Dialog.Title className="text-base font-bold text-rp-ink mb-3">
            {t('circle.switchCircle')}
          </Dialog.Title>

          {circles.length === 0 ? (
            <p className="text-sm text-rp-ink-mute py-4 text-center">
              {t('circle.noCircles')}
            </p>
          ) : (
            <div className="space-y-1">
              {circles.map((circle) => {
                const isActive = activeCircle?.id === circle.id
                return (
                  <button
                    key={circle.id}
                    onClick={() => handleSelect(circle)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors',
                      'active:scale-[0.98] transition-transform',
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-surface-dark-overlay'
                    )}
                  >
                    <span className="text-xl">{circle.icon}</span>
                    <span className={cn(
                      'flex-1 text-sm font-medium truncate',
                      isActive
                        ? 'text-brand-600 dark:text-brand-300'
                        : 'text-rp-ink'
                    )}>
                      {circle.name}
                    </span>
                    {isActive && (
                      <Check className="h-4 w-4 text-brand-500 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <button
            onClick={() => {
              onOpenChange(false)
              navigate('/profile/circles')
            }}
            className="w-full flex items-center justify-center gap-2 mt-4 pt-3 py-3 border-t border-rp-hairline text-sm text-rp-ink-mute hover:text-brand-500 dark:hover:text-brand-300 transition-colors min-h-[44px]"
          >
            <Settings className="h-3.5 w-3.5" />
            {t('circle.manageCircles')}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
