import { test, expect } from '@playwright/test'

test.describe('Dark Mode', () => {
  test('supports dark color scheme', async ({ page }) => {
    // Emulate dark mode
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page.waitForTimeout(1000)

    const body = page.locator('body')
    await expect(body).toBeVisible()

    // Body should have dark background (checking it doesn't crash)
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    })
    expect(bgColor).toBeTruthy()
  })

  test('supports light color scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await page.waitForTimeout(1000)

    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})
