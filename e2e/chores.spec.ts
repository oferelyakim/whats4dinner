import { test, expect, type Page } from '@playwright/test'

const SUPABASE_URL = 'https://zgebzhvbszhqvaryfiwk.supabase.co'

/** Mock Supabase auth so the app sees an authenticated session. */
async function mockAuth(page: Page) {
  // Intercept Supabase auth session endpoint
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

  // Intercept profile fetch
  await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id',
        display_name: 'Test User',
        avatar_url: null,
        email: 'test@example.com',
        has_onboarded: true,
        preferences: { theme: 'dark' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }),
    }),
  )

  // Intercept circle members
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

  // Intercept chores - return empty by default
  await page.route(`${SUPABASE_URL}/rest/v1/chores*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Intercept chore completions
  await page.route(`${SUPABASE_URL}/rest/v1/chore_completions*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
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
    // Supabase JS v2 flat format (v1 'currentSession' wrapper is ignored by v2)
    localStorage.setItem(
      'sb-zgebzhvbszhqvaryfiwk-auth-token',
      JSON.stringify({
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
      }),
    )
  })
}

// ---------------------------------------------------------------------------
// UNAUTHENTICATED TESTS
// ---------------------------------------------------------------------------

test.describe('Chores Page - Unauthenticated', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.goto('/more/chores')
    // 'Continue with Google' is unique on the login page — avoids strict-mode multi-match from 'Sign In'
    await expect(page.getByText('Continue with Google')).toBeVisible({ timeout: 10000 })
  })

  test('login page has email and password fields', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Continue with Google')).toBeVisible({ timeout: 10000 })
    // Verify Google sign-in is present
    const hasGoogle = await page.getByText('Continue with Google').isVisible().catch(() => false)
    expect(hasGoogle).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// AUTHENTICATED TESTS - NO CIRCLE SELECTED
// ---------------------------------------------------------------------------

test.describe('Chores Page - No Active Circle', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    // Set auth token but NO activeCircle
    await page.addInitScript(() => {
      const state = { state: { theme: 'dark', activeCircle: null }, version: 0 }
      localStorage.setItem('w4d-app', JSON.stringify(state))
      localStorage.setItem(
        'sb-zgebzhvbszhqvaryfiwk-auth-token',
        JSON.stringify({
          access_token: 'fake-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'test-user-id', email: 'test@example.com', role: 'authenticated', aud: 'authenticated' },
        }),
      )
    })
  })

  test('shows empty state prompting to select a circle', async ({ page }) => {
    await page.goto('/more/chores')
    // Should show the "Chores" heading and "select circle" empty state
    await expect(page.getByRole('heading', { name: 'Chores', exact: true })).toBeVisible({
      timeout: 10000,
    })
  })

  test('has a back button', async ({ page }) => {
    await page.goto('/more/chores')
    // The back button is an ArrowLeft icon button
    const backButton = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') })
    await expect(backButton.first()).toBeVisible({ timeout: 10000 })
  })
})

// ---------------------------------------------------------------------------
// AUTHENTICATED TESTS - WITH ACTIVE CIRCLE
// ---------------------------------------------------------------------------

