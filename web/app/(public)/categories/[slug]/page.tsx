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

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const res = await listCategories({ limit: 100 })
    return res.data.map((cat) => ({ slug: cat.slug }))
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const category = await getCategory(slug)
    return buildMetadata({
      title: category.name,
      metaTitle: category.metaTitle,
      metaDescription: category.metaDescription,
      pathname: `/categories/${slug}`,
      type: 'website',
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
  const { slug } = await params
  const { category, products } = await fetchCategoryAndProducts(slug)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', url: '/' },
          { name: 'Категории', url: '/categories' },
          { name: category.name, url: `/categories/${category.slug}` },
        ])}
      />
      {products.length > 0 ? <JsonLd data={itemListJsonLd(products)} /> : null}

      <nav aria-label="breadcrumbs" className="text-sm text-brand-text-secondary mb-4">
        <Link href="/categories" className="hover:underline">
          Категории
        </Link>
        <span className="mx-2">/</span>
        <span>{category.name}</span>
      </nav>

      <h1 className="text-4xl font-bold mb-8 text-brand-text">{category.name}</h1>

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
