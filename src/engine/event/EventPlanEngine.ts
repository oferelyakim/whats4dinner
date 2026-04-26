// Event Planner v2 — engine.
//
// Owns the questionnaire state machine for a single event. Mirrors the
// shape of src/engine/MealPlanEngine but the data flow is different:
//  • Pure-data picker drives the flow. AI is rare (intake NLU + propose + revise).
//  • State is persisted into events.questionnaire jsonb so sessions resume.
//  • Apply writes a batch of event_items rows + sets events.archetype.
//
// The engine is parameterized over a SupabaseLike (for tests) — the real
// supabase client from '@/services/supabase' satisfies the shape.

import type {
  AnswerLog,
  AnswerMap,
  AnswerSource,
  AnswerValue,
  Archetype,
  DraftPlan,
  PlanItem,
  PlannerState,
  Phase,
} from './types'
import { ARCHETYPES } from './types'
import {
  defaultForQuestion,
  getNextQuestion,
  getQuestion,
  inferSkippedValue,
} from './questions'
import { PlannerBus } from './events'
import type { EngineEventPayload } from './events'
import {
  callEventEngine,
  parseIntake,
  parsePropose,
} from './ai/client'
import type {
  EventEngineCallOptions,
  EventEngineRequest,
  EventEngineResponse,
} from './ai/client'
import { PlannerAbortedError } from './errors'
import type { ProposeResult, ProposalActivity } from './ai/schemas'

