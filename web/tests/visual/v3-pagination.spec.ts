import { test, expect } from '@playwright/test'

// v3 Lab Journal — PaginationLJ component visual baselines.
//
// The production catalog likely has fewer than 12 products in most
// categories at the time of writing, so <PaginationLJ /> won't render
// in any of the route-level visual specs. This file targets a dev-only
// fixture route that mounts the component in four representative scenes:
//
//   1. middle-of-many — currentPage=6 of 12 (both ellipses visible)
//   2. few-pages      — currentPage=3 of 5  (no ellipsis branch)
//   3. first-page     — currentPage=1 of 12 (НАЗАД disabled as <span>)
//   4. last-page      — currentPage=12 of 12 (ВПЕРЁД disabled, partial range)
//
// Each scene is a `<div data-fixture-scene="...">` so the screenshot
// crops tightly around just that pagination instance. Animations are
// globally disabled in playwright.config.ts; we still wait for fonts +
// a short settle so the Mazzard wordmark / mono numerals render at
// their final metrics before capture.
//
// Like the other v3-* specs, this runs across all three projects
// (mobile / tablet / desktop) — produces 4 scenes × 3 viewports = 12
// baseline files in __screenshots__/v3-pagination.spec.ts-snapshots/.
test.describe('v3 Lab Journal — pagination component', () => {
  test.beforeEach(async ({ page }) => {
    // Fixture route is gated to dev/test via process.env.NODE_ENV check;
    // Playwright's webServer boots Next.js in dev mode, so the route
    // resolves here. URL has no underscore prefix because Next.js App
    // Router excludes `_folderName` directories from routing.
    await page.goto('/ru/pagination-fixture')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
  })

  test('middle of many pages', async ({ page }) => {
    const scene = page.locator('[data-fixture-scene="middle-of-many"]')
    await expect(scene).toHaveScreenshot('pagination-middle.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('few pages no ellipsis', async ({ page }) => {
    const scene = page.locator('[data-fixture-scene="few-pages"]')
    await expect(scene).toHaveScreenshot('pagination-few.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('first page disabled back', async ({ page }) => {
    const scene = page.locator('[data-fixture-scene="first-page"]')
    await expect(scene).toHaveScreenshot('pagination-first.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('last page disabled forward', async ({ page }) => {
    const scene = page.locator('[data-fixture-scene="last-page"]')
    await expect(scene).toHaveScreenshot('pagination-last.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})
