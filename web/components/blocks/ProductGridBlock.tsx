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
    <section data-block="product_grid" className="max-w-[var(--max-lj-content)] mx-auto">
      {block.heading ? (
        <h2 className="font-[var(--font-lj-display)] font-[700] text-[clamp(1.5rem,2.5vw,2.25rem)] leading-[1.05] tracking-[-0.035em] mb-8">{block.heading}</h2>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          /* TODO(Task 4.4): replace with real catalog data + asymmetric grid */
          <ProductCard
            key={product.id}
            product={product}
            stats={{ reagents: 0, instruments: 0, reactions: 0 }}
            statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
          />
        ))}
      </div>
    </section>
  )
}
