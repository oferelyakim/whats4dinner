import { describe, it, expect } from 'vitest'
import { ExtractRecipeSchema } from '../ai/schemas'

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
