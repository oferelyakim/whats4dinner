import { test, expect, type Page } from '@playwright/test'

const SUPABASE_URL = 'https://zgebzhvbszhqvaryfiwk.supabase.co'

/** Mock Supabase auth so the app sees an authenticated session. */
async function mockAuth(page: Page) {
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
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          role: 'authenticated',
        },
      }),
    }),
  )

  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id',
        display_name: 'Test User',
        avatar_url: null,
        email: 'test@example.com',
        preferences: { theme: 'dark' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
    }),
  )

  await page.route(`${SUPABASE_URL}/rest/v1/circle_members*`, (route) => {
    const url = route.request().url()
    if (url.includes('select=')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'member-1', circle_id: 'circle-1', user_id: 'test-user-id', role: 'owner', profile: { display_name: 'Test User' } },
          { id: 'member-2', circle_id: 'circle-1', user_id: 'user-2', role: 'member', profile: { display_name: 'Family Member' } },
        ]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // Intercept activities - return empty by default
  await page.route(`${SUPABASE_URL}/rest/v1/activities*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

/** Set up localStorage so the app has an active circle pre-selected. */
async function setActiveCircle(page: Page) {
  await page.addInitScript(() => {
    const state = {
      state: {
        theme: 'dark',
        activeCircle: {
          id: 'circle-1',
          name: 'Test Family',
          created_by: 'test-user-id',
          invite_code: 'TEST123',
          created_at: '2025-01-01T00:00:00Z',
        },
      },
      version: 0,
    }
    localStorage.setItem('w4d-app', JSON.stringify(state))
    localStorage.setItem(
      'sb-zgebzhvbszhqvaryfiwk-auth-token',
      JSON.stringify({
        currentSession: {
          access_token: 'fake-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            role: 'authenticated',
            aud: 'authenticated',
          },
        },
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    )
  })
}

// ---------------------------------------------------------------------------
// UNAUTHENTICATED TESTS
// ---------------------------------------------------------------------------

test.describe('Activities Page - Unauthenticated', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(
      page.getByText('Sign In').or(page.getByText('Continue with Google')),
    ).toBeVisible({ timeout: 10000 })
  })

  test('login page shows Google sign-in option', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Continue with Google')).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// AUTHENTICATED TESTS - NO CIRCLE SELECTED
// ---------------------------------------------------------------------------

test.describe('Activities Page - No Active Circle', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await page.addInitScript(() => {
      const state = { state: { theme: 'dark', activeCircle: null }, version: 0 }
      localStorage.setItem('w4d-app', JSON.stringify(state))
      localStorage.setItem(
        'sb-zgebzhvbszhqvaryfiwk-auth-token',
        JSON.stringify({
          currentSession: {
            access_token: 'fake-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'fake-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: 'test-user-id', email: 'test@example.com', role: 'authenticated', aud: 'authenticated' },
          },
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }),
      )
    })
  })

  test('shows empty state prompting to select a circle', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Activities').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Select a circle first')).toBeVisible()
  })

  test('has a back button', async ({ page }) => {
    await page.goto('/more/activities')
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') })
    await expect(backButton.first()).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// AUTHENTICATED TESTS - WITH ACTIVE CIRCLE
// ---------------------------------------------------------------------------

test.describe('Activities Page - With Active Circle', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await setActiveCircle(page)
  })

  test('renders page header with title and add button', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Activities').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible()
  })

  test('shows subtitle description text', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText(/Schedule recurring activities/i)).toBeVisible({ timeout: 10000 })
  })

  test('displays weekly mini calendar with 7 day buttons', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Activities').first()).toBeVisible({ timeout: 10000 })
    // The week calendar should have 7 day buttons with day letters
    // These are narrow day labels (S, M, T, W, T, F, S) plus date numbers
    const dayButtons = page.locator('.flex.gap-1.justify-between button')
    await expect(dayButtons).toHaveCount(7)
  })

  test('shows empty state when no activities exist', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('No activities yet')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Add recurring schedules/i)).toBeVisible()
  })

  test('empty state has a "New Activity" button', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByRole('button', { name: /new activity/i })).toBeVisible({ timeout: 10000 })
  })

  test('clicking Add button opens create activity dialog', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /add/i }).click()
    await expect(page.getByText('New Activity')).toBeVisible()
  })

  test('clicking empty state New Activity button opens dialog', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /new activity/i }).click({ timeout: 10000 })
    await expect(page.getByText('New Activity')).toBeVisible()
  })

  test('create dialog has activity name input', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Activity Name')).toBeVisible()
    await expect(page.getByPlaceholder(/soccer practice/i)).toBeVisible()
  })

  test('create dialog has "For whom" autocomplete field', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('For whom')).toBeVisible()
    await expect(page.getByPlaceholder(/emma.*dad.*everyone/i)).toBeVisible()
  })

  test('create dialog has category selector with all 8 categories', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Category')).toBeVisible()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByText(/Sports/)).toBeVisible()
    await expect(dialog.getByText(/Music/)).toBeVisible()
    await expect(dialog.getByText(/Arts/)).toBeVisible()
    await expect(dialog.getByText(/Education/)).toBeVisible()
    await expect(dialog.getByText(/Social/)).toBeVisible()
    await expect(dialog.getByText(/Chores/)).toBeVisible()
    await expect(dialog.getByText(/Carpool/)).toBeVisible()
    await expect(dialog.getByText(/Other/)).toBeVisible()
  })

  test('category buttons show emoji prefixes', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    // Check that category buttons contain both emoji and text
    await expect(dialog.getByText(/⚽.*Sports/)).toBeVisible()
    await expect(dialog.getByText(/🎵.*Music/)).toBeVisible()
    await expect(dialog.getByText(/🎨.*Arts/)).toBeVisible()
  })

  test('can select a different category', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    const sportsButton = dialog.getByText(/⚽.*Sports/)
    await sportsButton.click()
    // Should have active style
    await expect(sportsButton.locator('..')).toHaveClass(/bg-brand-500/)
  })

  test('create dialog has location input', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Location (optional)')).toBeVisible()
    await expect(page.getByPlaceholder(/city sports center/i)).toBeVisible()
  })

  test('create dialog has recurrence type selector', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Repeats')).toBeVisible()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByText('Once', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Weekly', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Bi-weekly', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Daily', { exact: true })).toBeVisible()
  })

  test('Weekly recurrence shows day selector by default', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    // Weekly is the default recurrence type
    await expect(dialog.getByText('On which days')).toBeVisible()
    await expect(dialog.getByText('Su', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Mo', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Tu', { exact: true })).toBeVisible()
    await expect(dialog.getByText('We', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Th', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Fr', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Sa', { exact: true })).toBeVisible()
  })

  test('day selector is hidden when Once is selected', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    await dialog.getByText('Once', { exact: true }).click()
    await expect(dialog.getByText('On which days')).not.toBeVisible()
  })

  test('day selector is hidden when Daily is selected', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    await dialog.getByText('Daily', { exact: true }).click()
    await expect(dialog.getByText('On which days')).not.toBeVisible()
  })

  test('can toggle day buttons', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    const tuButton = dialog.getByText('Tu', { exact: true })
    await tuButton.click()
    await expect(tuButton.locator('..')).toHaveClass(/bg-brand-500/)
    await tuButton.click()
    await expect(tuButton.locator('..')).not.toHaveClass(/bg-brand-500/)
  })

  test('create dialog has start and end date fields', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByText('Start Date')).toBeVisible()
    await expect(dialog.getByText('End Date (optional)')).toBeVisible()
    const dateInputs = dialog.locator('input[type="date"]')
    expect(await dateInputs.count()).toBe(2)
  })

  test('create dialog has start and end time fields', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByText('Start Time')).toBeVisible()
    await expect(dialog.getByText('End Time')).toBeVisible()
    const timeInputs = dialog.locator('input[type="time"]')
    expect(await timeInputs.count()).toBe(2)
  })

  test('create dialog has exclude holidays checkbox', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText(/skip holidays/i)).toBeVisible()
    const checkbox = page.locator('[role="dialog"]').locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible()
  })

  test('can toggle exclude holidays checkbox', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const checkbox = page.locator('[role="dialog"]').locator('input[type="checkbox"]')
    await expect(checkbox).not.toBeChecked()
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
    await expect(checkbox).not.toBeChecked()
  })

  test('create dialog has notes field', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Notes (optional)')).toBeVisible()
    await expect(page.getByPlaceholder(/any details/i)).toBeVisible()
  })

  test('create dialog has participants section', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Participants')).toBeVisible()
    // Participant name input
    await expect(page.getByPlaceholder('Name')).toBeVisible()
    // Role dropdown
    const roleSelect = page.locator('[role="dialog"]').locator('select')
    await expect(roleSelect).toBeVisible()
  })

  test('participants section has role options', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const roleSelect = page.locator('[role="dialog"]').locator('select')
    // Check option values
    await expect(roleSelect.locator('option[value="participant"]')).toHaveCount(1)
    await expect(roleSelect.locator('option[value="escort"]')).toHaveCount(1)
    await expect(roleSelect.locator('option[value="driver"]')).toHaveCount(1)
    await expect(roleSelect.locator('option[value="supervisor"]')).toHaveCount(1)
  })

  test('create dialog has bring items section', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('What to Bring')).toBeVisible()
    await expect(page.getByPlaceholder(/water bottle.*cleats/i)).toBeVisible()
  })

  test('create dialog has Cancel and Create buttons', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('Create button is disabled when required fields are empty', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const createBtn = page.locator('[role="dialog"]').getByRole('button', { name: 'Create' })
    // Disabled because name and startDate are empty
    await expect(createBtn).toBeDisabled()
  })

  test('Create button remains disabled with only name filled (no start date)', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await page.getByPlaceholder(/soccer practice/i).fill('Piano Lesson')
    const createBtn = page.locator('[role="dialog"]').getByRole('button', { name: 'Create' })
    // Still disabled because startDate is required
    await expect(createBtn).toBeDisabled()
  })

  test('Create button enables when name and start date are filled', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await page.getByPlaceholder(/soccer practice/i).fill('Piano Lesson')
    const dialog = page.locator('[role="dialog"]')
    const dateInputs = dialog.locator('input[type="date"]')
    await dateInputs.first().fill('2026-04-10')
    const createBtn = dialog.getByRole('button', { name: 'Create' })
    await expect(createBtn).toBeEnabled()
  })

  test('Cancel button closes the dialog', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('can fill out the entire activity form', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Fill name
    await page.getByPlaceholder(/soccer practice/i).fill('Piano Lesson')

    // Fill for whom
    await page.getByPlaceholder(/emma.*dad.*everyone/i).fill('Test User')

    // Select category - Music
    await dialog.getByText(/🎵.*Music/).click()

    // Fill location
    await page.getByPlaceholder(/city sports center/i).fill('Music Academy')

    // Recurrence is weekly by default, select days
    await dialog.getByText('Tu', { exact: true }).click()
    await dialog.getByText('Th', { exact: true }).click()

    // Fill dates
    const dateInputs = dialog.locator('input[type="date"]')
    await dateInputs.first().fill('2026-04-10')
    await dateInputs.nth(1).fill('2026-12-31')

    // Fill times
    const timeInputs = dialog.locator('input[type="time"]')
    await timeInputs.first().fill('15:00')
    await timeInputs.nth(1).fill('16:00')

    // Check exclude holidays
    await dialog.locator('input[type="checkbox"]').check()

    // Fill notes
    await page.getByPlaceholder(/any details/i).fill('Bring sheet music')

    // Verify Create button is enabled
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  test('can add a participant to the form', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Fill participant name
    await page.getByPlaceholder('Name').fill('Emma')

    // Select role
    await dialog.locator('select').selectOption('driver')

    // Click the small add button next to the participant input
    // It's the Plus button in the participants section
    const participantSection = dialog.getByText('Participants').locator('..')
    const addParticipantBtn = participantSection.locator('button').filter({ has: page.locator('svg.lucide-plus') })
    await addParticipantBtn.click()

    // Participant should appear in the list
    await expect(dialog.getByText('Emma')).toBeVisible()
    await expect(dialog.getByText('Driver')).toBeVisible()
  })

  test('can add a bring item to the form', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Fill item name
    await page.getByPlaceholder(/water bottle.*cleats/i).fill('Water bottle')

    // Click the add button in the bring items section
    const bringSection = dialog.getByText('What to Bring').locator('..')
    const addItemBtn = bringSection.locator('button').filter({ has: page.locator('svg.lucide-plus') })
    await addItemBtn.click()

    // Item should appear in the list
    await expect(dialog.getByText('Water bottle')).toBeVisible()
  })

  test('can remove a participant from the form', async ({ page }) => {
    await page.goto('/more/activities')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Add a participant first
    await page.getByPlaceholder('Name').fill('Emma')
    const participantSection = dialog.getByText('Participants').locator('..')
    const addBtn = participantSection.locator('button').filter({ has: page.locator('svg.lucide-plus') })
    await addBtn.click()
    await expect(dialog.getByText('Emma')).toBeVisible()

    // Remove the participant via the X button
    const removeBtn = dialog.locator('button').filter({ has: page.locator('svg.lucide-x') }).first()
    await removeBtn.click()
    await expect(dialog.getByText('Emma')).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// ACTIVITY CARDS TESTS (with mock activity data)
// ---------------------------------------------------------------------------

test.describe('Activities Page - With Existing Activities', () => {
  const today = new Date().toISOString().split('T')[0]

  test.beforeEach(async ({ page }) => {
    await page.route(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, (route) =>
      route.fulfill({ status: 400, body: JSON.stringify({ error: 'invalid_grant' }) }),
    )
    await page.route(`${SUPABASE_URL}/auth/v1/session`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-id',
          display_name: 'Test User',
          avatar_url: null,
          email: 'test@example.com',
          preferences: { theme: 'dark' },
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        }),
      }),
    )
    await page.route(`${SUPABASE_URL}/rest/v1/circle_members*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'member-1', circle_id: 'circle-1', user_id: 'test-user-id', role: 'owner', profile: { display_name: 'Test User' } },
        ]),
      }),
    )

    // Return mock activities
    await page.route(`${SUPABASE_URL}/rest/v1/activities*`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'activity-1',
              circle_id: 'circle-1',
              name: 'Soccer Practice',
              category: 'sports',
              location: 'City Park',
              assigned_name: 'Test User',
              recurrence_type: 'weekly',
              recurrence_days: [2, 4],
              start_date: '2025-01-01',
              end_date: '2026-12-31',
              start_time: '16:00:00',
              end_time: '17:30:00',
              exclude_holidays: true,
              notes: 'Bring cleats and water',
              participants: [
                { name: 'Emma', role: 'participant' },
                { name: 'Dad', role: 'driver' },
              ],
              bring_items: [
                { name: 'Cleats', checked: false },
                { name: 'Water bottle', checked: true },
              ],
              created_by: 'test-user-id',
              profile: { display_name: 'Test User' },
              created_at: '2025-01-01T00:00:00Z',
            },
            {
              id: 'activity-2',
              circle_id: 'circle-1',
              name: 'Piano Lesson',
              category: 'music',
              location: null,
              assigned_name: 'Test User',
              recurrence_type: 'weekly',
              recurrence_days: [3],
              start_date: '2025-01-01',
              end_date: null,
              start_time: '14:00:00',
              end_time: '15:00:00',
              exclude_holidays: false,
              notes: null,
              participants: [],
              bring_items: [],
              created_by: 'test-user-id',
              profile: { display_name: 'Test User' },
              created_at: '2025-01-01T00:00:00Z',
            },
          ]),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await setActiveCircle(page)
  })

  test('displays activity cards with names', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Piano Lesson')).toBeVisible()
  })

  test('activity cards show category emoji', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    // Sports emoji and Music emoji should be visible on cards
    await expect(page.getByText('⚽').first()).toBeVisible()
    await expect(page.getByText('🎵').first()).toBeVisible()
  })

  test('activity cards show location when set', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('City Park')).toBeVisible()
  })

  test('activity cards are expandable', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    // Click on the soccer practice card to expand
    await page.getByText('Soccer Practice').click()
    // Expanded content should show notes
    await expect(page.getByText('Bring cleats and water')).toBeVisible()
  })

  test('expanded card shows edit and delete buttons', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await page.getByText('Soccer Practice').click()
    // Edit and Delete links in expanded section
    await expect(page.getByText('Edit Activity')).toBeVisible()
    await expect(page.getByText('Delete')).toBeVisible()
  })

  test('expanded card shows participants grouped by role', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await page.getByText('Soccer Practice').click()
    await expect(page.getByText('Participants').first()).toBeVisible()
    await expect(page.getByText('Emma')).toBeVisible()
    await expect(page.getByText('Dad')).toBeVisible()
  })

  test('expanded card shows bring items checklist', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await page.getByText('Soccer Practice').click()
    await expect(page.getByText('What to Bring')).toBeVisible()
    await expect(page.getByText('Cleats')).toBeVisible()
    await expect(page.getByText('Water bottle')).toBeVisible()
  })

  test('expanded card shows end date', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await page.getByText('Soccer Practice').click()
    // End date formatted as "Dec 31, 2026"
    await expect(page.getByText(/Dec 31, 2026/)).toBeVisible()
  })

  test('clicking a different card collapses the first one', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    // Expand soccer
    await page.getByText('Soccer Practice').click()
    await expect(page.getByText('Bring cleats and water')).toBeVisible()
    // Click piano to expand it (and collapse soccer)
    await page.getByText('Piano Lesson').click()
    // Soccer's notes should now be hidden
    await expect(page.getByText('Bring cleats and water')).not.toBeVisible()
  })

  test('activities are grouped by assigned person', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Test User').first()).toBeVisible()
  })

  test('activity cards show participant count indicator', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    // The card shows a participant count "2" next to the Users icon
    // Piano has 0 participants so it won't show
    const soccerCard = page.getByText('Soccer Practice').locator('../..')
    await expect(soccerCard.getByText('2')).toBeVisible()
  })

  test('activity cards show bring items count indicator', async ({ page }) => {
    await page.goto('/more/activities')
    await expect(page.getByText('Soccer Practice')).toBeVisible({ timeout: 10000 })
    // Shows "1/2" (1 checked out of 2 items)
    const soccerCard = page.getByText('Soccer Practice').locator('../..')
    await expect(soccerCard.getByText('1/2')).toBeVisible()
  })
})
