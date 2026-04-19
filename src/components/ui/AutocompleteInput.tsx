import { useState, useRef, useEffect, useId } from 'react'
import { cn } from '@/lib/cn'

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  autoFocus,
}: AutocompleteInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filtered, setFiltered] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  useEffect(() => {
    if (value.length === 0) {
      setFiltered(suggestions.slice(0, 6))
      return
    }
    const lower = value.toLowerCase()
    const matches = suggestions
      .filter((s) => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower)
      .slice(0, 6)
    setFiltered(matches)
  }, [value, suggestions])

  // Reset active index when suggestions list changes
  useEffect(() => {
    setActiveIndex(-1)
  }, [filtered])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isOpen = showSuggestions && filtered.length > 0

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      onChange(filtered[activeIndex])
      setShowSuggestions(false)
      setActiveIndex(-1)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value)
          setShowSuggestions(true)
        }}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 pb-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 transition-colors',
          className
        )}
      />
      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-surface-dark-elevated border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {filtered.map((suggestion, index) => (
            <button
              key={suggestion}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              onClick={() => {
                onChange(suggestion)
                setShowSuggestions(false)
                setActiveIndex(-1)
              }}
              className={cn(
                'w-full text-start px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-surface-dark-overlay transition-colors',
                index === activeIndex && 'bg-brand-50 dark:bg-surface-dark-overlay'
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
