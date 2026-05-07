import { test, expect } from '@playwright/test'

// v3 Lab Journal — SpecimenCard empty-state component visual baselines.
//
// Mounted via dev-only fixture at /ru/specimen-fixture (gated to
// NODE_ENV !== production via notFound()). Two scenes — `card` size
// (4:5 ProductCard slot) and `pdp` size (1:1 hero canvas) — each
// captured across mobile / tablet / desktop projects (2 × 3 = 6
// baselines).
//
// Pattern mirrors Stage 10's v3-pagination.spec.ts — same fixture
// route convention, same data-fixture-scene anchor, same wait
// pattern (networkidle + fonts.ready + 300ms settle).
test.describe('v3 Lab Journal — SpecimenCard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ru/specimen-fixture')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
  })

  test('card size', async ({ page }) => {
    const scene = page.locator('[data-fixture-scene="card-size"]')
    await expect(scene).toHaveScreenshot('specimen-card.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('pdp size', async ({ page }) => {
    const scene = page.locator('[data-fixture-scene="pdp-size"]')
    await expect(scene).toHaveScreenshot('specimen-pdp.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
