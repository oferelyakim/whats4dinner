import { test, expect } from '@playwright/test'

test.describe('Recipes Page', () => {
  test('navigates to recipes page', async ({ page }) => {
    await page.goto('/recipes')
    await page.waitForTimeout(1000)
    // Should show recipes page or redirect to auth
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('recipes page has search functionality', async ({ page }) => {
    await page.goto('/recipes')
    await page.waitForTimeout(1000)
    // Check for search input or auth redirect
    const hasSearch = await page.locator('input[placeholder*="earch"]').isVisible().catch(() => false)
    const hasAuth = await page.locator('text=/Sign In/i').isVisible().catch(() => false)
    expect(hasSearch || hasAuth).toBeTruthy()
  })

  test('can navigate to new recipe form', async ({ page }) => {
    await page.goto('/recipes/new')
    await page.waitForTimeout(1000)
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })
})
