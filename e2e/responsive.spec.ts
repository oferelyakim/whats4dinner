import { test, expect } from '@playwright/test'

test.describe('Responsive Design', () => {
  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Page should render without crashing
    const body = page.locator('body')
    await expect(body).toBeVisible()

    // Content should not overflow horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(375 + 1) // allow 1px tolerance
  })

  test('renders correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForTimeout(1000)

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})
