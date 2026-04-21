import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listCategories } from '@/lib/api'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { CategoryCard } from '@/components/CategoryCard'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd } from '@/lib/jsonLd'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  type Locale,
} from '@/lib/i18n'

export const revalidate = 60

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

interface Props {
  params: Promise<{ locale: string }>
}

function pathForLocale(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/categories' : `/${locale}/categories`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  return buildMetadata({
    title: 'Категории — Ximi4ka',
    description: 'Все категории товаров магазина Ximi4ka.',
    pathname: pathForLocale(locale),
    type: 'website',
    locale,
  })
}

async function fetchCategories(): Promise<ProductCategory[]> {
  try {
    const res = await listCategories({ limit: 100 })
    return res.data
  } catch {
    return []
  }
}

export default async function CategoriesListPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const categories = await fetchCategories()

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Категории', url: '/categories' },
        ])}
      />
      <section className="mb-8">
        <h1 className="text-4xl font-bold text-brand-text">Категории</h1>
      </section>

      {categories.length === 0 ? (
        <p className="text-brand-text-secondary">Категории пока не добавлены.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}
    </div>
  )
}
