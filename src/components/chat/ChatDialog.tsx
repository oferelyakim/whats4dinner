import { useRef, useEffect, useState, useCallback, type FormEvent } from 'react'
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
import { supabase } from '@/services/supabase'

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
    updateMessage,
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
  const shownPlanMessageIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Auto-show plan review when ai-chat has already generated the plan server-side
  useEffect(() => {
    if (pendingPlan) return
    for (const msg of messages) {
      if (
        !msg.isLoading &&
        msg.action?.type === 'plan_meals' &&
        msg.action.params.planData &&
        !shownPlanMessageIds.current.has(msg.id)
      ) {
        const planData = msg.action.params.planData as GeneratedPlan
        if (planData?.plan?.length > 0) {
          shownPlanMessageIds.current.add(msg.id)
          setPendingPlan(planData)
          updateMessage(msg.id, { action: undefined })
        }
        break
      }
    }
  }, [messages, pendingPlan, updateMessage])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage(input)
    setInput('')
  }

  const handleSuggestionClick = (text: string) => {
    sendMessage(text)
  }

  const handleRequestReplacements = async (
    accepted: MealPlanItem[],
    rejected: Array<{ item: MealPlanItem; comment: string }>
  ) => {
    if (!activeCircle) return
    setIsGeneratingPlan(true)
    setPendingPlan(null)

    try {
      const dates = [...new Set(rejected.map((r) => r.item.date))]
      const replacementContext = rejected
        .map((r) =>
          `Replace ${r.item.meal_type} on ${r.item.date} (was: "${r.item.recipe_title}")${r.comment ? `: ${r.comment}` : ''}`
        )
        .join('; ')

      const { data, error } = await supabase.functions.invoke('generate-meal-plan', {
        body: {
          circleId: activeCircle.id,
          dates,
          planScope: 'custom',
          preferences: {
            special_requests: replacementContext,
          },
        },
      })

      if (!error && data?.plan) {
        const rejectedSlots = new Set(rejected.map((r) => `${r.item.date}|${r.item.meal_type}`))
        const relevantReplacements = (data.plan as MealPlanItem[]).filter((item) =>
          rejectedSlots.has(`${item.date}|${item.meal_type}`)
        )

        const mealOrder = ['breakfast', 'brunch', 'lunch', 'snack', 'dinner']
        const mergedPlan: GeneratedPlan = {
          plan: [...accepted, ...relevantReplacements].sort((a, b) => {
            if (a.date < b.date) return -1
            if (a.date > b.date) return 1
            return mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type)
          }),
          shopping_suggestions: data.shopping_suggestions,
          notes: data.notes,
        }

        setPendingPlan(mergedPlan)
      } else {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: "Sorry, I couldn't find replacements. Please try again.",
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
    } finally {
      setIsGeneratingPlan(false)
    }
  }

  const handleActionApply = useCallback(async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg?.action) return

    const { type } = msg.action

    try {
      if (type === 'plan_meals') {
        // Fast path: plan was already generated server-side inside ai-chat
        const embedded = msg.action.params.planData as GeneratedPlan | undefined
        if (embedded?.plan?.length) {
          shownPlanMessageIds.current.add(messageId)
          setPendingPlan(embedded)
          updateMessage(messageId, { action: undefined })
          return
        }

        // Slow path: call generate-meal-plan separately (fallback)
        setIsGeneratingPlan(true)
        try {
          const result = await applyAction(msg.action)
          if (result) {
            setPendingPlan(result)
            updateMessage(messageId, { action: undefined })
          } else {
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: "Sorry, I couldn't generate the meal plan. Try asking again with more specific dates or preferences.",
              timestamp: Date.now(),
            })
          }
        } finally {
          setIsGeneratingPlan(false)
        }
      } else {
        await applyAction(msg.action)
        updateMessage(messageId, { action: undefined })
      }
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
    }
  }, [messages, applyAction, addMessage, updateMessage])

  const handleActionDismiss = useCallback((messageId: string) => {
    updateMessage(messageId, { action: undefined })
  }, [updateMessage])

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
              onRequestReplacements={handleRequestReplacements}
              onDismiss={() => setPendingPlan(null)}
            />
          </>
        )}
      </AnimatePresence>
    </>
  )
}