const now = () => Date.now()
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${Date.now()}`

// ─── Supabase shape (subset we actually use) ────────────────────────────────

interface SupabaseTableQuery<T = unknown> {
  select: (cols: string) => SupabaseTableQuery<T>
  eq: (col: string, val: unknown) => SupabaseTableQuery<T>
  maybeSingle: () => Promise<{ data: T | null; error: unknown }>
}

interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => SupabaseTableQuery
    update: (patch: Record<string, unknown>) => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> }
    insert: (rows: unknown[]) => Promise<{ error: unknown; data?: unknown }>
  }
  functions: {
    invoke: (
      name: string,
      opts: { body?: unknown; headers?: Record<string, string> },
    ) => Promise<{ data: unknown; error: { message?: string; status?: number; context?: { status?: number } } | null }>
  }
  rpc?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>
}

// ─── Engine ────────────────────────────────────────────────────────────────

export class EventPlanEngine {
  bus = new PlannerBus()
  private supabase: SupabaseLike | null
  private abortByEvent = new Map<string, AbortController>()
  private states = new Map<string, PlannerState>()
  private plans = new Map<string, DraftPlan>()

  constructor(supabase: SupabaseLike | null = null) {
    this.supabase = supabase
  }

  // ─── State helpers ──────────────────────────────────────────────────────

  /** Convert AnswerLog → flat AnswerMap for predicate evaluation. */
  static answersToMap(log: AnswerLog): AnswerMap {
    const out: AnswerMap = {}
    for (const [k, entry] of Object.entries(log)) out[k] = entry.value
    return out
  }

  getState(eventId: string): PlannerState | null {
    return this.states.get(eventId) ?? null
  }

  getPlan(eventId: string): DraftPlan | null {
    return this.plans.get(eventId) ?? null
  }

  on<K extends keyof EngineEventPayload>(
    event: K,
    handler: (payload: EngineEventPayload[K]) => void,
  ): () => void {
    return this.bus.on(event, handler)
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Start (or resume) the planner for an event.
   * If a draft questionnaire already exists in events.questionnaire jsonb,
   * we restore it so the user picks up where they left off.
   */
  async start(eventId: string, opts: { circleId?: string | null } = {}): Promise<PlannerState> {
    const restored = await this.loadFromDb(eventId)
    if (restored) {
      this.states.set(eventId, restored)
      this.emitState(eventId)
      this.emitNextQuestion(eventId)
      return restored
    }
    const fresh: PlannerState = {
      eventId,
      phase: 'intake',
      archetype: null,
      answers: {},
      freeText: '',
      pendingQuestionId: null,
      startedAt: now(),
      updatedAt: now(),
    }
    this.states.set(eventId, fresh)
    this.emitState(eventId)
    this.emitNextQuestion(eventId)
    void opts // reserved for future seeding from circle context
    return fresh
  }

  /** Cancel an in-flight AI call without losing state. */
  cancel(eventId: string): void {
    const ctl = this.abortByEvent.get(eventId)
    if (ctl) {
      ctl.abort()
      this.abortByEvent.delete(eventId)
    }
  }

  // ─── Intake (free-text NLU) ─────────────────────────────────────────────

  /**
   * Submit free-text intake. Calls the edge function `intake` op which
   * returns an NLUResult. We merge the inferred fields into the answer log
   * with source='nlu' so a later "Tell me more" call can overwrite them
   * cleanly.
   *
   * If `tellMore` is true the existing freeText is replaced AND any prior
   * 'nlu'-sourced answers are dropped before merging — so the user can
   * change their description and have downstream fields re-derive.
   */
  async submitIntake(
    eventId: string,
    freeText: string,
    options: { tellMore?: boolean } = {},
  ): Promise<PlannerState> {
    const state = this.requireState(eventId)
    const trimmed = freeText.trim()

    if (options.tellMore) {
      // Drop any prior NLU-sourced answers so re-extraction starts clean.
      for (const id of Object.keys(state.answers)) {
        if (state.answers[id].source === 'nlu') {
          delete state.answers[id]
        }
      }
    }
    state.freeText = trimmed
    state.phase = trimmed.length === 0 ? 'questionnaire' : state.phase

    if (trimmed.length === 0) {
      state.updatedAt = now()
      this.emitState(eventId)
      this.emitNextQuestion(eventId)
      await this.saveToDb(eventId)
      return state
    }

    // For very short briefs, skip the AI call — picker will guide the user.
    if (trimmed.length < 12 || !this.supabase) {
      state.phase = 'questionnaire'
      state.updatedAt = now()
      this.emitState(eventId)
      this.emitNextQuestion(eventId)
      await this.saveToDb(eventId)
      return state
    }

    const ctl = new AbortController()
    this.abortByEvent.set(eventId, ctl)
    try {
      const req: EventEngineRequest = {
        op: 'intake',
        freeText: trimmed,
        knownAnswers: EventPlanEngine.answersToMap(state.answers),
      }
      const resp = await this.callEdge(req, { signal: ctl.signal })
      const nlu = parseIntake(resp)
      this.mergeNluAnswers(state, nlu)
      state.phase = 'questionnaire'
      state.updatedAt = now()
      this.emitState(eventId)
      this.emitNextQuestion(eventId)
      await this.saveToDb(eventId)
      return state
    } catch (err) {
      if (err instanceof PlannerAbortedError || (err instanceof DOMException && err.name === 'AbortError')) {
        return state
      }
      // NLU failures are non-fatal — fall through into questionnaire phase.
      state.phase = 'questionnaire'
      state.updatedAt = now()
      this.bus.emit('error', { stage: 'intake', message: (err as Error).message })
      this.emitState(eventId)
      this.emitNextQuestion(eventId)
      await this.saveToDb(eventId)
      return state
    } finally {
      this.abortByEvent.delete(eventId)
    }
  }

  // ─── Answers ────────────────────────────────────────────────────────────

  /** Record an answer + transition to the next question. */
  async setAnswer(
    eventId: string,
    questionId: string,
    value: AnswerValue,
    source: AnswerSource = 'user',
  ): Promise<PlannerState> {
    const state = this.requireState(eventId)
    if (!getQuestion(questionId)) {
      throw new Error(`Unknown question id: ${questionId}`)
    }
    state.answers[questionId] = { value, source, at: now() }

    // Special-case: archetype carries the planner's archetype field too.
    if (questionId === 'archetype' && typeof value === 'string') {
      const arch = ARCHETYPES.find((a) => a === value)
      if (arch) state.archetype = arch
    }

    state.updatedAt = now()
    this.emitState(eventId)
    this.emitNextQuestion(eventId)
    await this.saveToDb(eventId)
    return state
  }

  /** Skip a question — applies inferenceWhenSkipped if the question defines it. */
  async skipQuestion(eventId: string, questionId: string): Promise<PlannerState> {
    const state = this.requireState(eventId)
    const q = getQuestion(questionId)
    if (!q) throw new Error(`Unknown question id: ${questionId}`)
    const inferred = inferSkippedValue(q, EventPlanEngine.answersToMap(state.answers))
    if (inferred !== undefined) {
      state.answers[questionId] = { value: inferred, source: 'inferred', at: now() }
    } else {
      // Mark as touched so picker doesn't re-ask, but with null sentinel.
      state.answers[questionId] = { value: null, source: 'inferred', at: now() }
    }
    state.updatedAt = now()
    this.emitState(eventId)
    this.emitNextQuestion(eventId)
    await this.saveToDb(eventId)
    return state
  }

  /** Go back to a previously answered question. */
  async unanswer(eventId: string, questionId: string): Promise<PlannerState> {
    const state = this.requireState(eventId)
    delete state.answers[questionId]
    state.updatedAt = now()
    this.emitState(eventId)
    this.emitNextQuestion(eventId)
    await this.saveToDb(eventId)
    return state
  }

  /** Helper used by the page on first load — pre-fills questions with
   *  their `defaultFrom` so the chip row shows a sensible suggestion
   *  before the user touches it. */
  prefilledValueFor(eventId: string, questionId: string): AnswerValue | undefined {
    const state = this.requireState(eventId)
    const q = getQuestion(questionId)
    if (!q) return undefined
    if (state.answers[questionId]) return state.answers[questionId].value
    return defaultForQuestion(q, EventPlanEngine.answersToMap(state.answers))
  }

  // ─── Propose / revise / apply ───────────────────────────────────────────

  /**
   * Generate the plan. Phase transitions: questionnaire → proposing → proposal.
   * Falls back to a deterministic catalog-only plan when:
   *  • supabase is null (tests, offline)
   *  • the AI call fails
   *  • the user is on the free tier (caller passes `freeTierOnly: true`)
   *
   * The returned DraftPlan is also pushed via the 'plan' bus event.
   */
  async propose(
    eventId: string,
    opts: { circleId?: string | null; freeTierOnly?: boolean; sessionId?: string } = {},
  ): Promise<DraftPlan> {
    const state = this.requireState(eventId)
    state.phase = 'proposing'
    state.updatedAt = now()
    this.emitState(eventId)

    const ctl = new AbortController()
    this.abortByEvent.set(eventId, ctl)

    try {
      let proposeResult: ProposeResult | null = null
      const fellBackBecause: string[] = []
      if (!opts.freeTierOnly && this.supabase) {
        try {
          const req: EventEngineRequest = {
            op: 'propose',
            eventId,
            circleId: opts.circleId ?? null,
            archetype: state.archetype ?? 'other',
            answers: EventPlanEngine.answersToMap(state.answers),
            sessionId: opts.sessionId,
          }
          const resp = await this.callEdge(req, { signal: ctl.signal })
          proposeResult = parsePropose(resp)
        } catch (err) {
          if (err instanceof PlannerAbortedError || (err instanceof DOMException && err.name === 'AbortError')) {
            throw err
          }
          fellBackBecause.push((err as Error).message)
        }
      } else {
        fellBackBecause.push(opts.freeTierOnly ? 'free-tier' : 'no-supabase')
      }

      const draft: DraftPlan = proposeResult
        ? proposeResultToDraft(proposeResult, false)
        : await this.fallbackCatalogPlan(state)
      if (fellBackBecause.length > 0) draft.fallback = true

      state.phase = 'proposal'
      state.updatedAt = now()
      this.plans.set(eventId, draft)
      this.bus.emit('plan', draft)
      this.emitState(eventId)
      await this.saveToDb(eventId)
      return draft
    } catch (err) {
      state.phase = 'error'
      state.errorMessage = (err as Error).message
      state.updatedAt = now()
      this.bus.emit('error', { stage: 'propose', message: state.errorMessage })
      this.emitState(eventId)
      await this.saveToDb(eventId)
      throw err
    } finally {
      this.abortByEvent.delete(eventId)
    }
  }

  /** Modify the draft via free-text instruction. */
  async revise(
    eventId: string,
    instruction: string,
    opts: { circleId?: string | null; sessionId?: string } = {},
  ): Promise<DraftPlan> {
    const state = this.requireState(eventId)
    const current = this.plans.get(eventId)
    if (!current) throw new Error('No draft to revise — call propose() first')
    if (!this.supabase) return current

    state.phase = 'proposing'
    state.updatedAt = now()
    this.emitState(eventId)

    const ctl = new AbortController()
    this.abortByEvent.set(eventId, ctl)
    try {
      const req: EventEngineRequest = {
        op: 'revise',
        eventId,
        circleId: opts.circleId ?? null,
        archetype: state.archetype ?? 'other',
        answers: EventPlanEngine.answersToMap(state.answers),
        instruction,
        draft: draftToProposeResult(current),
        sessionId: opts.sessionId,
      }
      const resp = await this.callEdge(req, { signal: ctl.signal })
      const updated = proposeResultToDraft(parsePropose(resp), false)
      this.plans.set(eventId, updated)
      state.phase = 'proposal'
      state.updatedAt = now()
      this.bus.emit('plan', updated)
      this.emitState(eventId)
      await this.saveToDb(eventId)
      return updated
    } catch (err) {
      if (err instanceof PlannerAbortedError || (err instanceof DOMException && err.name === 'AbortError')) {
        state.phase = 'proposal'
        this.emitState(eventId)
        return current
      }
      state.phase = 'error'
      state.errorMessage = (err as Error).message
      this.bus.emit('error', { stage: 'revise', message: state.errorMessage })
      this.emitState(eventId)
      throw err
    } finally {
      this.abortByEvent.delete(eventId)
    }
  }

  /** Replace a single PlanItem (used by inline edits in the review screen). */
  async editItem(eventId: string, itemId: string, patch: Partial<PlanItem>): Promise<DraftPlan> {
    const draft = this.plans.get(eventId)
    if (!draft) throw new Error('No draft to edit')
    const next = {
      ...draft,
      items: draft.items.map((it) =>
        it.id === itemId ? { ...it, ...patch, source: 'user-edit' as const } : it,
      ),
    }
    this.plans.set(eventId, next)
    this.bus.emit('plan', next)
    return next
  }

  async removeItem(eventId: string, itemId: string): Promise<DraftPlan> {
    const draft = this.plans.get(eventId)
    if (!draft) throw new Error('No draft')
    const next = { ...draft, items: draft.items.filter((it) => it.id !== itemId) }
    this.plans.set(eventId, next)
    this.bus.emit('plan', next)
    return next
  }

  /**
   * Apply the draft plan to the event:
   *  • inserts every PlanItem into event_items
   *  • sets events.archetype
   *  • clears events.draft_plan but keeps events.questionnaire so the user
   *    can revise later if they want
   *
   * Caller is responsible for refetching event_items afterwards.
   */
  async apply(eventId: string): Promise<{ inserted: number }> {
    const state = this.requireState(eventId)
    const draft = this.plans.get(eventId)
    if (!draft) throw new Error('No draft to apply')
    if (!this.supabase) {
      state.phase = 'applied'
      state.updatedAt = now()
      this.emitState(eventId)
      return { inserted: 0 }
    }

    state.phase = 'applying'
    state.updatedAt = now()
    this.emitState(eventId)

    try {
      const rows = draft.items.map((item, index) => ({
        event_id: eventId,
        type: item.type,
        name: item.name,
        category: item.category ?? (item.type === 'task' ? (item.dueWhen ?? 'other') : 'other'),
        quantity: item.quantity ?? null,
        notes: item.notes ?? null,
        sort_order: item.position ?? index,
      }))

      const { error: insertErr } = await this.supabase.from('event_items').insert(rows)
      if (insertErr) throw new Error((insertErr as { message?: string }).message ?? 'insert failed')

      const { error: updErr } = await this.supabase
        .from('events')
        .update({
          archetype: state.archetype,
          draft_plan: null,
          questionnaire: serializeState(state),
        })
        .eq('id', eventId)
      if (updErr) {
        // Non-fatal — items already inserted. Surface for telemetry only.
        console.warn('[EventPlanEngine] apply: events update failed', updErr)
      }

      state.phase = 'applied'
      state.updatedAt = now()
      this.emitState(eventId)
      return { inserted: rows.length }
    } catch (err) {
      state.phase = 'error'
      state.errorMessage = (err as Error).message
      this.bus.emit('error', { stage: 'apply', message: state.errorMessage })
      this.emitState(eventId)
      throw err
    }
  }

  // ─── Catalog fallback ───────────────────────────────────────────────────

  /**
   * Build a plan from the event_activity_catalog when AI is unavailable.
   * Free tier sees this; paid tier only sees this on AI failure.
   */
  private async fallbackCatalogPlan(state: PlannerState): Promise<DraftPlan> {
    const answers = EventPlanEngine.answersToMap(state.answers)
    const archetype = state.archetype ?? 'other'
    const headcount =
      (typeof answers.headcount_adults === 'number' ? answers.headcount_adults : 0) +
      (typeof answers.headcount_kids === 'number' ? answers.headcount_kids : 0)
    const venue = typeof answers.venue === 'string' ? answers.venue : null
    const budgetTier = typeof answers.budget_tier === 'string' ? answers.budget_tier : null

    let catalogRows: CatalogRow[] = []
    if (this.supabase?.rpc) {
      try {
        const { data } = await this.supabase.rpc('match_event_activities', {
          p_archetype: archetype,
          p_headcount: headcount,
          p_kid_count: typeof answers.headcount_kids === 'number' ? answers.headcount_kids : 0,
          p_venue: venue,
          p_budget_tier: budgetTier,
        })
        if (Array.isArray(data)) catalogRows = data as CatalogRow[]
      } catch {
        catalogRows = []
      }
    }

    const items = buildCatalogItems(state, catalogRows, headcount)
    return {
      items,
      timelineSummary: 'Starter plan from the activity catalog. Ask AI for personalised suggestions.',
      fallback: true,
      generatedAt: now(),
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  private async loadFromDb(eventId: string): Promise<PlannerState | null> {
    if (!this.supabase) return null
    try {
      const { data } = await this.supabase
        .from('events')
        .select('archetype, questionnaire, draft_plan')
        .eq('id', eventId)
        .maybeSingle()
      if (!data) return null
      const row = data as { archetype: string | null; questionnaire: unknown; draft_plan: unknown }
      const state = deserializeState(row.questionnaire, eventId, row.archetype)
      if (!state) return null
      const draft = deserializeDraft(row.draft_plan)
      if (draft) this.plans.set(eventId, draft)
      return state
    } catch (err) {
      console.warn('[EventPlanEngine] loadFromDb failed', err)
      return null
    }
  }

  private async saveToDb(eventId: string): Promise<void> {
    if (!this.supabase) return
    const state = this.states.get(eventId)
    if (!state) return
    try {
      const draft = this.plans.get(eventId) ?? null
      await this.supabase
        .from('events')
        .update({
          questionnaire: serializeState(state),
          draft_plan: draft ? serializeDraft(draft) : null,
        })
        .eq('id', eventId)
    } catch (err) {
      // Non-fatal — local state still mutates; user can keep going.
      console.warn('[EventPlanEngine] saveToDb failed', err)
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private requireState(eventId: string): PlannerState {
    const s = this.states.get(eventId)
    if (!s) throw new Error(`Planner not started for event ${eventId} — call start() first`)
    return s
  }

  private emitState(eventId: string) {
    const state = this.states.get(eventId)
    if (state) this.bus.emit('state', state)
  }

  private emitNextQuestion(eventId: string) {
    const state = this.states.get(eventId)
    if (!state) return
    const map = EventPlanEngine.answersToMap(state.answers)
    const { question, remaining } = getNextQuestion(map)
    state.pendingQuestionId = question?.id ?? null
    this.bus.emit('next-question', { questionId: question?.id ?? null, remaining })
  }

  private mergeNluAnswers(state: PlannerState, nlu: ReturnType<typeof parseIntake>) {
    const set = (id: string, value: AnswerValue) => {
      // Don't overwrite a user-typed answer with NLU.
      const existing = state.answers[id]
      if (existing && existing.source === 'user') return
      state.answers[id] = { value, source: 'nlu', at: now() }
    }
    if (nlu.archetype) {
      set('archetype', nlu.archetype)
      state.archetype = nlu.archetype as Archetype
    }
    if (typeof nlu.headcountAdults === 'number') set('headcount_adults', nlu.headcountAdults)
    if (typeof nlu.headcountKids === 'number') set('headcount_kids', nlu.headcountKids)
    if (nlu.venue) set('venue', nlu.venue)
    if (typeof nlu.durationHours === 'number') {
      // Snap to nearest chip option.
      const buckets = [2, 3, 4, 6, 8]
      const closest = buckets.reduce(
        (best, b) => (Math.abs(b - nlu.durationHours!) < Math.abs(best - nlu.durationHours!) ? b : best),
        buckets[0],
      )
      set('duration_hours', String(closest))
    }
    if (nlu.budget) set('budget_tier', nlu.budget)
    if (nlu.foodStyle) set('food_style', nlu.foodStyle)
    if (Array.isArray(nlu.specialGuests) && nlu.specialGuests.length > 0) {
      set('special_guest', nlu.specialGuests)
    }
    if (Array.isArray(nlu.kidActivities) && nlu.kidActivities.length > 0) {
      set('kid_activities', nlu.kidActivities)
    }
    if (Array.isArray(nlu.diet) && nlu.diet.length > 0) {
      set('dietary_mix', nlu.diet)
    }
  }

  private async callEdge(
    req: EventEngineRequest,
    opts: EventEngineCallOptions,
  ): Promise<EventEngineResponse> {
    if (!this.supabase) throw new Error('Supabase client not configured')
    return await callEventEngine(this.supabase, req, opts)
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface CatalogRow {
  id: string
  slug: string
  name: string
  description: string | null
  archetypes: string[]
  age_min: number | null
  age_max: number | null
  group_size_min: number | null
  group_size_max: number | null
  venue: string | null
  budget_tier: string | null
  vendor_category: string | null
  default_supplies: Array<{ name: string; quantity?: string; claimable?: boolean }> | null
  suggested_tasks: Array<{ title: string; due_when?: string; assignable?: boolean }> | null
  search_terms: string[] | null
  weight: number
}

function buildCatalogItems(state: PlannerState, rows: CatalogRow[], headcount: number): PlanItem[] {
  const out: PlanItem[] = []
  let pos = 0

  // Activity rows → tasks (booking) + supplies (defaults) + a "task" describing the activity.
  for (const r of rows.slice(0, 6)) {
    out.push({
      id: uid(),
      type: 'task',
      name: r.name,
      notes: r.description ?? null,
      dueWhen: r.suggested_tasks?.[0]?.due_when ?? 'plan ahead',
      claimable: false,
      source: 'catalog',
      position: pos++,
      category: 'activity',
    })
    for (const s of r.default_supplies ?? []) {
      out.push({
        id: uid(),
        type: 'supply',
        name: s.name,
        notes: s.quantity ? `Quantity: ${s.quantity}` : null,
        claimable: !!s.claimable,
        source: 'catalog',
        position: pos++,
      })
    }
    for (const t of r.suggested_tasks ?? []) {
      out.push({
        id: uid(),
        type: 'task',
        name: t.title,
        dueWhen: t.due_when ?? null,
        claimable: !!t.assignable,
        source: 'catalog',
        position: pos++,
      })
    }
  }

  // Universal supplies that scale by headcount when there's any food.
  const foodStyle = (state.answers.food_style?.value ?? 'host-cooks') as string
  if (foodStyle !== 'no-food' && headcount > 0) {
    out.push(
      {
        id: uid(),
        type: 'supply',
        name: 'Plates',
        quantity: headcount,
        claimable: false,
        source: 'catalog',
        position: pos++,
      },
      {
        id: uid(),
        type: 'supply',
        name: 'Cups',
        quantity: headcount * 2,
        claimable: false,
        source: 'catalog',
        position: pos++,
      },
      {
        id: uid(),
        type: 'supply',
        name: 'Napkins',
        quantity: headcount * 2,
        claimable: false,
        source: 'catalog',
        position: pos++,
      },
    )
  }

  // Universal tasks driven by foundations.
  out.push(
    {
      id: uid(),
      type: 'task',
      name: 'Send invites and confirm RSVPs',
      dueWhen: '2 weeks before',
      claimable: false,
      source: 'catalog',
      position: pos++,
    },
    {
      id: uid(),
      type: 'task',
      name: 'Setup + breakdown plan',
      dueWhen: 'day-of',
      claimable: false,
      source: 'catalog',
      position: pos++,
    },
  )

  return out
}

function proposeResultToDraft(result: ProposeResult, fallback: boolean): DraftPlan {
  const items: PlanItem[] = []
  let pos = 0

  for (const dish of result.dishes) {
    items.push({
      id: uid(),
      type: 'dish',
      name: dish.name,
      category: dish.type ?? 'other',
      notes: dish.notes ?? null,
      claimable: dish.claimable !== false,
      source: 'ai',
      position: pos++,
    })
  }
  for (const supply of result.supplies) {
    items.push({
      id: uid(),
      type: 'supply',
      name: supply.name,
      notes: supply.quantity ? `Quantity: ${supply.quantity}` : (supply.notes ?? null),
      claimable: supply.claimable !== false,
      source: 'ai',
      position: pos++,
    })
  }
  for (const task of result.tasks) {
    items.push({
      id: uid(),
      type: 'task',
      name: task.name,
      dueWhen: task.due_when ?? null,
      notes: task.notes ?? null,
      claimable: task.assignable === true,
      source: 'ai',
      position: pos++,
    })
  }
  for (const activity of result.activities) {
    items.push({
      id: uid(),
      type: 'task',
      name: activity.name,
      category: 'activity',
      dueWhen: activity.when ?? null,
      notes: formatActivityNotes(activity),
      claimable: false,
      source: 'ai',
      position: pos++,
    })
  }

  return {
    items,
    timelineSummary: result.timeline_summary ?? '',
    clarifyingQuestion: result.clarifying_question ?? null,
    fallback,
    generatedAt: now(),
  }
}

function formatActivityNotes(activity: ProposalActivity): string {
  const prefix = '[Activity]'
  const bits = [activity.notes ?? '']
  return [prefix, ...bits].filter(Boolean).join(' ').trim()
}

function draftToProposeResult(draft: DraftPlan): ProposeResult {
  return {
    dishes: draft.items
      .filter((it) => it.type === 'dish')
      .map((it) => ({
        name: it.name,
        type: (it.category ?? 'other') as 'starter' | 'main' | 'side' | 'dessert' | 'drink' | 'other',
        notes: it.notes ?? null,
        claimable: it.claimable,
        quantity: it.quantity != null ? String(it.quantity) : null,
      })),
    supplies: draft.items
      .filter((it) => it.type === 'supply')
      .map((it) => ({
        name: it.name,
        notes: it.notes ?? null,
        claimable: it.claimable,
        quantity: it.quantity != null ? String(it.quantity) : null,
      })),
    tasks: draft.items
      .filter((it) => it.type === 'task' && it.category !== 'activity')
      .map((it) => ({
        name: it.name,
        notes: it.notes ?? null,
        due_when: it.dueWhen ?? null,
        assignable: !!it.claimable,
      })),
    activities: draft.items
      .filter((it) => it.type === 'task' && it.category === 'activity')
      .map((it) => ({
        name: it.name,
        slug: null,
        when:
          it.dueWhen === 'arrival' ||
          it.dueWhen === 'during meal' ||
          it.dueWhen === 'after meal' ||
          it.dueWhen === 'closing' ||
          it.dueWhen === 'pre-event' ||
          it.dueWhen === 'cleanup'
            ? it.dueWhen
            : undefined,
        notes: it.notes ?? null,
      })),
    timeline_summary: draft.timelineSummary ?? '',
    clarifying_question: draft.clarifyingQuestion ?? null,
  }
}

// ─── Serialisation ─────────────────────────────────────────────────────────

function serializeState(state: PlannerState): unknown {
  return {
    phase: state.phase,
    archetype: state.archetype,
    answers: state.answers,
    freeText: state.freeText,
    pendingQuestionId: state.pendingQuestionId ?? null,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  }
}

function deserializeState(
  raw: unknown,
  eventId: string,
  archetype: string | null,
): PlannerState | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!obj.phase || !obj.answers) return null
  return {
    eventId,
    phase: obj.phase as Phase,
    archetype: (obj.archetype as Archetype) ?? (archetype as Archetype | null) ?? null,
    answers: obj.answers as AnswerLog,
    freeText: typeof obj.freeText === 'string' ? obj.freeText : '',
    pendingQuestionId: (obj.pendingQuestionId as string | null) ?? null,
    startedAt: typeof obj.startedAt === 'number' ? obj.startedAt : Date.now(),
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
  }
}

function serializeDraft(draft: DraftPlan): unknown {
  return draft
}

function deserializeDraft(raw: unknown): DraftPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.items)) return null
  return obj as unknown as DraftPlan
}

// ─── Singleton helper ──────────────────────────────────────────────────────

let __engine: EventPlanEngine | null = null

export function getEventEngine(supabase?: SupabaseLike): EventPlanEngine {
  if (!__engine) {
    __engine = new EventPlanEngine(supabase ?? null)
  }
  return __engine
}

/** For tests — wipe the singleton. */
export function __resetEventEngine() {
  __engine = null
}
