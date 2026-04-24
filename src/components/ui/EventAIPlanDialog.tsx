import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, X, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

export interface EventAIPlanRequest {
  description: string
  headcountAdults: number
  headcountKids: number
  budget: 'low' | 'medium' | 'high' | 'no_idea'
  helpNeeded: string[]
  keyRequirements: string
}

interface EventAIPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventTitle: string
  onSubmit: (values: EventAIPlanRequest) => void
  isLoading?: boolean
}

const DEFAULT_VALUES: EventAIPlanRequest = {
  description: '',
  headcountAdults: 10,
  headcountKids: 0,
  budget: 'medium',
  helpNeeded: ['tasks', 'menu', 'supplies'],
  keyRequirements: '',
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

export function EventAIPlanDialog({
  open,
  onOpenChange,
  eventTitle,
  onSubmit,
  isLoading = false,
}: EventAIPlanDialogProps) {
  const { t } = useI18n()
  const [values, setValues] = useState<EventAIPlanRequest>(DEFAULT_VALUES)

  function toggleHelp(value: string) {
    setValues((prev) => {
      const already = prev.helpNeeded.includes(value)
      return {
        ...prev,
        helpNeeded: already
          ? prev.helpNeeded.filter((h) => h !== value)
          : [...prev.helpNeeded, value],
      }
    })
  }

  function handleSubmit() {
    onSubmit(values)
  }

  const budgetOptions: { value: EventAIPlanRequest['budget']; label: string }[] = [
    { value: 'low', label: t('event.aiBudgetLow') },
    { value: 'medium', label: t('event.aiBudgetMedium') },
    { value: 'high', label: t('event.aiBudgetHigh') },
    { value: 'no_idea', label: t('event.aiBudgetNoIdea') },
  ]

  const helpOptions: { value: string; label: string }[] = [
    { value: 'tasks', label: t('event.aiHelpTasks') },
    { value: 'menu', label: t('event.aiHelpMenu') },
    { value: 'supplies', label: t('event.aiHelpSupplies') },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed bottom-0 start-0 end-0 z-50 bg-rp-card rounded-t-3xl p-6 max-w-lg mx-auto max-h-[90vh] overflow-y-auto focus:outline-none"
          aria-describedby="event-ai-plan-desc"
        >
          {/* Drag handle */}
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />

          {/* Header */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <Dialog.Title className="text-lg font-bold text-rp-ink">
                {t('event.aiPlanTitle')}
              </Dialog.Title>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p id="event-ai-plan-desc" className="text-sm text-slate-500 mb-5 ps-10">
            {eventTitle}
          </p>

          <div className="space-y-5">
            {/* Description */}
            <section>
              <SectionLabel>{t('event.aiDescription')}</SectionLabel>
              <textarea
                value={values.description}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, description: e.target.value.slice(0, 300) }))
                }
                placeholder={t('event.aiDescriptionPlaceholder')}
                rows={3}
                maxLength={300}
                className="w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-surface-dark-overlay border-0 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
              />
            </section>

            {/* Headcount */}
            <section>
              <SectionLabel>{t('event.aiHeadcount')}</SectionLabel>
              <div className="space-y-1 px-1">
                <Counter
                  label={t('plan.intake.adults')}
                  value={values.headcountAdults}
                  min={1}
                  max={200}
                  onChange={(v) => setValues((prev) => ({ ...prev, headcountAdults: v }))}
                />
                <Counter
                  label={t('plan.intake.kids')}
                  value={values.headcountKids}
                  min={0}
                  max={100}
                  onChange={(v) => setValues((prev) => ({ ...prev, headcountKids: v }))}
                />
              </div>
            </section>

            {/* Budget */}
            <section>
              <SectionLabel>{t('event.aiBudget')}</SectionLabel>
              <div className="grid grid-cols-4 gap-2">
                {budgetOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValues((prev) => ({ ...prev, budget: value }))}
                    className={cn(
                      'py-2 px-2 rounded-xl text-xs font-medium transition-all border active:scale-[0.96] min-h-[40px]',
                      values.budget === value
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-slate-100 dark:bg-surface-dark-overlay text-rp-ink-soft border-rp-hairline'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* Help needed */}
            <section>
              <SectionLabel>{t('event.aiHelpNeeded')}</SectionLabel>
              <div className="space-y-2">
                {helpOptions.map(({ value, label }) => {
                  const checked = values.helpNeeded.includes(value)
                  return (
                    <label
                      key={value}
                      className="flex items-center gap-3 cursor-pointer py-1 min-h-[44px]"
                    >
                      <div
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleHelp(value)}
                        className={cn(
                          'h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                          checked
                            ? 'bg-brand-500 border-brand-500'
                            : 'border-slate-300 dark:border-slate-600'
                        )}
                      >
                        {checked && (
                          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-rp-ink-soft">{label}</span>
                    </label>
                  )
                })}
              </div>
            </section>

            {/* Key requirements */}
            <section>
              <SectionLabel>{t('event.aiKeyRequirements')}</SectionLabel>
              <textarea
                value={values.keyRequirements}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, keyRequirements: e.target.value.slice(0, 500) }))
                }
                placeholder={t('event.aiKeyRequirementsPlaceholder')}
                rows={3}
                maxLength={500}
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
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={isLoading}
              disabled={isLoading || values.description.trim().length === 0}
            >
              {isLoading ? t('event.aiGenerating') : t('event.aiGenerate')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
