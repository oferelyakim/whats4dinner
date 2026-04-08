import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/cn'

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
}: AutocompleteInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filtered, setFiltered] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value.length < 2) {
      setFiltered([])
      return
    }
    const lower = value.toLowerCase()
    const matches = suggestions
      .filter((s) => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower)
      .slice(0, 6)
    setFiltered(matches)
  }, [value, suggestions])

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

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowSuggestions(true)
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
        className={cn(
          'w-full text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 pb-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 transition-colors',
          className
        )}
      />
      {showSuggestions && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-surface-dark-elevated border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {filtered.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                onChange(suggestion)
                setShowSuggestions(false)
              }}
              className="w-full text-start px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-surface-dark-overlay transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
