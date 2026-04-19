import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ApiError,
  getCategory,
  listCategories,
  listProductsByCategory,
} from '@/lib/api'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'
import { ProductCard } from '@/components/ProductCard'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const res = await listCategories({ limit: 100 })
    return res.data.map((cat) => ({ slug: cat.slug }))
  } catch {
    return []
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

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { category, products } = await fetchCategoryAndProducts(slug)

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <nav aria-label="breadcrumbs" className="text-sm text-gray-500 mb-4">
        <Link href="/categories" className="hover:underline">
          Категории
        </Link>
        <span className="mx-2">/</span>
        <span>{category.name}</span>
      </nav>

      <h1 className="text-4xl font-bold mb-8">{category.name}</h1>

      {products.length === 0 ? (
        <p className="text-gray-500">В этой категории пока нет товаров</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  )
}
