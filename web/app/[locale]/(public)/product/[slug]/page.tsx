import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Product } from '@ximi4ka-shop/shared'
import { ApiError, getPublishedProduct, listPublishedProducts } from '@/lib/api'
import { formatRub, stockLabel } from '@/lib/stockLabel'
import { AddToCartButton } from '@/components/AddToCartButton'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata, siteUrl } from '@/lib/metadata'
import { breadcrumbJsonLd, productJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const res = await listPublishedProducts({ limit: 500 })
    // Emit one (locale, slug) pair per supported locale. EN renders
    // with RU fallback content when `translations.en` is empty.
    return SUPPORTED_LOCALES.flatMap((locale) =>
      res.data.map((p) => ({ locale, slug: p.slug })),
    )
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

// URL the user sees for this entity in a given locale. RU stays
// unprefixed because middleware rewrites `/product/foo` → `/ru/product/foo`
// internally. Non-default locales are prefixed.
function pathForLocale(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE
    ? `/product/${slug}`
    : `/${locale}/product/${slug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale
  try {
    const product = await getPublishedProduct(slug)
    const name = pickField<string>(product, 'name', locale) ?? product.name
    const shortDescription = pickField<string>(product, 'shortDescription', locale)
    const metaTitle = pickField<string>(product, 'metaTitle', locale)
    const metaDescription = pickField<string>(product, 'metaDescription', locale)

    const alternatesByLocale = Object.fromEntries(
      SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc, slug)]),
    ) as Record<Locale, string>

    return buildMetadata({
      title: name,
      description: shortDescription,
      metaTitle,
      metaDescription,
      ogImage: product.ogImage ?? product.images?.[0]?.url ?? null,
      canonicalUrl: product.canonicalUrl,
      noindex: product.noindex,
      pathname: pathForLocale(locale, slug),
      type: 'product',
      ampPath: `/amp/product/${slug}`,
      locale,
      alternatesByLocale,
    })
  } catch {
    return { title: 'Товар — Ximi4ka' }
  }
}

export default async function ProductPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale
  let product: Product
  try {
    product = await getPublishedProduct(slug)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound()
    }
    throw err
  }

  // Display values — fall back to RU top-level column when the EN
  // translation is missing. Static UI strings ("Главная", "Каталог",
  // "Описание", etc.) stay Russian for now; translating them is out of
  // scope for Phase 8.
  const name = pickField<string>(product, 'name', locale) ?? product.name
  const shortDescription = pickField<string>(
    product,
    'shortDescription',
    locale,
  )
  const longDescriptionBlocks =
    (pickField<unknown[]>(product, 'longDescriptionBlocks', locale) ??
      product.longDescriptionBlocks) as unknown[]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* AMP discovery: search engines expect <link rel="amphtml"> on the
          canonical page. Next's Metadata API can emit the meta-tag form but
          not this link directly, so we render it inline alongside JSON-LD. */}
      <link rel="amphtml" href={`${siteUrl()}/amp/product/${slug}`} />
      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Каталог', url: '/categories' },
          { name, url: pathForLocale(locale, product.slug) },
        ])}
      />
      <nav aria-label="breadcrumbs" className="text-sm mb-6 text-brand-text-secondary">
        <Link href="/" className="hover:text-black">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <Link href="/categories" className="hover:text-black">
          Каталог
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Gallery */}
        <div>
          {product.images && product.images.length > 0 ? (
            <div className="space-y-4">
              {product.images.map((img) => (
                <div
                  key={img.id}
                  className="aspect-square bg-gray-100 rounded-2xl overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              aria-hidden
              className="aspect-square bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400"
            >
              Нет изображения
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{name}</h1>
          <p className="text-sm text-gray-500 mb-4">
            {stockLabel(product.stockStatus)}
          </p>

          <div className="mb-6">
            <span className="text-3xl font-bold">{formatRub(product.priceRub)}</span>
            {product.compareAtPriceRub != null && (
              <span className="ml-3 text-gray-400 line-through">
                {formatRub(product.compareAtPriceRub)}
              </span>
            )}
          </div>

          {shortDescription && (
            <p className="mb-6 text-gray-700">{shortDescription}</p>
          )}

          <AddToCartButton product={product} />

          {Array.isArray(longDescriptionBlocks) &&
            longDescriptionBlocks.length > 0 && (
              <section className="mt-12 pt-8 border-t border-gray-200">
                <h2 className="text-xl font-semibold mb-4">Описание</h2>
                <BlockRenderer blocks={longDescriptionBlocks} />
              </section>
            )}
        </div>
      </div>
    </div>
  )
}
