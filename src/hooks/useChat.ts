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
import { FREE_RECIPE_IMPORT_CAP } from '@/lib/constants'

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
    clearMessages,
    showUpgradeModal: ai.showUpgradeModal,
    setShowUpgradeModal: ai.setShowUpgradeModal,
  }
}
