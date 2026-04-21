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
