import { test, type Page } from '@playwright/test'

const SUPABASE_URL = 'https://zgebzhvbszhqvaryfiwk.supabase.co'
const SCREENSHOT_DIR = 'e2e/ux-screenshots'

/** Mock Supabase auth + core data so pages render with realistic content */
async function mockAuth(page: Page) {
  // Auth session
  await page.route(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, (route) =>
    route.fulfill({ status: 400, body: JSON.stringify({ error: 'invalid_grant' }) }),
  )
  await page.route(`${SUPABASE_URL}/auth/v1/session`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        user: { id: 'test-user-id', email: 'test@example.com', role: 'authenticated' },
      }),
    }),
  )

  // Profile
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id',
        display_name: 'Test User',
        avatar_url: null,
        email: 'test@example.com',
        preferences: {},
        has_onboarded: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
    }),
  )

  // Circle members
  await page.route(`${SUPABASE_URL}/rest/v1/circle_members*`, (route) => {
    const url = route.request().url()
    if (url.includes('select=')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'member-1', circle_id: 'circle-1', user_id: 'test-user-id', role: 'owner', profile: { display_name: 'Test User' } },
          { id: 'member-2', circle_id: 'circle-1', user_id: 'user-2', role: 'member', profile: { display_name: 'Sarah' } },
          { id: 'member-3', circle_id: 'circle-1', user_id: 'user-3', role: 'member', profile: { display_name: 'Dan' } },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // Circles
  await page.route(`${SUPABASE_URL}/rest/v1/circles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'circle-1', name: 'Family', icon: '👨‍👩‍👧‍👦', created_by: 'test-user-id', invite_code: 'abc123' },
      ]),
    }),
  )

  // Recipes
  await page.route(`${SUPABASE_URL}/rest/v1/recipes*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'r1', title: 'Shakshuka', description: 'Israeli classic', prep_time: 10, cook_time: 20, servings: 4, tags: ['breakfast', 'israeli'], circle_id: 'circle-1', created_by: 'test-user-id', type: 'recipe', ingredients: [{ name: 'Tomatoes', quantity: '4', unit: 'pcs' }, { name: 'Eggs', quantity: '6', unit: 'pcs' }] },
          { id: 'r2', title: 'Hummus', description: 'Creamy chickpea dip', prep_time: 15, cook_time: 0, servings: 6, tags: ['appetizer', 'israeli'], circle_id: 'circle-1', created_by: 'test-user-id', type: 'recipe', ingredients: [] },
          { id: 'r3', title: 'Chicken Schnitzel', description: 'Crispy breaded chicken', prep_time: 20, cook_time: 15, servings: 4, tags: ['dinner', 'israeli'], circle_id: 'circle-1', created_by: 'test-user-id', type: 'recipe', ingredients: [] },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Shopping lists
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'sl1', name: 'Weekly Groceries', circle_id: 'circle-1', created_by: 'test-user-id', is_completed: false, created_at: '2026-04-10T10:00:00Z' },
          { id: 'sl2', name: 'Party Supplies', circle_id: 'circle-1', created_by: 'user-2', is_completed: false, created_at: '2026-04-09T10:00:00Z' },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Shopping list items
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_list_items*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Events
  await page.route(`${SUPABASE_URL}/rest/v1/events*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'e1', title: 'Friday Dinner', date: '2026-04-17T19:00:00Z', location: 'Home', circle_id: 'circle-1', created_by: 'test-user-id', description: 'Weekly family dinner' },
          { id: 'e2', title: 'Birthday Party', date: '2026-04-25T18:00:00Z', location: 'Park', circle_id: 'circle-1', created_by: 'user-2', description: "Dan's birthday celebration" },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Event items, organizers
  await page.route(`${SUPABASE_URL}/rest/v1/event_items*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(`${SUPABASE_URL}/rest/v1/event_organizers*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Chores
  await page.route(`${SUPABASE_URL}/rest/v1/chores*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'ch1', name: 'Dishes', emoji: '🍽️', frequency: 'daily', points: 5, assignee: 'Test User', circle_id: 'circle-1', created_by: 'test-user-id', recurrence_days: [] },
          { id: 'ch2', name: 'Vacuum', emoji: '🧹', frequency: 'weekly', points: 10, assignee: 'Sarah', circle_id: 'circle-1', created_by: 'test-user-id', recurrence_days: [1, 4] },
          { id: 'ch3', name: 'Trash', emoji: '🗑️', frequency: 'daily', points: 3, assignee: 'Dan', circle_id: 'circle-1', created_by: 'test-user-id', recurrence_days: [] },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Chore completions
  await page.route(`${SUPABASE_URL}/rest/v1/chore_completions*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Activities
  await page.route(`${SUPABASE_URL}/rest/v1/activities*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'a1', name: 'Soccer Practice', recurrence: 'weekly', day_of_week: 2, time: '16:00', location: 'Sports Center', circle_id: 'circle-1', created_by: 'test-user-id', participants: ['Dan'], bring_items: ['Water bottle', 'Shin guards'] },
          { id: 'a2', name: 'Piano Lesson', recurrence: 'weekly', day_of_week: 4, time: '17:30', location: 'Music School', circle_id: 'circle-1', created_by: 'test-user-id', participants: ['Sarah'], bring_items: ['Sheet music'] },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Meal plans
  await page.route(`${SUPABASE_URL}/rest/v1/meal_plans*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Stores
  await page.route(`${SUPABASE_URL}/rest/v1/stores*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Subscriptions
  await page.route(`${SUPABASE_URL}/rest/v1/subscriptions*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  )

  // AI usage
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_user_monthly_usage*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_cost: 0, usage_count: 0 }) }),
  )

  // Notifications / reminders
  await page.route(`${SUPABASE_URL}/rest/v1/activity_reminders*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Realtime channel — prevent WebSocket errors
  await page.route(`${SUPABASE_URL}/realtime/**`, (route) => route.abort())

  // Set auth in localStorage before navigation
  await page.addInitScript(() => {
    const fakeSession = {
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'fake-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'test-user-id', email: 'test@example.com', role: 'authenticated' },
    }
    localStorage.setItem(
      'sb-zgebzhvbszhqvaryfiwk-auth-token',
      JSON.stringify(fakeSession),
    )
  })
}

// Pages to capture
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'food-hub', path: '/food' },
  { name: 'recipes', path: '/recipes' },
  { name: 'lists', path: '/lists' },
  { name: 'plan', path: '/plan' },
  { name: 'events', path: '/events' },
  { name: 'household', path: '/household' },
  { name: 'profile', path: '/profile' },
]

// Themes and languages
const VARIANTS = [
  { theme: 'light', lang: 'en', suffix: 'light_en' },
  { theme: 'dark', lang: 'en', suffix: 'dark_en' },
  { theme: 'light', lang: 'he', suffix: 'light_he' },
  { theme: 'dark', lang: 'he', suffix: 'dark_he' },
]

test.describe('UX Audit Screenshots', () => {
  for (const pg of PAGES) {
    for (const variant of VARIANTS) {
      test(`${pg.name} — ${variant.suffix} — mobile`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await mockAuth(page)

        // Set theme and language via localStorage before navigating
        await page.addInitScript(({ theme, lang }: { theme: string; lang: string }) => {
          localStorage.setItem('theme', theme)
          localStorage.setItem('language', lang)
          if (lang === 'he') {
            document.documentElement.dir = 'rtl'
            document.documentElement.lang = 'he'
          }
        }, { theme: variant.theme, lang: variant.lang })

        await page.goto(pg.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${pg.name}_mobile_${variant.suffix}.png`,
          fullPage: true,
        })
      })

      test(`${pg.name} — ${variant.suffix} — desktop`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await mockAuth(page)

        await page.addInitScript(({ theme, lang }: { theme: string; lang: string }) => {
          localStorage.setItem('theme', theme)
          localStorage.setItem('language', lang)
          if (lang === 'he') {
            document.documentElement.dir = 'rtl'
            document.documentElement.lang = 'he'
          }
        }, { theme: variant.theme, lang: variant.lang })

        await page.goto(pg.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${pg.name}_desktop_${variant.suffix}.png`,
          fullPage: true,
        })
      })
    }
  }
})
