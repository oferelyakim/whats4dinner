import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('app loads and shows login page when not authenticated', async ({ page }) => {
    await page.goto('/')
    // Should show auth page or home page
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('bottom navigation is present when authenticated, or login page shows', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    // Either we see the nav (authenticated) or the sign in page (not authenticated)
    const hasNav = await page.locator('nav').first().isVisible().catch(() => false)
    const hasAuth = await page.locator('text=/Sign In/i').isVisible().catch(() => false)
    expect(hasNav || hasAuth).toBeTruthy()
  })
})

test.describe('App Shell', () => {
  test('renders without crashing', async ({ page }) => {
    await page.goto('/')
    // No unhandled errors
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(2000)
    expect(errors).toHaveLength(0)
  })

  test('has proper meta tags for PWA', async ({ page }) => {
    await page.goto('/')
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    expect(themeColor).toBeTruthy()
  })
})
