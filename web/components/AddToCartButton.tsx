'use client'

import { useEffect, useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { AddToCartBurst } from '@/components/AddToCartBurst'

interface Props {
  // images optional: часть вызовов может не иметь картинок под рукой —
  // корзина тогда покажет плейсхолдер-колбу.
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'> &
    Partial<Pick<Product, 'images'>>
}

export function AddToCartButton({ product }: Props) {
  const { add } = useCart()
  const [pending, setPending] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [burstKey, setBurstKey] = useState(0)

  const disabled = product.stockStatus === 'out_of_stock' || pending

  useEffect(() => {
    if (!toastVisible) return
    const id = window.setTimeout(() => setToastVisible(false), 2000)
    return () => window.clearTimeout(id)
  }, [toastVisible])

  function handleClick() {
    setPending(true)
    add({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      priceRub: product.priceRub,
      image: product.images?.[0]?.url,
    })
    setBurstKey((k) => k + 1)
    setToastVisible(true)
    window.setTimeout(() => setPending(false), 400)
  }

  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex">
        <button
          type="button"
          disabled={disabled}
          onClick={handleClick}
          className="inline-flex items-center gap-3 px-6 py-3 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {product.stockStatus === 'out_of_stock' ? 'Нет в наличии' : 'В корзину'}
        </button>
        <AddToCartBurst burstKey={burstKey} />
      </span>
      {/* Постоянный live-регион: скринридер объявляет добавление товара. */}
      <span role="status" aria-live="polite" className="text-sm text-green-700 font-medium">
        {toastVisible ? 'Товар добавлен ✓' : ''}
      </span>
    </div>
  )
}
