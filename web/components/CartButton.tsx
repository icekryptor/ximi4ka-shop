'use client'

import { useCart } from '@/lib/cart'

export const OPEN_CART_EVENT = 'open-cart'

export function CartButton() {
  const { itemCount } = useCart()
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT))}
      aria-label="Открыть корзину"
      className="inline-flex items-center gap-2 rounded-full bg-brand text-white px-5 py-2 text-sm font-semibold shadow-sm hover:bg-brand-dark transition-colors"
    >
      <span>Корзина</span>
      {itemCount > 0 ? (
        <span
          data-testid="cart-badge"
          className="inline-flex items-center justify-center bg-white text-brand rounded-full text-xs px-2 py-0.5 font-bold min-w-[1.5rem]"
        >
          {itemCount}
        </span>
      ) : null}
    </button>
  )
}
