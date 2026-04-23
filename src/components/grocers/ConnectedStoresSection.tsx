import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/lib/i18n'
import { getMyGrocerConnections } from '@/services/grocers/service'
import { KrogerConnectCard } from './KrogerConnectCard'
import { KrogerConnectionCard } from './KrogerConnectionCard'

export function ConnectedStoresSection() {
  const { t } = useI18n()
  const { session } = useAuth()
  const userId = session?.user?.id
  const queryClient = useQueryClient()

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['grocer-connections', userId],
    queryFn: getMyGrocerConnections,
    enabled: !!userId,
  })

  const krogerConnection = connections.find((c) => c.provider === 'kroger')

  function invalidateConnections() {
    queryClient.invalidateQueries({ queryKey: ['grocer-connections', userId] })
  }

  if (isLoading) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1">
        {t('grocer.connectedStores')}
      </h3>

      {krogerConnection ? (
        <KrogerConnectionCard
          connection={krogerConnection}
          onDisconnected={invalidateConnections}
          onStoreChanged={invalidateConnections}
        />
      ) : (
        <KrogerConnectCard />
      )}
    </div>
  )
}
