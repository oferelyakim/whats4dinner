import { supabase } from './supabase'
import type { AIActionType } from '@/types'
import { logAIUsage } from './ai-usage'
import { CHAT_MAX_HISTORY } from '@/lib/constants'

export interface ChatApiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  reply: string
  action?: {
    type: string
    params: Record<string, unknown>
    confirmation: string
  }
  isPaid: boolean
  _ai_usage?: {
    model: string
    tokens_in: number
    tokens_out: number
    cost_usd: number
  }
}

export async function sendChatMessage(
  messages: ChatApiMessage[],
  circleId: string | undefined,
  locale: string,
): Promise<ChatResponse> {
  const trimmed = messages.slice(-CHAT_MAX_HISTORY)

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { messages: trimmed, circleId, locale },
  })

  if (error) {
    const msg = typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>).message ?? JSON.stringify(error)
      : String(error)
    throw new Error(String(msg) || 'Chat request failed')
  }
  return data as ChatResponse
}

export async function getFreeRecipeImportCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_free_recipe_import_count', {
    p_user_id: userId,
  })
  if (error) return 0
  return (data as number) ?? 0
}

export async function logChatUsage(
  userId: string,
  actionType: AIActionType,
  usage?: ChatResponse['_ai_usage'],
): Promise<void> {
  if (!usage) return
  await logAIUsage(
    userId,
    actionType,
    usage.model,
    usage.tokens_in,
    usage.tokens_out,
    usage.cost_usd,
  )
}
