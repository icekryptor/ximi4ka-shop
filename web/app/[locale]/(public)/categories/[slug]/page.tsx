import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ApiError,
  getCategory,
  listCategories,
  listProductsByCategory,
} from '@/lib/api'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import { ProductCard } from '@/components/ProductCard'
import { LabSection } from '@/components/ui/LabSection'
import { NotebookHeader } from '@/components/ui/NotebookHeader'
import { PaginationLJ } from '@/components/ui/PaginationLJ'
import { PreFooterCta } from '@/components/marketing'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  pickField,
  type Locale,
} from '@/lib/i18n'
import type { SortKey } from '@/components/marketing/CategoryFilterBar'
import { CategoryFilterBarMount } from './_components/CategoryFilterBarMount'

export const revalidate = 60

const PAGE_SIZE = 12

// Плотность карточек по слагу категории (V3_5 §каталог): наборы/комбо —
// крупные фото-форвард карточки; реактивы/оборудование/печать — компактная
// плотная сетка со степпером количества.
const COMPACT_SLUGS = new Set(['reagents', 'equipment', 'print'])
function densityForSlug(slug: string): 'kit' | 'compact' {
  return COMPACT_SLUGS.has(slug) ? 'compact' : 'kit'
}

export async function generateStaticParams() {
  try {
    const res = await listCategories({ limit: 100 })
    return SUPPORTED_LOCALES.flatMap((locale) =>
      res.data.map((cat) => ({ locale, slug: cat.slug })),
    )
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ locale: string; slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const SORT_KEYS = ['newest', 'price-asc', 'price-desc', 'name-asc'] as const

function parseSort(raw: unknown): SortKey {
  return (SORT_KEYS as readonly string[]).includes(raw as string)
    ? (raw as SortKey)
    : 'newest'
}

function pathForLocale(locale: Locale, slug: string): string {
  return locale === DEFAULT_LOCALE
    ? `/categories/${slug}`
    : `/${locale}/categories/${slug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  try {
    const category = await getCategory(slug)
    const name = pickField<string>(category, 'name', locale) ?? category.name
    const metaTitle = pickField<string>(category, 'metaTitle', locale)
    const metaDescription = pickField<string>(category, 'metaDescription', locale)
    const alternatesByLocale = Object.fromEntries(
      SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc, slug)]),
    ) as Record<Locale, string>
    return buildMetadata({
      title: name,
      metaTitle,
      metaDescription,
      pathname: pathForLocale(locale, slug),
      type: 'website',
      locale,
      alternatesByLocale,
    })
  } catch {
    return { title: 'Категория — Ximi4ka' }
  }
}

async function fetchCategoryAndProducts(
  slug: string,
  opts: { limit: number; offset: number },
): Promise<{
  category: ProductCategory
  products: Product[]
  totalCount: number
}> {
  let category: ProductCategory
  try {
    category = await getCategory(slug)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound()
    }
    throw err
  }
  let products: Product[] = []
  let totalCount = 0
  try {
    const res = await listProductsByCategory(slug, {
      limit: opts.limit,
      offset: opts.offset,
    })
    products = res.data
    totalCount = res.pagination.total
  } catch {
    products = []
    totalCount = 0
  }
  return { category, products, totalCount }
}

// Server-side sort. The public products API does not yet accept a sort
// parameter, so we order in memory after fetch. Once the API supports it the
// sort key can be forwarded via opts and this becomes a noop.
function sortProducts(products: Product[], sort: SortKey): Product[] {
  const arr = [...products]
  switch (sort) {
    case 'price-asc':
      return arr.sort((a, b) => a.priceRub - b.priceRub)
    case 'price-desc':
      return arr.sort((a, b) => b.priceRub - a.priceRub)
    case 'name-asc':
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    case 'newest':
    default:
      return arr.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  }
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: Props) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const sp = (await searchParams) ?? {}
  const currentSort = parseSort(sp.sort)
  const pageRaw = sp.page
  const page = Math.max(
    1,
    parseInt(typeof pageRaw === 'string' ? pageRaw : '1', 10) || 1,
  )

  const {
    category,
    products: unsorted,
    totalCount,
  } = await fetchCategoryAndProducts(slug, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  // NOTE: sortProducts orders only the current page in memory. Once the public
  // products API supports a sort param, lift this into the API call so that
  // ordering applies across the full result set rather than just the page slice.
  const products = sortProducts(unsorted, currentSort)
  const density = densityForSlug(slug)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const name = pickField<string>(category, 'name', locale) ?? category.name
  const description =
    pickField<string>(category, 'metaDescription', locale) ??
    category.metaDescription ??
    null

  const categoriesPath =
    locale === DEFAULT_LOCALE ? '/categories' : `/${locale}/categories`
  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`

  // First word of the category name is emphasised in brand colour, mirroring
  // the v3 hero pattern used elsewhere in Stage 8.
  const nameWords = name.split(/\s+/).filter(Boolean)

  return (
    <>
      {/* PRESERVED: breadcrumb + product list JsonLd — search engines and
          editors depend on these schemas. */}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Каталог', url: '/categories' },
          { name, url: pathForLocale(locale, category.slug) },
        ])}
      />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      {/* Mono breadcrumb trail — restyled from v2 dot-separated list */}
      <nav
        aria-label="breadcrumbs"
        className="max-w-[var(--max-lj-content)] mx-auto px-6 pt-6 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70"
      >
        <Link href={homePath} className="hover:opacity-100">
          Главная
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <Link href={categoriesPath} className="hover:opacity-100">
          Каталог
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="opacity-100 text-[var(--color-lj-brand-deep)]">
          {name}
        </span>
      </nav>

      {/* C. Категория (LAB CREAM) — v3 LJ hero */}
      <LabSection variant="cream" className="px-6 pt-12 pb-16">
        <NotebookHeader section="C" label={name} page={1} total={3} />
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-5 inline-flex items-center gap-3 before:content-[''] before:w-2 before:h-2 before:bg-[var(--color-lj-brand)] before:rounded-full">
            C.0 / Категория
          </p>
          <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,6vw,5rem)] leading-[0.92] tracking-[-0.045em] mb-6">
            {nameWords.length > 0 ? (
              nameWords.map((w, i) => (
                <span key={i} className="block">
                  {i === 0 ? (
                    <em className="italic text-[var(--color-lj-brand)] font-[900]">
                      {w}
                    </em>
                  ) : (
                    w
                  )}
                </span>
              ))
            ) : (
              <span className="block">{name}</span>
            )}
          </h1>
          {description && (
            <p className="text-xl leading-[1.45] opacity-78 max-w-[48ch]">
              {description}
            </p>
          )}
        </div>
      </LabSection>

      {/* Sticky filter bar — client island for sort + reset */}
      <CategoryFilterBarMount currentSort={currentSort} />

      {/* Product grid */}
      <LabSection variant="cream" className="px-6 py-16">
        <div className="max-w-[var(--max-lj-content)] mx-auto">
          {products.length === 0 ? (
            <p className="text-center opacity-60 py-32 font-lj-mono uppercase tracking-[0.06em]">
              Ничего не найдено
            </p>
          ) : density === 'compact' ? (
            // Компактная плотная сетка: 2 колонки на мобиле, до 6 на десктопе.
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-5 gap-y-8">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                  statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                  images={p.images}
                  density="compact"
                />
              ))}
            </div>
          ) : (
            // Карточки наборов ~360–380px, до 4 в ряд на широких экранах.
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {products.map((p, i) => {
                // v3.5: первая карточка первой страницы — featured (широкая,
                // на 2 колонки), больше визуала продукта.
                const isFeatured = page === 1 && i === 0 && products.length > 2
                return (
                  <div
                    key={p.id}
                    className={isFeatured ? 'sm:col-span-2' : undefined}
                  >
                    {/* TODO(Task 4.4): wire real catalog stats + asymmetric grid */}
                    <ProductCard
                      product={p}
                      stats={{ reagents: 0, instruments: 0, reactions: 0 }}
                      statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
                      images={p.images}
                      featured={isFeatured}
                    />
                  </div>
                )
              })}
            </div>
          )}
          {/* Pagination — PaginationLJ renders null when totalPages <= 1 */}
          <PaginationLJ
            currentPage={page}
            totalPages={totalPages}
            totalResults={totalCount}
            resultsPerPage={PAGE_SIZE}
            basePath={pathForLocale(locale, slug)}
            preserveParams={['sort']}
            currentParams={{
              sort: typeof sp.sort === 'string' ? sp.sort : undefined,
            }}
          />
        </div>
      </LabSection>

      {/* Pre-footer CTA */}
      <PreFooterCta
        title="Изучите другие категории"
        cta={{ label: 'Все категории', href: '/categories' }}
      />
    </>
  )
}
