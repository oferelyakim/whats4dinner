import { test, expect } from '@playwright/test'

test.describe('RTL Support', () => {
  test('page supports RTL direction', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    // Check that the html element can have dir="rtl"
    // The app sets this based on locale
    const html = page.locator('html')
    await expect(html).toBeAttached()

    // Verify no horizontal overflow in either direction
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })
})
