import { useRef, useEffect, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Send, Sparkles, Trash2 } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useChat } from '@/hooks/useChat'
import { useI18n } from '@/lib/i18n'
import { ChatMessage } from './ChatMessage'
import { ChatWelcome } from './ChatWelcome'
import { ChatPlanReview } from './ChatPlanReview'
import type { GeneratedPlan, MealPlanItem } from './ChatPlanReview'
import { cn } from '@/lib/cn'
import { AIUpgradeModal } from '@/components/ui/UpgradePrompt'
import { useAppStore } from '@/stores/appStore'
import { useQueryClient } from '@tanstack/react-query'
import { createRecipe } from '@/services/recipes'
import { setMealPlan } from '@/services/mealPlans'

export function ChatDialog() {
  const { t } = useI18n()
  const { activeCircle } = useAppStore()
  const queryClient = useQueryClient()
  const {
    messages,
    isOpen,
    isLoading,
    isPaid,
    freeImportsRemaining,
    freeImportCap,
    closeChat,
    sendMessage,
    applyAction,
    addMessage,
    clearMessages,
    showUpgradeModal,
    setShowUpgradeModal,
  } = useChat()

  const [input, setInput] = useState('')
  const [pendingPlan, setPendingPlan] = useState<GeneratedPlan | null>(null)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const [isAcceptingPlan, setIsAcceptingPlan] = useState(false)
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

  const handleActionApply = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg?.action) return

    const { type } = msg.action

    if (type === 'plan_meals') {
      setIsGeneratingPlan(true)
      try {
        const result = await applyAction(msg.action)
        if (result) {
          setPendingPlan(result)
        }
      } finally {
        setIsGeneratingPlan(false)
      }
    } else {
      await applyAction(msg.action)
    }
  }

  const handleActionDismiss = (_messageId: string) => {
    // Dismissing just leaves the message as-is without acting
  }

  const handleAcceptPlan = async (selectedItems: MealPlanItem[]) => {
    if (!activeCircle) return
    setIsAcceptingPlan(true)
    try {
      for (const item of selectedItems) {
        let recipeId = item.recipe_id ?? undefined
        if (!recipeId && item.ingredients) {
          const recipe = await createRecipe({
            circle_id: activeCircle.id,
            title: item.recipe_title,
            ingredients: item.ingredients.map((ing, idx) => ({
              name: ing.name,
              quantity: ing.quantity ?? null,
              unit: (ing.unit || '') as import('@/lib/constants').Unit,
              sort_order: idx,
              notes: null,
              item_id: null,
            })),
            tags: item.tags || [],
          })
          recipeId = recipe.id
        }
        await setMealPlan(activeCircle.id, item.date, item.meal_type, recipeId)
      }
      queryClient.invalidateQueries({ queryKey: ['meal-plans'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      setPendingPlan(null)
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `✅ Your meal plan has been saved! Check the Plan tab to see it.`,
        timestamp: Date.now(),
      })
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, there was an error saving the plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
    } finally {
      setIsAcceptingPlan(false)
    }
  }

  return (
    <>
      <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) closeChat() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark-elevated rounded-t-3xl max-w-lg mx-auto flex flex-col"
            style={{ maxHeight: '80dvh' }}
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
                    className="p-3 min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay dark:hover:text-slate-300 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <Dialog.Close asChild>
                  <button
                    aria-label={t('common.close')}
                    className="p-3 min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-surface-dark-overlay dark:hover:text-slate-300 transition-colors flex items-center justify-center"
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

      {/* Generating plan overlay */}
      {isGeneratingPlan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-dark-elevated rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl mx-4">
            <div className="h-8 w-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('plan.generatingMeals')}
            </p>
          </div>
        </div>
      )}

      {/* Plan review sheet */}
      <AnimatePresence>
        {pendingPlan && (
          <>
            <div
              className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm"
              onClick={() => setPendingPlan(null)}
            />
            <ChatPlanReview
              plan={pendingPlan}
              isAccepting={isAcceptingPlan}
              onAccept={handleAcceptPlan}
              onRequestChanges={(request) => {
                setPendingPlan(null)
                sendMessage(request)
              }}
              onDismiss={() => setPendingPlan(null)}
            />
          </>
        )}
      </AnimatePresence>
    </>
  )
}
