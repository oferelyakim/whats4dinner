import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Slot } from '../types'
import { getEngine } from '../MealPlanEngine'

export function useSlot(slotId: string | null | undefined): Slot | null {
  const [slot, setSlot] = useState<Slot | null>(null)

  useEffect(() => {
    if (!slotId) {
      setSlot(null)
      return
    }
    let cancelled = false
    db.slots.get(slotId).then((s) => {
      if (!cancelled) setSlot(s ?? null)
    })
    const engine = getEngine()
    const off = engine.bus.on('slot:updated', (payload) => {
      if (payload.id === slotId) setSlot(payload)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [slotId])

  return slot
}
