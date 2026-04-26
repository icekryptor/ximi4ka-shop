'use client'

import { useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { QuantityStepper } from '@/components/product'
import { Button } from '@/components/ui'

interface Props {
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'>
}

/**
 * Combines a quantity stepper and add-to-cart button so the user-selected
 * quantity flows through to the cart in a single click. Carries a
 * `data-add-to-cart-row` sentinel attribute used by `<MobileBuyBar>` to
 * decide when to slide its sticky bar into view.
 */
export function AddToCartWithQuantity({ product }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [confirmed, setConfirmed] = useState(false)
  const { add } = useCart()
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
    setConfirmed(true)
    window.setTimeout(() => setConfirmed(false), 2000)
  }

  return (
    <div data-add-to-cart-row className="flex flex-wrap items-center gap-4">
      <QuantityStepper value={quantity} onChange={setQuantity} />
      <Button
        size="lg"
        onClick={handleAdd}
        disabled={isOutOfStock}
        className="min-w-[200px] flex-1 sm:flex-initial"
      >
        {isOutOfStock ? 'Нет в наличии' : 'В корзину'}
      </Button>
      {confirmed && (
        <span
          role="status"
          className="text-[length:var(--text-small)] font-medium text-[var(--color-stock-success)]"
        >
          Добавлено в корзину ✓
        </span>
      )}
    </div>
  )
}
