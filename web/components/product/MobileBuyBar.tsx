'use client'

import { useEffect, useState, type RefObject } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { formatRub } from '@/lib/stockLabel'

interface Props {
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'>
  sentinelRef: RefObject<HTMLElement | null>
  quantity?: number
}

export function MobileBuyBar({ product, sentinelRef, quantity = 1 }: Props) {
  const [shown, setShown] = useState(false)
  const [hasSentinel, setHasSentinel] = useState(false)
  const { add } = useCart()

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) {
      setHasSentinel(false)
      return
    }
    setHasSentinel(true)
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        // Show the bar when the sentinel is OUT of view (user scrolled past it).
        setShown(!entry.isIntersecting)
      },
      { threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinelRef])

  if (!hasSentinel) return null

  const isOutOfStock = product.stockStatus === 'out_of_stock'

  const handleAdd = () => {
    if (isOutOfStock) return
    add(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        priceRub: product.priceRub,
      },
      quantity,
    )
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] transition-transform duration-300 md:hidden ${
        shown ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!shown}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--text-small)] font-medium text-[var(--color-brand-text)]">
            {product.name}
          </p>
          <p className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)]">
            {formatRub(product.priceRub)}
          </p>
        </div>
        <button
          type="button"
          disabled={isOutOfStock}
          onClick={handleAdd}
          className="rounded-full bg-[var(--gradient-brand)] px-6 py-2.5 text-[length:var(--text-small)] font-semibold text-[var(--color-text-on-brand)] shadow-[var(--shadow-glow-brand)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isOutOfStock ? 'Нет в наличии' : 'В корзину'}
        </button>
      </div>
    </div>
  )
}
