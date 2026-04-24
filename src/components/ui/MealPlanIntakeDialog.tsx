import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

export interface MealPlanIntakeValues {
  scope: 'meal' | 'day' | 'week'
  mealTypes: string[]
  headcountAdults: number
  headcountKids: number
  dietaryNotes: string
  preferSource: 'my_recipes' | 'new_ideas' | 'mix'
  skillLevel: 'easy' | 'normal' | 'challenge'
  caloriesPerMeal?: string
}

interface MealPlanIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MealPlanIntakeValues) => void
  isLoading?: boolean
}

const DEFAULT_VALUES: MealPlanIntakeValues = {
  scope: 'week',
  mealTypes: ['dinner'],
  headcountAdults: 2,
  headcountKids: 0,
  dietaryNotes: '',
  preferSource: 'mix',
  skillLevel: 'normal',
  caloriesPerMeal: '',
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
        'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 border min-h-[40px]',
        'active:scale-[0.96]',
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

interface CounterProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

function Counter({ label, value, min, max, onChange }: CounterProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-rp-ink-soft">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="h-8 w-8 rounded-full bg-slate-100 dark:bg-surface-dark-overlay flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3.5 w-3.5 text-rp-ink-soft" />
        </button>
        <span className="text-sm font-semibold text-rp-ink w-5 text-center tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-8 w-8 rounded-full bg-slate-100 dark:bg-surface-dark-overlay flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3.5 w-3.5 text-rp-ink-soft" />
        </button>
      </div>
    </div>
  )
}

export function MealPlanIntakeDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: MealPlanIntakeDialogProps) {
  const { t } = useI18n()
  const [values, setValues] = useState<MealPlanIntakeValues>(DEFAULT_VALUES)
  const [showMoreOptions, setShowMoreOptions] = useState(false)

  function toggleMealType(mealType: string) {
    setValues((prev) => {
      const already = prev.mealTypes.includes(mealType)
      if (already && prev.mealTypes.length === 1) return prev // keep at least one
      return {
        ...prev,
        mealTypes: already
          ? prev.mealTypes.filter((m) => m !== mealType)
          : [...prev.mealTypes, mealType],
      }
    })
  }

  function handleSubmit() {
    onSubmit(values)
  }

  const scopeOptions: { value: MealPlanIntakeValues['scope']; label: string }[] = [
    { value: 'meal', label: t('plan.intake.scopeMeal') },
    { value: 'day', label: t('plan.intake.scopeDay') },
    { value: 'week', label: t('plan.intake.scopeWeek') },
  ]

  const mealTypeOptions: { value: string; label: string }[] = [
    { value: 'breakfast', label: t('plan.intake.mealTypeBreakfast') },
    { value: 'brunch', label: t('plan.intake.mealTypeBrunch') },
    { value: 'lunch', label: t('plan.intake.mealTypeLunch') },
    { value: 'dinner', label: t('plan.intake.mealTypeDinner') },
    { value: 'snack', label: t('plan.intake.mealTypeSnack') },
    { value: 'snack_bar', label: t('plan.intake.mealTypeSnackBar') },
    { value: 'tapas', label: t('plan.intake.mealTypeTapas') },
  ]

  const sourceOptions: { value: MealPlanIntakeValues['preferSource']; label: string }[] = [
    { value: 'my_recipes', label: t('plan.intake.sourceMyRecipes') },
    { value: 'mix', label: t('plan.intake.sourceMix') },
    { value: 'new_ideas', label: t('plan.intake.sourceNewIdeas') },
  ]

  const skillOptions: { value: MealPlanIntakeValues['skillLevel']; label: string }[] = [
    { value: 'easy', label: t('plan.intake.skillEasy') },
    { value: 'normal', label: t('plan.intake.skillNormal') },
    { value: 'challenge', label: t('plan.intake.skillChallenge') },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed bottom-0 start-0 end-0 z-50 bg-rp-card rounded-t-3xl p-6 max-w-lg mx-auto max-h-[90vh] overflow-y-auto focus:outline-none"
          aria-describedby="intake-desc"
        >
          {/* Drag handle */}
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />

          <Dialog.Title className="text-lg font-bold text-rp-ink mb-1">
            {t('plan.intake.title')}
          </Dialog.Title>
          <p id="intake-desc" className="sr-only">
            {t('plan.intake.title')}
          </p>

          <div className="space-y-5">
            {/* Scope */}
            <section>
              <SectionLabel>{t('plan.intake.scope')}</SectionLabel>
              <div className="flex gap-2">
                {scopeOptions.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={values.scope === value}
                    onClick={() => setValues((prev) => ({ ...prev, scope: value }))}
                  />
                ))}
              </div>
            </section>

            {/* Meal types — shown for single meal scope */}
            {values.scope === 'meal' && (
              <section>
                <SectionLabel>{t('plan.intake.mealTypes')}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {mealTypeOptions.map(({ value, label }) => (
                    <Chip
                      key={value}
                      label={label}
                      selected={values.mealTypes.includes(value)}
                      onClick={() => toggleMealType(value)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Headcount */}
            <section>
              <SectionLabel>{t('plan.intake.headcount')}</SectionLabel>
              <div className="space-y-1 px-1">
                <Counter
                  label={t('plan.intake.adults')}
                  value={values.headcountAdults}
                  min={1}
                  max={20}
                  onChange={(v) => setValues((prev) => ({ ...prev, headcountAdults: v }))}
                />
                <Counter
                  label={t('plan.intake.kids')}
                  value={values.headcountKids}
                  min={0}
                  max={20}
                  onChange={(v) => setValues((prev) => ({ ...prev, headcountKids: v }))}
                />
              </div>
            </section>

            {/* Dietary notes */}
            <section>
              <SectionLabel>{t('plan.intake.dietaryNotes')}</SectionLabel>
              <textarea
                value={values.dietaryNotes}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, dietaryNotes: e.target.value.slice(0, 200) }))
                }
                placeholder={t('plan.intake.dietaryPlaceholder')}
                rows={2}
                maxLength={200}
                className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
              />
            </section>

            {/* Prefer source */}
            <section>
              <SectionLabel>{t('plan.intake.preferSource')}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {sourceOptions.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={values.preferSource === value}
                    onClick={() => setValues((prev) => ({ ...prev, preferSource: value }))}
                  />
                ))}
              </div>
            </section>

            {/* More options collapsible */}
            <section>
              <button
                type="button"
                onClick={() => setShowMoreOptions((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-brand-500 active:opacity-70 transition-opacity"
              >
                {showMoreOptions
                  ? <ChevronUp className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />
                }
                {t('plan.intake.moreOptions')}
              </button>

              {showMoreOptions && (
                <div className="mt-4 space-y-4">
                  {/* Skill level */}
                  <div>
                    <SectionLabel>{t('plan.intake.skillLevel')}</SectionLabel>
                    <div className="flex gap-2">
                      {skillOptions.map(({ value, label }) => (
                        <Chip
                          key={value}
                          label={label}
                          selected={values.skillLevel === value}
                          onClick={() => setValues((prev) => ({ ...prev, skillLevel: value }))}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Calories per meal */}
                  <div>
                    <SectionLabel>{t('plan.intake.caloriesPerMeal')}</SectionLabel>
                    <input
                      type="text"
                      value={values.caloriesPerMeal ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, caloriesPerMeal: e.target.value }))
                      }
                      placeholder="e.g., 500"
                      className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading ? t('plan.intake.generating') : t('plan.intake.generate')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
