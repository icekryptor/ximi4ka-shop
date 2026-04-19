'use client'

import { useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'

interface Props {
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'>
}

export function AddToCartButton({ product }: Props) {
  const [pending, setPending] = useState(false)

  const disabled = product.stockStatus === 'out_of_stock' || pending

  function handleClick() {
    setPending(true)
    // TODO(task-2.6): wire to cart store
    console.info('Add to cart:', product.slug)
    setTimeout(() => setPending(false), 400)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className="bg-black text-white rounded-full px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {product.stockStatus === 'out_of_stock' ? 'Нет в наличии' : 'В корзину'}
    </button>
  )
}
