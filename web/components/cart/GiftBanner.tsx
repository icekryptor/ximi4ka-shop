'use client'

import { useEffect, useId, useState } from 'react'
import { getPublishedProduct } from '@/lib/api'
import {
  GIFT_SLUGS,
  GIFT_THRESHOLD_RUB,
  giftRemainingRub,
  saveGiftChoice,
  useGiftChoice,
  type GiftChoice,
} from '@/lib/gift'
import { formatRub } from '@/lib/stockLabel'

// Реактивы-подарки: тянем карточки по slug, оставляем те, что можно положить в
// заказ (сервер проверяет то же самое). Не загрузился один — остальные живут.
function useGiftOptions(enabled: boolean): GiftChoice[] | null {
  const [options, setOptions] = useState<GiftChoice[] | null>(null)

  useEffect(() => {
    if (!enabled || options !== null) return
    let cancelled = false
    Promise.all(GIFT_SLUGS.map((slug) => getPublishedProduct(slug).catch(() => null))).then(
      (products) => {
        if (cancelled) return
        setOptions(
          products.flatMap((p) =>
            p && p.isPublished && p.stockStatus === 'in_stock'
              ? [{ productId: p.id, slug: p.slug, name: p.name }]
              : [],
          ),
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, options])

  return options
}

/**
 * Плашка подарка в корзине. `totalRub` — к оплате за товары (после скидок), как
 * порог бесплатной доставки. Ниже порога — подсказка, от порога — выбор реактива.
 */
export function GiftBanner({ totalRub }: { totalRub: number }) {
  const unlocked = totalRub > 0 && giftRemainingRub(totalRub) === 0
  const options = useGiftOptions(unlocked)
  const [choice, setChoice] = useGiftChoice()
  // Страница и drawer показывают по плашке: общее name склеило бы их радиогруппы.
  const groupName = useId()

  // Выбор живёт, пока подарок открыт и реактив есть в наличии; иначе чекаут
  // не должен отправлять устаревший id.
  useEffect(() => {
    if (!choice) return
    const stale =
      !unlocked || (options !== null && !options.some((o) => o.productId === choice.productId))
    if (stale) saveGiftChoice(null)
  }, [choice, unlocked, options])

  if (totalRub <= 0) return null
  // Все реактивы разобрали — предлагать нечего.
  if (unlocked && options !== null && options.length === 0) return null

  if (!unlocked) {
    return (
      <div
        data-testid="gift-banner"
        className="border border-[var(--color-lj-rule)] px-4 py-3 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)]"
      >
        Подарок — реактив на выбор от {formatRub(GIFT_THRESHOLD_RUB)}. Добавьте ещё на{' '}
        <span className="text-[var(--color-lj-brand-deep)] font-[700]">
          {formatRub(giftRemainingRub(totalRub))}
        </span>
      </div>
    )
  }

  return (
    <fieldset
      data-testid="gift-banner"
      className="m-0 border border-[var(--color-lj-brand-deep)] bg-[var(--color-lj-cream)] p-4 flex flex-col gap-3"
    >
      <legend className="px-2 font-lj-display font-[900] text-xl tracking-[-0.04em] text-[var(--color-lj-ink)]">
        Вам подарок!
      </legend>
      <p className="m-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70">
        Выберите реактив — он поедет с заказом бесплатно
      </p>
      <div role="radiogroup" aria-label="Подарок на выбор" className="flex flex-col gap-2">
        {(options ?? []).map((option) => {
          const checked = choice?.productId === option.productId
          return (
            <label
              key={option.productId}
              className={`flex items-center gap-3 border px-3 py-2 cursor-pointer text-[var(--color-lj-ink)] ${
                checked
                  ? 'border-[var(--color-lj-brand-deep)]'
                  : 'border-[var(--color-lj-rule)] hover:border-[var(--color-lj-brand-deep)]'
              }`}
            >
              <input
                type="radio"
                name={groupName}
                checked={checked}
                onChange={() => setChoice(option)}
                className="accent-[var(--color-lj-brand-deep)]"
              />
              <span className="font-lj-display font-[700] tracking-[-0.025em]">{option.name}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
