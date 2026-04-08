import { test, expect } from '@playwright/test'

test.describe('Chores Page', () => {
  test('navigates to chores page', async ({ page }) => {
    await page.goto('/more/chores')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
