import { getPage, listPublishedProducts } from '@/lib/api'
import type { Page, Product } from '@ximi4ka-shop/shared'
import { ProductCard } from '@/components/ProductCard'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'

export const revalidate = 60

async function fetchHome(): Promise<{ page: Page | null; products: Product[] }> {
  const [pageResult, productsResult] = await Promise.allSettled([
    getPage('home'),
    listPublishedProducts({ limit: 8 }),
  ])
  return {
    page: pageResult.status === 'fulfilled' ? pageResult.value : null,
    products: productsResult.status === 'fulfilled' ? productsResult.value.data : [],
  }
}

export default async function HomePage() {
  const { page, products } = await fetchHome()
  const title = page?.title ?? 'Магазин Ximi4ka'
  const blocks = page?.blocks ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <section className="mb-8">
        <h1 className="text-4xl font-bold text-brand-text">{title}</h1>
        {page === null && products.length === 0 && (
          <p className="mt-4 text-brand-text-secondary">Магазин Ximi4ka — контент загружается</p>
        )}
      </section>

      {blocks.length > 0 && (
        <section className="mb-8">
          <BlockRenderer blocks={blocks} />
        </section>
      )}

      {products.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-brand-text">Каталог</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
