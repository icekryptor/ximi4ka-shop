import type { Product, ProductGridBlock as ProductGridBlockType } from '@ximi4ka-shop/shared'
import { getPublishedProduct } from '@/lib/api'
import { ProductCard } from '@/components/ProductCard'

interface Props {
  block: ProductGridBlockType
}

async function resolveProducts(slugs: string[]): Promise<Product[]> {
  const results = await Promise.allSettled(slugs.map((s) => getPublishedProduct(s)))
  const products: Product[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') products.push(r.value)
  }
  return products
}

export async function ProductGridBlock({ block }: Props) {
  const products = await resolveProducts(block.productSlugs)
  if (products.length === 0) return null

  return (
    <section data-block="product_grid" className="my-8">
      {block.heading ? (
        <h2 className="text-2xl font-semibold mb-4">{block.heading}</h2>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
