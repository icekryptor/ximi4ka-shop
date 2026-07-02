import type { Metadata } from 'next'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './i18n'

export interface SeoInput {
  title: string
  description?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: string | null
  canonicalUrl?: string | null
  noindex?: boolean
  /** Route-relative path, e.g. '/product/foo'. Used to build absolute canonical + OG URL. */
  pathname: string
  type?: 'website' | 'article' | 'product'
  /**
   * Route-relative path to the AMP equivalent, e.g. '/amp/product/foo'.
   * When set, buildMetadata emits `<link rel="amphtml" href="...">` pointing
   * at this URL so Yandex/Google can discover the Accelerated Mobile Pages
   * variant.
   */
  ampPath?: string | null
  /**
   * Current locale this page renders in. Controls OG `locale` and
   * seeds the default alternates map if `alternatesByLocale` is omitted.
   */
  locale?: Locale
  /**
   * Per-locale route-relative paths, e.g.
   *   { ru: '/product/foo', en: '/en/product/foo' }
   * Every supported locale that appears here becomes a `hreflang` entry.
   * The default locale also becomes the `x-default` alternate.
   * When omitted, we emit alternates using `pathname` for every locale,
   * which is fine for static pages like `/categories` where the RU URL
   * and EN URL only differ by prefix.
   */
  alternatesByLocale?: Partial<Record<Locale, string>>
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://new.ximi4ka.ru'
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// Map our internal locale codes to IETF BCP 47 tags used by hreflang +
// OpenGraph. Keep this table alongside DEFAULT_LOCALE / SUPPORTED_LOCALES
// so additions only require one edit.
const OG_LOCALE_BY_CODE: Record<Locale, string> = {
  ru: 'ru_RU',
  en: 'en_US',
}
const HREFLANG_BY_CODE: Record<Locale, string> = {
  ru: 'ru',
  en: 'en',
}

/**
 * Build the default path map for alternates when the caller doesn't
 * supply one. Mirrors the middleware's prefixing rule: default locale
 * is unprefixed, others get `/${locale}` prefix.
 */
function defaultAlternatePaths(pathname: string): Record<Locale, string> {
  // `pathname` may already be prefixed (e.g. `/en/product/foo`) when the
  // caller forgot to supply a map. Strip the prefix first, then rebuild.
  const stripped = stripLocalePrefix(pathname)
  const map = {} as Record<Locale, string>
  for (const loc of SUPPORTED_LOCALES) {
    map[loc] =
      loc === DEFAULT_LOCALE
        ? stripped
        : `/${loc}${stripped === '/' ? '' : stripped}` || `/${loc}`
  }
  return map
}

function stripLocalePrefix(pathname: string): string {
  for (const loc of SUPPORTED_LOCALES) {
    if (pathname === `/${loc}`) return '/'
    if (pathname.startsWith(`/${loc}/`)) return pathname.slice(loc.length + 1)
  }
  return pathname
}

/**
 * Build a Next.js `Metadata` object from an entity's SEO fields + fallbacks.
 *
 * Admin-set `metaTitle` / `metaDescription` / `ogImage` / `canonicalUrl` /
 * `noindex` take precedence over the natural title/description. The canonical
 * URL is always absolute — either the explicit override or `siteUrl() + pathname`.
 *
 * `hreflang` alternates are emitted for every supported locale plus an
 * `x-default` pointing at the default-locale URL. When the caller doesn't
 * supply `alternatesByLocale`, we synthesize one from `pathname` using the
 * same rule the middleware uses (default locale unprefixed, others prefixed).
 */
export function buildMetadata(input: SeoInput): Metadata {
  const metaTitle = trimOrNull(input.metaTitle)
  const metaDescription = trimOrNull(input.metaDescription)
  const ogImage = trimOrNull(input.ogImage)
  const canonicalOverride = trimOrNull(input.canonicalUrl)
  const locale: Locale = input.locale ?? DEFAULT_LOCALE

  const title = metaTitle ?? input.title
  const description =
    metaDescription ?? trimOrNull(input.description ?? null) ?? undefined

  const base = siteUrl()
  const canonical = canonicalOverride ?? `${base}${input.pathname}`
  const image = ogImage ?? `${base}/og-default.png`

  // Next's OG type union doesn't include 'product'; we fall back to 'website'
  // so builds don't fail. The JSON-LD Product type is what search engines read
  // for product-specific signals anyway.
  const ogType = input.type === 'product' ? 'website' : input.type ?? 'website'

  // Next's Metadata API doesn't have a first-class amphtml slot — it lives
  // under `other` and renders as a flat `<link>` tag. We build it manually
  // so the caller just passes `/amp/product/slug` without thinking about
  // URL assembly.
  const ampHref = input.ampPath ? `${base}${input.ampPath}` : null
  const other = ampHref ? { amphtml: ampHref } : undefined

  // Build hreflang alternates. We include every supported locale that
  // has a path in the map (or synthesize one from pathname), plus an
  // `x-default` entry pointing at the default locale URL.
  const paths = {
    ...defaultAlternatePaths(input.pathname),
    ...(input.alternatesByLocale ?? {}),
  }
  const languages: Record<string, string> = {}
  for (const loc of SUPPORTED_LOCALES) {
    const p = paths[loc]
    if (p != null) {
      languages[HREFLANG_BY_CODE[loc]] = `${base}${p}`
    }
  }
  const defaultPath = paths[DEFAULT_LOCALE]
  if (defaultPath != null) {
    languages['x-default'] = `${base}${defaultPath}`
  }

  return {
    title,
    description,
    alternates: { canonical, languages },
    robots: input.noindex ? { index: false, follow: false } : undefined,
    other,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Ximi4ka',
      images: [{ url: image }],
      locale: OG_LOCALE_BY_CODE[locale],
      type: ogType,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}
