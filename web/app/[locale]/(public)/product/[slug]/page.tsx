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
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { LabSection } from '@/components/ui/LabSection'
import {
  ProductHeroImage,
  ProductPriceBlockLJ,
  ProductTabsLJ,
  StockChip,
  CharacteristicsTableLJ,
  extractContentsHtml,
  extractGalleryImages,
  type ProductTab,
} from '@/components/product'
import { ProductCard } from '@/components/ProductCard'
import { PreFooterCta } from '@/components/marketing/PreFooterCta'
import { parseCharacteristics } from '@/lib/parseCharacteristics'
import { AddToCartWithQuantity } from './_components/AddToCartWithQuantity'
import { MobileBuyBarMount } from './_components/MobileBuyBarMount'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, pickField, type Locale } from '@/lib/i18n'

export const revalidate = 60

// Headings whose blocks the «Состав» and «Характеристики» tabs already
// render. The «Описание» tab's BlockRenderer must skip them so the same
// content isn't shown twice. Both block types use the `<h3>…</h3>` paragraph wrapper convention
// that ContentsSection / parseCharacteristics match against.
const EXCLUDED_HEADING_RE = /<h3[^>]*>\s*(?:состав|что внутри|характеристики)\s*<\/h3>/i

function isDuplicatedSectionBlock(block: unknown): boolean {
  if (!isBlock(block)) return false
  if (block.type !== 'paragraph') return false
  const html = (block as { html?: string }).html ?? ''
  return EXCLUDED_HEADING_RE.test(html)
}

