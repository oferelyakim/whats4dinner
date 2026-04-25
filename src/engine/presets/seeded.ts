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
]
