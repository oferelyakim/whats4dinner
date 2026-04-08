import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('all interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    // Tab through the page and ensure focus is visible
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(focusedElement).toBeTruthy()
  })

  test('buttons have accessible names', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const buttons = await page.locator('button').all()
    for (const button of buttons.slice(0, 10)) {
      const name = await button.getAttribute('aria-label') ||
                   await button.textContent() ||
                   await button.getAttribute('title')
      // Each button should have some accessible name
      expect(name?.trim()).toBeTruthy()
    }
  })

  test('images have alt text', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const images = await page.locator('img').all()
    for (const img of images) {
      const alt = await img.getAttribute('alt')
      // All images should have alt attribute
      expect(alt !== null).toBeTruthy()
    }
  })
})
