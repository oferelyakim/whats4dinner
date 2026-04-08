import { test, expect } from '@playwright/test'

test.describe('Events Page', () => {
  test('navigates to events page', async ({ page }) => {
    await page.goto('/events')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
