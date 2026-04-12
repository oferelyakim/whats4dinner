import { useRef, useEffect, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Send, Sparkles, Trash2 } from 'lucide-react'
import { useChat } from '@/hooks/useChat'
import { useI18n } from '@/lib/i18n'
import { ChatMessage } from './ChatMessage'
import { ChatWelcome } from './ChatWelcome'
import { cn } from '@/lib/cn'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'

export function ChatDialog() {
  const { t } = useI18n()
  const {
    messages,
    isOpen,
    isLoading,
    isPaid,
    freeImportsRemaining,
    freeImportCap,
    closeChat,
    sendMessage,
    clearMessages,
    showUpgradeModal,
    setShowUpgradeModal,
  } = useChat()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage(input)
    setInput('')
  }

  const handleSuggestionClick = (text: string) => {
    sendMessage(text)
  }

  const handleActionApply = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg?.action) return

    // Actions are already handled in useChat hook for recipe imports.
    // For paid-tier actions (create_activity, plan_meals, etc.),
    // navigate to the appropriate page with pre-filled data.
    // This is handled by the action type in the message.
    const { type, params } = msg.action
    if (type === 'create_activity' && params) {
      // Navigate to create activity — for now, just confirm
      // Future: router.push('/household/activities/new', { state: params })
    }
  }

  const handleActionDismiss = (_messageId: string) => {
    // Dismissing just leaves the message as-is without acting
  }

  return (
    <>
      <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) closeChat() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-3xl max-w-lg mx-auto flex flex-col"
            style={{ maxHeight: '80vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-200 dark:border-slate-700/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-500" />
                <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('chat.title')}
                </Dialog.Title>
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                    isPaid
                      ? 'bg-brand-500/10 text-brand-500'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
                  )}
                >
                  {isPaid ? 'AI Pro' : t('chat.freeTier')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearMessages}
                    aria-label={t('chat.clearChat')}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay dark:hover:text-slate-300 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <Dialog.Close asChild>
                  <button
                    aria-label={t('common.close')}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay dark:hover:text-slate-300 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
              {messages.length === 0 ? (
                <ChatWelcome
                  isPaid={isPaid}
                  freeImportsRemaining={freeImportsRemaining}
                  freeImportCap={freeImportCap}
                  onSuggestionClick={handleSuggestionClick}
                />
              ) : (
                messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    isLoading={msg.isLoading}
                    action={msg.action}
                    onActionApply={() => handleActionApply(msg.id)}
                    onActionDismiss={() => handleActionDismiss(msg.id)}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Free tier import counter */}
            {!isPaid && messages.length > 0 && (
              <div className="px-4 py-1.5 text-center">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {freeImportsRemaining}/{freeImportCap} {t('chat.importsRemainingLabel')}
                </span>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700/50"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.inputPlaceholder')}
                disabled={isLoading}
                className="flex-1 h-10 px-4 rounded-xl bg-slate-100 dark:bg-surface-dark-overlay text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-10 w-10 rounded-xl bg-brand-500 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AIUpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
      />
    </>
  )
}
