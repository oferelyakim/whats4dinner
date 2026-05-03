import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/stores/chatStore'
import type { ChatMessage } from '@/stores/chatStore'
import { useAIAccess } from './useAIAccess'
import { useAuth } from './useAuth'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'
import { sendChatMessage, getFreeRecipeImportCount, logChatUsage } from '@/services/ai-chat'
import { importRecipeFromUrl } from '@/services/recipeImport'
import { RECIPE_IMPORT_FREE_CAP } from '@/services/ai-usage'
import { createActivity } from '@/services/activities'
import { createChore } from '@/services/chores'
import { createRecipe, getRecipes } from '@/services/recipes'
import { createEvent } from '@/services/events'
import { supabase } from '@/services/supabase'
import { getCircleMembers } from '@/services/circles'
import type { NavigateFunction } from 'react-router-dom'
import type { Unit } from '@/lib/constants'

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

  const freeImportsRemaining = Math.max(0, RECIPE_IMPORT_FREE_CAP - freeImportCount)

  const applyAction = useCallback(
    async (
      action: { type: string; params: Record<string, unknown> },
      ctx?: { navigate?: NavigateFunction },
    ): Promise<undefined> => {
      if (!userId || !activeCircle?.id) return undefined

      // Soft navigation — the model can ask the user to jump to a feature
      // surface (the dedicated planner, an event detail, the daily meal
      // assistant, etc.) without performing a destructive write.
      if (action.type === 'navigate') {
        const path = action.params.path as string | undefined
        if (path && path.startsWith('/') && ctx?.navigate) {
          ctx.navigate(path)
        }
        return undefined
      }

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
          instructions: Array.isArray(p.instructions)
            ? (p.instructions as string[]).join('\n\n')
            : ((p.instructions as string) || undefined),
          servings: (p.servings as number) || undefined,
          prep_time_min: (p.prep_time_minutes as number) || undefined,
          cook_time_min: (p.cook_time_minutes as number) || undefined,
          ingredients: ((p.ingredients as Array<{ name: string; quantity?: number; unit?: string }>) || []).map((ing, idx) => ({
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: (ing.unit || '') as Unit,
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

      // import_recipe_url — both free + paid land here when the user clicks
      // Apply on the action chip (or, for free, when the auto-execute path
      // already imported and stored the parsed recipe in params.recipe).
      if (action.type === 'import_recipe_url') {
        const url = (action.params.url as string) || ''
        const parsed = action.params.recipe as
          | {
              title: string
              description?: string
              instructions?: string
              image_url?: string
              prep_time_min?: number
              cook_time_min?: number
              servings?: number
              source_url?: string
              ingredients?: Array<{ name: string; quantity?: number; unit?: string }>
              tags?: string[]
            }
          | undefined

        const recipeShape = parsed ?? (await importRecipeFromUrl(url))

        const recipe = await createRecipe({
          circle_id: activeCircle.id,
          title: recipeShape.title,
          description: recipeShape.description,
          source_url: recipeShape.source_url || url || undefined,
          instructions: recipeShape.instructions,
          prep_time_min: recipeShape.prep_time_min,
          cook_time_min: recipeShape.cook_time_min,
          servings: recipeShape.servings,
          tags: recipeShape.tags ?? [],
          ingredients: (recipeShape.ingredients ?? []).map((ing, idx) => ({
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: (ing.unit || '') as Unit,
            sort_order: idx,
            notes: null,
            item_id: null,
          })),
        })

        queryClient.invalidateQueries({ queryKey: ['recipes'] })
        queryClient.invalidateQueries({ queryKey: ['free-recipe-import-count'] })
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ Saved "${recipe.title}". [Open recipe](/recipes/${recipe.id})`,
          timestamp: Date.now(),
        })
        return undefined
      }

      if (action.type === 'create_chore') {
        const p = action.params
        await createChore({
          circle_id: activeCircle.id,
          name: p.name as string,
          icon: (p.emoji as string) || undefined,
          frequency: (p.frequency as string) || 'weekly',
          recurrence_days: (p.recurrence_days as number[]) || [],
          due_time: (p.due_time as string) || undefined,
          points: (p.points as number) || undefined,
          assigned_name: (p.assigned_to as string) || undefined,
        })
        queryClient.invalidateQueries({ queryKey: ['chores'] })
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ Created chore "${p.name as string}". [Open chores](/household/chores)`,
          timestamp: Date.now(),
        })
        return undefined
      }

      // add_recipe_to_plan_day — resolves recipe (by id or title), stashes
      // an in-flight hint in localStorage, navigates to /plan-v2. The
      // planner reads the hint on mount and offers a one-tap "Add to {date}
      // {meal}" button. Falling back to navigate-only keeps the chat fast
      // and leverages the planner's existing add-to-meal flow.
      if (action.type === 'add_recipe_to_plan_day') {
        const p = action.params
        const date = (p.date as string) || ''
        const mealType = (p.meal_type as string) || 'dinner'
        const role = (p.role as string) || 'main'
        let recipeId = (p.recipe_id as string) || ''
        const recipeTitle = (p.recipe_title as string) || ''

        if (!recipeId && recipeTitle) {
          try {
            const recipes = await getRecipes(activeCircle.id, 'recipe')
            const needle = recipeTitle.toLowerCase().trim()
            const match = recipes.find((r) => r.title.toLowerCase().trim() === needle)
              ?? recipes.find((r) => r.title.toLowerCase().includes(needle))
            if (match) recipeId = match.id
          } catch {
            // best-effort
          }
        }

        try {
          localStorage.setItem(
            'replanish.chat.addToPlan',
            JSON.stringify({
              recipeId: recipeId || null,
              recipeTitle: recipeTitle || null,
              date,
              mealType,
              role,
              ts: Date.now(),
            }),
          )
        } catch {
          // private mode / quota — non-fatal
        }

        if (ctx?.navigate) ctx.navigate('/plan-v2')
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Opening the planner — I'll line "${recipeTitle || 'the recipe'}" up for ${mealType} on ${date}. Tap **Add** to confirm. [Open meal planner](/plan-v2)`,
          timestamp: Date.now(),
        })
        return undefined
      }

      // create_event — paid only. Soft side-effect: lets the chat create the
      // event shell, then directs the user to the dedicated event planner.
      if (action.type === 'create_event') {
        const p = action.params
        const event = await createEvent({
          name: p.name as string,
          description: (p.description as string) || undefined,
          event_date: (p.event_date as string) || undefined,
          location: (p.location as string) || undefined,
          circle_id: activeCircle.id,
        })
        queryClient.invalidateQueries({ queryKey: ['events'] })
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `✅ Event "${event.name}" created. [Plan it](/events/${event.id}/plan) — the event planner has menu, supplies, tasks, and activities all in one place.`,
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

        // Log usage
        const actionType = response.action?.type === 'import_recipe_url'
          ? ('chat_recipe_import' as const)
          : ('chat' as const)
        logChatUsage(userId, actionType, response._ai_usage)

        // Handle recipe import action — keep the loading indicator on while
        // we parse + persist the recipe (URL fetches can take 5-30s for the
        // full Anthropic-backed scrape-recipe path). Without this the bubble
        // sits silent for the whole import and looks broken.
        if (response.action?.type === 'import_recipe_url') {
          const url = response.action.params.url as string
          if (!ai.hasAI && freeImportCount >= RECIPE_IMPORT_FREE_CAP) {
            updateMessage(loadingMsg.id, {
              content: response.reply + '\n\n' + t('chat.importLimitReached'),
              action: undefined,
              isLoading: false,
            })
            return
          }

          // Show a transient "importing" status while the full pipeline
          // runs. Reuses isLoading to keep the spinner visible.
          updateMessage(loadingMsg.id, {
            content: t('chat.recipeImporting'),
            isLoading: true,
          })

          try {
            const parsed = await importRecipeFromUrl(url)
            const saved = await createRecipe({
              circle_id: activeCircle?.id,
              title: parsed.title,
              description: parsed.description,
              source_url: parsed.source_url || url,
              instructions: parsed.instructions,
              prep_time_min: parsed.prep_time_min,
              cook_time_min: parsed.cook_time_min,
              servings: parsed.servings,
              tags: parsed.tags ?? [],
              ingredients: (parsed.ingredients ?? []).map((ing, idx) => ({
                name: ing.name,
                quantity: ing.quantity ?? null,
                unit: (ing.unit || '') as Unit,
                sort_order: idx,
                notes: null,
                item_id: null,
              })),
            })
            queryClient.invalidateQueries({ queryKey: ['recipes'] })
            queryClient.invalidateQueries({ queryKey: ['free-recipe-import-count'] })
            updateMessage(loadingMsg.id, {
              content:
                response.reply +
                `\n\n✅ ${t('chat.recipeImported')} [${saved.title}](/recipes/${saved.id})`,
              action: undefined,
              isLoading: false,
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : ''
            updateMessage(loadingMsg.id, {
              content:
                response.reply +
                '\n\n' +
                t('chat.recipeImportFailed') +
                (msg ? `\n\n_${msg}_` : ''),
              action: undefined,
              isLoading: false,
            })
          }
        } else {
          updateMessage(loadingMsg.id, {
            content: response.reply,
            action: response.action,
            isLoading: false,
          })
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

  return {
    messages,
    isOpen,
    isLoading,
    isPaid: ai.hasAI,
    freeImportCount,
    freeImportsRemaining,
    freeImportCap: RECIPE_IMPORT_FREE_CAP,
    openChat,
    closeChat,
    toggleChat,
    sendMessage,
    applyAction,
    addMessage,
    updateMessage,
    clearMessages,
    showUpgradeModal: ai.showUpgradeModal,
    setShowUpgradeModal: ai.setShowUpgradeModal,
  }
}
