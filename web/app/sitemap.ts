import type { MetadataRoute } from 'next'
import { listCategories, listPages, listPublishedProducts } from '@/lib/api'
import { siteUrl } from '@/lib/metadata'

// Next will serve this at /sitemap.xml. All enumeration failures degrade to
// an empty section — we'd rather ship a partial sitemap than a 500.
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
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    {
      url: `${base}/categories`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...categories.map((c) => ({
      url: `${base}/categories/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    // CMS pages — skip `home`, which is rendered at `/`.
    ...pages
      .filter((p) => p.slug !== 'home')
      .map((p) => ({
        url: `${base}/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
  ]
}
