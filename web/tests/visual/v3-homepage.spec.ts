import { test, expect } from '@playwright/test'

// v3 Lab Journal homepage visual baseline.
//
// Captures the three editorial slabs (Hero, Manifesto, v3 catalog) at the
// 1440×900 desktop viewport so subsequent design iteration is gated by an
// explicit "yes, this drift is intentional" baseline refresh. Animations are
// globally disabled by playwright.config.ts (`expect.toHaveScreenshot.animations
// = 'disabled'`); we still wait for fonts + a short settle window so any
// reveal-on-scroll variants land in their final frame.
//
// Pin to the `desktop` project — brief explicitly targets 1440×900 and the
// other projects (mobile/tablet) belong to the broader storefront.spec.ts
// coverage. Skipping at runtime keeps this file's baseline count to 3 even
// when someone runs the whole suite with no `--project` flag.
test.describe('v3 Lab Journal homepage', () => {
  test.beforeEach(async ({ page }) => {
    // Project config (mobile/tablet/desktop) drives viewport; Stage 10
    // dropped the desktop-only restriction to baseline all three.
    // Locale-prefixed homepage. Middleware will accept both `/` and `/ru`,
    // but using `/ru` makes the intent explicit and avoids relying on a
    // rewrite if the default locale ever changes.
    await page.goto('/ru')
    await page.waitForLoadState('networkidle')
    // Ensure web fonts (next/font/google) have finished swapping before
    // any screenshot is taken — otherwise the first frame may catch a
    // metric-compatible fallback face.
    await page.evaluate(() => document.fonts.ready)
    // Pause briefly so any one-shot mount work (e.g. measure-then-paint
    // layout effects) settles before the screenshot capture.
    await page.waitForTimeout(500)
  })

  test('hero section visual', async ({ page }) => {
    const hero = page.locator('section').first()
    await expect(hero).toHaveScreenshot('hero.png', { maxDiffPixelRatio: 0.02 })
  })

  test('manifesto section visual', async ({ page }) => {
    // Manifesto is rendered with id="manifesto" by components/marketing/Manifesto.tsx.
    const manifesto = page.locator('#manifesto')
    await manifesto.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(manifesto).toHaveScreenshot('manifesto.png', { maxDiffPixelRatio: 0.02 })
  })

  test('products section visual', async ({ page }) => {
    // The v3 catalog section is the cream-background slab containing the
    // three flagship cards (Химичка 3.0, Мини-Химичка, Электрохимичка).
    // We disambiguate via the heading "Готовые наборы".
    const productsSection = page.locator('section').filter({ hasText: 'Химичка 3.0' }).first()
    await productsSection.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await expect(productsSection).toHaveScreenshot('products.png', { maxDiffPixelRatio: 0.03 })
  })
})
