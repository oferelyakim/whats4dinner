import type { Slot, MealView, PlanView, ErrorStage } from './types'

export interface EngineErrorPayload {
  slotId: string
  stage: ErrorStage
  message: string
  durationMs: number
}

export type EngineEvents = {
  'slot:updated': Slot
  'meal:updated': MealView
  'plan:updated': PlanView
  error: EngineErrorPayload
}

type Handler<T> = (payload: T) => void

export class EventBus {
  private listeners = new Map<keyof EngineEvents, Set<Handler<unknown>>>()

  on<K extends keyof EngineEvents>(event: K, handler: Handler<EngineEvents[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    const set = this.listeners.get(event)!
    set.add(handler as Handler<unknown>)
    return () => set.delete(handler as Handler<unknown>)
  }

  emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]) {
    this.listeners.get(event)?.forEach((h) => {
      try {
        ;(h as Handler<EngineEvents[K]>)(payload)
      } catch (err) {
        console.error('[EventBus] handler error', event, err)
      }
    })
  }
}