export async function generateStaticParams() {
  try {
    const res = await listPublishedProducts({ limit: 500 })
    // Emit one (locale, slug) pair per supported locale. EN renders
    // with RU fallback content when `translations.en` is empty.
    return SUPPORTED_LOCALES.flatMap((locale) => res.data.map((p) => ({ locale, slug: p.slug })))
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
  return locale === DEFAULT_LOCALE ? `/product/${slug}` : `/${locale}/product/${slug}`
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
async function fetchRelatedProducts(currentProductId: string): Promise<Product[]> {
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
      (p) => p.id !== currentProductId && !sameCategory.some((s) => s.id === p.id),
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
  const shortDescription = pickField<string>(product, 'shortDescription', locale)
  const longDescriptionBlocks = (pickField<unknown[]>(product, 'longDescriptionBlocks', locale) ??
    product.longDescriptionBlocks) as unknown[]

  const characteristics = parseCharacteristics(longDescriptionBlocks)
  const contentsHtml = extractContentsHtml(longDescriptionBlocks)
  const galleryImages = extractGalleryImages(product)

  // «Описание» re-renders the long description as prose. Drop the «Состав»
  // and «Характеристики» blocks here — their own tabs render that content.
  const filteredDescriptionBlocks = Array.isArray(longDescriptionBlocks)
    ? longDescriptionBlocks.filter((b) => !isDuplicatedSectionBlock(b))
    : []

  // Вкладки под ценой (Figma «Товар — 1440»): пустые не показываем.
  const tabs: ProductTab[] = []
  if (filteredDescriptionBlocks.length > 0) {
    tabs.push({
      id: 'description',
      label: 'Описание',
      content: <BlockRenderer blocks={filteredDescriptionBlocks} className="space-y-4" />,
    })
  }
  if (contentsHtml) {
    tabs.push({
      id: 'contents',
      label: 'Состав',
      content: (
        <div
          className="lj-prose font-lj-body text-[1.0625rem] leading-[1.6] text-[var(--color-lj-ink)] [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_li]:mb-1"
          dangerouslySetInnerHTML={{ __html: contentsHtml }}
        />
      ),
    })
  }
  if (Object.keys(characteristics).length > 0) {
    tabs.push({
      id: 'specs',
      label: 'Характеристики',
      content: <CharacteristicsTableLJ characteristics={characteristics} surface="light" />,
    })
  }

  const related = await fetchRelatedProducts(product.id)

  // Первое слово названия — фиолетовое (Figma: «Набор» lj/brand).
  const [firstWord, ...restWords] = name.split(/\s+/)

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

      {/* Хлебные крошки (Figma Breadcrumbs, Levels=3, Current=Ink):
          IBM Plex 11/16.5, uppercase, весь блок 70%. Выровнены по
          колонкам hero ниже. */}
      <nav
        aria-label="breadcrumbs"
        className="box-content max-w-[1260px] mx-auto px-6 pt-6 flex flex-wrap gap-x-2 font-lj-mono text-[length:var(--text-lj-mono-xs)] leading-[1.5] uppercase tracking-[0.03em] text-[var(--color-lj-ink)] opacity-70"
      >
        <Link href="/" className="hover:text-[var(--color-lj-brand)]">
          Главная
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/categories" className="hover:text-[var(--color-lj-brand)]">
          Каталог
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{name}</span>
      </nav>

      {/* SECTION 1 — HERO (Figma «Section 1 — Hero», 33:790): галерея 660
          и колонка 560 с зазором 40; на узких экранах — стопкой. */}
      <LabSection variant="cream" className="px-6 pt-12 pb-20">
        <div className="max-w-[1260px] mx-auto grid gap-10 lg:grid-cols-[minmax(0,660fr)_minmax(0,560fr)] lg:items-start">
          <ProductHeroImage images={galleryImages} alt={name} sku={product.sku ?? product.slug} />

          <div className="flex flex-col gap-10 min-w-0">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-start gap-5">
                <StockChip status={product.stockStatus} />

                <h1 className="font-lj-mazzard font-light italic text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em] text-[var(--color-lj-ink)]">
                  <span className="text-[var(--color-lj-brand)]">{firstWord}</span>
                  {restWords.length > 0 && ` ${restWords.join(' ')}`}
                </h1>

                {shortDescription && (
                  <p className="font-lj-mono text-[1.0625rem] leading-[1.5] text-[var(--color-lj-ink)] opacity-78">
                    {shortDescription}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-5">
                <ProductPriceBlockLJ
                  priceRub={product.priceRub}
                  compareAtPriceRub={product.compareAtPriceRub}
                />
                <AddToCartWithQuantity product={product} />
              </div>
            </div>

            <ProductTabsLJ tabs={tabs} />
          </div>
        </div>
      </LabSection>

      {/* SECTION 2 — «Смотрите также» (Figma 33:792): песочный фон, три
          карточки лесенкой 0 / 64 / 128. Stats are placeholders pending a
          future `kit_stats` admin field; the homepage uses the same
          pattern. Заголовок — Mazzard ExtraLight Italic по макету; пока
          файла этого начертания нет, браузер берёт Light Italic. */}
      {related.length > 0 && (
        <section className="bg-[var(--color-lj-sand)] text-[var(--color-lj-ink)] px-6 py-16 md:py-24">
          <div className="max-w-[var(--max-lj-content)] mx-auto flex flex-col gap-12 md:gap-16">
            <h2 className="flex flex-wrap gap-x-3 md:gap-x-5 font-lj-mazzard font-extralight italic text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.92] tracking-[-0.06em]">
              <span>Смотрите</span>
              <span className="text-[var(--color-lj-brand)]">также</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {related.slice(0, 3).map((p, i) => {
                const stagger = i === 0 ? '' : i === 1 ? 'md:pt-16' : 'md:pt-32'
                return (
                  <div key={p.id} className={stagger}>
                    {/* TODO(Task 4.4 follow-up): wire real stats once admin
                        `kit_stats` field lands. Mirrors the homepage
                        placeholder pattern. */}
                    <ProductCard
                      product={p}
                      stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                      statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                      images={p.images}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3 — Pre-footer dark CTA. Already migrated to ink LJ. */}
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
