import { test, expect } from '@playwright/test'

// v3 Lab Journal — Stage 9 surfaces visual baselines.
//
// Captures the chrome surfaces rebuilt in Stage 9: Header (Mazzard SVG logo
// + mono nav + cart link), Footer (lab-notebook colophon), the cart page
// empty state (calm v3 typography), and the full-screen MobileMenuOverlay.
//
// Header + Footer are pinned to desktop 1440×900. The mobile menu test
// uses a 375×812 viewport (matches `mobile` project default) — we explicitly
// resize before navigating since this single spec runs in the desktop
// project context for consistency with stages 7-8.
//
// Animations are globally disabled in playwright.config.ts; we still wait
// for fonts + a short settle so the Mazzard wordmark renders at its final
// metrics before capture.
test.describe('v3 Lab Journal — Stage 9 surfaces', () => {
  test.beforeEach(async () => {
    // Project config (mobile/tablet/desktop) drives viewport; Stage 10
    // dropped the desktop-only restriction to baseline all three.
  })

  test('Header on cream surface', async ({ page }) => {
    await page.goto('/ru')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    const header = page.locator('header').first()
    await expect(header).toHaveScreenshot('header.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('Footer colophon', async ({ page }) => {
    await page.goto('/ru')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    const footer = page.locator('footer').first()
    await footer.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(footer).toHaveScreenshot('footer.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('Cart page empty state', async ({ page }) => {
    await page.goto('/ru/cart')
    await page.waitForLoadState('networkidle')
    // Ensure a clean empty cart regardless of any persisted state.
    await page.evaluate(() => {
      localStorage.removeItem('ximi4ka-shop-cart')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    await expect(page.locator('main, section').first()).toHaveScreenshot(
      'cart-empty.png',
      { maxDiffPixelRatio: 0.02 },
    )
  })

  test('Mobile menu overlay', async ({ page }, testInfo) => {
    // Mobile menu only renders at the mobile breakpoint — scope to mobile project.
    test.skip(
      testInfo.project.name !== 'mobile',
      'Mobile menu renders only at the mobile breakpoint',
    )
    await page.goto('/ru')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveScreenshot(
      'mobile-menu.png',
      { maxDiffPixelRatio: 0.02 },
    )
  })
})
