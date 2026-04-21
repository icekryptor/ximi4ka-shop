import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Page } from '@ximi4ka-shop/shared'
import { ApiError, getPage } from '@/lib/api'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata, siteUrl } from '@/lib/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/jsonLd'

export const revalidate = 60
export const dynamicParams = true

// Known CMS slugs to pre-render at build time. Excludes 'home' (served by `/`).
// Other slugs still work via on-demand rendering thanks to dynamicParams.
const KNOWN_SLUGS: string[] = ['o-nas', 'dostavka', 'kontakty']

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  // Only emit slugs the API actually serves; this mirrors how category/product
  // routes degrade when the API is offline (e.g. during CI builds).
  const results = await Promise.all(
    KNOWN_SLUGS.map(async (slug) => {
      try {
        await getPage(slug)
        return { slug }
      } catch {
        return null
      }
    }),
  )
  return results.filter((p): p is { slug: string } => p !== null)
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (slug === 'home') return { title: 'Ximi4ka' }
  try {
    const page = await getPage(slug)
    return buildMetadata({
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      ogImage: page.ogImage,
      canonicalUrl: page.canonicalUrl,
      noindex: page.noindex,
      pathname: `/${slug}`,
      type: 'article',
      ampPath: `/amp/article/${slug}`,
    })
  } catch {
    return { title: 'Страница — Ximi4ka' }
  }
}

async function fetchPage(slug: string): Promise<Page> {
  try {
    return await getPage(slug)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound()
    }
    throw err
  }
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params
  // Guard: the root `/` already handles the `home` page.
  if (slug === 'home') notFound()

  const page = await fetchPage(slug)
  const blocks = page.blocks ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* AMP discovery link — see product page for rationale. */}
      <link rel="amphtml" href={`${siteUrl()}/amp/article/${slug}`} />
      <JsonLd data={articleJsonLd(page)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: page.title, url: `/${page.slug}` },
        ])}
      />

      <h1 className="text-4xl font-bold text-brand-text mb-6">{page.title}</h1>
      {blocks.length > 0 ? (
        <BlockRenderer blocks={blocks} />
      ) : (
        <p className="text-brand-text-secondary">Страница пока пуста.</p>
      )}
    </div>
  )
}
