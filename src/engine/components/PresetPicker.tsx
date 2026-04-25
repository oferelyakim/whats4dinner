import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { getEngine } from '../MealPlanEngine'
import type { Preset } from '../types'
import { Button } from '@/components/ui/Button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: 'meal' | 'day'
  onPick: (presetId: string) => void
}

export function PresetPicker({ open, onOpenChange, scope, onPick }: Props) {
  const [presets, setPresets] = useState<Preset[]>([])
  useEffect(() => {
    if (!open) return
    void getEngine().listPresets(scope).then(setPresets)
  }, [open, scope])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-x-4 top-[10%] z-50 bg-rp-card rounded-2xl p-5 shadow-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md max-h-[80vh] overflow-y-auto">
          <Dialog.Title className="text-base font-bold text-rp-ink mb-3">
            Apply preset {scope === 'day' ? '(day shape)' : '(meal shape)'}
          </Dialog.Title>
          <div className="space-y-1.5">
            {presets.map((p) => {
              const slotCount =
                scope === 'meal'
                  ? p.slots?.length ?? 0
                  : p.mealShapes?.reduce((n, m) => n + m.slots.length, 0) ?? 0
              const meta =
                scope === 'meal'
                  ? `${slotCount} slot${slotCount === 1 ? '' : 's'}`
                  : `${p.mealShapes?.length ?? 0} meals · ${slotCount} slots`
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onPick(p.id)
                    onOpenChange(false)
                  }}
                  className="w-full text-start p-3 rounded-xl bg-rp-bg-soft hover:bg-rp-hairline/40 transition-colors"
                >
                  <div className="text-sm font-medium text-rp-ink">{p.name}</div>
                  <div className="text-[11px] text-rp-ink-mute">
                    {p.source === 'system' ? 'Built-in' : 'Saved'} · {meta}
                  </div>
                </button>
              )
            })}
            {presets.length === 0 && (
              <p className="text-sm text-rp-ink-mute text-center py-6">No presets yet.</p>
            )}
          </div>
          <Button variant="secondary" className="w-full mt-3" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