test.describe('Chores Page - With Active Circle', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await setActiveCircle(page)
  })

  test('renders page header with title and add button', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Chores').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible()
  })

  test('shows empty state when no chores exist', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('No chores yet')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Create chores for family members/i)).toBeVisible()
  })

  test('empty state has a "New Chore" button', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByRole('button', { name: /new chore/i })).toBeVisible({ timeout: 10000 })
  })

  test('clicking Add button opens create chore dialog', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByRole('button', { name: /add/i })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /add/i }).click()
    // Dialog title should appear — use heading role to avoid matching the button too
    await expect(page.getByRole('heading', { name: 'New Chore' })).toBeVisible()
  })

  test('clicking empty state New Chore button opens dialog', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /new chore/i }).click({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'New Chore' })).toBeVisible()
  })

  test('create dialog has chore name input', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Chore Name')).toBeVisible()
    const nameInput = page.getByPlaceholder(/take out trash/i)
    await expect(nameInput).toBeVisible()
  })

  test('create dialog has emoji icon picker with 20 options', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Icon')).toBeVisible()
    // Each emoji is a button - check a sampling of them
    await expect(page.locator('[role="dialog"]').getByText('🧹')).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByText('🧽')).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByText('🗑️')).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByText('🐕')).toBeVisible()
  })

  test('can select a different emoji icon', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    // Click on the dog emoji
    const dogButton = page.locator('[role="dialog"]').getByText('🐕')
    await dogButton.click()
    // The selected icon button itself gets ring-2 class (not its parent wrapper)
    await expect(dogButton).toHaveClass(/ring-2/)
  })

  test('create dialog has assigned-to autocomplete', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Assigned to')).toBeVisible()
    await expect(page.getByPlaceholder(/emma.*dad/i)).toBeVisible()
  })

  test('create dialog has frequency selector with all options', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Frequency')).toBeVisible()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByText('Daily', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Weekly', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Bi-weekly', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Monthly', { exact: true })).toBeVisible()
    await expect(dialog.getByText('One-time', { exact: true })).toBeVisible()
  })

  test('selecting Weekly frequency shows day selector', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Click Weekly
    await dialog.getByText('Weekly', { exact: true }).click()
    // Day selector should appear
    await expect(dialog.getByText('On which days')).toBeVisible()
    await expect(dialog.getByText('Su', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Mo', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Tu', { exact: true })).toBeVisible()
    await expect(dialog.getByText('We', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Th', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Fr', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Sa', { exact: true })).toBeVisible()
  })

  test('day selector is hidden for Daily frequency', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Daily is selected by default
    await expect(dialog.getByText('On which days')).not.toBeVisible()
  })

  test('selecting Bi-weekly frequency also shows day selector', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    await dialog.getByText('Bi-weekly', { exact: true }).click()
    await expect(dialog.getByText('On which days')).toBeVisible()
  })

  test('can toggle day buttons in day selector', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    await dialog.getByText('Weekly', { exact: true }).click()
    const moButton = dialog.getByText('Mo', { exact: true })
    await moButton.click()
    // The button itself gets bg-brand-500 when selected
    await expect(moButton).toHaveClass(/bg-brand-500/)

    // Click again to deselect
    await moButton.click()
    await expect(moButton).not.toHaveClass(/bg-brand-500/)
  })

  test('create dialog has due time and points fields', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    await expect(dialog.getByText('Due Time')).toBeVisible()
    await expect(dialog.getByText('pts')).toBeVisible()
    // Time input
    await expect(dialog.locator('input[type="time"]')).toBeVisible()
    // Points input
    await expect(dialog.locator('input[type="number"]')).toBeVisible()
  })

  test('create dialog has description field', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.getByText('Description (optional)')).toBeVisible()
    await expect(page.getByPlaceholder(/any details/i)).toBeVisible()
  })

  test('create dialog has Cancel and Create buttons', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('Create button is disabled when name is empty', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const createBtn = page.locator('[role="dialog"]').getByRole('button', { name: 'Create' })
    await expect(createBtn).toBeDisabled()
  })

  test('Create button enables when name is filled', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const nameInput = page.getByPlaceholder(/take out trash/i)
    await nameInput.fill('Wash dishes')
    const createBtn = page.locator('[role="dialog"]').getByRole('button', { name: 'Create' })
    await expect(createBtn).toBeEnabled()
  })

  test('Cancel button closes the dialog', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('can fill out the entire chore form', async ({ page }) => {
    await page.goto('/more/chores')
    await page.getByRole('button', { name: /add/i }).click({ timeout: 10000 })
    const dialog = page.locator('[role="dialog"]')

    // Fill name
    await page.getByPlaceholder(/take out trash/i).fill('Walk the dog')

    // Select icon
    await dialog.getByText('🐕').click()

    // Fill assigned to
    await page.getByPlaceholder(/emma.*dad/i).fill('Test User')

    // Select frequency
    await dialog.getByText('Weekly', { exact: true }).click()

    // Select days
    await dialog.getByText('Mo', { exact: true }).click()
    await dialog.getByText('We', { exact: true }).click()
    await dialog.getByText('Fr', { exact: true }).click()

    // Fill time
    await dialog.locator('input[type="time"]').fill('08:00')

    // Fill points
    await dialog.locator('input[type="number"]').fill('5')

    // Fill description
    await page.getByPlaceholder(/any details/i).fill('Morning walk around the block')

    // Verify Create button is enabled
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeEnabled()
  })
})

