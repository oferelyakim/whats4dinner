import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Clock, CheckSquare, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotifications, type AppNotification } from '@/hooks/useNotifications'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const bellButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { notifications, todayCount } = useNotifications()
  const navigate = useNavigate()
  const { t } = useI18n()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Move focus into panel when opened, return focus to bell when closed
  useEffect(() => {
    if (open) {
      // Focus the first focusable element inside the panel on next tick
      requestAnimationFrame(() => {
        const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        firstFocusable?.focus()
      })
    } else {
      bellButtonRef.current?.focus()
    }
  }, [open])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  function handleNotificationClick(n: AppNotification) {
    setOpen(false)
    if (n.type === 'reminder' && n.activityId) {
      navigate('/household/activities')
    } else if (n.type === 'chore') {
      navigate('/household/chores')
    }
  }

  function requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  const showBadge = todayCount > 0

  return (
    <div ref={ref} className="relative">
      <button
        ref={bellButtonRef}
        onClick={() => { setOpen(!open); requestPermission() }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('reminder.upcoming')}
        className="relative h-11 w-11 rounded-xl flex items-center justify-center bg-slate-100/80 dark:bg-surface-dark-elevated active:scale-90 transition-transform"
      >
        <Bell className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400" />
        {showBadge && (
          <span className="absolute -top-0.5 -end-0.5 h-4 min-w-4 px-1 rounded-full bg-brand-500 text-[10px] font-bold text-white flex items-center justify-center" aria-hidden="true">
            {todayCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label={t('reminder.upcoming')}
            aria-modal="true"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute end-0 top-11 w-80 max-h-96 overflow-y-auto rounded-2xl bg-white dark:bg-surface-dark-elevated border border-slate-200 dark:border-slate-700 shadow-xl z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('reminder.upcoming')}
              </h3>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-slate-100 dark:hover:bg-surface-dark-overlay transition-colors flex items-center justify-center"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm text-slate-400">{t('reminder.noReminders')}</p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className="w-full text-start px-4 py-3 hover:bg-slate-50 dark:hover:bg-surface-dark-overlay transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                        n.type === 'reminder' ? 'bg-blue-500/10' : 'bg-amber-500/10'
                      )} aria-hidden="true">
                        {n.type === 'reminder' ? (
                          <Clock className="h-4 w-4 text-blue-500" />
                        ) : (
                          <CheckSquare className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                      </div>
                      {n.date === new Date().toISOString().split('T')[0] && (
                        <span className="text-[10px] font-medium text-brand-500 bg-brand-50 dark:bg-brand-500/10 px-1.5 py-0.5 rounded-full shrink-0">
                          Today
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
