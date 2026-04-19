import Link from 'next/link'
import type { Product } from '@ximi4ka-shop/shared'
import { formatRub, stockLabel } from '@/lib/stockLabel'

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="border border-gray-200 rounded-2xl p-4 hover:shadow-md transition block"
    >
      <div
        aria-hidden
        className="bg-gray-100 rounded-xl aspect-square mb-3"
      />
      <h3 className="font-semibold">{product.name}</h3>
      <p className="text-sm text-gray-500 mt-1">{stockLabel(product.stockStatus)}</p>
      <p className="text-lg mt-2">{formatRub(product.priceRub)}</p>
      {product.compareAtPriceRub != null && (
        <p className="text-sm text-gray-400 line-through">
          {formatRub(product.compareAtPriceRub)}
        </p>
      )}
    </Link>
  )
}
