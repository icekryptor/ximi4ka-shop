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

export const revalidate = 60

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
): Promise<{ category: ProductCategory; products: Product[] }> {
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
  try {
    const res = await listProductsByCategory(slug, { limit: 50 })
    products = res.data
  } catch {
    products = []
  }
  return { category, products }
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const { category, products } = await fetchCategoryAndProducts(slug)
  const name = pickField<string>(category, 'name', locale) ?? category.name

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Категории', url: '/categories' },
          { name, url: pathForLocale(locale, category.slug) },
        ])}
      />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      <nav aria-label="breadcrumbs" className="text-sm text-brand-text-secondary mb-4">
        <Link href="/categories" className="hover:underline">
          Категории
        </Link>
        <span className="mx-2">/</span>
        <span>{name}</span>
      </nav>

      <h1 className="text-4xl font-bold mb-8 text-brand-text">{name}</h1>

      {products.length === 0 ? (
        <p className="text-brand-text-secondary">В этой категории пока нет товаров</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
