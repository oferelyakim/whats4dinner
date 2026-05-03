import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PantryPick {
  id: string
  source: 'bank' | 'user_recipe'
  /** Supabase recipes.id — only set when source='user_recipe' */
  recipeId?: string
  /** recipe_bank.id — only set when source='bank' */
  bankId?: string
  title: string
  imageUrl?: string | null
  sourceUrl?: string | null
  prepTimeMin?: number | null
  cookTimeMin?: number | null
  servings?: number | null
  /** The pantry ingredients that matched this pick */
  matchedIngredients: string[]
  addedAt: number
}

interface PantryPicksState {
  picks: PantryPick[]
  pantryIngredients: string[]

  addPick: (pick: Omit<PantryPick, 'id' | 'addedAt'>) => void
  removePick: (id: string) => void
  clearAllPicks: () => void
  setPantryIngredients: (ingredients: string[]) => void
}

export const usePantryPicksStore = create<PantryPicksState>()(
  persist(
    (set) => ({
      picks: [],
      pantryIngredients: [],

      addPick: (pick) =>
        set((state) => ({
          picks: [
            {
              ...pick,
              id: crypto.randomUUID(),
              addedAt: Date.now(),
            },
            ...state.picks,
          ],
        })),

      removePick: (id) =>
        set((state) => ({
          picks: state.picks.filter((p) => p.id !== id),
        })),

      clearAllPicks: () => set({ picks: [] }),

      setPantryIngredients: (ingredients) => set({ pantryIngredients: ingredients }),
    }),
    {
      name: 'replanish-pantry-picks',
    }
  )
)
