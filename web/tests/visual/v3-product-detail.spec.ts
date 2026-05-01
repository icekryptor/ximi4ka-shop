import { test, expect } from '@playwright/test'

// v3 Lab Journal product detail page baselines.
//
// Captures the hero (SECTION 1) and characteristics (SECTION 3) slabs of the
// rebuilt PDP at the 1440×900 desktop viewport, mirroring the structure used
// by `v3-homepage.spec.ts`. Animations are globally disabled in
// playwright.config.ts (`expect.toHaveScreenshot.animations = 'disabled'`); we
// still wait for fonts + a short settle so any reveal-on-mount variants and
// next/image LQIP swaps land in their final frame before capture.
//
// Pinned to the `desktop` project — Stage 7 brief targets 1440×900 explicitly.
// Mobile/tablet PDP coverage stays under storefront.spec.ts for now.
//
// Slug: `himichka-30` is the canonical "flagship Химичка 3.0" product carried
// over from the Tilda CSV import (see api/src/seeds/_lib/tilda-row.ts and
// the storefront spec for the same slug). It's published, has a SKU, gallery
// images, and a `<h3>Характеристики</h3>` block so `parseCharacteristics`
// surfaces a populated table — both the "use facts" cell row and the full
// "Полный список характеристик" table render against this seed.
test.describe('v3 Lab Journal — product detail', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'v3 PDP baselines run only at the 1440×900 desktop viewport',
    )
    await page.goto('/ru/product/himichka-30')
    await page.waitForLoadState('networkidle')
    // Ensure web fonts (next/font/google) have finished swapping before the
    // first capture — otherwise we may snapshot a metric-fallback face.
    await page.evaluate(() => document.fonts.ready)
    // Brief pause for one-shot mount work / layout-effect settling.
    await page.waitForTimeout(500)
  })

  test('hero section visual', async ({ page }) => {
    // SECTION 1 (cream LabSection) — first <section> on the page. Sits
    // directly under the breadcrumb <nav>. LabSection renders <section>
    // (see components/ui/LabSection.tsx).
    const hero = page.locator('section').first()
    await expect(hero).toHaveScreenshot('pdp-hero.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('characteristics section visual', async ({ page }) => {
    // SECTION 3 (ink LabSection) — disambiguated by the eyebrow text
    // "02.0 / Технические данные" which renders unconditionally on this
    // section, regardless of whether the product has a populated full
    // characteristics table.
    const characteristics = page
      .locator('section')
      .filter({ hasText: '02.0 / Технические данные' })
      .first()
    await characteristics.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(characteristics).toHaveScreenshot('pdp-characteristics.png', {
      maxDiffPixelRatio: 0.03,
    })
  })
})
