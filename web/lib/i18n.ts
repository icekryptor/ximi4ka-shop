// Locale plumbing for the public storefront. We keep this dependency-free
// on purpose: no `next-intl`, no `react-intl`, just a couple of helpers
// that agree on the supported set + a fallback rule.
//
// RU is the source-of-truth locale — its values live on the top-level
// entity columns (Product.name, Category.metaTitle, Page.title, etc.).
// Non-default locales live under the `translations` JSONB blob:
//
//   {
//     "en": { "name": "Young Chemist Kit", "metaTitle": "…" }
//   }
//
// Fields inside a locale block are all optional. When EN is missing a
// field we fall back to the RU value — that's the core promise of
// Phase 8 and why we can ship EN URLs safely before any translation
// work has landed.

export const DEFAULT_LOCALE = 'ru' as const

// Order matters for hreflang emission (RU first, EN second). If a new
// locale is added, append it here and everything that reads the list
// (middleware matcher, sitemap alternates, buildMetadata) picks it up
// automatically.
export const SUPPORTED_LOCALES = ['ru', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export function isLocale(value: string | undefined | null): value is Locale {
  if (value == null) return false
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Shape contract for entities that support translations — Product,
 * ProductCategory, and Page all match this today. We type `translations`
 * loosely because its contents are per-locale JSON, but the top-level
 * map is always `{ [locale]: { [field]: value } }`.
 */
export interface Translatable {
  translations?: Record<string, unknown> | null
}

/**
 * Return the value of `field` for the given locale, with RU fallback.
 *
 * For the default locale (`ru`), we always read the entity's top-level
 * column — the `translations` blob is only for non-default locales.
 * For a non-default locale, we look up `translations[locale][field]`
 * and fall back to the top-level column when the translation is missing
 * or null.
 *
 * Typed loosely on purpose: the shared `Product` / `ProductCategory` /
 * `Page` types declare `translations: Record<string, unknown>` (not a
 * strict nested-record shape) and entity columns don't satisfy an
 * index-signature type. We re-validate the per-locale object at
 * runtime with `typeof === 'object'` so mis-shaped rows fall back
 * gracefully instead of crashing the render.
 *
 * NOTE on slug routing: even when a locale-specific slug exists under
 * `translations.en.slug`, we currently route by the RU slug. That means
 * `/en/product/nabor-yunogo-himika` renders the EN content for the
 * product whose RU slug is `nabor-yunogo-himika`. Per-locale slug routes
 * are explicitly out of scope for Phase 8.
 */
export function pickField<T>(
  entity: Translatable | null | undefined,
  field: string,
  locale: Locale,
): T | null {
  if (entity == null) return null

  if (locale !== DEFAULT_LOCALE) {
    const perLocaleRaw = entity.translations?.[locale]
    if (perLocaleRaw && typeof perLocaleRaw === 'object') {
      const perLocale = perLocaleRaw as Record<string, unknown>
      if (perLocale[field] != null) {
        return perLocale[field] as T
      }
    }
  }

  const top = (entity as unknown as Record<string, unknown>)[field]
  return (top as T | undefined) ?? null
}

/**
 * Russian plural rule: 1 / 2-4 / 5+ → forms[0] / forms[1] / forms[2].
 *
 * Numbers in the "teens" range (11-19, regardless of hundreds digit)
 * always take the 3rd form (5+); otherwise the last digit determines
 * the form. Examples:
 *
 *   pluralizeRu(1, ['товар', 'товара', 'товаров'])   → 'товар'
 *   pluralizeRu(2, ['товар', 'товара', 'товаров'])   → 'товара'
 *   pluralizeRu(5, ['товар', 'товара', 'товаров'])   → 'товаров'
 *   pluralizeRu(11, ['товар', 'товара', 'товаров'])  → 'товаров'  // 11-14 always 3rd form
 *   pluralizeRu(21, ['товар', 'товара', 'товаров'])  → 'товар'
 *   pluralizeRu(42, ['товар', 'товара', 'товаров'])  → 'товара'
 */
export function pluralizeRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const tens = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (tens > 1 && tens < 5) return forms[1]
  if (tens === 1) return forms[0]
  return forms[2]
}
