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
import { MicroTrustRow, type MicroTrustItem } from '@/components/ui/MicroTrustRow'
import { LabSection } from '@/components/ui/LabSection'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import {
  ContentsSection,
  ProductHeroImage,
  ProductPriceBlockLJ,
  StockChip,
  KeyFactsListLJ,
  CharacteristicsTableLJ,
  CharacteristicsCellRow,
  extractGalleryImages,
  extractKeyFacts,
  extractUseFacts,
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

// Static trust signals for the v3 hero column. Lab-journal vocabulary
// drops the emoji icons that v2 used — bullets render as brand-purple
// `•` per MicroTrustRow's restyled `before:` pseudo.
const MICRO_TRUST_ITEMS: MicroTrustItem[] = [
  { icon: null, label: 'Безопасные реактивы' },
  { icon: null, label: 'Доставка от 3 дней' },
  { icon: null, label: 'Возврат 14 дней' },
]

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
 * Pull up to 3 related products. Strategy:
 *  1. Fetch the published product list with `?include=categories` so each
 *     entry carries `categoryIds`.
 *  2. Find products sharing a category with the current one.
 *  3. If fewer than 3, top up with any other published products so the
 *     section is never empty when there's stock to show.
 *
 * v3 trims to a 3-up grid (was 4-up in v2) to match the lab-journal
 * asymmetric catalog rhythm used on the homepage.
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

    if (sameCategory.length >= 3) return sameCategory.slice(0, 3)

    const others = all.filter(
      (p) =>
        p.id !== currentProductId && !sameCategory.some((s) => s.id === p.id),
    )
    return [...sameCategory, ...others].slice(0, 3)
  } catch {
    return []
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
  const keyFacts = extractKeyFacts(characteristics)
  const useFacts = extractUseFacts(characteristics)
  const galleryImages = extractGalleryImages(product)

  const related = await fetchRelatedProducts(product.id)

  // SKU suffix used for hero corner-mark + section coordinate. Falls back
  // to `XX` when the editor hasn't set a SKU on this product.
  const skuSuffix = (product.sku ?? 'XX').slice(-2)

  // Split the product name on whitespace so the hero H1 can render an
  // off-grid stagger: even-indexed words flush left, odd-indexed words
  // indented `pl-[6vw]` for the hand-typeset journal feel. The first
  // word lights up brand-purple italic.
  const nameWords = name.split(/\s+/)

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

      {/* Mono breadcrumb trail — sits above SECTION 1, on the page bg
          (cream is the section, this nav is on the body's bone-ish bg). */}
      <nav
        aria-label="breadcrumbs"
        className="max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70"
      >
        <Link href="/" className="hover:opacity-100">
          Главная
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <Link href="/categories" className="hover:opacity-100">
          Каталог
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="opacity-100">{name}</span>
      </nav>

      {/* SECTION 1 — HERO (cream). Two-column desktop: gallery + info. */}
      <LabSection variant="cream" className="px-6 pt-12 pb-20 relative">
        <NotebookHeader
          section={`P-${skuSuffix}`}
          label="Карточка набора"
          page={1}
          total={6}
          edition="Ред. 2026.04 / v3"
        />
        <div className="max-w-[var(--max-lj-content)] mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20">
          {/* IMAGE COLUMN */}
          <div>
            <ProductHeroImage
              images={galleryImages}
              cornerMark={`arr. P-${skuSuffix}`}
              alt={name}
            />
          </div>

          {/* INFO COLUMN */}
          <div className="flex flex-col gap-6 pt-4">
            {/* SKU header — brand-purple bullet then mono SKU label */}
            <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] inline-flex items-center gap-2 before:content-[''] before:w-1.5 before:h-1.5 before:bg-[var(--color-lj-brand)] before:rounded-full">
              № {product.sku ?? product.slug}
            </p>

            {/* OFF-GRID H1 — even words flush, odd words indented for the
                hand-typeset journal stagger. First word lights up brand. */}
            <h1 className="font-[var(--font-lj-display)] font-[900] text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.045em] uppercase">
              {nameWords.map((word, i) => (
                <span key={i} className={`block ${i % 2 === 1 ? 'pl-[6vw]' : ''}`}>
                  {i === 0 ? (
                    <em className="not-italic-fix italic text-[var(--color-lj-brand)] font-[900]">
                      {word}
                    </em>
                  ) : (
                    word
                  )}
                </span>
              ))}
            </h1>

            {/* Trail line — small mono follow-up under the headline */}
            <p className="font-[var(--font-lj-mono)] text-sm text-[var(--color-lj-ink)] opacity-55 max-w-[36ch]">
              — настоящие реактивы, без подделок
            </p>

            {shortDescription && (
              <p className="text-[1.0625rem] leading-[1.5] text-[var(--color-lj-ink)] opacity-78 max-w-[48ch]">
                {shortDescription}
              </p>
            )}

            <ProductPriceBlockLJ
              priceRub={product.priceRub}
              compareAtPriceRub={product.compareAtPriceRub}
            />

            <StockChip status={product.stockStatus} />

            <AddToCartWithQuantity product={product} />

            <MicroTrustRow items={MICRO_TRUST_ITEMS} />

            {/* Spec sheet — KeyFactsListLJ no-renders when keyFacts is empty */}
            <KeyFactsListLJ facts={keyFacts} />
          </div>
        </div>
      </LabSection>

      {/* SECTION 2 — «Что внутри». Self-no-renders when «Состав» block
          isn't present in the long description. */}
      <ContentsSection blocks={longDescriptionBlocks} />

      {/* SECTION 3 — Характеристики (ink data sheet). Always shown — the
          `useFacts` row + full table both no-render when empty. */}
      <LabSection variant="ink" className="px-6 py-32 relative">
        <NotebookHeader section="02" label="Характеристики" page={3} total={6} />
        <div className="max-w-[var(--max-lj-narrow)] mx-auto relative z-[2]">
          <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)] mb-12 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            02.0 / Технические данные
          </p>
          <h2 className="font-[var(--font-lj-display)] font-[700] text-[clamp(2rem,4vw,3.5rem)] leading-[1.0] tracking-[-0.04em] mb-16 max-w-[20ch]">
            Что у вас будет в{' '}
            <em className="italic text-[var(--color-lj-brand)] font-[700]">руках</em>
          </h2>
          <div className="mb-16">
            <CharacteristicsCellRow facts={useFacts} />
          </div>
          {Object.keys(characteristics).length > 0 && (
            <div className="mt-16">
              <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-bone-mute)] mb-6">
                Полный список характеристик
              </p>
              <CharacteristicsTableLJ characteristics={characteristics} />
            </div>
          )}
        </div>
      </LabSection>

      {/* SECTION 4 — Описание (cream prose). Renders when CMS provided
          long-description blocks. */}
      {Array.isArray(longDescriptionBlocks) &&
        longDescriptionBlocks.length > 0 && (
          <LabSection variant="cream" className="px-6 py-24">
            <NotebookHeader section="03" label="Описание" page={4} total={6} />
            <div className="max-w-[var(--max-lj-narrow)] mx-auto">
              <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-8 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
                03.0 / Полное описание
              </p>
              <BlockRenderer blocks={longDescriptionBlocks} />
            </div>
          </LabSection>
        )}

      {/* SECTION 5 — Related products (cream). 3-up grid mirroring the
          asymmetric homepage catalog. Stats are placeholders pending a
          future `kit_stats` admin field; this is the same pattern Task 4.3
          uses on the homepage. */}
      {related.length > 0 && (
        <LabSection variant="cream" className="px-6 py-24">
          <NotebookHeader
            section="04"
            label="Связанные наборы"
            page={5}
            total={6}
          />
          <div className="max-w-[var(--max-lj-content)] mx-auto">
            <p className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-8 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
              04.0 / С этим набором покупают
            </p>
            <h2 className="font-[var(--font-lj-display)] font-[900] text-[clamp(2rem,4vw,3.5rem)] leading-[0.92] tracking-[-0.045em] mb-16">
              Совместимые
              <br />
              <em className="italic text-[var(--color-lj-brand)] font-[900]">
                наборы
              </em>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {related.map((p) => (
                /* TODO(Task 4.4 follow-up): wire real stats once admin
                   `kit_stats` field lands. Mirrors the homepage placeholder
                   pattern. */
                <ProductCard
                  key={p.id}
                  product={p}
                  stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                  statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                />
              ))}
            </div>
          </div>
        </LabSection>
      )}

      {/* SECTION 6 — Pre-footer dark CTA. Already migrated to ink LJ. */}
      <PreFooterCta
        title="Не нашли подходящий набор?"
        lead="В каталоге собраны наборы для разных возрастов и научных направлений."
        cta={{ label: 'Все категории', href: '/categories' }}
      />

      {/* MOBILE BUY BAR — sticky bottom on mobile, IO-driven via the
          `data-add-to-cart-row` sentinel inside AddToCartWithQuantity. */}
      <MobileBuyBarMount product={product} />
    </>
  )
}
