'use client'

import { useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { AddToCartBurst } from '@/components/AddToCartBurst'
import { QuantityStepperLJ } from '@/components/product/QuantityStepperLJ'

interface Props {
  product: Pick<
    Product,
    'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus' | 'images'
  >
}

/**
 * v3 add-to-cart row. Combines the lab-journal QuantityStepperLJ and an
 * ink-pill primary button so the user-selected quantity flows through to
 * the cart in a single click. Carries a `data-add-to-cart-row` sentinel
 * attribute used by `<MobileBuyBar>` (via `MobileBuyBarMount`) to decide
 * when to slide its sticky bar into view.
 *
 * При добавлении запускается CSS-«реакция» (AddToCartBurst) и озвучивается
 * aria-live-статус «Товар добавлен».
 */
export function AddToCartWithQuantity({ product }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [confirmed, setConfirmed] = useState(false)
  const [burstKey, setBurstKey] = useState(0)
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
        image: product.images[0]?.url,
      },
      quantity,
    )
    setBurstKey((k) => k + 1)
    setConfirmed(true)
    window.setTimeout(() => setConfirmed(false), 2000)
  }

  return (
    <div data-add-to-cart-row className="flex flex-wrap items-center gap-4">
      <QuantityStepperLJ value={quantity} onChange={setQuantity} />
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={handleAdd}
          disabled={isOutOfStock}
          className="inline-flex items-center gap-3 px-7 py-4 font-[var(--font-lj-mono)] text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-400 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isOutOfStock ? 'Нет в наличии' : 'В корзину →'}
        </button>
        <AddToCartBurst burstKey={burstKey} />
      </span>
      {/* Постоянно смонтированный live-регион: скринридер озвучивает
          добавление даже когда визуальный текст скрыт/появляется. */}
      <span
        role="status"
        aria-live="polite"
        className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-stock-success)]"
      >
        {confirmed ? 'Товар добавлен ✓' : ''}
      </span>
    </div>
  )
}
