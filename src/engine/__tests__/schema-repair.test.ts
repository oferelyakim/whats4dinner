import { describe, it, expect } from 'vitest'
import {
  ExtractRecipeSchema,
  IntakeParseResultSchema,
  ProposePlanResultSchema,
} from '../ai/schemas'

/**
 * v1.16.0: schema is lenient on imageUrl + numeric fields. The whole-recipe
 * parse must succeed when a single field is malformed — we never want a
 * stage-C "find-recipe" call to throw because the recipe site returned a
 * relative URL or a stringy "30 minutes" duration.
 *
 * Server normalizeImageUrl + repairAndValidate normally cleans these up
 * before the client sees them — these tests are the second line of defence.
 */
describe('ExtractRecipeSchema — lenient transforms (v1.16.0)', () => {
  const valid = {
    title: 'Test recipe',
    ingredients: [{ item: 'salt' }, { item: 'butter' }],
    steps: ['mix', 'cook'],
  }

  it('accepts a valid recipe with all optional fields', () => {
    const r = ExtractRecipeSchema.parse({
      ...valid,
      imageUrl: 'https://example.com/img.jpg',
      prepTimeMin: 10,
      cookTimeMin: 20,
      servings: 4,
    })
    expect(r.imageUrl).toBe('https://example.com/img.jpg')
    expect(r.prepTimeMin).toBe(10)
  })

  it('drops invalid imageUrl to undefined instead of throwing', () => {
    // The case that bit us in v1.15.7: server returns a relative URL.
    const r = ExtractRecipeSchema.parse({ ...valid, imageUrl: '/relative/path.jpg' })
    expect(r.imageUrl).toBeUndefined()
    expect(r.title).toBe('Test recipe')
  })

  it('drops empty-string imageUrl to undefined', () => {
    const r = ExtractRecipeSchema.parse({ ...valid, imageUrl: '' })
    expect(r.imageUrl).toBeUndefined()
  })

  it('drops javascript: imageUrl to undefined', () => {
    const r = ExtractRecipeSchema.parse({ ...valid, imageUrl: 'javascript:void(0)' })
    expect(r.imageUrl).toBeUndefined()
  })

  it('coerces stringy numeric times to numbers', () => {
    const r = ExtractRecipeSchema.parse({
      ...valid,
      prepTimeMin: '15',
      cookTimeMin: '25',
    })
    expect(r.prepTimeMin).toBe(15)
    expect(r.cookTimeMin).toBe(25)
  })

  it('drops out-of-range time to undefined', () => {
    // 25 hours is silly — clamp range is 0..1440 (24h).
    const r = ExtractRecipeSchema.parse({
      ...valid,
      prepTimeMin: 1500,
    })
    expect(r.prepTimeMin).toBeUndefined()
  })

  it('drops non-coercible time to undefined without throwing', () => {
    const r = ExtractRecipeSchema.parse({ ...valid, prepTimeMin: 'about an hour' })
    expect(r.prepTimeMin).toBeUndefined()
  })

  it('drops servings of 0 (not positive) to undefined', () => {
    const r = ExtractRecipeSchema.parse({ ...valid, servings: 0 })
    expect(r.servings).toBeUndefined()
  })

  it('drops servings over 100 to undefined', () => {
    const r = ExtractRecipeSchema.parse({ ...valid, servings: 200 })
    expect(r.servings).toBeUndefined()
  })

  it('still requires title, ingredients[0], steps[0]', () => {
    expect(() => ExtractRecipeSchema.parse({ ingredients: valid.ingredients, steps: valid.steps })).toThrow()
    expect(() => ExtractRecipeSchema.parse({ ...valid, ingredients: [] })).toThrow()
    expect(() => ExtractRecipeSchema.parse({ ...valid, steps: [] })).toThrow()
  })

  it('survives multiple bad optional fields at once', () => {
    // The realistic v1.15.7 failure mode: imageUrl bad AND prepTime bad AND
    // cookTime bad. Whole-recipe parse should still succeed, with bad
    // fields dropped to undefined.
    const r = ExtractRecipeSchema.parse({
      ...valid,
      imageUrl: '//cdn.example.com/img.jpg', // protocol-relative
      prepTimeMin: 'not a number',
      cookTimeMin: -5,
      servings: 0,
    })
    expect(r.title).toBe('Test recipe')
    expect(r.imageUrl).toBeUndefined()
    expect(r.prepTimeMin).toBeUndefined()
    expect(r.cookTimeMin).toBeUndefined()
    expect(r.servings).toBeUndefined()
  })
})

/**
 * v2.0.0: parse-intake op output. Lenient — model may return partial / empty
 * objects when freeform is sparse. The schema strips invalid skip-list ids
 * and unknown enum values rather than throwing, so a stale model on stale
 * frontend doesn't block the whole interview.
 */
