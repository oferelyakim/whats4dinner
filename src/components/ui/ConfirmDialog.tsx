import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** i18n-resolved title string */
  title: string
  /** i18n-resolved description string (optional) */
  description?: string
  /** Label for the confirm button. Defaults to 'Delete'. */
  confirmLabel?: string
  /** Label for the cancel button. Defaults to 'Cancel'. */
  cancelLabel?: string
  /**
   * When true (default), the confirm button renders in red destructive style.
   * Pass false for neutral confirmations.
   */
  destructive?: boolean
  /** Called when the user clicks the confirm button. May return a Promise. */
  onConfirm: () => Promise<void> | void
}

/**
 * Reusable confirm dialog (v2.1 primitive).
 *
 * - Uses @radix-ui/react-dialog for accessibility + portal.
 * - Bottom sheet on mobile, centered modal on sm+.
 * - Tokens: bg-rp-card / text-rp-ink / border-rp-hairline only.
 *   Never dark:bg-surface-dark-* (clashes with skin system).
 * - Shows a loading spinner on the confirm button while onConfirm is pending.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    if (isPending) return
    setIsPending(true)
    try {
      await onConfirm()
    } finally {
      setIsPending(false)
      onOpenChange(false)
    }
  }

  const handleOpenChange = (value: boolean) => {
    if (isPending) return
    onOpenChange(value)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        {/* Bottom sheet on mobile, centered card on sm+ */}
        <Dialog.Content
          className={cn(
            'fixed z-50 bg-rp-card',
            // Mobile: full-width bottom sheet
            'bottom-0 start-0 end-0 rounded-t-3xl p-6',
            // sm+: centered modal
            'sm:bottom-auto sm:top-1/2 sm:start-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-2xl sm:w-full sm:max-w-sm',
          )}
        >
          {/* Drag handle — mobile only */}
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rp-hairline sm:hidden" />

          <Dialog.Title className="text-base font-semibold text-rp-ink mb-1">
            {title}
          </Dialog.Title>

          {description && (
            <Dialog.Description className="text-sm text-rp-ink-soft mb-5">
              {description}
            </Dialog.Description>
          )}

          {!description && <div className="mb-5" />}

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
            <button
              onClick={() => void handleConfirm()}
              disabled={isPending}
              className={cn(
                'flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
                'flex items-center justify-center gap-2',
                destructive
                  ? 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300'
                  : 'bg-rp-brand hover:bg-rp-brand/90 text-white disabled:opacity-50',
              )}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
            <button
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-medium bg-rp-bg-soft text-rp-ink hover:bg-rp-bg transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
