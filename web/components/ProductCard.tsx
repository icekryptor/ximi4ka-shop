import Link from 'next/link'
import type { Product } from '@ximi4ka-shop/shared'
import { formatRub, stockLabel } from '@/lib/stockLabel'
import { Pill } from '@/components/ui'

type StockVariant = 'success' | 'warning' | 'danger'

function stockVariant(status: Product['stockStatus']): StockVariant {
  switch (status) {
    case 'in_stock':
      return 'success'
    case 'preorder':
      return 'warning'
    case 'out_of_stock':
      return 'danger'
  }
}

function discountPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null
  return Math.round((1 - price / compareAt) * 100)
}

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0]
  const isOutOfStock = product.stockStatus === 'out_of_stock'
  const discount = discountPercent(product.priceRub, product.compareAtPriceRub)

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] p-4 shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
    >
      {/* Image area on brand-tinted surface */}
      <div
        className={`relative aspect-square overflow-hidden rounded-[var(--radius-md)] ${
          isOutOfStock ? 'opacity-70' : ''
        }`}
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(141,103,255,0.10) 0%, rgba(200,86,255,0.05) 50%, rgba(238,235,243,1) 100%)',
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.alt || product.name}
            className="absolute inset-0 h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand)] opacity-30 px-6 text-center leading-tight">
              {product.name}
            </span>
          </div>
        )}

        {/* Discount pill — top-right corner, only when compare-at price is higher */}
        {discount != null && (
          <div className="absolute top-3 right-3">
            <Pill variant="solid-brand">−{discount}%</Pill>
          </div>
        )}
      </div>

      {/* Stock pill */}
      <Pill variant={stockVariant(product.stockStatus)} className="self-start">
        {stockLabel(product.stockStatus)}
      </Pill>

      {/* Name */}
      <h3 className="text-[length:var(--text-body)] font-semibold text-[var(--color-brand-text)] leading-tight">
        {product.name}
      </h3>

      {/* Price block */}
      <div className="mt-auto flex items-baseline gap-2">
        <span className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)] tracking-[var(--tracking-tight)]">
          {formatRub(product.priceRub)}
        </span>
        {product.compareAtPriceRub != null && product.compareAtPriceRub > product.priceRub && (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)] line-through">
            {formatRub(product.compareAtPriceRub)}
          </span>
        )}
      </div>
    </Link>
  )
}
