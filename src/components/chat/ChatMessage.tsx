import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
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
  onInAppLinkNavigate?: () => void
}

// Custom component overrides for ReactMarkdown — sized and spaced to fit inside
// a compact chat bubble rather than using browser-default heading sizes.
function buildMarkdownComponents(
  navigate: ReturnType<typeof useNavigate>,
  onInAppLinkNavigate?: () => void,
): React.ComponentProps<typeof ReactMarkdown>['components'] {
  return {
    h1: ({ children }) => (
      <div className="font-bold text-base mt-2 mb-1 first:mt-0">{children}</div>
    ),
    h2: ({ children }) => (
      <div className="font-semibold text-base mt-2 mb-1 first:mt-0">{children}</div>
    ),
    h3: ({ children }) => (
      <div className="font-semibold text-sm mt-1.5 mb-0.5 first:mt-0">{children}</div>
    ),
    p: ({ children }) => (
      <p className="leading-relaxed mb-1.5 last:mb-0">{children}</p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic">{children}</em>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-outside ps-4 mb-1.5 last:mb-0 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ps-4 mb-1.5 last:mb-0 space-y-0.5">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    code: ({ children, className }) => {
      const isBlock = className?.startsWith('language-')
      if (isBlock) {
        return (
          <code className="block font-mono text-xs bg-black/10 dark:bg-white/10 rounded-lg px-3 py-2 my-1.5 overflow-x-auto whitespace-pre">
            {children}
          </code>
        )
      }
      return (
        <code className="font-mono text-xs bg-black/10 dark:bg-white/10 rounded px-1 py-0.5">
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre className="my-1.5">{children}</pre>
    ),
    // In-app links (href starts with `/`) use react-router so they don't open
    // in a new tab and the chat dialog/route transition stays smooth.
    a: ({ href, children }) => {
      const isInApp = !!href && href.startsWith('/')
      if (isInApp) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              onInAppLinkNavigate?.()
              navigate(href!)
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-500 text-white hover:opacity-90 transition-opacity no-underline"
          >
            {children}
          </a>
        )
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-500 underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          {children}
        </a>
      )
    },
    hr: () => (
      <hr className="border-slate-300 dark:border-slate-600 my-2" />
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-s-2 border-slate-300 dark:border-slate-600 ps-3 italic opacity-80 my-1.5">
        {children}
      </blockquote>
    ),
  }
}

export function ChatMessage({
  role,
  content,
  isLoading,
  action,
  onActionApply,
  onActionDismiss,
  onInAppLinkNavigate,
}: ChatMessageProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const markdownComponents = buildMarkdownComponents(navigate, onInAppLinkNavigate)

  if (isLoading) {
    return (
      <div className="flex justify-start">
        <div className="bg-rp-bg-soft rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            <span className="text-sm text-rp-ink-mute">
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
          'rounded-2xl px-4 py-2.5 max-w-[85%] text-sm',
          role === 'user'
            ? 'bg-brand-500 text-white rounded-br-md whitespace-pre-wrap leading-relaxed'
            : 'bg-rp-bg-soft text-slate-900 dark:text-slate-100 rounded-bl-md',
        )}
      >
        {role === 'user' ? (
          content
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        )}

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
