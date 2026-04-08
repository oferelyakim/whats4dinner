import { test as setup, expect } from '@playwright/test'

/**
 * Auth setup: logs in with test credentials and saves session state.
 * For local testing, ensure these env vars are set or use defaults.
 */
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@ourtable.app'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!'

setup('authenticate', async ({ page }) => {
  await page.goto('/')

  // Wait for auth page to load
  await expect(page.locator('text=Sign In').first()).toBeVisible({ timeout: 10000 })

  // Fill in credentials
  await page.getByLabel(/email/i).fill(TEST_EMAIL)
  await page.getByLabel(/password/i).fill(TEST_PASSWORD)

  // Submit
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for redirect to home page
  await expect(page).toHaveURL('/', { timeout: 15000 })

  // Save signed-in state
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
})
