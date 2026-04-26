// Event Planner v2 — event bus.
//
// Same shape as src/engine/events.ts (the meal-plan one). Kept separate so
// the two engines never accidentally share state or types.

import type { DraftPlan, PlannerState } from './types'

export type EngineEventPayload = {
  state: PlannerState
  'next-question': { questionId: string | null; remaining: number }
  plan: DraftPlan
  error: { stage: 'intake' | 'propose' | 'revise' | 'apply'; message: string }
}

type Handler<T> = (payload: T) => void

export class PlannerBus {
  private listeners = new Map<keyof EngineEventPayload, Set<Handler<unknown>>>()

  on<K extends keyof EngineEventPayload>(
    event: K,
    handler: Handler<EngineEventPayload[K]>,
  ): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    const set = this.listeners.get(event)!
    set.add(handler as Handler<unknown>)
    return () => set.delete(handler as Handler<unknown>)
  }

  emit<K extends keyof EngineEventPayload>(event: K, payload: EngineEventPayload[K]) {
    this.listeners.get(event)?.forEach((h) => {
      try {
        ;(h as Handler<EngineEventPayload[K]>)(payload)
      } catch (err) {
        console.error('[PlannerBus] handler error', event, err)
      }
    })
  }
}
