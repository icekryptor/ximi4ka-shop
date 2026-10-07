'use client'

import { useMemo, useState } from 'react'
import type { SearchProductResult } from '@ximi4ka-shop/shared'
import { openCartDrawer, useCart } from '@/lib/cart'
import { formatRub } from '@/lib/stockLabel'
import {
  nextTierHint,
  priceStaged,
  stepQuantity,
  toStagedLine,
  type StagedLine,
} from '@/lib/wholesaleStaging'
import { WholesaleSearch } from './WholesaleSearch'

const STEP_BTN =
  'inline-flex size-8 items-center justify-center rounded-full font-lj-mono leading-none text-[var(--color-lj-ink)] transition-colors hover:bg-[var(--color-lj-rule-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)]'

const SUMMARY_ROW =
  'flex justify-between gap-4 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]'

/**
 * Блок оптового заказа: найти позиции, выбрать количества, увидеть цену с
 * оптовой скидкой и одним кликом отправить список в обычную корзину. Список
 * живёт в памяти страницы. Цены считает тот же движок, что корзина и сервер.
 */
export function WholesaleOrder() {
  const { add } = useCart()
  const [lines, setLines] = useState<StagedLine[]>([])
  const priced = useMemo(() => priceStaged(lines), [lines])

  const pick = (product: SearchProductResult) =>
    setLines((cur) =>
      cur.some((l) => l.productId === product.id) ? cur : [...cur, toStagedLine(product)],
    )

  const step = (productId: string, direction: 1 | -1) =>
    setLines((cur) =>
      cur.map((l) =>
        l.productId === productId
          ? { ...l, quantity: stepQuantity(l.slug, l.quantity, direction) }
          : l,
      ),
    )

  const remove = (productId: string) =>
    setLines((cur) => cur.filter((l) => l.productId !== productId))

  const addAll = () => {
    for (const l of lines) {
      add(
        {
          productId: l.productId,
          slug: l.slug,
          name: l.name,
          priceRub: l.priceRub,
          image: l.image ?? undefined,
          categories: l.categories,
        },
        l.quantity,
      )
    }
    setLines([])
    openCartDrawer()
  }

  return (
    <div className="flex flex-col gap-6">
      <WholesaleSearch onPick={pick} />

      {lines.length === 0 ? (
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-65">
          Найдите товар — он появится здесь с оптовой ценой
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {priced.lines.map((l) => {
            const hint = nextTierHint(l)
            const discounted = l.totalRub < l.listRub
            return (
              <li
                key={l.productId}
                data-testid="wholesale-line"
                className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-3"
              >
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-lj-mono text-xs opacity-50">Х</span>
                  )}
                </span>
                <span className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
                  <span className="font-lj-body text-sm text-[var(--color-lj-ink)]">{l.name}</span>
                  {hint ? (
                    <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] text-[var(--color-lj-brand-deep)]">
                      {hint}
                    </span>
                  ) : null}
                </span>
                <span
                  role="group"
                  aria-label={`Количество: ${l.name}`}
                  className="inline-flex h-10 items-center rounded-full border-[0.5px] border-[var(--color-lj-ink)] px-0.5"
                >
                  <button
                    type="button"
                    className={STEP_BTN}
                    aria-label="Уменьшить количество"
                    onClick={() => step(l.productId, -1)}
                  >
                    −
                  </button>
                  <span
                    aria-live="polite"
                    className="w-8 text-center font-lj-mono text-[0.9375rem] tabular-nums"
                  >
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    className={STEP_BTN}
                    aria-label="Увеличить количество"
                    onClick={() => step(l.productId, 1)}
                  >
                    +
                  </button>
                </span>
                <span className="flex min-w-[6rem] flex-col items-end font-lj-mono">
                  <span className="text-[length:var(--text-lj-mono-sm)]">
                    {formatRub(l.totalRub)}
                  </span>
                  {discounted ? (
                    <span className="text-[length:var(--text-lj-mono-xs)] line-through opacity-55">
                      {formatRub(l.listRub)}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={STEP_BTN}
                  aria-label={`Убрать ${l.name}`}
                  onClick={() => remove(l.productId)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] pt-4">
        <div className={`${SUMMARY_ROW} opacity-70`}>
          <span>Без скидки</span>
          <span data-testid="wholesale-list-total">{formatRub(priced.listRub)}</span>
        </div>
        {priced.savingsRub > 0 && (
          <div className={`${SUMMARY_ROW} text-[var(--color-lj-brand-deep)]`}>
            <span>Скидка</span>
            <span data-testid="wholesale-savings">−{formatRub(priced.savingsRub)}</span>
          </div>
        )}
        <div className={`${SUMMARY_ROW} font-bold`}>
          <span>К оплате</span>
          <span data-testid="wholesale-total">{formatRub(priced.totalRub)}</span>
        </div>
        <button
          type="button"
          onClick={addAll}
          disabled={lines.length === 0}
          className="lj-btn lj-btn-primary mt-2 self-start rounded-[4px] px-7 py-4 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Добавить в корзину
        </button>
      </div>
    </div>
  )
}
