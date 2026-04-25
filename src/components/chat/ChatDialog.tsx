import { useRef, useEffect, useState, useCallback, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Send, Sparkles, Trash2 } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useChat } from '@/hooks/useChat'
import { useI18n } from '@/lib/i18n'
import { ChatMessage } from './ChatMessage'
import { ChatWelcome } from './ChatWelcome'
import { ChatPlanReview } from './ChatPlanReview'
import { PlanShoppingModal } from './PlanShoppingModal'
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
  const navigate = useNavigate()
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
    revisePlan,
    addMessage,
    updateMessage,
    clearMessages,
    showUpgradeModal,
    setShowUpgradeModal,
  } = useChat()

  const [input, setInput] = useState('')
  const [pendingPlan, setPendingPlan] = useState<GeneratedPlan | null>(null)
  const [isAcceptingPlan, setIsAcceptingPlan] = useState(false)
  const [shoppingItems, setShoppingItems] = useState<MealPlanItem[] | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isRevisingPlan, setIsRevisingPlan] = useState(false)
  const reviseAbortRef = useRef<AbortController | null>(null)
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
      if (!msg.isLoading && msg.action?.type === 'plan_meals' && !shownPlanMessageIds.current.has(msg.id)) {
        // If inline generation failed, clean up and show error
        if (msg.action.params.planGenerationFailed) {
          shownPlanMessageIds.current.add(msg.id)
          updateMessage(msg.id, { action: undefined })
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              "I couldn't generate that plan from chat. Try the new slot-based planner — it's more reliable and lets you replace dishes one at a time. Open /plan-v2 from the menu.",
            timestamp: Date.now(),
          })
          break
        }

        const planData = msg.action.params.planData as GeneratedPlan | undefined
        if (planData && planData.plan && planData.plan.length > 0) {
          shownPlanMessageIds.current.add(msg.id)
          setPendingPlan(planData)
          updateMessage(msg.id, { action: undefined })
        }
        break
      }
    }
  }, [messages, pendingPlan, updateMessage, addMessage])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage(input)
    setInput('')
  }

  const handleSuggestionClick = (text: string) => {
    sendMessage(text)
  }

  // Helper: extract a human-readable error message from a Supabase FunctionsHttpError
  const extractFunctionsErrorMessage = useCallback(
    async (error: unknown): Promise<string> => {
      if (error && typeof error === 'object' && 'context' in error) {
        const ctx = (error as { context: Response }).context
        try {
          const json = await ctx.clone().json() as { error?: string; detail?: string }
          if (json.error) return json.detail ? `${json.error}: ${json.detail}` : json.error
        } catch {
          try {
            const text = await ctx.clone().text()
            if (text) return text
          } catch {
            // fall through
          }
        }
      }
      if (error instanceof Error) return error.message
      return String(error)
    },
    [],
  )

  // Fetch a single item via get-recipe and update results in-place
  const fetchSingleRecipe = useCallback(
    async (item: MealPlanItem, results: MealPlanItem[], index: number): Promise<void> => {
      try {
        const { data, error } = await supabase.functions.invoke('get-recipe', {
          body: {
            dish_name: item.recipe_title,
            tags: item.tags || [],
            source_preference: item.source_preference || 'web',
            preferences: item.description || '',
          },
        })
        if (data && !error) {
          results[index] = {
            ...item,
            ingredients: data.ingredients,
            instructions: data.instructions,
            servings: data.servings ?? item.servings,
            estimated_time_min: data.estimated_time_min ?? item.estimated_time_min,
            tags: data.tags?.length ? data.tags : item.tags || [],
            from_web: data.from_web,
            source_url: data.source_url,
            thumbnail: data.thumbnail,
            _status: 'ready',
            _errorMessage: undefined,
          }
        } else {
          const errorMessage = await extractFunctionsErrorMessage(error)
          console.error('[ai-chat] get-recipe failed', item.recipe_title, errorMessage)
          results[index] = { ...item, _status: 'error', _errorMessage: errorMessage }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error('[ai-chat] get-recipe failed', item.recipe_title, errorMessage)
        results[index] = { ...item, _status: 'error', _errorMessage: errorMessage }
      }
    },
    [extractFunctionsErrorMessage],
  )

  // Phase 2: fetch full recipes in parallel via get-recipe edge function
  const handleApproveAndFetchRecipes = useCallback(async (selectedItems: MealPlanItem[]) => {
    setFetchError(null)
    // Move to fetching stage — all items start in loading state
    const loadingItems: MealPlanItem[] = selectedItems.map((item) => ({
      ...item,
      _status: 'loading' as const,
    }))
    setPendingPlan((prev) =>
      prev ? { ...prev, plan: loadingItems, _stage: 'fetching' } : null
    )

    // Mutable array for progressive updates
    const results: MealPlanItem[] = [...loadingItems]

    await Promise.allSettled(
      selectedItems.map((item, i) =>
        fetchSingleRecipe(item, results, i).then(() => {
          setPendingPlan((prev) =>
            prev ? { ...prev, plan: [...results] } : null
          )
        })
      )
    )

    // If every single item failed, surface a top-level error
    const allFailed = results.every((r) => r._status === 'error')
    if (allFailed) {
      const firstError = results[0]?._errorMessage ?? t('chat.planReview.fetchAllFailed')
      setFetchError(firstError)
    }

    // Mark the whole plan as ready
    setPendingPlan((prev) => (prev ? { ...prev, _stage: 'ready' } : null))
  }, [fetchSingleRecipe, t])

  // Retry a single failed item
  const handleRetryItem = useCallback(async (failedItem: MealPlanItem) => {
    if (!pendingPlan) return
    setFetchError(null)
    const results: MealPlanItem[] = pendingPlan.plan.map((p) =>
      p.recipe_title === failedItem.recipe_title && p.date === failedItem.date && p.meal_type === failedItem.meal_type
        ? { ...p, _status: 'loading' as const, _errorMessage: undefined }
        : p
    )
    setPendingPlan((prev) => prev ? { ...prev, plan: results, _stage: 'fetching' } : null)

    const index = results.findIndex(
      (p) => p.recipe_title === failedItem.recipe_title && p.date === failedItem.date && p.meal_type === failedItem.meal_type
    )
    if (index === -1) return

    await fetchSingleRecipe(failedItem, results, index)
    const allFailed = results.every((r) => r._status === 'error')
    if (allFailed) {
      setFetchError(results[0]?._errorMessage ?? t('chat.planReview.fetchAllFailed'))
    }
    setPendingPlan((prev) => prev ? { ...prev, plan: [...results], _stage: 'ready' } : null)
  }, [pendingPlan, fetchSingleRecipe, t])

  // Retry all failed items
  const handleRetryAllFailed = useCallback(async () => {
    if (!pendingPlan) return
    setFetchError(null)
    const currentPlan: MealPlanItem[] = pendingPlan.plan.map((p) =>
      p._status === 'error'
        ? { ...p, _status: 'loading' as const, _errorMessage: undefined }
        : p
    )
    setPendingPlan((prev) => prev ? { ...prev, plan: currentPlan, _stage: 'fetching' } : null)

    const results: MealPlanItem[] = [...currentPlan]
    const failedIndices = currentPlan.reduce<number[]>((acc, p, i) => {
      if (p._status === 'loading') acc.push(i)
      return acc
    }, [])

    await Promise.allSettled(
      failedIndices.map((i) =>
        fetchSingleRecipe(results[i], results, i).then(() => {
          setPendingPlan((prev) =>
            prev ? { ...prev, plan: [...results] } : null
          )
        })
      )
    )

    const retriedAllFailed =
      failedIndices.length > 0 &&
      failedIndices.every((i) => results[i]?._status === 'error')
    if (retriedAllFailed) {
      const firstFailed = failedIndices.map((i) => results[i]).find((r) => r?._errorMessage)
      setFetchError(firstFailed?._errorMessage ?? t('chat.planReview.fetchAllFailed'))
    }
    setPendingPlan((prev) => (prev ? { ...prev, _stage: 'ready' } : null))
  }, [pendingPlan, fetchSingleRecipe, t])

  const handleActionApply = useCallback(async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg?.action) return

    const { type } = msg.action

    try {
      if (type === 'plan_meals') {
        // If inline generation failed server-side, show a retry message
        if (msg.action.params.planGenerationFailed) {
          updateMessage(messageId, { action: undefined })
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              "I couldn't generate that plan from chat. Try the new slot-based planner at /plan-v2 — it builds the plan one dish at a time, so failures are isolated and you can replace any single dish without restarting.",
            timestamp: Date.now(),
          })
          return
        }

        // Fast path: plan was already generated server-side inside ai-chat
        const embedded = msg.action.params.planData as GeneratedPlan | undefined
        if (embedded?.plan?.length) {
          shownPlanMessageIds.current.add(messageId)
          setPendingPlan(embedded)
          updateMessage(messageId, { action: undefined })
          return
        }

        // Fallback — dismiss the action and tell user to retry
        updateMessage(messageId, { action: undefined })
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: "Something went wrong generating the plan. Please try asking again.",
          timestamp: Date.now(),
        })
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

  const handleNavigateToRecipe = useCallback((recipeId: string) => {
    setPendingPlan(null)
    closeChat()
    navigate(`/recipes/${recipeId}`)
  }, [navigate, closeChat])

  const handleRevisePlan = useCallback(
    async (request: string) => {
      if (!pendingPlan || isRevisingPlan) return
      // Abort any previous in-flight revision
      reviseAbortRef.current?.abort()
      const controller = new AbortController()
      reviseAbortRef.current = controller

      setFetchError(null)
      setIsRevisingPlan(true)
      try {
        const newPlan = await revisePlan(pendingPlan, request, controller.signal)
        if (controller.signal.aborted) return
        if (newPlan?.plan?.length) {
          // Replace plan in place — back to selecting stage so user can review.
          setPendingPlan({ ...newPlan, _stage: 'selecting' })
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "Here's the revised plan — review and approve when you're happy with it.",
            timestamp: Date.now(),
          })
        } else {
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content:
              "I couldn't generate a revised plan. Try rephrasing the change, or close this and start a new plan from the chat.",
            timestamp: Date.now(),
          })
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRevisingPlan(false)
        }
      }
    },
    [pendingPlan, isRevisingPlan, revisePlan, addMessage],
  )

  const handleCancelRevision = useCallback(() => {
    reviseAbortRef.current?.abort()
    reviseAbortRef.current = null
    setIsRevisingPlan(false)
  }, [])

  const handleAcceptPlan = async (selectedItems: MealPlanItem[]) => {
    if (!activeCircle) return
    setIsAcceptingPlan(true)
    try {
      for (const item of selectedItems) {
        let recipeId = item.recipe_id ?? undefined
        if (!recipeId) {
          const recipe = await createRecipe({
            circle_id: activeCircle.id,
            title: item.recipe_title,
            description: item.description,
            source_url: item.source_url,
            ingredients: (item.ingredients || []).map((ing, idx) => ({
              name: ing.name,
              quantity: ing.quantity ?? null,
              unit: (ing.unit || '') as import('@/lib/constants').Unit,
              sort_order: idx,
              notes: null,
              item_id: null,
            })),
            tags: item.tags || [],
            instructions: item.instructions?.length ? item.instructions.join('\n') : undefined,
            servings: item.servings ?? undefined,
            prep_time_min: item.estimated_time_min ?? undefined,
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
      <Dialog.Root modal={false} open={isOpen} onOpenChange={(open) => { if (!open) closeChat() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={closeChat} />
          <Dialog.Content
            className="fixed bottom-0 left-0 right-0 z-50 bg-rp-card rounded-t-3xl max-w-lg mx-auto flex flex-col"
            style={{ maxHeight: '80dvh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-rp-hairline/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-500" />
                <Dialog.Title className="text-base font-semibold text-rp-ink">
                  {t('chat.title')}
                </Dialog.Title>
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                    isPaid
                      ? 'bg-brand-500/10 text-brand-500'
                      : 'bg-slate-100 dark:bg-slate-700 text-rp-ink-mute',
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
                <span className="text-[11px] text-rp-ink-mute">
                  {freeImportsRemaining}/{freeImportCap} {t('chat.importsRemainingLabel')}
                </span>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 px-4 py-3 border-t border-rp-hairline/50"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.inputPlaceholder')}
                disabled={isLoading}
                className="flex-1 h-10 px-4 rounded-xl bg-slate-100 dark:bg-surface-dark-overlay text-sm text-rp-ink placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
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
              isRevising={isRevisingPlan}
              fetchError={fetchError}
              onApprove={handleApproveAndFetchRecipes}
              onAccept={handleAcceptPlan}
              onRequestChanges={handleRevisePlan}
              onCancelRevision={handleCancelRevision}
              onDismiss={() => {
                reviseAbortRef.current?.abort()
                reviseAbortRef.current = null
                setIsRevisingPlan(false)
                setPendingPlan(null)
                setFetchError(null)
              }}
              onNavigateToRecipe={handleNavigateToRecipe}
              onAddToShoppingList={(items) => setShoppingItems(items)}
              onRetryItem={handleRetryItem}
              onRetryAllFailed={handleRetryAllFailed}
            />
          </>
        )}
      </AnimatePresence>

      {/* Shopping list selection modal */}
      <AnimatePresence>
        {shoppingItems && (
          <PlanShoppingModal
            items={shoppingItems}
            onDismiss={() => setShoppingItems(null)}
            onDone={() => {
              setShoppingItems(null)
              addMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '✅ Ingredients added to your shopping list!',
                timestamp: Date.now(),
              })
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
