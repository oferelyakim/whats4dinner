import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import {
  REVIEW_STORE_URL,
  dismissReviewPrompt,
  getReviewPromptOpen,
  subscribeReviewPrompt,
} from '@/lib/reviewPrompt'

export function ReviewPrompt() {
  const { t } = useI18n()
  const [open, setOpen] = useState(getReviewPromptOpen())

  useEffect(() => {
    return subscribeReviewPrompt(() => setOpen(getReviewPromptOpen()))
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) dismissReviewPrompt(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-6 max-w-lg mx-auto">
          <Dialog.Title className="text-lg font-bold text-rp-ink mb-2">{t('review.title')}</Dialog.Title>
          <p className="text-sm text-rp-ink-soft mb-4">{t('review.body')}</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => dismissReviewPrompt(false)}>
              {t('review.notNow')}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                window.open(REVIEW_STORE_URL, '_blank', 'noopener,noreferrer')
                dismissReviewPrompt(true)
              }}
            >
              {t('review.cta')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
