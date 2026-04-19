'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCart } from '@/lib/cart'

function formatRub(value: number): string {
  return `${value.toLocaleString('ru-RU')} ₽`
}

export function CartDrawer() {
  const { items, itemCount, subtotal, remove, setQty } = useCart()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Открыть корзину"
        className="fixed top-4 right-4 z-40 bg-black text-white rounded-full px-4 py-2 text-sm font-semibold shadow-md hover:bg-neutral-800"
      >
        Корзина
        {itemCount > 0 ? (
          <span
            data-testid="cart-badge"
            className="ml-2 inline-flex items-center justify-center bg-white text-black rounded-full text-xs px-2 py-0.5 font-bold"
          >
            {itemCount}
          </span>
        ) : null}
      </button>

      {open ? (
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
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Корзина</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <p className="text-sm text-neutral-500">Корзина пуста</p>
              ) : (
                <ul className="space-y-4">
                  {items.map((item) => (
                    <li
                      key={item.productId}
                      data-testid={`cart-item-${item.productId}`}
                      className="flex items-start gap-3 border-b pb-4"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs text-neutral-500">
                          {formatRub(item.priceRub)} за шт.
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Уменьшить количество ${item.name}`}
                            onClick={() => setQty(item.productId, item.quantity - 1)}
                            className="w-7 h-7 rounded-full border text-sm"
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
                            className="w-7 h-7 rounded-full border text-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="font-semibold text-sm">
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
              <div className="px-6 py-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500">Итого</span>
                  <span className="font-semibold">{formatRub(subtotal)}</span>
                </div>
                <Link
                  href="/cart"
                  onClick={() => setOpen(false)}
                  className="block w-full text-center bg-black text-white rounded-full py-3 font-semibold"
                >
                  Перейти к оформлению
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
