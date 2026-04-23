import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { getGrocerFlag } from '@/services/grocers/service'

export interface GrocerFlagResult {
  enabled: boolean
  isLoading: boolean
}

export function useGrocerFlag(): GrocerFlagResult {
  const { session } = useAuth()
  const userId = session?.user?.id

  const { data, isLoading } = useQuery({
    queryKey: ['grocer-flag', userId],
    queryFn: getGrocerFlag,
    staleTime: 60 * 1000, // 60 seconds
    enabled: !!userId,
  })

  const enabled =
    !!userId &&
    !!data &&
    (data.enabled || data.enabled_for_user_ids.includes(userId))

  return { enabled, isLoading }
}
