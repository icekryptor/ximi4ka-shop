'use client'

import { useEffect, useId, useState } from 'react'
import Image from 'next/image'
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

/** Подарок в плашке: выбор для хранилища плюс фото для мини-карточки. */
interface GiftOption extends GiftChoice {
  image: { url: string; alt: string } | null
}

/** Выбор без фото — в хранилище и чекаут уходит только он. */
function toChoice({ productId, slug, name }: GiftOption): GiftChoice {
  return { productId, slug, name }
}

// Реактивы-подарки: тянем карточки по slug, оставляем те, что можно положить в
// заказ (сервер проверяет то же самое). Не загрузился один — остальные живут.
function useGiftOptions(enabled: boolean): GiftOption[] | null {
  const [options, setOptions] = useState<GiftOption[] | null>(null)

  useEffect(() => {
    if (!enabled || options !== null) return
    let cancelled = false
    Promise.all(GIFT_SLUGS.map((slug) => getPublishedProduct(slug).catch(() => null))).then(
      (products) => {
        if (cancelled) return
        setOptions(
          products.flatMap((p) =>
            p && p.isPublished && p.stockStatus === 'in_stock'
              ? [
                  {
                    productId: p.id,
                    slug: p.slug,
                    name: p.name,
                    image: p.images?.[0] ? { url: p.images[0].url, alt: p.images[0].alt } : null,
                  },
                ]
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
      className="m-0 border border-[var(--color-lj-brand-deep)] bg-[var(--color-lj-cream)] p-4 flex flex-col gap-3 md:w-fit"
    >
      <legend className="px-2 font-lj-mazzard font-[700] text-xl tracking-[-0.02em] text-[var(--color-lj-ink)]">
        Вам подарок!
      </legend>
      <p className="m-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70">
        Выберите реактив — он поедет с заказом бесплатно
      </p>
      <div
        role="radiogroup"
        aria-label="Подарок на выбор"
        className="grid grid-cols-3 gap-3 md:grid-cols-[repeat(3,minmax(0,10rem))]"
      >
        {(options ?? []).map((option) => {
          const checked = choice?.productId === option.productId
          return (
            <label
              key={option.productId}
              className="group flex min-w-0 cursor-pointer flex-col gap-2 text-[var(--color-lj-ink)]"
            >
              <input
                type="radio"
                name={groupName}
                checked={checked}
                onChange={() => setChoice(toChoice(option))}
                className="peer sr-only"
              />
              <span className="relative block aspect-square overflow-hidden rounded-[var(--radius-lj-bright-sm)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-lj-brand-deep)]">
                {option.image && (
                  <Image
                    src={option.image.url}
                    alt={option.image.alt}
                    fill
                    sizes="(max-width: 640px) 30vw, 140px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="font-lj-mazzard font-[400] text-[0.8125rem] leading-[1.15] tracking-[-0.01em]">
                {option.name}
              </span>
              <span
                aria-hidden="true"
                className={`mt-auto inline-flex items-center justify-center rounded-[14px] border-2 border-[var(--color-lj-brand-deep)] px-2 py-1.5 font-lj-mazzard font-[400] text-sm leading-none transition-colors ${
                  checked
                    ? 'bg-[var(--color-lj-brand-deep)] text-[var(--color-lj-on-bright)]'
                    : 'text-[var(--color-lj-brand-deep)] group-hover:bg-[var(--color-lj-brand-deep)]/10'
                }`}
              >
                {checked ? 'Выбрано' : 'Выбрать'}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
