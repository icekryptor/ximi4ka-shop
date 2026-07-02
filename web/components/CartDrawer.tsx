'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { OPEN_CART_EVENT, useCart } from '@/lib/cart'
import { formatRub } from '@/lib/stockLabel'

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
    <div role="dialog" aria-label="Корзина" aria-modal="true" className="fixed inset-0 z-[56] flex">
      <button
        type="button"
        aria-label="Закрыть корзину"
        onClick={() => setOpen(false)}
        className="flex-1 bg-[var(--color-lj-ink)]/40"
      />

      <aside className="w-full max-w-md bg-[var(--color-lj-cream)] border-l border-[var(--color-lj-rule)] h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-lj-rule)] font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]">
          <span className="text-[var(--color-lj-ink)]">
            {items.length > 0 ? `КОРЗИНА · ${items.length}` : 'КОРЗИНА (0)'}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            className="font-[var(--font-lj-mono)] text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand-deep)]"
          >
            × ЗАКРЫТЬ
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {items.length === 0 ? (
            <p className="text-center font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-60 mt-8">
              Корзина пуста
            </p>
          ) : (
            <ul className="list-none p-0 m-0 flex flex-col gap-0">
              {items.map((item) => (
                <li
                  key={item.productId}
                  data-testid={`cart-item-${item.productId}`}
                  className="flex items-start gap-3 border-b border-[var(--color-lj-rule)] py-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-[var(--font-lj-display)] font-[700] text-base tracking-[-0.02em] text-[var(--color-lj-ink)] truncate">
                      {item.name}
                    </div>
                    <div className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60 mt-1">
                      {formatRub(item.priceRub)} за шт.
                    </div>
                    <div className="mt-3 inline-flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Уменьшить количество ${item.name}`}
                        onClick={() => setQty(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-[var(--color-lj-ink)] text-sm text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)] transition-colors"
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center font-[var(--font-lj-mono)] text-sm text-[var(--color-lj-ink)]">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Увеличить количество ${item.name}`}
                        onClick={() => setQty(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-[var(--color-lj-ink)] text-sm text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)] transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="font-[var(--font-lj-display)] font-[900] text-base tracking-[-0.03em] text-[var(--color-lj-ink)]">
                      {formatRub(item.priceRub * item.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      aria-label={`Удалить ${item.name}`}
                      className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60 hover:opacity-100 hover:text-[var(--color-stock-danger)]"
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
          <div className="border-t border-[var(--color-lj-rule)] px-6 py-5 flex flex-col gap-3">
            <div className="flex items-baseline justify-between font-[var(--font-lj-display)] font-[900] text-xl tracking-[-0.04em] text-[var(--color-lj-ink)]">
              <span>Итого</span>
              <span>{formatRub(subtotal)}</span>
            </div>
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-3 px-7 py-4 font-[var(--font-lj-mono)] text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-300 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)]"
            >
              Оформить заказ →
            </Link>
            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="self-center font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-60 hover:opacity-100 hover:text-[var(--color-lj-brand-deep)]"
            >
              Открыть корзину
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
