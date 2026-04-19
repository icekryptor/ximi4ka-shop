import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Product } from '@ximi4ka-shop/shared'
import { ApiError, getPublishedProduct, listPublishedProducts } from '@/lib/api'
import { formatRub, stockLabel } from '@/lib/stockLabel'
import { AddToCartButton } from '@/components/AddToCartButton'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const res = await listPublishedProducts({ limit: 500 })
    return res.data.map((p) => ({ slug: p.slug }))
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ slug: string }>
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  let product: Product
  try {
    product = await getPublishedProduct(slug)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound()
    }
    throw err
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <nav aria-label="breadcrumbs" className="text-sm mb-6 text-gray-500">
        <Link href="/" className="hover:text-black">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <Link href="/categories" className="hover:text-black">
          Каталог
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Gallery */}
        <div>
          {product.images && product.images.length > 0 ? (
            <div className="space-y-4">
              {product.images.map((img) => (
                <div
                  key={img.id}
                  className="aspect-square bg-gray-100 rounded-2xl overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              aria-hidden
              className="aspect-square bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400"
            >
              Нет изображения
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <p className="text-sm text-gray-500 mb-4">
            {stockLabel(product.stockStatus)}
          </p>

          <div className="mb-6">
            <span className="text-3xl font-bold">{formatRub(product.priceRub)}</span>
            {product.compareAtPriceRub != null && (
              <span className="ml-3 text-gray-400 line-through">
                {formatRub(product.compareAtPriceRub)}
              </span>
            )}
          </div>

          {product.shortDescription && (
            <p className="mb-6 text-gray-700">{product.shortDescription}</p>
          )}

          <AddToCartButton product={product} />

          {/* Long description blocks — TODO(task-2.5): real block renderer */}
          {Array.isArray(product.longDescriptionBlocks) &&
            product.longDescriptionBlocks.length > 0 && (
              <section className="mt-12 pt-8 border-t border-gray-200">
                <h2 className="text-xl font-semibold mb-4">Описание</h2>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap">
                  {JSON.stringify(product.longDescriptionBlocks, null, 2)}
                </pre>
              </section>
            )}
        </div>
      </div>
    </main>
  )
}