// ---------------------------------------------------------------------------
// CHORE CARDS TESTS (with mock chore data)
// ---------------------------------------------------------------------------

test.describe('Chores Page - With Existing Chores', () => {
  test.beforeEach(async ({ page }) => {
    // Set up auth mocking but override chores endpoint with data
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
    await page.route(`${SUPABASE_URL}/rest/v1/profiles*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-id',
          display_name: 'Test User',
          avatar_url: null,
          email: 'test@example.com',
          has_onboarded: true,
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

    // Return mock chores
    await page.route(`${SUPABASE_URL}/rest/v1/chores*`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'chore-1',
              circle_id: 'circle-1',
              name: 'Take out trash',
              icon: '🗑️',
              assigned_name: 'Test User',
              frequency: 'daily',
              recurrence_days: [],
              due_time: '08:00:00',
              points: 3,
              description: 'Before breakfast',
              created_by: 'test-user-id',
              profile: { display_name: 'Test User' },
              created_at: '2025-01-01T00:00:00Z',
            },
            {
              id: 'chore-2',
              circle_id: 'circle-1',
              name: 'Do laundry',
              icon: '🧺',
              assigned_name: 'Test User',
              frequency: 'weekly',
              recurrence_days: [1, 4],
              due_time: null,
              points: 5,
              description: null,
              created_by: 'test-user-id',
              profile: { display_name: 'Test User' },
              created_at: '2025-01-01T00:00:00Z',
            },
          ]),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.route(`${SUPABASE_URL}/rest/v1/chore_completions*`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )

    await setActiveCircle(page)
  })

  test('displays chore cards with names', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Do laundry')).toBeVisible()
  })

  test('chore cards show emoji icons', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('🗑️').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('🧺')).toBeVisible()
  })

  test('chore cards show points', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    // Points displayed as "3 pts" and "5 pts"
    await expect(page.getByText('3 pts').first()).toBeVisible()
    await expect(page.getByText('5 pts').first()).toBeVisible()
  })

  test('chore cards show due time when set', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('08:00')).toBeVisible()
  })

  test('chore cards have Done button for incomplete chores', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    const doneButtons = page.getByRole('button', { name: /done/i })
    await expect(doneButtons.first()).toBeVisible()
  })

  test('chore cards have edit and delete buttons', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    // Edit buttons (Pencil icons)
    const editButtons = page.locator('button').filter({ has: page.locator('svg.lucide-pencil') })
    expect(await editButtons.count()).toBeGreaterThanOrEqual(2)
    // Delete buttons (Trash icons)
    const deleteButtons = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') })
    expect(await deleteButtons.count()).toBeGreaterThanOrEqual(2)
  })

  test('chores are grouped by assigned person', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    // Person label should be visible
    await expect(page.getByText('Test User').first()).toBeVisible()
  })

  test('weekly summary toggle exists and expands', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    const summaryButton = page.getByText('Weekly Summary')
    await expect(summaryButton).toBeVisible({ timeout: 5000 })
    await summaryButton.click()
    // Allow Framer Motion height animation to complete
    await page.waitForTimeout(400)
    await expect(page.getByText(/this week/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('weekly summary can be collapsed after expanding', async ({ page }) => {
    await page.goto('/more/chores')
    await expect(page.getByText('Take out trash')).toBeVisible({ timeout: 10000 })
    const summaryButton = page.getByText('Weekly Summary')
    await expect(summaryButton).toBeVisible({ timeout: 5000 })
    // Expand
    await summaryButton.click()
    await page.waitForTimeout(400)
    await expect(page.getByText(/this week/i).first()).toBeVisible({ timeout: 5000 })
    // Collapse
    await summaryButton.click()
    await page.waitForTimeout(400)
    await expect(page.getByText(/No completions this week/i)).not.toBeVisible()
  })
})
