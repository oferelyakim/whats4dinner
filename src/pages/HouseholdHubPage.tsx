import { Navigate } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'

/**
 * `/household` is now a thin redirect to whichever tab the user was last on.
 * The actual content lives in ChoresPage / ActivitiesPage; the [Chores | Activities]
 * segmented control sits at the top of those pages (HouseholdTabs).
 */
export function HouseholdHubPage() {
  const lastHouseholdTab = useAppStore((s) => s.lastHouseholdTab)
  const target = lastHouseholdTab === 'activities' ? '/household/activities' : '/household/chores'
  return <Navigate to={target} replace />
}
