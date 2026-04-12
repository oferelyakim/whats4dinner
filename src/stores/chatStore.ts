import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  action?: {
    type: string
    params: Record<string, unknown>
    confirmation: string
  }
  timestamp: number
  isLoading?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isLoading: boolean

  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  addMessage: (msg: ChatMessage) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  clearMessages: () => void
  setLoading: (loading: boolean) => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isOpen: false,
  isLoading: false,

  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  toggleChat: () => set((s) => ({ isOpen: !s.isOpen })),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  clearMessages: () => set({ messages: [] }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
