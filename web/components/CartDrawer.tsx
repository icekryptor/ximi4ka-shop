'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCart } from '@/lib/cart'
import { OPEN_CART_EVENT } from '@/components/CartButton'

function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`
}

export function CartDrawer() {
  const { items, subtotal, remove, setQty } = useCart()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener(OPEN_CART_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_CART_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Корзина"
      aria-modal="true"
      className="fixed inset-0 z-50 flex"
    >
      <button
        type="button"
        aria-label="Закрыть корзину"
        onClick={() => setOpen(false)}
        className="flex-1 bg-black/40"
      />
      <div className="w-full max-w-md bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
          <h2 className="text-lg font-semibold text-brand-text">Корзина</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            className="text-2xl leading-none px-2 text-brand-text-secondary hover:text-brand-text"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-brand-text-secondary">Корзина пуста</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.productId}
                  data-testid={`cart-item-${item.productId}`}
                  className="flex items-start gap-3 border-b border-brand-border pb-4"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-brand-text">{item.name}</div>
                    <div className="text-xs text-brand-text-secondary">
                      {formatRub(item.priceRub)} за шт.
                    </div>
                    <div className="mt-2 inline-flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Уменьшить количество ${item.name}`}
                        onClick={() => setQty(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-brand-border text-sm"
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Увеличить количество ${item.name}`}
                        onClick={() => setQty(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-brand-border text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="font-semibold text-sm text-brand-text">
                      {formatRub(item.priceRub * item.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      aria-label={`Удалить ${item.name}`}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 ? (
          <div className="px-6 py-4 border-t border-brand-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-text-secondary">Итого</span>
              <span className="font-semibold text-brand-text">{formatRub(subtotal)}</span>
            </div>
            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="block w-full text-center bg-brand hover:bg-brand-dark text-white rounded-full py-3 font-semibold transition-colors"
            >
              Перейти к оформлению
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
