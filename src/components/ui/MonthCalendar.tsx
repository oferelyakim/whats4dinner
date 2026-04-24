import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useI18n, type Locale } from '@/lib/i18n'

interface MonthCalendarProps {
  year: number
  month: number // 0-indexed
  selectedDate: string | null
  onSelectDate: (dateStr: string) => void
  onNavigate: (year: number, month: number) => void
  activityDots?: Map<string, number>
  locale?: Locale
}

const DAY_LABELS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_LABELS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const DAY_LABELS_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function MonthCalendar({
  year,
  month,
  selectedDate,
  onSelectDate,
  onNavigate,
  activityDots,
  locale = 'en',
}: MonthCalendarProps) {
  const { dir } = useI18n()
  const rtlMultiplier = dir() === 'rtl' ? -1 : 1
  const todayStr = new Date().toISOString().split('T')[0]
  const dayLabels = locale === 'he' ? DAY_LABELS_HE : locale === 'es' ? DAY_LABELS_ES : DAY_LABELS_EN

  const localeMap: Record<Locale, string> = { en: 'en-US', he: 'he-IL', es: 'es-ES' }
  const monthName = new Date(year, month).toLocaleDateString(localeMap[locale], {
    month: 'long',
    year: 'numeric',
  })

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: Array<{ day: number; dateStr: string } | null> = []

    // Empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) result.push(null)

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ day: d, dateStr: formatDateStr(year, month, d) })
    }

    return result
  }, [year, month])

  function goPrev() {
    if (month === 0) onNavigate(year - 1, 11)
    else onNavigate(year, month - 1)
  }

  function goNext() {
    if (month === 11) onNavigate(year + 1, 0)
    else onNavigate(year, month + 1)
  }

  return (
    <div className="select-none">
      {/* Month navigation header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goPrev}
          aria-label="Previous month"
          className="h-11 w-11 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-surface-dark-overlay active:scale-90 transition-transform"
        >
          <ChevronLeft className="h-4 w-4 text-rp-ink-soft rtl-flip" />
        </button>
        <h3 className="text-sm font-semibold text-rp-ink capitalize">
          {monthName}
        </h3>
        <button
          onClick={goNext}
          aria-label="Next month"
          className="h-11 w-11 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-surface-dark-overlay active:scale-90 transition-transform"
        >
          <ChevronRight className="h-4 w-4 text-rp-ink-soft rtl-flip" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map((label, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium text-slate-400 py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${year}-${month}`}
          initial={{ opacity: 0, x: 20 * rtlMultiplier }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 * rtlMultiplier }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-7 gap-y-0.5"
        >
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} />
            }
            const { day, dateStr } = cell
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const dotCount = activityDots?.get(dateStr) || 0

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDate(dateStr)}
                className={cn(
                  'flex flex-col items-center py-1.5 rounded-lg transition-all mx-0.5',
                  isSelected
                    ? 'bg-brand-500 text-white shadow-sm'
                    : isToday
                      ? 'bg-brand-50 dark:bg-brand-900/20'
                      : 'hover:bg-slate-50 dark:hover:bg-surface-dark-overlay'
                )}
              >
                <span
                  className={cn(
                    'text-sm font-medium',
                    isSelected
                      ? 'text-white'
                      : isToday
                        ? 'text-brand-600 dark:text-brand-400 font-bold'
                        : 'text-rp-ink-soft'
                  )}
                >
                  {day}
                </span>
                {/* Activity dots */}
                {dotCount > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: Math.min(dotCount, 3) }).map((_, di) => (
                      <span
                        key={di}
                        className={cn(
                          'h-1 w-1 rounded-full',
                          isSelected ? 'bg-white/80' : 'bg-brand-500'
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
