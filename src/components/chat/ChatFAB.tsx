import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/stores/chatStore'
import { useI18n } from '@/lib/i18n'

/** Returns true when any Radix dialog (or sheet) is open in the DOM. */
function useAnyDialogOpen(): boolean {
  const [anyOpen, setAnyOpen] = useState(false)

  useEffect(() => {
    const checkDialogs = () => {
      const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]')
      setAnyOpen(openDialogs.length > 0)
    }

    // Run once on mount in case a dialog is already open
    checkDialogs()

    const observer = new MutationObserver(checkDialogs)

    // Watch the whole document for attribute and subtree changes so we catch
    // Radix portal mounts/unmounts and data-state transitions
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
      childList: true,
    })

    return () => observer.disconnect()
  }, [])

  return anyOpen
}

export function ChatFAB() {
  const { toggleChat, isOpen } = useChatStore()
  const { t } = useI18n()
  const anyDialogOpen = useAnyDialogOpen()

  // Hide while any dialog (including the chat dialog itself) is open.
  // This avoids z-index battles with Radix overlays and keeps focus on the sheet.
  const visible = !isOpen && !anyDialogOpen

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="chat-fab"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          onClick={toggleChat}
          aria-label={t('chat.title')}
          className="fixed end-4 z-[55] h-14 w-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 flex items-center justify-center active:scale-90 transition-[transform,box-shadow] hover:shadow-xl"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          <MessageCircle className="h-6 w-6" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
