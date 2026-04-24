import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

const PREFERENCES_STORAGE_KEY = 'meal-plan-preferences'

export type PlanScope = 'meal' | 'day' | 'week'
export type MealTypeOption = 'breakfast' | 'lunch' | 'dinner'

export interface MealPlanPreferences {
  planScope: PlanScope
  mealType: MealTypeOption
  dietary: string[]
  cuisines: string[]
  cookingStyle: 'quick' | 'balanced' | 'gourmet' | ''
  calories: 'light' | 'regular' | 'hearty' | ''
  specialRequests: string
}

const DEFAULT_PREFERENCES: MealPlanPreferences = {
  planScope: 'day',
  mealType: 'dinner',
  dietary: [],
  cuisines: [],
  cookingStyle: '',
  calories: '',
  specialRequests: '',
}

function loadSavedPreferences(): MealPlanPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function savePreferences(prefs: MealPlanPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage unavailable — ignore silently is acceptable here (non-critical persistence)
  }
}

interface ChipProps {
  label: string
  selected: boolean
  onClick: () => void
}

function Chip({ label, selected, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 border',
        'active:scale-[0.96] min-h-[36px]',
        selected
          ? 'bg-brand-500 text-white border-brand-500'
          : 'bg-slate-100 dark:bg-surface-dark-overlay text-rp-ink-soft border-rp-hairline hover:border-brand-400'
      )}
    >
      {label}
    </button>
  )
}

interface SectionLabelProps {
  children: React.ReactNode
}

function SectionLabel({ children }: SectionLabelProps) {
  return (
    <p className="text-xs font-semibold text-rp-ink-mute uppercase tracking-wide mb-2">
      {children}
    </p>
  )
}

interface MealPlanPreferencesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerate: (prefs: MealPlanPreferences) => void
  loading?: boolean
}

