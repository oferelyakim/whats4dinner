import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export function PlanPage() {
  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Meal Plan</h2>

      <EmptyState
        icon={<CalendarDays className="h-12 w-12" />}
        title="Coming soon"
        description="Plan your weekly meals by dragging recipes onto days. Available in a future update."
      />
    </div>
  )
}
