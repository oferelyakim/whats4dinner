import { test, expect } from '@playwright/test'

test.describe('Activities Page', () => {
  test('navigates to activities page', async ({ page }) => {
    await page.goto('/more/activities')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
