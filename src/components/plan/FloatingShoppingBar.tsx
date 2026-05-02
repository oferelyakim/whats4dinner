// v3.0.0 — Floating shopping bar that sits above the WeeklyDropDrawer.
//
// Dark inverse pill (`bgDeep` background, cream text), shows current dish
// count, opens the shopping list. Glow CTA next to it triggers the smart
// consolidation flow (paid AI, dedupe across the week → Add to shopping list).
// Hidden when the drawer is in `hero` density.

import { ChevronRight, ShoppingCart, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'

interface Props {
  drawerHeightPx: number
  hidden: boolean
  dishCount: number
  itemCount: number
  onOpenList: () => void
  onSmartConsolidate: () => void
}

export function FloatingShoppingBar({ drawerHeightPx, hidden, dishCount, itemCount, onOpenList, onSmartConsolidate }: Props) {
  const t = useI18n((s) => s.t)
  if (hidden || dishCount === 0) return null

  return (
    <div
      className={cn(
        'fixed inset-x-4 z-20 flex items-center gap-2 transition-all duration-200',
      )}
      style={{
        bottom: `calc(${drawerHeightPx + 64 + 8}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <button
        onClick={onOpenList}
        className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-medium text-rp-bg shadow-lg"
        style={{ background: '#1f1612' }}
      >
        <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">
          {t('shopping.barCount')
            .replace('{items}', String(itemCount))
            .replace('{dishes}', String(dishCount))}
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onSmartConsolidate}
        className="px-3 py-2.5 rounded-full text-[11px] font-semibold shadow-lg inline-flex items-center gap-1"
        style={{ background: '#f2c14e', color: '#1f1612' }}
        aria-label={t('shopping.smartConsolidate')}
        title={t('shopping.smartConsolidate')}
      >
        <Sparkles className="h-3 w-3" />
        {t('shopping.consolidateCta')}
      </button>
    </div>
  )
}
