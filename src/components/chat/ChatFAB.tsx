import { MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useChatStore } from '@/stores/chatStore'
import { useI18n } from '@/lib/i18n'

export function ChatFAB() {
  const { toggleChat, isOpen } = useChatStore()
  const { t } = useI18n()

  if (isOpen) return null

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.3 }}
      onClick={toggleChat}
      aria-label={t('chat.title')}
      className="fixed end-4 z-[55] h-14 w-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 flex items-center justify-center active:scale-90 transition-[transform,box-shadow] hover:shadow-xl"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
    >
      <MessageCircle className="h-6 w-6" />
    </motion.button>
  )
}
