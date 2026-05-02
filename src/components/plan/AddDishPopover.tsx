// v3.0.0 — Add-dish anchored popover (recipe / template / AI suggest).
//
// Per the design handoff: small 196px-wide popover anchored to the slot's
// "+ add" button. Three rows; AI row is dimmed for free users with the AI
// chip still visible (implies upgrade path).

import { useEffect, useRef } from 'react'
import { BookOpen, LayoutGrid, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'

export type AddSource = 'recipe' | 'template' | 'ai'

interface Props {
  isPaid: boolean
  onPick: (source: AddSource) => void
  onUpgrade: () => void
  onClose: () => void
}

export function AddDishPopover({ isPaid, onPick, onUpgrade, onClose }: Props) {
  const t = useI18n((s) => s.t)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full mt-2 z-40 w-[200px] bg-rp-card border border-rp-hairline rounded-xl py-1 overflow-hidden"
      style={{ boxShadow: '0 14px 28px -10px rgba(40, 20, 10, 0.25)' }}
    >
      <Item
        icon={<BookOpen className="h-3.5 w-3.5" />}
        label={t('add.fromRecipe')}
        onClick={() => onPick('recipe')}
      />
      <Divider />
      <Item
        icon={<LayoutGrid className="h-3.5 w-3.5" />}
        label={t('add.fromTemplate')}
        onClick={() => onPick('template')}
      />
      <Divider />
      <Item
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label={t('add.aiSuggest')}
        chip="AI"
        dim={!isPaid}
        onClick={() => (isPaid ? onPick('ai') : onUpgrade())}
      />
    </div>
  )
}

function Item({
  icon,
  label,
  chip,
  dim = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  chip?: string
  dim?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-rp-bg-soft transition-colors',
        dim && 'opacity-60',
      )}
    >
      <span className="text-rp-ink-soft">{icon}</span>
      <span className="flex-1 text-[13px] text-rp-ink">{label}</span>
      {chip && (
        <span
          className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: '#f2c14e', color: '#1f1612' }}
        >
          {chip}
        </span>
      )}
    </button>
  )
}

function Divider() {
  return <div className="h-px bg-rp-hairline-soft mx-3" />
}
