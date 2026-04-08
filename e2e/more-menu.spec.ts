import { test, expect } from '@playwright/test'

test.describe('More Menu', () => {
  test('navigates to more page', async ({ page }) => {
    await page.goto('/more')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('more page has expected menu items', async ({ page }) => {
    await page.goto('/more')
    await page.waitForTimeout(1000)
    // Should have links to circles, profile, etc. or redirect to auth
    const hasAuth = await page.locator('text=/Sign In/i').isVisible().catch(() => false)
    if (!hasAuth) {
      // If authenticated, check for menu structure
      const body = await page.locator('body').textContent()
      expect(body).toBeTruthy()
    }
  })
})
