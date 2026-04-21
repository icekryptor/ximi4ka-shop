import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Page } from '@ximi4ka-shop/shared'
import { ApiError, getPage } from '@/lib/api'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata, siteUrl } from '@/lib/metadata'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60
export const dynamicParams = true

// Known CMS slugs to pre-render at build time. Excludes 'home' (served by `/`).
// Other slugs still work via on-demand rendering thanks to dynamicParams.
const KNOWN_SLUGS: string[] = ['o-nas', 'dostavka', 'kontakty']

export async function generateStaticParams(): Promise<
  Array<{ locale: Locale; slug: string }>
> {
  // Only emit slugs the API actually serves; this mirrors how category/product
  // routes degrade when the API is offline (e.g. during CI builds). Cross
  // with every locale so both /o-nas and /en/o-nas are pre-rendered.
  const resolved = await Promise.all(
    KNOWN_SLUGS.map(async (slug) => {
      try {
        await getPage(slug)
        return slug
      } catch {
        return null
      }
    }),
  )
  const slugs = resolved.filter((s): s is string => s !== null)
  return SUPPORTED_LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })))
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

function pathForLocale(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE ? `/${slug}` : `/${locale}/${slug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  if (slug === 'home') return { title: 'Ximi4ka' }
  try {
    const page = await getPage(slug)
    const title = pickField<string>(page, 'title', locale) ?? page.title
    const metaTitle = pickField<string>(page, 'metaTitle', locale)
    const metaDescription = pickField<string>(page, 'metaDescription', locale)
    const alternatesByLocale = Object.fromEntries(
      SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc, slug)]),
    ) as Record<Locale, string>
    return buildMetadata({
      title,
      metaTitle,
      metaDescription,
      ogImage: page.ogImage,
      canonicalUrl: page.canonicalUrl,
      noindex: page.noindex,
      pathname: pathForLocale(locale, slug),
      type: 'article',
      ampPath: `/amp/article/${slug}`,
      locale,
      alternatesByLocale,
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
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  // Guard: the root `/` already handles the `home` page.
  if (slug === 'home') notFound()

  const page = await fetchPage(slug)
  const title = pickField<string>(page, 'title', locale) ?? page.title
  const blocks =
    (pickField<unknown[]>(page, 'blocks', locale) ?? page.blocks ?? []) as unknown[]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* AMP discovery link — see product page for rationale. */}
      <link rel="amphtml" href={`${siteUrl()}/amp/article/${slug}`} />
      <JsonLd data={articleJsonLd(page)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: title, url: pathForLocale(locale, page.slug) },
        ])}
      />

      <h1 className="text-4xl font-bold text-brand-text mb-6">{title}</h1>
      {blocks.length > 0 ? (
        <BlockRenderer blocks={blocks} />
      ) : (
        <p className="text-brand-text-secondary">Страница пока пуста.</p>
      )}
    </div>
  )
}
