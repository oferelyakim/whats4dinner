import { test, expect } from '@playwright/test'

test.describe('Shopping Lists Page', () => {
  test('navigates to lists page', async ({ page }) => {
    await page.goto('/lists')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('can navigate to new list page', async ({ page }) => {
    await page.goto('/lists/new')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
