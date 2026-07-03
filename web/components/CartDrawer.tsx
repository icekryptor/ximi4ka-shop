'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { OPEN_CART_EVENT, useCart } from '@/lib/cart'
import { SHIPPING_RULES } from '@/lib/checkout'
import { formatRub } from '@/lib/stockLabel'

// Порог бесплатной доставки для прогресс-бара. Единый источник — правила
// доставки СДЭК ПВЗ (3000 ₽), те же, что показывает чекаут.
const FREE_SHIPPING_FROM_RUB = SHIPPING_RULES.cdek_pvz.freeFromRub

export function CartDrawer() {
  const { items, subtotal, remove, setQty } = useCart()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener(OPEN_CART_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_CART_EVENT, onOpen)
  }, [])

  // Прогреваем маршруты CTA заранее: в закрытом состоянии drawer рендерит
  // null, поэтому <Link prefetch> внутри не сработает до открытия. Явный
  // router.prefetch делает переход «Оформить заказ» / «Открыть корзину»
  // мгновенным (в dev prefetch — no-op, это нормально).
  useEffect(() => {
    router.prefetch('/cart')
    router.prefetch('/checkout')
  }, [router])

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-lj-rule)] font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]">
          <span className="text-[var(--color-lj-ink)]">
            {items.length > 0 ? `КОРЗИНА · ${items.length}` : 'КОРЗИНА (0)'}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            className="font-lj-mono text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand-deep)]"
          >
            × ЗАКРЫТЬ
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {items.length === 0 ? (
            <p className="text-center font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-60 mt-8">
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
                  {/* Миниатюра: первая картинка товара; для записей старого
                      формата (без image) — колба-плейсхолдер. Острые углы —
                      по правилам v3 (пилл только у CTA). */}
                  <div className="w-14 h-[4.5rem] shrink-0 border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream-shade)] overflow-hidden flex items-center justify-center">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 56px-миниатюра в drawer: next/image здесь только добавил бы обёртку и лоадер
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        data-testid="cart-thumb-placeholder"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="w-6 h-6 text-[var(--color-lj-ink)] opacity-35"
                      >
                        <path d="M9.5 3h5" />
                        <path d="M10 3v6.2L5.2 17.7A2 2 0 0 0 7 20.6h10a2 2 0 0 0 1.8-2.9L14 9.2V3" />
                        <path d="M7.6 14.6h8.8" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-lj-display font-[700] text-base tracking-[-0.02em] text-[var(--color-lj-ink)] truncate">
                      {item.name}
                    </div>
                    <div className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60 mt-1">
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
                      <span className="min-w-[2ch] text-center font-lj-mono text-sm text-[var(--color-lj-ink)]">
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
                    <div className="font-lj-display font-[900] text-base tracking-[-0.03em] text-[var(--color-lj-ink)]">
                      {formatRub(item.priceRub * item.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      aria-label={`Удалить ${item.name}`}
                      className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60 hover:opacity-100 hover:text-[var(--color-stock-danger)]"
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
            {/* Прогресс до бесплатной доставки (порог СДЭК ПВЗ, 3000 ₽) */}
            <div data-testid="free-shipping-progress" className="flex flex-col gap-2">
              <p className="m-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)]">
                {subtotal >= FREE_SHIPPING_FROM_RUB ? (
                  <span className="text-[var(--color-lj-brand-deep)]">
                    Бесплатная доставка в пункт СДЭК ✓
                  </span>
                ) : (
                  <>
                    До бесплатной доставки осталось{' '}
                    <span className="text-[var(--color-lj-brand-deep)] font-[700]">
                      {formatRub(FREE_SHIPPING_FROM_RUB - subtotal)}
                    </span>
                  </>
                )}
              </p>
              <div
                role="progressbar"
                aria-label="Прогресс до бесплатной доставки"
                aria-valuemin={0}
                aria-valuemax={FREE_SHIPPING_FROM_RUB}
                aria-valuenow={Math.min(subtotal, FREE_SHIPPING_FROM_RUB)}
                className="h-1.5 rounded-full bg-[var(--color-lj-rule-soft)] overflow-hidden"
              >
                <div
                  data-testid="free-shipping-bar"
                  className="h-full rounded-full bg-[linear-gradient(90deg,#8d67ff_0%,#c856ff_100%)] transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((subtotal / FREE_SHIPPING_FROM_RUB) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-baseline justify-between font-lj-display font-[900] text-xl tracking-[-0.04em] text-[var(--color-lj-ink)]">
              <span>Итого</span>
              <span>{formatRub(subtotal)}</span>
            </div>
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full bg-[linear-gradient(135deg,#8d67ff_0%,#c856ff_100%)] text-white shadow-[var(--shadow-glow-brand)] transition-all duration-300 hover:brightness-110 hover:scale-[1.01]"
            >
              Оформить заказ →
            </Link>
            <Link
              href="/cart"
              onClick={() => setOpen(false)}
              className="self-center font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-60 hover:opacity-100 hover:text-[var(--color-lj-brand-deep)]"
            >
              Открыть страницу корзины
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
