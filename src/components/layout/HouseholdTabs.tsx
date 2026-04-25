import { useNavigate } from 'react-router-dom'
import { Sparkles, Calendar } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from '@/lib/i18n'

interface HouseholdTabsProps {
  active: 'chores' | 'activities'
}

export function HouseholdTabs({ active }: HouseholdTabsProps) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const setLastHouseholdTab = useAppStore((s) => s.setLastHouseholdTab)

  function go(tab: 'chores' | 'activities') {
    setLastHouseholdTab(tab)
    if (tab !== active) {
      navigate(tab === 'chores' ? '/household/chores' : '/household/activities')
    }
  }

  return (
    <div className="flex bg-rp-bg-soft rounded-xl p-1">
      <button
        onClick={() => go('chores')}
        className={cn(
          'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]',
          active === 'chores'
            ? 'bg-rp-card text-rp-ink shadow-sm'
            : 'text-rp-ink-mute',
        )}
      >
        <Sparkles className="h-4 w-4" />
        {t('more.chores')}
      </button>
      <button
        onClick={() => go('activities')}
        className={cn(
          'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]',
          active === 'activities'
            ? 'bg-rp-card text-rp-ink shadow-sm'
            : 'text-rp-ink-mute',
        )}
      >
        <Calendar className="h-4 w-4" />
        {t('more.activities')}
      </button>
    </div>
  )
}