describe('IntakeParseResultSchema — lenient transforms (v2.0.0)', () => {
  it('accepts an empty result (no skip, no prefill)', () => {
    const r = IntakeParseResultSchema.parse({})
    expect(r.skip).toEqual([])
    expect(r.prefill.diets).toEqual([])
    expect(r.prefill.themes).toEqual([])
  })

  it('strips unknown question ids from skip-list', () => {
    const r = IntakeParseResultSchema.parse({
      skip: ['q_dietary', 'q_unknown_future_question', 'q_dislikes'],
      prefill: {},
    })
    expect(r.skip).toEqual(['q_dietary', 'q_dislikes'])
  })

  it('strips unknown theme ids from prefill.themes', () => {
    const r = IntakeParseResultSchema.parse({
      skip: [],
      prefill: { themes: ['taco-tuesday', 'unknown-theme', 'meatless-monday'] },
    })
    expect(r.prefill.themes).toEqual(['taco-tuesday', 'meatless-monday'])
  })

  it('coerces numbers and clamps invalid values to undefined', () => {
    const r = IntakeParseResultSchema.parse({
      skip: ['q_headcount'],
      prefill: { headcountAdults: '4', headcountKids: -2, maxPrepMin: 600 },
    })
    expect(r.prefill.headcountAdults).toBe(4)
    // -2 fails min(0) → catch returns undefined
    expect(r.prefill.headcountKids).toBeUndefined()
    // 600 > max(240) → catch returns undefined
    expect(r.prefill.maxPrepMin).toBeUndefined()
  })

  it('rejects invalid calorie/skill enum values via .catch(undefined)', () => {
    const r = IntakeParseResultSchema.parse({
      skip: [],
      prefill: { calories: 'extra-hearty', skill: 'master-chef' },
    })
    expect(r.prefill.calories).toBeUndefined()
    expect(r.prefill.skill).toBeUndefined()
  })
})

/**
 * v2.0.0: propose-plan op output. Each slot must have 1-3 candidate dish
 * names. The engine matches each in order against the bank.
 */
describe('ProposePlanResultSchema — strict on candidates (v2.0.0)', () => {
  it('accepts a minimal one-day-one-meal proposal', () => {
    const r = ProposePlanResultSchema.parse({
      days: [
        {
          date: '2026-04-27',
          meals: [
            {
              type: 'dinner',
              slots: [{ role: 'main', candidates: ['Chicken Adobo'] }],
            },
          ],
        },
      ],
    })
    expect(r.days).toHaveLength(1)
    expect(r.days[0].meals[0].slots[0].candidates).toEqual(['Chicken Adobo'])
  })

  it('accepts multiple candidates per slot', () => {
    const r = ProposePlanResultSchema.parse({
      days: [
        {
          date: '2026-04-27',
          meals: [
            {
              type: 'dinner',
              slots: [
                {
                  role: 'main',
                  candidates: ['Korean Bibimbap', 'Thai Pad See Ew', 'Sheet-Pan Greek Chicken'],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(r.days[0].meals[0].slots[0].candidates).toHaveLength(3)
  })

  it('rejects a slot with zero candidates', () => {
    expect(() =>
      ProposePlanResultSchema.parse({
        days: [
          {
            date: '2026-04-27',
            meals: [{ type: 'dinner', slots: [{ role: 'main', candidates: [] }] }],
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects a slot with more than 3 candidates', () => {
    expect(() =>
      ProposePlanResultSchema.parse({
        days: [
          {
            date: '2026-04-27',
            meals: [
              {
                type: 'dinner',
                slots: [
                  { role: 'main', candidates: ['a', 'b', 'c', 'd'] },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow()
  })

  it('coerces theme=null acceptable, blank string acceptable', () => {
    const r = ProposePlanResultSchema.parse({
      days: [
        {
          date: '2026-04-27',
          theme: null,
          meals: [
            {
              type: 'dinner',
              slots: [{ role: 'main', candidates: ['Chicken Adobo'] }],
            },
          ],
        },
      ],
    })
    expect(r.days[0].theme).toBeNull()
  })

  it('v2.5.0: rejects missing days field (was: defaulted to []; that hid blank-page bugs)', () => {
    // Pre-v2.5 the schema had `.default([])` on days, which silently accepted
    // any malformed Anthropic response and let the client render an empty
    // review dialog. v2.5.0 tightened to `.min(1)` so a malformed response
    // throws a ZodError → caught by runProposePlan's try/catch → user sees
    // the retry CTA instead of a blank "Here is your draft" page.
    expect(() => ProposePlanResultSchema.parse({})).toThrow()
    expect(() => ProposePlanResultSchema.parse({ days: [] })).toThrow()
  })

  it('v2.5.0: rejects days with empty meals array', () => {
    expect(() =>
      ProposePlanResultSchema.parse({
        days: [{ date: '2026-05-01', meals: [] }],
      }),
    ).toThrow()
  })

  it('v2.5.0: rejects meals with empty slots array (the actual blank-page bug)', () => {
    expect(() =>
      ProposePlanResultSchema.parse({
        days: [{ date: '2026-05-01', meals: [{ type: 'Dinner', slots: [] }] }],
      }),
    ).toThrow()
  })
})
