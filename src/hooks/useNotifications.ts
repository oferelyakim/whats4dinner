import { useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/stores/appStore'
import { getActivities, getUpcomingReminders, type Reminder } from '@/services/activities'
import { getChores, type Chore } from '@/services/chores'

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
 */
export function useNotifications() {
  const { activeCircle, profile } = useAppStore()
  const sentRef = useRef<Set<string>>(new Set())

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

  // Today's chores for current user
  const myName = profile?.display_name?.toLowerCase()
  if (myName) {
    const todayDay = new Date().getDay()
    const myChores = chores.filter((c: Chore) => {
      if (!c.assigned_to) return false
      const assignee = c.assigned_to.toLowerCase()
      if (assignee !== myName) return false
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

    sentRef.current.add(n.id)
    new Notification(n.title, { body: n.body, icon: '/icons/icon-192.png' })
  }, [])

  // Trigger browser notifications for today's items on mount/focus
  useEffect(() => {
    const todayNotifications = notifications.filter((n) => n.date === today)
    for (const n of todayNotifications) {
      triggerBrowserNotification(n)
    }
  }, [notifications.length, today, triggerBrowserNotification])

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
