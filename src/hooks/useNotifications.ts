import { useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/stores/appStore'
import { getActivities, getUpcomingReminders, type Reminder } from '@/services/activities'
import { getChores, type Chore } from '@/services/chores'
import { getShoppingLists } from '@/services/shoppingLists'
import { supabase } from '@/services/supabase'

export interface AppNotification {
  id: string
  type: 'reminder' | 'chore'
  title: string
  body: string
  date: string
  activityId?: string
}

/**
 * Returns upcoming reminders and today's chores as notifications.
 * Also triggers browser Notification API when the app is focused
 * and new notifications are detected (requires permission).
 *
 * Per-category gating is applied to browser notifications only.
 * The in-app bell dropdown shows all notifications regardless of prefs.
 *
 * Additional features (v3.2):
 * - Chore due-time scheduler: fires a browser notification at the chore's
 *   due_time today if the tab is open and `prefs.chores` is on.
 * - Realtime list-item subscription: fires a browser notification when a
 *   circle member adds an item to a shared list (`prefs.lists`).
 */
export function useNotifications() {
  const { activeCircle, profile, notificationPrefs } = useAppStore()
  const sentRef = useRef<Set<string>>(new Set())
  const choreTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const lastScheduledDayRef = useRef<string>('')

  // Shopping lists — needed to filter the realtime subscription server-
  // payloads to lists in the active circle. Fetched directly here so the
  // cache is populated even on a fresh session before the user visits the
  // Lists tab. RLS scopes `getShoppingLists()` to the user's circles, then
  // we filter to the active circle below.
  const { data: allShoppingLists = [] } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: getShoppingLists,
    enabled: !!activeCircle?.id && notificationPrefs.enabled && notificationPrefs.lists,
    staleTime: 60 * 1000,
  })
  const shoppingLists = activeCircle?.id
    ? allShoppingLists.filter((l) => l.circle_id === activeCircle.id)
    : []

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', activeCircle?.id],
    queryFn: () => getActivities(activeCircle!.id),
    enabled: !!activeCircle,
  })

  const { data: chores = [] } = useQuery({
    queryKey: ['chores', activeCircle?.id],
    queryFn: () => getChores(activeCircle!.id),
    enabled: !!activeCircle,
  })

  // Build notification list
  const notifications: AppNotification[] = []

  // Activity reminders
  const upcomingReminders = getUpcomingReminders(activities, 7)
  const today = new Date().toISOString().split('T')[0]

  for (const { activity, reminder, triggerDate } of upcomingReminders) {
    notifications.push({
      id: `rem-${activity.id}-${reminder.amount}-${reminder.unit}`,
      type: 'reminder',
      title: activity.name,
      body: formatReminderText(reminder, triggerDate, today),
      date: triggerDate,
      activityId: activity.id,
    })
  }

  // Today's chores for current user.
  // Chores are assigned via the free-text `assigned_name` column (the
  // AutocompleteInput suggests circle-member names but allows custom strings);
  // the UUID `assigned_to` column is currently never written by createChore.
  const myName = profile?.display_name?.toLowerCase()
  const myUserId = profile?.id
  const isAssignedToMe = useCallback(
    (c: Chore): boolean => {
      if (myUserId && c.assigned_to === myUserId) return true
      if (myName && c.assigned_name?.toLowerCase() === myName) return true
      return false
    },
    [myName, myUserId]
  )
  if (myName || myUserId) {
    const todayDay = new Date().getDay()
    const myChores = chores.filter((c: Chore) => {
      if (!isAssignedToMe(c)) return false
      // Check if chore is scheduled for today based on frequency
      if (c.frequency === 'daily') return true
      if (c.frequency === 'weekly' && c.recurrence_days?.includes(todayDay)) return true
      return false
    })

    for (const chore of myChores) {
      notifications.push({
        id: `chore-${chore.id}-${today}`,
        type: 'chore',
        title: `${chore.icon || '🧹'} ${chore.name}`,
        body: 'Due today',
        date: today,
      })
    }
  }

  // Sort: today first, then by date
  notifications.sort((a, b) => {
    if (a.date === today && b.date !== today) return -1
    if (b.date === today && a.date !== today) return 1
    return a.date.localeCompare(b.date)
  })

  // Browser notification trigger (once per session per notification)
  const triggerBrowserNotification = useCallback((n: AppNotification) => {
    if (sentRef.current.has(n.id)) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    // Per-category gating — master toggle + category toggle
    if (!notificationPrefs.enabled) return
    if (n.type === 'reminder' && !notificationPrefs.activities) return
    if (n.type === 'chore' && !notificationPrefs.chores) return

    sentRef.current.add(n.id)
    // `tag` matches the SW push handler's tag convention so OS dedups when both
    // the in-tab path and a push for the same event arrive close together.
    const tag = n.type === 'chore' ? `chore:${n.id}` : `activity:${n.activityId ?? n.id}`
    new Notification(n.title, { body: n.body, icon: '/icons/icon-192.png', tag })
  }, [notificationPrefs])

  // Trigger browser notifications for today's items on mount/focus
  useEffect(() => {
    const todayNotifications = notifications.filter((n) => n.date === today)
    for (const n of todayNotifications) {
      triggerBrowserNotification(n)
    }
  }, [notifications.length, today, triggerBrowserNotification])

  // ── Chore due-time scheduler ───────────────────────────────────────────────
  // Schedules a setTimeout for each chore with a due_time set for today.
  // Re-computes on day rollover (checked every minute).
  useEffect(() => {
    function scheduleChoreTimers() {
      const nowToday = new Date().toISOString().split('T')[0]
      lastScheduledDayRef.current = nowToday

      // Clear any existing timers before rescheduling
      choreTimersRef.current.forEach((timer) => clearTimeout(timer))
      choreTimersRef.current.clear()

      if (!notificationPrefs.enabled || !notificationPrefs.chores) return
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (!myName && !myUserId) return

      const nowDate = new Date()
      const todayDayOfWeek = nowDate.getDay()

      const myDueChores = chores.filter((c: Chore) => {
        if (!isAssignedToMe(c)) return false
        if (!c.due_time) return false
        if (c.frequency === 'daily') return true
        if (c.frequency === 'weekly' && c.recurrence_days?.includes(todayDayOfWeek)) return true
        return false
      })

      for (const chore of myDueChores) {
        if (!chore.due_time) continue
        const [hours, minutes] = chore.due_time.split(':').map(Number)
        const fireAt = new Date()
        fireAt.setHours(hours, minutes, 0, 0)
        const msUntilFire = fireAt.getTime() - nowDate.getTime()
        if (msUntilFire <= 0) continue // already past due time today

        const timerId = setTimeout(() => {
          const fireId = `chore-due-${chore.id}-${nowToday}`
          if (sentRef.current.has(fireId)) return
          if (!('Notification' in window) || Notification.permission !== 'granted') return
          if (!notificationPrefs.enabled || !notificationPrefs.chores) return
          sentRef.current.add(fireId)
          new Notification(`${chore.icon || '🧹'} ${chore.name}`, {
            body: 'Due now',
            icon: '/icons/icon-192.png',
            tag: `chore:${chore.id}`,
          })
        }, msUntilFire)

        choreTimersRef.current.set(chore.id, timerId)
      }
    }

    scheduleChoreTimers()

    // Re-check every minute for day rollovers and re-scheduling
    const interval = setInterval(scheduleChoreTimers, 60_000)
    return () => {
      clearInterval(interval)
      choreTimersRef.current.forEach((timer) => clearTimeout(timer))
      choreTimersRef.current.clear()
    }
  }, [chores, myName, myUserId, isAssignedToMe, notificationPrefs.enabled, notificationPrefs.chores])

  // ── Realtime shopping list subscription ───────────────────────────────────
  // Subscribes to shopping_list_items INSERT events for lists in the active
  // circle. Fires a browser notification when a circle member adds an item.
  // Uses the locally-fetched `shoppingLists` (above) for circle scoping —
  // not a global query cache — so filtering works on fresh sessions.
  useEffect(() => {
    if (!activeCircle?.id) return
    if (!notificationPrefs.enabled || !notificationPrefs.lists) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (shoppingLists.length === 0) return

    const currentUserId = profile?.id
    const listIdsInCircle = new Set(shoppingLists.map((l) => l.id))
    const listsById = new Map(shoppingLists.map((l) => [l.id, l]))

    const channel = supabase
      .channel(`notif-lists-${activeCircle.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shopping_list_items',
        },
        (payload) => {
          const record = payload.new as {
            id: string
            list_id: string
            name: string
            added_by: string | null
          }

          // Skip if the current user added the item
          if (currentUserId && record.added_by === currentUserId) return

          // Filter to lists in the active circle
          if (!listIdsInCircle.has(record.list_id)) return
          const matchingList = listsById.get(record.list_id)
          if (!matchingList) return

          const fireId = `list-item-${record.id}`
          if (sentRef.current.has(fireId)) return
          if (!notificationPrefs.enabled || !notificationPrefs.lists) return
          sentRef.current.add(fireId)

          new Notification('Shopping list updated', {
            body: `${record.name} was added to ${matchingList.name}`,
            icon: '/icons/icon-192.png',
            tag: `list-update:${record.list_id}`,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [
    activeCircle?.id,
    profile?.id,
    notificationPrefs.enabled,
    notificationPrefs.lists,
    shoppingLists,
  ])

  return {
    notifications,
    count: notifications.length,
    todayCount: notifications.filter((n) => n.date === today).length,
  }
}

function formatReminderText(reminder: Reminder, triggerDate: string, today: string): string {
  const amount = reminder.amount
  const unit = reminder.unit
  if (triggerDate === today) return `Today — ${amount} ${unit} before`
  const daysAway = Math.ceil((new Date(triggerDate).getTime() - new Date(today).getTime()) / (86400000))
  if (daysAway === 1) return `Tomorrow — ${amount} ${unit} before`
  return `In ${daysAway} days — ${amount} ${unit} before`
}
