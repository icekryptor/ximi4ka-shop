import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import type { Product } from '@ximi4ka-shop/shared'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProductCard } from '@/components/ProductCard'
import { JsonLd } from '@/components/seo/JsonLd'
import { LabSection } from '@/components/ui/LabSection'
import { getPublishedProduct, listProductsByCategory } from '@/lib/api'
import {
  BLACK_FRIDAY,
  SALE_EXTRA_COMBO_SLUGS,
  isBlackFridayActive,
  orderSaleCombos,
} from '@/lib/blackFriday'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'
import { firstScreenCardLoading } from '@/lib/imageLoading'
import { breadcrumbJsonLd, itemListJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { buildMetadata } from '@/lib/metadata'
import { fetchSplitAvailable } from '@/lib/splitInstallments'

// Состав и цены — из api на каждый запрос, а показ страницы зависит от даты акции.
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ locale: string }>
}

const PAGE_TITLE = 'Чёрная пятница — цены 2023 года'

function pathForLocale(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/sale' : `/${locale}/sale`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: PAGE_TITLE,
    metaDescription:
      'Распродажа Химички с 14 по 28 ноября: наборы для опытов и комбо по ценам 2023 года.',
    pathname: pathForLocale(locale),
    type: 'website',
    brandSuffix: true,
    locale,
    alternatesByLocale,
  })
}

async function categoryProducts(slug: string): Promise<Product[]> {
  try {
    return (await listProductsByCategory(slug, { limit: 50 })).data
  } catch {
    return []
  }
}

async function extraCombos(): Promise<Product[]> {
  const found = await Promise.all(
    SALE_EXTRA_COMBO_SLUGS.map((slug) => getPublishedProduct(slug).catch(() => null)),
  )
  return found.filter((p): p is Product => p !== null)
}

const SECTION_H2 =
  'font-lj-display text-[clamp(2rem,4vw,3rem)] font-[900] leading-[0.95] tracking-[-0.045em]'

function SaleGrid({
  products,
  splitOn,
  firstScreen,
}: {
  products: Product[]
  splitOn: boolean
  firstScreen: boolean
}) {
  return (
    // Все четыре набора — в один ряд с 1280px, как в категории наборов.
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          stats={{ reagents: 0, instruments: 0, reactions: 0 }}
          statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
          images={p.images}
          imageLoading={firstScreen ? firstScreenCardLoading('kit', i) : 'lazy'}
          splitInstallments={splitOn}
        />
      ))}
    </div>
  )
}

export default async function SalePage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  // После акции страница не нужна — ведём в наборы (временный редирект).
  if (!isBlackFridayActive()) redirect('/categories/kits')

  const [kits, comboCategory, extra, splitOn] = await Promise.all([
    categoryProducts('kits'),
    categoryProducts('combo'),
    extraCombos(),
    fetchSplitAvailable(),
  ])
  const combos = orderSaleCombos([comboCategory, extra])

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: 'Чёрная пятница', href: pathForLocale(locale) },
  ]
  const all = [...kits, ...combos]

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {all.length > 0 ? <JsonLd data={itemListJsonLd(all)} /> : null}
      <Breadcrumbs items={crumbs} variant="catalog" />

      <section className="relative overflow-hidden bg-[var(--bf-black)] text-white">
        <span aria-hidden="true" className="bf-stripes block h-3 [--bf-stripe:12px]" />
        <div
          aria-hidden="true"
          className="bf-fire-text pointer-events-none absolute -right-[4vw] top-1/2 -translate-y-1/2 select-none font-lj-mazzard text-[clamp(8rem,26vw,22rem)] font-[700] leading-none tracking-[-0.05em] opacity-25"
        >
          2023
        </div>
        <div className="relative mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-6 px-6 py-14 md:py-20">
          <h1 className="font-lj-mazzard text-[clamp(2.25rem,6vw,4.5rem)] font-[700] uppercase leading-[1.05] tracking-[-0.045em]">
            <span className="bf-white-glow">{BLACK_FRIDAY.titleLines[0]}</span> <br />
            <span className="bf-fire-text">{BLACK_FRIDAY.titleLines[1]}</span>
          </h1>
          <p className="max-w-[40rem] font-lj-mono text-lg leading-[1.4] text-white/85">
            {BLACK_FRIDAY.lead}.
          </p>
        </div>
        <span aria-hidden="true" className="bf-stripes block h-3 [--bf-stripe:12px]" />
      </section>

      <LabSection variant="cream" className="px-6 pt-14 pb-10">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-8">
          <h2 className={SECTION_H2}>Наборы</h2>
          {kits.length > 0 ? (
            <SaleGrid products={kits} splitOn={splitOn} firstScreen />
          ) : (
            <p className="font-lj-mono opacity-60">Наборы скоро появятся.</p>
          )}
        </div>
      </LabSection>

      <LabSection variant="cream" className="px-6 pt-10 pb-24">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-8">
          <h2 className={SECTION_H2}>Комбо</h2>
          {combos.length > 0 ? (
            <SaleGrid products={combos} splitOn={splitOn} firstScreen={false} />
          ) : (
            <p className="font-lj-mono opacity-60">Комбо скоро появятся.</p>
          )}
        </div>
      </LabSection>
    </>
  )
}
