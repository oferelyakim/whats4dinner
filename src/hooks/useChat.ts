import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/stores/chatStore'
import type { ChatMessage } from '@/stores/chatStore'
import { useAIAccess } from './useAIAccess'
import { useAuth } from './useAuth'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { sendChatMessage, getFreeRecipeImportCount, logChatUsage, type ChatApiMessage } from '@/services/ai-chat'
import { importRecipeFromUrl } from '@/services/recipeImport'
import { FREE_RECIPE_IMPORT_CAP } from '@/lib/constants'
import { createActivity } from '@/services/activities'
import { createRecipe } from '@/services/recipes'
import { supabase } from '@/services/supabase'
import { getCircleMembers } from '@/services/circles'
import type { GeneratedPlan } from '@/components/chat/ChatPlanReview'

export function useChat() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const ai = useAIAccess()
  const { activeCircle } = useAppStore()
  const { locale, t } = useI18n()
  const queryClient = useQueryClient()

  const {
    messages,
    isOpen,
    isLoading,
    openChat,
    closeChat,
    toggleChat,
    addMessage,
    updateMessage,
    clearMessages,
    setLoading,
  } = useChatStore()

  const { data: freeImportCount = 0 } = useQuery({
    queryKey: ['free-recipe-import-count', userId],
    queryFn: () => getFreeRecipeImportCount(userId!),
    enabled: !!userId && !ai.hasAI,
  })

  const freeImportsRemaining = FREE_RECIPE_IMPORT_CAP - freeImportCount

  const applyAction = useCallback(
    async (action: { type: string; params: Record<string, unknown> }): Promise<GeneratedPlan | undefined> => {
      if (!userId || !activeCircle?.id) return undefined

      if (action.type === 'create_activity') {
        const members = await getCircleMembers(activeCircle.id)
        const assignedName = action.params.assigned_to as string | undefined

        const dayMap: Record<string, number> = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
          thursday: 4, friday: 5, saturday: 6,
        }
        const dayName = ((action.params.day_of_week as string) || '').toLowerCase()
        const dayNum = dayMap[dayName]
        const recurrence = (action.params.recurrence as string) || 'weekly'

        // Prefer the concrete start_date Claude resolved from the Current Date
        // Context. Fall back to computing the next occurrence of day_of_week
        // only when Claude didn't provide one (older clients / old prompts).
        const claudeStart = (action.params.start_date as string | undefined)?.trim()
        let startDateStr: string
        if (claudeStart && /^\d{4}-\d{2}-\d{2}$/.test(claudeStart)) {
          startDateStr = claudeStart
        } else {
          const today = new Date()
          const startDate = new Date(today)
          if (dayNum !== undefined) {
            const daysUntil = (dayNum - today.getDay() + 7) % 7
            // daysUntil=0 means today IS the target day — start today, not next week.
            startDate.setDate(today.getDate() + daysUntil)
          }
          startDateStr = startDate.toISOString().split('T')[0]
        }

        // For weekly/biweekly recurrence, recurrence_days is required. Derive
        // it from start_date if Claude didn't send a day_of_week.
        let recurrenceDays: number[] = []
        if (recurrence === 'weekly' || recurrence === 'biweekly' || recurrence === 'custom') {
          if (dayNum !== undefined) {
            recurrenceDays = [dayNum]
          } else {
            const derivedDay = new Date(startDateStr + 'T12:00:00').getDay()
            recurrenceDays = [derivedDay]
          }
        }

        let resolvedAssignedName = assignedName
        if (assignedName) {
          const matched = members.find((m) => {
            const displayName = (m.profile?.display_name || '').toLowerCase()
            return (
              displayName.includes(assignedName.toLowerCase()) ||
              assignedName.toLowerCase().includes(displayName.split(' ')[0])
            )
          })
          if (matched?.profile?.display_name) {
            resolvedAssignedName = matched.profile.display_name
          }
        }

        await createActivity({
          circle_id: activeCircle.id,
          name: action.params.name as string,
          recurrence_type: recurrence,
          recurrence_days: recurrenceDays,
          start_date: startDateStr,
          start_time: (action.params.start_time as string | undefined) ?? undefined,
          end_time: (action.params.end_time as string | undefined) ?? undefined,
          end_date: (action.params.end_date as string | undefined) ?? undefined,
          assigned_name: resolvedAssignedName ?? undefined,
        })

        queryClient.invalidateQueries({ queryKey: ['activities'] })
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ Done! I've added "${action.params.name as string}" to the schedule (starting ${startDateStr}).`,
          timestamp: Date.now(),
        })
        return undefined
      }

      if (action.type === 'plan_meals') {
        const { data, error } = await supabase.functions.invoke('generate-meal-plan', {
          body: {
            circleId: activeCircle.id,
            dates: action.params.dates,
            planScope: 'custom',
            preferences: {
              special_requests: (action.params.preferences as string) || '',
            },
          },
        })
        if (!error && data?.plan) {
          return data as GeneratedPlan
        }
        return undefined
      }

      if (action.type === 'add_to_shopping_list') {
        const items = action.params.items as string[]
        const { data: lists } = await supabase
          .from('shopping_lists')
          .select('id')
          .eq('circle_id', activeCircle.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)

        if (lists?.[0]) {
          for (const item of items) {
            await supabase.from('shopping_list_items').insert({
              list_id: lists[0].id,
              name: item,
              checked: false,
              sort_order: 0,
            })
          }
          queryClient.invalidateQueries({ queryKey: ['shopping-list-items'] })
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `✅ Added ${items.length} item${items.length > 1 ? 's' : ''} to your shopping list.`,
            timestamp: Date.now(),
          })
        }
        return undefined
      }

      if (action.type === 'create_recipe') {
        const p = action.params
        const recipe = await createRecipe({
          circle_id: activeCircle.id,
          title: p.title as string,
          description: (p.description as string) || undefined,
          tags: (p.tags as string[]) || [],
          instructions: (p.instructions as string) || undefined,
          servings: (p.servings as number) || undefined,
          prep_time_min: (p.prep_time_minutes as number) || undefined,
          cook_time_min: (p.cook_time_minutes as number) || undefined,
          ingredients: ((p.ingredients as Array<{ name: string; quantity?: number; unit?: string }>) || []).map((ing, idx) => ({
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: (ing.unit || '') as import('@/lib/constants').Unit,
            sort_order: idx,
            notes: null,
            item_id: null,
          })),
        })
        queryClient.invalidateQueries({ queryKey: ['recipes'] })
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ Recipe "${recipe.title}" has been saved to your recipes!`,
          timestamp: Date.now(),
        })
        return undefined
      }

      return undefined
    },
    [userId, activeCircle?.id, addMessage, queryClient],
  )

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || !userId) return

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      }
      addMessage(userMsg)

      const loadingMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isLoading: true,
      }
      addMessage(loadingMsg)
      setLoading(true)

      try {
        const apiMessages = [...messages, userMsg]
          .filter((m) => !m.isLoading && m.content.trim())
          .map((m) => ({
            role: m.role,
            content: m.content,
          }))

        const response = await sendChatMessage(
          apiMessages,
          activeCircle?.id,
          locale,
        )

        updateMessage(loadingMsg.id, {
          content: response.reply,
          action: response.action,
          isLoading: false,
        })

        // Log usage
        const actionType = response.action?.type === 'import_recipe_url'
          ? ('chat_recipe_import' as const)
          : ('chat' as const)
        logChatUsage(userId, actionType, response._ai_usage)

        // Handle recipe import action for free users
        if (response.action?.type === 'import_recipe_url') {
          const url = response.action.params.url as string
          if (!ai.hasAI && freeImportCount >= FREE_RECIPE_IMPORT_CAP) {
            updateMessage(loadingMsg.id, {
              content: response.reply + '\n\n' + t('chat.importLimitReached'),
              action: undefined,
              isLoading: false,
            })
            return
          }
          // Auto-execute recipe import
          try {
            const recipe = await importRecipeFromUrl(url)
            queryClient.invalidateQueries({ queryKey: ['free-recipe-import-count'] })
            updateMessage(loadingMsg.id, {
              content: response.reply,
              action: {
                type: 'import_recipe_url',
                params: { url, recipe },
                confirmation: t('chat.recipeImported'),
              },
              isLoading: false,
            })
          } catch {
            updateMessage(loadingMsg.id, {
              content: response.reply + '\n\n' + t('chat.recipeImportFailed'),
              action: undefined,
              isLoading: false,
            })
          }
        }

        // Refresh AI usage queries
        if (ai.hasAI) {
          queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
        }
      } catch {
        updateMessage(loadingMsg.id, {
          content: t('chat.errorGeneric'),
          isLoading: false,
        })
      } finally {
        setLoading(false)
      }
    },
    [userId, messages, activeCircle?.id, locale, ai.hasAI, freeImportCount, addMessage, updateMessage, setLoading, queryClient],
  )

  // Revise an existing meal plan in-place. Injects the current plan as context
  // and forces the model to call plan_meals so we always get structured data
  // back — never a conversational refusal that leaves the UI stuck.
  const revisePlan = useCallback(
    async (currentPlan: GeneratedPlan, request: string, signal?: AbortSignal): Promise<GeneratedPlan | null> => {
      if (!userId) return null
      const trimmed = request.trim()
      if (!trimmed) return null

      // Surface the request in the chat transcript so the user can see what was asked.
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      })
      setLoading(true)
      try {
        const planSummary = currentPlan.plan
          .map((p) => `- ${p.date} ${p.meal_type}: "${p.recipe_title}"${p.description ? ' — ' + p.description : ''}`)
          .join('\n')
        const dates = Array.from(new Set(currentPlan.plan.map((p) => p.date)))

        const wrappedRevisionMessage =
          `Current meal plan you previously generated:\n${planSummary}\n\n` +
          `Dates: ${dates.join(', ')}\n\n` +
          `User revision request: "${trimmed}"\n\n` +
          `Call plan_meals with these same dates to return a revised plan that applies the user's feedback. ` +
          `For any dish the user wants from a real recipe online, set source_preference: "web". ` +
          `Keep dishes that the user did not ask to change.`

        const apiMessages: ChatApiMessage[] = [...messages]
          .filter((m) => !m.isLoading && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content }))
        apiMessages.push({ role: 'user', content: wrappedRevisionMessage })

        if (signal?.aborted) return null
        const response = await sendChatMessage(apiMessages, activeCircle?.id, locale, true)
        if (signal?.aborted) return null

        logChatUsage(userId, 'chat', response._ai_usage)
        if (ai.hasAI) {
          queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
        }

        const planData = response.action?.params?.planData as GeneratedPlan | undefined
        if (planData?.plan?.length) {
          return planData
        }
        return null
      } catch {
        return null
      } finally {
        setLoading(false)
      }
    },
    [userId, messages, activeCircle?.id, locale, ai.hasAI, queryClient, addMessage, setLoading],
  )

  return {
    messages,
    isOpen,
    isLoading,
    isPaid: ai.hasAI,
    freeImportCount,
    freeImportsRemaining,
    freeImportCap: FREE_RECIPE_IMPORT_CAP,
    openChat,
    closeChat,
    toggleChat,
    sendMessage,
    applyAction,
    revisePlan,
    addMessage,
    updateMessage,
    clearMessages,
    showUpgradeModal: ai.showUpgradeModal,
    setShowUpgradeModal: ai.setShowUpgradeModal,
  }
}
