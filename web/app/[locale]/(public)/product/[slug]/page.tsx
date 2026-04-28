import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Product } from '@ximi4ka-shop/shared'
import {
  ApiError,
  getPublishedProduct,
  listPublishedProducts,
  type ProductWithCategories,
} from '@/lib/api'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata, siteUrl } from '@/lib/metadata'
import { breadcrumbJsonLd, productJsonLd } from '@/lib/jsonLd'
import {
  Container,
  Section,
  DisplayHeading,
  Eyebrow,
  SectionHeading,
  MicroTrustRow,
  Pill,
} from '@/components/ui'
import { Reveal } from '@/components/motion'
import {
  PriceBlock,
  StockPill,
  KeyFactsList,
  CharacteristicsTable,
  ContentsSection,
} from '@/components/product'
import { ProductCard } from '@/components/ProductCard'
import { PreFooterCta } from '@/components/marketing/PreFooterCta'
import { parseCharacteristics } from '@/lib/parseCharacteristics'
import { AddToCartWithQuantity } from './_components/AddToCartWithQuantity'
import { MobileBuyBarMount } from './_components/MobileBuyBarMount'
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

/**
 * Pull up to 4 related products. Strategy:
 *  1. Fetch the published product list with `?include=categories` so each
 *     entry carries `categoryIds`.
 *  2. Find products sharing a category with the current one.
 *  3. If fewer than 4, top up with any other published products so the
 *     section is never empty when there's stock to show.
 */
async function fetchRelatedProducts(
  currentProductId: string,
): Promise<Product[]> {
  try {
    const res = await listPublishedProducts({ limit: 100, include: 'categories' })
    const all = res.data as ProductWithCategories[]
    const current = all.find((p) => p.id === currentProductId)
    const currentCategoryIds = new Set(current?.categoryIds ?? [])

    const sameCategory = all.filter((p) => {
      if (p.id === currentProductId) return false
      const ids = p.categoryIds ?? []
      return ids.some((id) => currentCategoryIds.has(id))
    })

    if (sameCategory.length >= 4) return sameCategory.slice(0, 4)

    const others = all.filter(
      (p) =>
        p.id !== currentProductId && !sameCategory.some((s) => s.id === p.id),
    )
    return [...sameCategory, ...others].slice(0, 4)
  } catch {
    return []
  }
}

