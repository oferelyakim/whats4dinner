// Event Planner v2 — zod schemas validating edge-function responses.
//
// One-stop place to keep the client/server contract honest. Mirrors
// src/engine/ai/schemas.ts.

import { z } from 'zod'

export const NLUResultSchema = z.object({
  /** Inferred archetype if the prose strongly implies one. */
  archetype: z
    .enum([
      'family-dinner',
      'holiday',
      'reunion',
      'birthday',
      'potluck',
      'picnic',
      'housewarming',
      'activity-day',
      'other',
    ])
    .nullable()
    .optional(),
  headcountAdults: z.coerce.number().int().min(0).max(500).optional(),
  headcountKids: z.coerce.number().int().min(0).max(500).optional(),
  venue: z.enum(['indoor', 'outdoor', 'both']).optional(),
  durationHours: z.coerce.number().min(0).max(48).optional(),
  budget: z.enum(['shoestring', 'modest', 'comfortable', 'premium']).optional(),
  foodStyle: z
    .enum(['host-cooks', 'potluck', 'catered', 'guest-chef', 'mixed', 'no-food'])
    .optional(),
  specialGuests: z.array(z.string()).optional(),
  kidActivities: z.array(z.string()).optional(),
  diet: z.array(z.string()).optional(),
  /** Misc tags the LLM extracted that didn't fit a known field. */
  tags: z.array(z.string()).optional(),
  /** When the prose is so vague the engine should ask one targeted question. */
  clarifyingQuestion: z.string().nullable().optional(),
})

export type NLUResult = z.infer<typeof NLUResultSchema>

const ProposalItemBaseSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional().nullable(),
  claimable: z.coerce.boolean().optional(),
})

export const ProposalDishSchema = ProposalItemBaseSchema.extend({
  type: z.enum(['starter', 'main', 'side', 'dessert', 'drink', 'other']).optional(),
  quantity: z.string().optional().nullable(),
})

export const ProposalSupplySchema = ProposalItemBaseSchema.extend({
  quantity: z.string().optional().nullable(),
})

export const ProposalTaskSchema = ProposalItemBaseSchema.extend({
  /** "4 weeks before", "day before", "day-of", etc. */
  due_when: z.string().optional().nullable(),
  /** Whether guests can claim from the EventDetailPage. */
  assignable: z.coerce.boolean().optional(),
})

export const ProposalActivitySchema = z.object({
  name: z.string().min(1),
  /** Catalog slug if this came from match_event_activities; null = AI-generated. */
  slug: z.string().nullable().optional(),
  when: z
    .enum(['arrival', 'during meal', 'after meal', 'closing', 'pre-event', 'cleanup'])
    .optional(),
  notes: z.string().nullable().optional(),
})

export const ProposeResultSchema = z.object({
  dishes: z.array(ProposalDishSchema).default([]),
  supplies: z.array(ProposalSupplySchema).default([]),
  tasks: z.array(ProposalTaskSchema).default([]),
  activities: z.array(ProposalActivitySchema).default([]),
  timeline_summary: z.string().optional().default(''),
  clarifying_question: z.string().nullable().optional(),
})

export type ProposeResult = z.infer<typeof ProposeResultSchema>
export type ProposalDish = z.infer<typeof ProposalDishSchema>
export type ProposalSupply = z.infer<typeof ProposalSupplySchema>
export type ProposalTask = z.infer<typeof ProposalTaskSchema>
export type ProposalActivity = z.infer<typeof ProposalActivitySchema>
