import type { Preset } from '../types'

const now = () => Date.now()

const mk = (id: string, name: string, slots: { role: string; notes?: string }[]): Preset => ({
  id,
  name,
  scope: 'meal',
  source: 'system',
  slots,
  createdAt: now(),
})

export const SYSTEM_PRESETS: Preset[] = [
  mk('sys-standard-dinner', 'Standard dinner', [
    { role: 'main' },
    { role: 'veg_side' },
    { role: 'starch_side' },
  ]),
  mk('sys-simple-breakfast', 'Simple breakfast', [{ role: 'main' }]),
  mk('sys-big-breakfast', 'Big breakfast', [
    { role: 'main' },
    { role: 'side' },
    { role: 'drink' },
  ]),
  mk('sys-snack', 'Snack', [{ role: 'main' }]),
  mk('sys-tapas', 'Tapas night', [
    { role: 'tapas' },
    { role: 'tapas' },
    { role: 'tapas' },
    { role: 'tapas' },
    { role: 'tapas' },
  ]),
  mk('sys-mixed-mains', 'Mixed mains dinner', [
    { role: 'main', notes: 'chicken' },
    { role: 'main', notes: 'beef' },
    { role: 'main', notes: 'vegetarian' },
    { role: 'starch_side' },
    { role: 'starch_side' },
    { role: 'starch_side' },
    { role: 'veg_side' },
    { role: 'veg_side' },
    { role: 'veg_side' },
    { role: 'veg_side' },
    { role: 'veg_side' },
  ]),
  mk('sys-soup-salad', 'Soup & salad', [
    { role: 'soup' },
    { role: 'salad' },
    { role: 'bread' },
  ]),
  mk('sys-pasta', 'Pasta night', [
    { role: 'main' },
    { role: 'salad' },
    { role: 'bread' },
  ]),
  {
    id: 'sys-day-standard',
    name: 'Standard day',
    scope: 'day',
    source: 'system',
    mealShapes: [
      { type: 'breakfast', slots: [{ role: 'main' }] },
      { type: 'lunch', slots: [{ role: 'main' }, { role: 'side' }] },
      { type: 'dinner', slots: [{ role: 'main' }, { role: 'veg_side' }, { role: 'starch_side' }] },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-light',
    name: 'Light day',
    scope: 'day',
    source: 'system',
    mealShapes: [
      { type: 'breakfast', slots: [{ role: 'main' }] },
      { type: 'snack', slots: [{ role: 'main' }] },
      { type: 'dinner', slots: [{ role: 'soup' }, { role: 'salad' }, { role: 'bread' }] },
    ],
    createdAt: now(),
  },
  // ─── v2.0.0 — Theme-night day presets ────────────────────────────────────
  // Each is scope:'day' / source:'system' so users can pick from the q_themes
  // step in the interview, or apply one-off from the day card preset picker.
  // The `notes` field carries a one-word hint that flows through the bank's
  // `replaceHint` parser as the cuisine/protein constraint.
  // v2.1.0: explicit cuisineId on theme presets so the bank query never
  // returns a stylistic mismatch (e.g. Pasta Wednesday → German dish).
  // Sides inherit the cuisine from the main slot in the same meal — the
  // engine's sibling-cuisine envelope check enforces within-meal coherence.
  {
    id: 'sys-day-meatless-monday',
    name: 'Meatless Monday',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', notes: 'vegetarian' },
          { role: 'veg_side' },
          { role: 'starch_side' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-taco-tuesday',
    name: 'Taco Tuesday',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', cuisineId: 'mexican', notes: 'taco' },
          { role: 'side', cuisineId: 'mexican', notes: 'rice or beans' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-pasta-wednesday',
    name: 'Pasta Wednesday',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', cuisineId: 'italian-southern', notes: 'pasta' },
          { role: 'veg_side', cuisineId: 'italian-southern' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-pizza-friday',
    name: 'Pizza Friday',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', cuisineId: 'italian-southern', notes: 'pizza' },
          { role: 'salad', cuisineId: 'italian-southern' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-slow-cooker',
    name: 'Slow-cooker night',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', notes: 'slow cooker' },
          { role: 'starch_side' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-one-pot',
    name: 'One-pot night',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', notes: 'one pot' },
          { role: 'side' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-burger',
    name: 'Burger night',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', cuisineId: 'american', notes: 'burger' },
          { role: 'side', cuisineId: 'american', notes: 'fries or salad' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-greek',
    name: 'Greek night',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', cuisineId: 'greek' },
          { role: 'veg_side', cuisineId: 'greek' },
          { role: 'starch_side', cuisineId: 'greek' },
        ],
      },
    ],
    createdAt: now(),
  },
  {
    id: 'sys-day-asian',
    name: 'Asian night',
    scope: 'day',
    source: 'system',
    mealShapes: [
      {
        type: 'dinner',
        slots: [
          { role: 'main', cuisineId: 'thai' },
          { role: 'veg_side', cuisineId: 'thai' },
        ],
      },
    ],
    createdAt: now(),
  },
]
