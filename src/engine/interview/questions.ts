// Meal-Planner Interview — the master 12-question tree (v2.0.0).
//
// Read by `runtime.ts`. The order here IS the ask-order. The first three
// questions (q_days, q_meals_per_day, q_freeform) always run; the rest can
// be skipped by `parse-intake` if the user's freeform answer covered them.

import type { Question } from './types'

export const QUESTIONS: ReadonlyArray<Question> = [
  // ─── 1-3: Always-asked anchors ──────────────────────────────────────────
  {
    id: 'q_days',
    kind: 'days_picker',
    promptKey: 'interview.q.days',
    helpKey: 'interview.q.daysHelp',
  },
  {
    id: 'q_meals_per_day',
    kind: 'meals_per_day',
    promptKey: 'interview.q.mealsPerDay',
    helpKey: 'interview.q.mealsPerDayHelp',
  },
  {
    id: 'q_freeform',
    kind: 'open_text',
    promptKey: 'interview.q.freeform',
    helpKey: 'interview.q.freeformHelp',
    // Optional skip if the user has nothing to add — `runtime.skipFreeform()`
    // can elide it on a button-press, but by default we ask.
  },
  // ─── 4-11: Skippable via parse-intake ───────────────────────────────────
  {
    id: 'q_headcount',
    kind: 'number_pair',
    promptKey: 'interview.q.headcount',
    helpKey: 'interview.q.headcountHelp',
    defaultFrom: 'circle_context',
    inferenceWhenSkipped: (_a, parsed) => {
      // If parse-intake gave us numbers, use them; else default 2 adults / 0 kids.
      const adults = parsed?.prefill.headcountAdults ?? 2
      const kids = parsed?.prefill.headcountKids ?? 0
      return { adults, kids }
    },
  },
  {
    id: 'q_preset_per_day',
    kind: 'preset_picker',
    promptKey: 'interview.q.presetPerDay',
    helpKey: 'interview.q.presetPerDayHelp',
    inferenceWhenSkipped: (a, parsed) => {
      // Apply any theme presets to specific days (Mon→Meatless, Tue→Taco, …).
      // Returns Record<isoDate, presetId|null>. Days without a theme = null
      // (engine leaves them as-is; `applyPreset` is a no-op for null entries).
      const dates = a.q_days?.selectedDates ?? []
      const themes = parsed?.prefill.themes ?? a.q_themes ?? []
      const out: Record<string, string | null> = {}
      for (const iso of dates) {
        const dow = new Date(iso + 'T12:00:00').getDay() // 0=Sun..6=Sat
        let presetId: string | null = null
        if (themes.includes('meatless-monday') && dow === 1) presetId = 'sys-day-meatless-monday'
        else if (themes.includes('taco-tuesday') && dow === 2) presetId = 'sys-day-taco-tuesday'
        else if (themes.includes('pasta-wednesday') && dow === 3) presetId = 'sys-day-pasta-wednesday'
        else if (themes.includes('pizza-friday') && dow === 5) presetId = 'sys-day-pizza-friday'
        out[iso] = presetId
      }
      return out
    },
  },
  {
    id: 'q_dietary',
    kind: 'multi_select',
    promptKey: 'interview.q.dietary',
    helpKey: 'interview.q.dietaryHelp',
    defaultFrom: 'circle_context',
    options: [
      { id: 'vegetarian', labelKey: 'interview.diet.vegetarian' },
      { id: 'vegan', labelKey: 'interview.diet.vegan' },
      { id: 'gluten-free', labelKey: 'interview.diet.glutenFree' },
      { id: 'dairy-free', labelKey: 'interview.diet.dairyFree' },
      { id: 'pescatarian', labelKey: 'interview.diet.pescatarian' },
      { id: 'keto', labelKey: 'interview.diet.keto' },
      { id: 'kosher', labelKey: 'interview.diet.kosher' },
      { id: 'halal', labelKey: 'interview.diet.halal' },
    ],
    inferenceWhenSkipped: (_a, parsed) => parsed?.prefill.diets ?? [],
  },
  {
    id: 'q_dislikes',
    kind: 'open_text',
    promptKey: 'interview.q.dislikes',
    helpKey: 'interview.q.dislikesHelp',
    defaultFrom: 'circle_context',
    inferenceWhenSkipped: (_a, parsed) => parsed?.prefill.dislikes ?? [],
  },
  {
    id: 'q_prep_time',
    kind: 'choice',
    promptKey: 'interview.q.prepTime',
    helpKey: 'interview.q.prepTimeHelp',
    defaultFrom: 'circle_context',
    options: [
      { id: '15', labelKey: 'interview.prepTime.under15', payload: 15 },
      { id: '30', labelKey: 'interview.prepTime.under30', payload: 30 },
      { id: '45', labelKey: 'interview.prepTime.under45', payload: 45 },
      { id: '60+', labelKey: 'interview.prepTime.flex', payload: 90 },
    ],
    inferenceWhenSkipped: (_a, parsed) => parsed?.prefill.maxPrepMin ?? 45,
  },
  {
    id: 'q_calories',
    kind: 'choice',
    promptKey: 'interview.q.calories',
    helpKey: 'interview.q.caloriesHelp',
    options: [
      { id: 'light', labelKey: 'interview.calories.light' },
      { id: 'balanced', labelKey: 'interview.calories.balanced' },
      { id: 'hearty', labelKey: 'interview.calories.hearty' },
    ],
    inferenceWhenSkipped: (_a, parsed) => parsed?.prefill.calories ?? 'balanced',
  },
  {
    id: 'q_cooking_skill',
    kind: 'choice',
    promptKey: 'interview.q.skill',
    helpKey: 'interview.q.skillHelp',
    defaultFrom: 'circle_context',
    options: [
      { id: 'easy', labelKey: 'interview.skill.easy' },
      { id: 'normal', labelKey: 'interview.skill.normal' },
      { id: 'challenge', labelKey: 'interview.skill.challenge' },
    ],
    inferenceWhenSkipped: (_a, parsed) => parsed?.prefill.skill ?? 'normal',
  },
  {
    id: 'q_themes',
    kind: 'multi_select',
    promptKey: 'interview.q.themes',
    helpKey: 'interview.q.themesHelp',
    options: [
      { id: 'meatless-monday', labelKey: 'interview.theme.meatlessMonday' },
      { id: 'taco-tuesday', labelKey: 'interview.theme.tacoTuesday' },
      { id: 'pasta-wednesday', labelKey: 'interview.theme.pastaWednesday' },
      { id: 'pizza-friday', labelKey: 'interview.theme.pizzaFriday' },
      { id: 'slow-cooker', labelKey: 'interview.theme.slowCooker' },
      { id: 'one-pot', labelKey: 'interview.theme.onePot' },
      { id: 'burger', labelKey: 'interview.theme.burger' },
      { id: 'greek', labelKey: 'interview.theme.greek' },
      { id: 'asian', labelKey: 'interview.theme.asian' },
    ],
    inferenceWhenSkipped: (_a, parsed) => parsed?.prefill.themes ?? [],
  },
  // ─── 12: Always-asked review ────────────────────────────────────────────
  {
    id: 'q_review',
    kind: 'review',
    promptKey: 'interview.q.review',
    helpKey: 'interview.q.reviewHelp',
  },
]

/** Look up a question by id. Returns null if unknown (shouldn't happen). */
export function getQuestion(id: string): Question | null {
  return QUESTIONS.find((q) => q.id === id) ?? null
}