export function MealPlanPreferencesDialog({
  open,
  onOpenChange,
  onGenerate,
  loading = false,
}: MealPlanPreferencesDialogProps) {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<MealPlanPreferences>(DEFAULT_PREFERENCES)

  // Load saved preferences when dialog opens
  useEffect(() => {
    if (open) {
      setPrefs(loadSavedPreferences())
    }
  }, [open])

  function toggleDietary(value: string) {
    setPrefs((prev) => {
      if (value === 'none') {
        return { ...prev, dietary: [] }
      }
      const already = prev.dietary.includes(value)
      return {
        ...prev,
        dietary: already
          ? prev.dietary.filter((d) => d !== value)
          : [...prev.dietary, value],
      }
    })
  }

  function toggleCuisine(value: string) {
    setPrefs((prev) => {
      const already = prev.cuisines.includes(value)
      return {
        ...prev,
        cuisines: already
          ? prev.cuisines.filter((c) => c !== value)
          : [...prev.cuisines, value],
      }
    })
  }

  function setCookingStyle(value: MealPlanPreferences['cookingStyle']) {
    setPrefs((prev) => ({ ...prev, cookingStyle: prev.cookingStyle === value ? '' : value }))
  }

  function setCalories(value: MealPlanPreferences['calories']) {
    setPrefs((prev) => ({ ...prev, calories: prev.calories === value ? '' : value }))
  }

  function handleGenerate() {
    savePreferences(prefs)
    onGenerate(prefs)
  }

  const dietaryOptions = [
    { value: 'none', label: t('plan.prefs.none') },
    { value: 'vegetarian', label: t('plan.prefs.vegetarian') },
    { value: 'vegan', label: t('plan.prefs.vegan') },
    { value: 'gluten-free', label: t('plan.prefs.glutenFree') },
    { value: 'dairy-free', label: t('plan.prefs.dairyFree') },
    { value: 'nut-free', label: t('plan.prefs.nutFree') },
    { value: 'kosher', label: t('plan.prefs.kosher') },
    { value: 'low-carb', label: t('plan.prefs.lowCarb') },
  ]

  const cuisineOptions = [
    { value: 'Israeli/Mediterranean', label: t('plan.prefs.cuisineIsraeli') },
    { value: 'Italian', label: t('plan.prefs.cuisineItalian') },
    { value: 'Asian', label: t('plan.prefs.cuisineAsian') },
    { value: 'Mexican', label: t('plan.prefs.cuisineMexican') },
    { value: 'American', label: t('plan.prefs.cuisineAmerican') },
    { value: 'Indian', label: t('plan.prefs.cuisineIndian') },
    { value: 'Mixed', label: t('plan.prefs.cuisineMixed') },
  ]

  const styleOptions: { value: MealPlanPreferences['cookingStyle']; label: string }[] = [
    { value: 'quick', label: t('plan.prefs.styleQuick') },
    { value: 'balanced', label: t('plan.prefs.styleBalanced') },
    { value: 'gourmet', label: t('plan.prefs.styleGourmet') },
  ]

  const calorieOptions: { value: MealPlanPreferences['calories']; label: string }[] = [
    { value: 'light', label: t('plan.prefs.calLight') },
    { value: 'regular', label: t('plan.prefs.calRegular') },
    { value: 'hearty', label: t('plan.prefs.calHearty') },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed bottom-0 start-0 end-0 z-50 bg-rp-card rounded-t-3xl p-6 max-w-lg mx-auto max-h-[88vh] overflow-y-auto focus:outline-none"
          aria-describedby="prefs-desc"
        >
          {/* Drag handle */}
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />

          <Dialog.Title className="text-lg font-bold text-rp-ink mb-1">
            {t('plan.prefs.title')}
          </Dialog.Title>
          <p id="prefs-desc" className="text-sm text-slate-500 mb-5">
            {t('plan.prefs.desc')}
          </p>

          <div className="space-y-5">
            {/* Plan scope — what to plan */}
            <section>
              <SectionLabel>{t('plan.prefs.planScope')}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'meal' as const, label: t('plan.prefs.scopeMeal') },
                  { value: 'day' as const, label: t('plan.prefs.scopeDay') },
                  { value: 'week' as const, label: t('plan.prefs.scopeWeek') },
                ] as const).map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={prefs.planScope === value}
                    onClick={() => setPrefs((prev) => ({ ...prev, planScope: value }))}
                  />
                ))}
              </div>
            </section>

            {/* Meal type — only shown for single meal scope */}
            {prefs.planScope === 'meal' && (
              <section>
                <SectionLabel>{t('plan.prefs.mealType')}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'breakfast' as const, label: t('plan.breakfast') },
                    { value: 'lunch' as const, label: t('plan.lunch') },
                    { value: 'dinner' as const, label: t('plan.dinner') },
                  ] as const).map(({ value, label }) => (
                    <Chip
                      key={value}
                      label={label}
                      selected={prefs.mealType === value}
                      onClick={() => setPrefs((prev) => ({ ...prev, mealType: value }))}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Dietary restrictions */}
            <section>
              <SectionLabel>{t('plan.prefs.dietary')}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {dietaryOptions.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={
                      value === 'none'
                        ? prefs.dietary.length === 0
                        : prefs.dietary.includes(value)
                    }
                    onClick={() => toggleDietary(value)}
                  />
                ))}
              </div>
            </section>

            {/* Cuisine preferences */}
            <section>
              <SectionLabel>{t('plan.prefs.cuisine')}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {cuisineOptions.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={prefs.cuisines.includes(value)}
                    onClick={() => toggleCuisine(value)}
                  />
                ))}
              </div>
            </section>

            {/* Cooking style — single select */}
            <section>
              <SectionLabel>{t('plan.prefs.cookingStyle')}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {styleOptions.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={prefs.cookingStyle === value}
                    onClick={() => setCookingStyle(value)}
                  />
                ))}
              </div>
            </section>

            {/* Calories per meal */}
            <section>
              <SectionLabel>{t('plan.prefs.calories')}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {calorieOptions.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={prefs.calories === value}
                    onClick={() => setCalories(value)}
                  />
                ))}
              </div>
            </section>

            {/* Special requests */}
            <section>
              <SectionLabel>{t('plan.prefs.specialRequests')}</SectionLabel>
              <textarea
                value={prefs.specialRequests}
                onChange={(e) => setPrefs((prev) => ({ ...prev, specialRequests: e.target.value }))}
                placeholder={t('plan.prefs.specialRequestsPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
              />
            </section>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={handleGenerate}
              loading={loading}
            >
              {t('plan.prefs.generate')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
