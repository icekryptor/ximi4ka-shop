'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart'
import { QuantityStepperLJ } from '@/components/product/QuantityStepperLJ'
import { formatRub } from '@/lib/stockLabel'
import { pluralizeRu } from '@/lib/i18n'

const SHIPPING_RUB = 400

export default function CartPage() {
  const { items, setQty, remove, subtotal } = useCart()
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  const itemTypeCount = items.length
  const totalRub = subtotal + (itemTypeCount > 0 ? SHIPPING_RUB : 0)

  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        {hydrated && itemTypeCount > 0 ? (
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
            КОРЗИНА · {itemTypeCount}{' '}
            {pluralizeRu(itemTypeCount, ['НАБОР', 'НАБОРА', 'НАБОРОВ'])}
          </p>
        ) : (
          <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
            КОРЗИНА
          </p>
        )}

        <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.045em] mb-12 text-[var(--color-lj-ink)]">
          Корзина
        </h1>

        {!hydrated ? (
          <div className="min-h-[40vh]" />
        ) : itemTypeCount === 0 ? (
          <div className="flex flex-col items-start gap-6">
            <p className="text-xl text-[var(--color-lj-ink)] opacity-70">Корзина пуста</p>
            <Link
              href="/categories"
              className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-300 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)]"
            >
              Открыть каталог →
            </Link>
          </div>
        ) : (
          <>
            <ul className="list-none p-0 m-0 flex flex-col gap-0 mb-12">
              {items.map((item) => (
                <li
                  key={item.productId}
                  data-testid={`cart-page-item-${item.productId}`}
                  className="grid grid-cols-[1fr_auto] gap-6 py-6 border-b border-[var(--color-lj-rule)] items-center"
                >
                  <div className="flex flex-col gap-2 min-w-0">
                    <Link
                      href={`/product/${item.slug}`}
                      className="font-lj-display font-[700] text-xl tracking-[-0.025em] text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand-deep)] truncate"
                    >
                      {item.name}
                    </Link>
                    <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-60">
                      {formatRub(item.priceRub)} за шт.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap justify-end">
                    <QuantityStepperLJ
                      value={item.quantity}
                      onChange={(qty) => setQty(item.productId, qty)}
                    />
                    <span className="font-lj-display font-[900] text-2xl tracking-[-0.04em] min-w-[7rem] text-right text-[var(--color-lj-ink)]">
                      {formatRub(item.priceRub * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      aria-label={`Удалить ${item.name}`}
                      className="font-lj-mono text-[var(--color-lj-ink)] opacity-60 hover:opacity-100 hover:text-[var(--color-stock-danger)] text-2xl leading-none px-2"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 mb-8 max-w-md ml-auto">
              <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
                <span>Подытог</span>
                <span>{formatRub(subtotal)}</span>
              </div>
              <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
                <span>Доставка</span>
                <span>{formatRub(SHIPPING_RUB)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--color-lj-rule)] pt-4 font-lj-display font-[900] text-2xl tracking-[-0.04em] text-[var(--color-lj-ink)]">
                <span>Итого</span>
                <span>{formatRub(totalRub)}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                href="/checkout"
                className="inline-flex items-center gap-3 px-8 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] border border-[var(--color-lj-ink)] rounded-full bg-[var(--color-lj-ink)] text-[var(--color-lj-bone)] transition-all duration-300 hover:bg-[var(--color-lj-brand-deep)] hover:border-[var(--color-lj-brand-deep)]"
              >
                Оформить заказ →
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
