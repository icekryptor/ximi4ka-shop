import { test, expect, type Page } from '@playwright/test'

const ROUTES: Array<{ name: string; path: string }> = [
  { name: 'home', path: '/' },
  { name: 'categories', path: '/categories' },
  { name: 'category-detail', path: '/categories/himicheskie-nabory' },
  { name: 'product-detail', path: '/product/nabor-yunogo-himika' },
  { name: 'cart-empty', path: '/cart' },
  { name: 'cms-about', path: '/o-nas' },
  { name: 'cms-delivery', path: '/dostavka' },
  { name: 'cms-contacts', path: '/kontakty' },
  { name: '404', path: '/this-route-does-not-exist' },
]

async function preparePage(page: Page) {
  // Honour OS-level reduced motion so any framer-motion variants that respect
  // prefers-reduced-motion render in their reduced state.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Belt-and-braces: kill all CSS animations/transitions so a slow tick can't
  // catch a half-rendered frame.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  })
}

for (const route of ROUTES) {
  test(`${route.name} renders consistently`, async ({ page }) => {
    await preparePage(page)
    const response = await page.goto(route.path, { waitUntil: 'networkidle' })

    if (route.name === '404') {
      expect(response?.status()).toBe(404)
    } else {
      expect(response?.ok()).toBe(true)
    }

    // Re-apply prepare after navigation in case the new document threw away
    // the injected <style> tag.
    await preparePage(page)

    // Let any reveal-on-scroll / mount animations settle into their final
    // state before snapshotting.
    await page.waitForTimeout(300)

    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: true,
    })
  })
}
