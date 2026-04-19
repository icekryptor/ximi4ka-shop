'use client'

import { useEffect, useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'

interface Props {
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'>
}

export function AddToCartButton({ product }: Props) {
  const { add } = useCart()
  const [pending, setPending] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

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
    })
    setToastVisible(true)
    window.setTimeout(() => setPending(false), 400)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className="bg-black text-white rounded-full px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {product.stockStatus === 'out_of_stock' ? 'Нет в наличии' : 'В корзину'}
      </button>
      {toastVisible ? (
        <span role="status" className="text-sm text-green-700 font-medium">
          Добавлено в корзину ✓
        </span>
      ) : null}
    </div>
  )
}
