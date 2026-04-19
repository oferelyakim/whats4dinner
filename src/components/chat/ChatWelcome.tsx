import { useI18n } from '@/lib/i18n'
import { APP_VERSION } from '@/lib/version'
import { Sparkles } from 'lucide-react'

interface ChatWelcomeProps {
  isPaid: boolean
  freeImportsRemaining: number
  freeImportCap: number
  onSuggestionClick: (text: string) => void
}

export function ChatWelcome({ isPaid, freeImportsRemaining, freeImportCap, onSuggestionClick }: ChatWelcomeProps) {
  const { t } = useI18n()

  const suggestions = isPaid
    ? [
        t('chat.suggestHelp'),
        t('chat.suggestImportRecipe'),
        t('chat.suggestPlanMeals'),
        t('chat.suggestCreateActivity'),
      ]
    : [
        t('chat.suggestHelp'),
        t('chat.suggestImportRecipe'),
        t('chat.suggestNavigation'),
      ]

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="h-12 w-12 rounded-full bg-brand-500/10 flex items-center justify-center mb-4">
        <Sparkles className="h-6 w-6 text-brand-500" />
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-[280px]">
        {isPaid ? t('chat.paidWelcome') : t('chat.freeWelcome')}
      </p>

      <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">
        v{APP_VERSION}
      </p>

      {!isPaid && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          {freeImportsRemaining}/{freeImportCap} {t('chat.importsRemainingLabel')}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestionClick(suggestion)}
            className="px-3 py-1.5 text-xs rounded-full bg-slate-100 dark:bg-surface-dark-elevated text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-surface-dark-overlay transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
