import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'
import { Check, X, Loader2 } from 'lucide-react'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  isLoading?: boolean
  action?: {
    type: string
    params: Record<string, unknown>
    confirmation: string
  }
  onActionApply?: () => void
  onActionDismiss?: () => void
}

export function ChatMessage({
  role,
  content,
  isLoading,
  action,
  onActionApply,
  onActionDismiss,
}: ChatMessageProps) {
  const { t } = useI18n()

  if (isLoading) {
    return (
      <div className="flex justify-start">
        <div className="bg-slate-100 dark:bg-surface-dark-elevated rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {t('chat.typing')}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap',
          role === 'user'
            ? 'bg-brand-500 text-white rounded-br-md'
            : 'bg-slate-100 dark:bg-surface-dark-elevated text-slate-900 dark:text-slate-100 rounded-bl-md',
        )}
      >
        {content}

        {action && (
          <div className="mt-3 pt-3 border-t border-slate-200/30 dark:border-slate-600/30">
            <p className="text-xs font-medium opacity-80 mb-2">{action.confirmation}</p>
            <div className="flex gap-2">
              <button
                onClick={onActionApply}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                {t('chat.applyAction')}
              </button>
              <button
                onClick={onActionDismiss}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                {t('chat.cancelAction')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