// Priority list of characteristic keys to surface as quick-scan pills in
// the info column. We pick the first few that are present on this product.
const PILL_KEYS = ['Концентрация', 'Объем', 'Возраст', 'Масса', 'Квалификация']

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
  // translation is missing. Static UI strings stay Russian for now;
  // translating them is out of scope for Phase 8.
  const name = pickField<string>(product, 'name', locale) ?? product.name
  const shortDescription = pickField<string>(
    product,
    'shortDescription',
    locale,
  )
  const longDescriptionBlocks =
    (pickField<unknown[]>(product, 'longDescriptionBlocks', locale) ??
      product.longDescriptionBlocks) as unknown[]

  const characteristics = parseCharacteristics(longDescriptionBlocks)

  // Quick-scan pills row — first 4 priority keys present on this product.
  const pillItems = PILL_KEYS.map((k) =>
    characteristics[k] ? characteristics[k] : null,
  )
    .filter((v): v is string => Boolean(v))
    .slice(0, 4)

  const related = await fetchRelatedProducts(product.id)

  return (
    <>
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

      {/* Hero / info area */}
      <Section size="lg">
        <Container>
          <nav
            aria-label="breadcrumbs"
            className="mb-8 text-[length:var(--text-small)] text-[var(--color-text-muted)]"
          >
            <Link href="/" className="hover:text-[var(--color-brand-text)]">
              Главная
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <Link
              href="/categories"
              className="hover:text-[var(--color-brand-text)]"
            >
              Каталог
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-[var(--color-brand-text)]">{name}</span>
          </nav>

          {/* 5-column grid: gallery (3 cols ≈ 60%) + info (2 cols ≈ 40%) on md+ */}
          <div className="grid grid-cols-1 gap-12 md:grid-cols-5">
            {/* Gallery — sticky on md+, with floating sticker badges */}
            <div className="md:col-span-3">
              <div className="space-y-4 md:sticky md:top-24">
                <div
                  className="relative aspect-square overflow-hidden rounded-[var(--radius-lg)]"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 30%, rgba(141,103,255,0.10) 0%, rgba(200,86,255,0.05) 50%, rgba(238,235,243,1) 100%)',
                  }}
                >
                  {product.images && product.images.length > 0 ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={product.images[0].url}
                      alt={product.images[0].alt || name}
                      className="absolute inset-0 h-full w-full object-contain p-12"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <span className="font-[var(--font-display)] text-[length:var(--text-h1)] text-[var(--color-brand)] opacity-30 px-12 text-center leading-tight">
                        {name}
                      </span>
                    </div>
                  )}

                  {/* TODO(v3): re-evaluate product detail badge positioning vs v3 lab-journal aesthetic */}
                </div>

                {/* Thumbnail strip — purely visual stack for v1 */}
                {product.images && product.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {product.images.map((img) => (
                      <div
                        key={img.id}
                        className="aspect-square w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-soft)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.alt}
                          className="h-full w-full object-contain p-1"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Info column */}
            <div className="flex flex-col gap-6 md:col-span-2">
              <div>
                <Eyebrow>Каталог</Eyebrow>
                <DisplayHeading as="h1" className="mt-3">
                  {name}
                </DisplayHeading>
              </div>

              {shortDescription && (
                <p className="text-[length:var(--text-lead)] leading-[var(--leading-body)] text-[var(--color-brand-text-secondary)]">
                  {shortDescription}
                </p>
              )}

              {/* Quick-scan characteristic pills */}
              {pillItems.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pillItems.map((p, i) => (
                    <Pill key={`${p}-${i}`} variant="soft-brand">
                      {p}
                    </Pill>
                  ))}
                </div>
              )}

              <StockPill status={product.stockStatus} className="self-start" />

              <PriceBlock
                priceRub={product.priceRub}
                compareAtPriceRub={product.compareAtPriceRub}
                size="lg"
              />

              <AddToCartWithQuantity product={product} />

              <MicroTrustRow
                items={[
                  { icon: '🛡️', label: 'Безопасные реактивы' },
                  { icon: '🚚', label: 'Доставка от 3 дней' },
                  { icon: '↩️', label: 'Возврат 14 дней' },
                ]}
              />

              {/* Spec sheet — renders nothing when no priority key matches. */}
              <KeyFactsList characteristics={characteristics} />
            </div>
          </div>
        </Container>
      </Section>

      {/* «Что внутри» — DarkSection. Renders only when «Состав» content
          is present in longDescriptionBlocks (e.g. Химичка 3.0). */}
      <ContentsSection blocks={longDescriptionBlocks} />

      {/* Long description — constrained width for readability. Appends
          a CharacteristicsTable below for products with 4+ characteristics. */}
      {Array.isArray(longDescriptionBlocks) &&
        longDescriptionBlocks.length > 0 && (
          <Section size="md" surface="base">
            <Container>
              <div className="mx-auto max-w-3xl">
                <SectionHeading title="Описание" />
                <BlockRenderer blocks={longDescriptionBlocks} />
                <CharacteristicsTable
                  characteristics={characteristics}
                  className="mt-12"
                />
              </div>
            </Container>
          </Section>
        )}

      {/* Related products — 4-up on desktop. */}
      {related.length > 0 && (
        <Section size="lg" surface="soft">
          <Container>
            <Reveal>
              <SectionHeading title="С этим набором покупают" />
            </Reveal>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => (
                /* TODO(Task 4.4): replace with real catalog data + asymmetric grid */
                <ProductCard
                  key={p.id}
                  product={p}
                  stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                  statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                />
              ))}
            </div>
          </Container>
        </Section>
      )}

      {/* Pre-footer dark CTA. */}
      <PreFooterCta
        title="Не нашли подходящий набор?"
        lead="В каталоге собраны наборы для разных возрастов и научных направлений."
        cta={{ label: 'Все категории', href: '/categories' }}
      />

      {/* Mobile sticky buy bar */}
      <MobileBuyBarMount product={product} />
    </>
  )
}
