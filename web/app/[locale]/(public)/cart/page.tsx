'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart'
import {
  Container,
  Section,
  DisplayHeading,
  Eyebrow,
  Button,
  GlassCard,
  MicroTrustRow,
  type MicroTrustItem,
} from '@/components/ui'
import { QuantityStepperLJ } from '@/components/product/QuantityStepperLJ'
import { formatRub } from '@/lib/stockLabel'

const TRUST_ITEMS: MicroTrustItem[] = [
  { icon: '🛡️', label: 'Безопасные реактивы' },
  { icon: '🚚', label: 'Доставка от 3 дней' },
  { icon: '↩️', label: 'Возврат 14 дней' },
]

export default function CartPage() {
  const { items, setQty, remove, subtotal, clear } = useCart()
  const [hydrated, setHydrated] = useState(false)
  // Standard SSR/CSR hydration guard — set after mount so server-rendered
  // markup matches the first client render before the localStorage read kicks in.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  // Avoid SSR/CSR hydration mismatch — cart state lives in localStorage,
  // so the server renders an empty placeholder until the client mounts.
  if (!hydrated) {
    return (
      <Section size="md" surface="base">
        <Container>
          <div className="min-h-[40vh]" />
        </Container>
      </Section>
    )
  }

  if (items.length === 0) {
    return (
      <Section size="lg" surface="base">
        <Container>
          <div className="flex flex-col items-center justify-center text-center py-16 gap-6">
            <Eyebrow>Корзина</Eyebrow>
            <DisplayHeading>Корзина пуста</DisplayHeading>
            <p className="max-w-md text-[length:var(--text-lead)] text-[var(--color-brand-text-secondary)]">
              Добавьте набор из каталога, чтобы оформить заказ.
            </p>
            <Button href="/categories" size="lg">
              В каталог
            </Button>
          </div>
        </Container>
      </Section>
    )
  }

  return (
    <Section size="md" surface="base">
      <Container>
        <Eyebrow className="mb-3">Корзина</Eyebrow>
        <DisplayHeading className="mb-10">Ваш заказ</DisplayHeading>

        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
          {/* Items list */}
          <div className="flex flex-col">
            {items.map((item, i) => (
              <div
                key={item.productId}
                data-testid={`cart-page-item-${item.productId}`}
                className={`flex flex-wrap items-center gap-4 py-6 ${
                  i > 0 ? 'border-t border-[var(--color-border-subtle)]' : ''
                }`}
              >
                {/* Cutout-style thumbnail placeholder — cart items don't carry image URLs */}
                <div
                  aria-hidden="true"
                  className="h-20 w-20 shrink-0 rounded-[var(--radius-md)]"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 30%, rgba(141,103,255,0.10), rgba(238,235,243,1))',
                  }}
                />

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${item.slug}`}
                    className="font-semibold text-[var(--color-brand-text)] hover:text-[var(--color-brand)]"
                  >
                    {item.name}
                  </Link>
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {formatRub(item.priceRub)} за шт.
                  </p>
                </div>

                <QuantityStepperLJ
                  value={item.quantity}
                  onChange={(qty) => setQty(item.productId, qty)}
                />

                <p className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)] tracking-[var(--tracking-tight)] min-w-[100px] text-right">
                  {formatRub(item.priceRub * item.quantity)}
                </p>

                <button
                  type="button"
                  onClick={() => remove(item.productId)}
                  aria-label={`Удалить ${item.name}`}
                  className="rounded-full p-2 text-[var(--color-text-muted)] hover:text-[var(--color-stock-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={clear}
              className="mt-6 self-start text-[length:var(--text-small)] text-[var(--color-text-muted)] hover:text-[var(--color-stock-danger)] underline underline-offset-4"
            >
              Очистить корзину
            </button>
          </div>

          {/* Summary */}
          <div className="lg:sticky lg:top-24 self-start">
            <GlassCard>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between text-[var(--color-brand-text)]">
                  <span>Подытог</span>
                  <span className="font-medium">{formatRub(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  <span>Доставка</span>
                  <span>Расчёт доставки — на следующем шаге</span>
                </div>
                <hr className="border-[var(--color-border-subtle)]" />
                <div className="flex items-baseline justify-between">
                  <span className="text-[length:var(--text-lead)] text-[var(--color-brand-text)]">
                    Итого
                  </span>
                  <span
                    className="font-[var(--font-display)] text-[length:var(--text-h2)] text-[var(--color-accent)] tracking-[var(--tracking-tight)]"
                  >
                    {formatRub(subtotal)}
                  </span>
                </div>
                <Link
                  href="/checkout"
                  className="inline-flex w-full items-center justify-center rounded-full px-8 py-4 text-[length:var(--text-lead)] font-semibold text-white shadow-[var(--shadow-md)] transition hover:opacity-95"
                  style={{ backgroundImage: 'var(--gradient-accent)' }}
                >
                  Оформить заказ
                </Link>
              </div>
            </GlassCard>

            <div className="mt-6">
              <MicroTrustRow items={TRUST_ITEMS} />
            </div>
          </div>
        </div>
      </Container>
    </Section>
  )
}
