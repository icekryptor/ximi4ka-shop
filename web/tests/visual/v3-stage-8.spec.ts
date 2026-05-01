import { test, expect } from '@playwright/test'

// v3 Lab Journal — Stage 8 surfaces visual baselines.
//
// Captures the four surfaces shipped/touched in Stage 8 at the 1440×900 desktop
// viewport, mirroring the structure used by `v3-homepage.spec.ts` and
// `v3-product-detail.spec.ts`. Animations are globally disabled in
// playwright.config.ts (`expect.toHaveScreenshot.animations = 'disabled'`); we
// still wait for fonts + a short settle so any reveal-on-mount variants and
// next/image LQIP swaps land in their final frame before capture.
//
// Scope:
//   1. Homepage `#how-it-works` slab (5. Как это работает — DARK INK)
//   2. Homepage Каталог по интересам slab (4. LAB CREAM)
//   3. /ru/categories index (categories listing v3)
//   4. /ru/categories/reaktivy detail (v3 hero + sticky filter + grid)
//
// Pinned to the `desktop` project — the v3 baselines target 1440×900 only.
// Mobile/tablet surfaces stay covered by storefront.spec.ts.
//
// Detail slug: `reaktivy` — the largest published category in the seed
// (29 products at the time of writing), so the grid renders enough cards to
// exercise the full v3 detail layout including the sticky filter rail.
test.describe('v3 Lab Journal — Stage 8 surfaces', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'Stage 8 baselines run only at the 1440×900 desktop viewport',
    )
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('homepage how-it-works section', async ({ page }) => {
    await page.goto('/ru')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    // The section keeps its Stage 5 id="how-it-works" via LabSection's
    // {...rest} prop forwarding (see components/ui/LabSection.tsx).
    const section = page.locator('#how-it-works')
    await section.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(section).toHaveScreenshot('homepage-how-it-works.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('homepage categories section', async ({ page }) => {
    await page.goto('/ru')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    // Section 4 ("Каталог по интересам") — disambiguated by the heading copy
    // "Каталог по". No id is set on this slab, so we filter by visible text.
    const section = page.locator('section').filter({ hasText: 'Каталог по' }).first()
    await section.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(section).toHaveScreenshot('homepage-categories.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('categories index', async ({ page }) => {
    await page.goto('/ru/categories')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    await expect(page.locator('section').first()).toHaveScreenshot(
      'categories-index.png',
      { maxDiffPixelRatio: 0.02 },
    )
  })

  test('category detail', async ({ page }) => {
    // `reaktivy` is the largest seeded category (29 products) — exercises
    // the full v3 detail layout (hero + sticky filter rail + product grid).
    await page.goto('/ru/categories/reaktivy')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    await expect(page.locator('section').first()).toHaveScreenshot(
      'category-detail.png',
      { maxDiffPixelRatio: 0.02 },
    )
  })
})
