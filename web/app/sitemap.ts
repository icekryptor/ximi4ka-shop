import type { MetadataRoute } from 'next'
import { listCategories, listPages, listPublishedProducts } from '@/lib/api'
import { siteUrl } from '@/lib/metadata'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from '@/lib/i18n'

// Path-per-locale helper. Matches the middleware rule: default locale
// URLs stay unprefixed, everything else gets a /${locale}/ prefix.
function pathForLocale(locale: Locale, pathname: string): string {
  return locale === DEFAULT_LOCALE
    ? pathname
    : `/${locale}${pathname === '/' ? '' : pathname}` || `/${locale}`
}

function alternatesFor(pathname: string, base: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const loc of SUPPORTED_LOCALES) {
    out[loc] = `${base}${pathForLocale(loc, pathname)}`
  }
  return out
}

// Next will serve this at /sitemap.xml. All enumeration failures degrade to
// an empty section — we'd rather ship a partial sitemap than a 500.
//
// Each entry emits `alternates.languages` with the URL for every supported
// locale. Next's sitemap serializer turns those into `<xhtml:link>` entries
// so search engines pick up hreflang without us hand-rolling the XML.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()

  const [products, categories, pages] = await Promise.all([
    listPublishedProducts({ limit: 1000 })
      .then((r) => r.data)
      .catch(() => []),
    listCategories({ limit: 1000 })
      .then((r) => r.data)
      .catch(() => []),
    listPages({ limit: 1000 })
      .then((r) => r.data)
      .catch(() => []),
  ])

  const now = new Date().toISOString()

  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
      alternates: { languages: alternatesFor('/', base) },
    },
    {
      url: `${base}/categories`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: { languages: alternatesFor('/categories', base) },
    },
    ...categories.map((c) => ({
      url: `${base}/categories/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: { languages: alternatesFor(`/categories/${c.slug}`, base) },
    })),
    ...products.map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
      alternates: { languages: alternatesFor(`/product/${p.slug}`, base) },
    })),
    // CMS pages — skip `home`, which is rendered at `/`.
    ...pages
      .filter((p) => p.slug !== 'home')
      .map((p) => ({
        url: `${base}/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
        alternates: { languages: alternatesFor(`/${p.slug}`, base) },
      })),
  ]
}
