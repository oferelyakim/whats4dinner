import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

export interface SpeedDialItem {
  icon: LucideIcon
  label: string
  onClick: () => void
  color?: string
}

interface SpeedDialProps {
  items: SpeedDialItem[]
}

export function SpeedDial({ items }: SpeedDialProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* FAB container */}
      <div className="fixed bottom-20 end-4 z-50 flex flex-col items-end gap-3">
        {/* Speed dial items */}
        <AnimatePresence>
          {open &&
            items.map((item, index) => (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.8 }}
                transition={{
                  duration: 0.2,
                  delay: (items.length - 1 - index) * 0.05,
                }}
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
                className="flex items-center gap-2.5 active:scale-95 transition-transform"
              >
                <span className="text-sm font-medium text-white bg-slate-800/90 dark:bg-slate-700/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                  {item.label}
                </span>
                <span
                  className="h-11 w-11 rounded-full shadow-lg flex items-center justify-center"
                  style={{
                    backgroundColor: item.color || 'rgb(var(--color-brand-500, 249 115 22))',
                  }}
                >
                  <item.icon className="h-5 w-5 text-white" />
                </span>
              </motion.button>
            ))}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          onClick={() => setOpen((v) => !v)}
          animate={{ rotate: open ? 135 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="h-14 w-14 rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/30 flex items-center justify-center active:scale-90 transition-[transform,box-shadow]"
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </motion.button>
      </div>
    </>
  )
}
