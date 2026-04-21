import type { Metadata } from 'next'

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
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shop.ximi4ka.ru'
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Build a Next.js `Metadata` object from an entity's SEO fields + fallbacks.
 *
 * Admin-set `metaTitle` / `metaDescription` / `ogImage` / `canonicalUrl` /
 * `noindex` take precedence over the natural title/description. The canonical
 * URL is always absolute — either the explicit override or `siteUrl() + pathname`.
 */
export function buildMetadata(input: SeoInput): Metadata {
  const metaTitle = trimOrNull(input.metaTitle)
  const metaDescription = trimOrNull(input.metaDescription)
  const ogImage = trimOrNull(input.ogImage)
  const canonicalOverride = trimOrNull(input.canonicalUrl)

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

  return {
    title,
    description,
    alternates: { canonical },
    robots: input.noindex ? { index: false, follow: false } : undefined,
    other,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Ximi4ka',
      images: [{ url: image }],
      locale: 'ru_RU',
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
