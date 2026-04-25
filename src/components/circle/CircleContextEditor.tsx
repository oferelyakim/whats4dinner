import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { updateCircleContext } from '@/services/circles'
import { useToast } from '@/components/ui/Toast'
import type { Circle, CircleContext } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  circle: Circle
}

const DIET_OPTIONS: { value: string; labelKey: string; emoji: string }[] = [
  { value: 'vegetarian', labelKey: 'diet.vegetarian', emoji: '🥗' },
  { value: 'vegan', labelKey: 'diet.vegan', emoji: '🌱' },
  { value: 'pescatarian', labelKey: 'diet.pescatarian', emoji: '🐟' },
  { value: 'kosher', labelKey: 'diet.kosher', emoji: '✡️' },
  { value: 'halal', labelKey: 'diet.halal', emoji: '☪️' },
  { value: 'gluten-free', labelKey: 'diet.glutenFree', emoji: '🌾' },
  { value: 'dairy-free', labelKey: 'diet.dairyFree', emoji: '🥛' },
  { value: 'nut-free', labelKey: 'diet.nutFree', emoji: '🥜' },
  { value: 'low-carb', labelKey: 'diet.lowCarb', emoji: '🥩' },
]

export function CircleContextEditor({ open, onOpenChange, circle }: Props) {
  const { t } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()

  const initialContext = (circle.context ?? {}) as CircleContext
  const [purpose, setPurpose] = useState(circle.purpose ?? '')
  const [diet, setDiet] = useState<string[]>(initialContext.diet ?? [])
  const [notes, setNotes] = useState(typeof initialContext.notes === 'string' ? initialContext.notes : '')

  function toggleDiet(value: string) {
    setDiet((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const next: CircleContext = {
        ...initialContext,
        diet: diet.length ? diet : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      }
      return updateCircleContext(circle.id, {
        purpose: purpose.trim() ? purpose.trim() : null,
        context: next,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles'] })
      toast.success(t('common.saved'))
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-2xl p-6 max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-bold text-rp-ink mb-1">{t('circle.context.editTitle')}</Dialog.Title>
          <p className="text-xs text-rp-ink-mute mb-4">{t('circle.context.editDesc')}</p>

          <div className="space-y-4">
            <Input
              label={t('circle.context.purpose')}
              placeholder={t('circle.context.purposePh')}
              value={purpose}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPurpose(e.target.value)}
            />

            <div>
              <label className="block mb-2 text-sm font-medium text-rp-ink-soft">{t('circle.context.dietLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {DIET_OPTIONS.map((opt) => {
                  const active = diet.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleDiet(opt.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                        active
                          ? 'bg-rp-brand text-white border-rp-brand'
                          : 'bg-rp-card text-rp-ink border-rp-hairline hover:border-rp-brand/50',
                      )}
                    >
                      <span className="me-1">{opt.emoji}</span>
                      {t(opt.labelKey)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block mb-1.5 text-sm font-medium text-rp-ink-soft">{t('circle.context.notesLabel')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={t('circle.context.notesPh')}
                className="w-full rounded-lg border border-rp-hairline bg-rp-bg px-3 py-2 text-sm text-rp-ink resize-none focus:outline-none focus:ring-2 focus:ring-rp-brand/40"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
