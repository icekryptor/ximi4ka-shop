'use client'

import { useEffect, useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { AddToCartBurst } from '@/components/AddToCartBurst'

interface Props {
  // images optional: часть вызовов может не иметь картинок под рукой —
  // корзина тогда покажет плейсхолдер-колбу.
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'> &
    Partial<Pick<Product, 'images'>>
  // Сколько единиц добавить за один клик. По умолчанию 1 — существующие
  // вызовы (карточка товара, главная) поведения не меняют. Компактные
  // карточки каталога передают выбранное в степпере количество.
  quantity?: number
  // Компактный вариант для карточки реактива/оборудования (Figma «Карточки»,
  // Density=Compact): та же логика/бёрст, кнопка Outline по макету. В узкой
  // карточке — текст «В корзину», в широкой (от 12.5rem, container query
  // карточки) — квадрат 40×40 с иконкой корзины.
  compact?: boolean
}

export function AddToCartButton({ product, quantity = 1, compact = false }: Props) {
  const { add } = useCart()
  const [pending, setPending] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [burstKey, setBurstKey] = useState(0)

  const disabled = product.stockStatus === 'out_of_stock' || pending

  useEffect(() => {
    if (!toastVisible) return
    const id = window.setTimeout(() => setToastVisible(false), 2000)
    return () => window.clearTimeout(id)
  }, [toastVisible])

  function handleClick() {
    setPending(true)
    add(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        priceRub: product.priceRub,
        image: product.images?.[0]?.url,
      },
      // Отбрасываем дробное/нулевое: степпер держит целое ≥ 1, но добавим
      // защиту на случай прямого вызова.
      Math.max(1, Math.floor(quantity)),
    )
    setBurstKey((k) => k + 1)
    setToastVisible(true)
    window.setTimeout(() => setPending(false), 400)
  }

  const label = product.stockStatus === 'out_of_stock' ? 'Нет в наличии' : 'В корзину'

  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex">
        {compact ? (
          <button
            type="button"
            disabled={disabled}
            onClick={handleClick}
            aria-label={`${label}: ${product.name}`}
            className="lj-btn lj-btn-outline px-4 py-3 @min-[12.5rem]:size-10 @min-[12.5rem]:p-0"
          >
            {/* «Добавлено ✓» — отклик, видимый и без анимации бёрста
                (prefers-reduced-motion её выключает). */}
            <span className="@min-[12.5rem]:hidden">{toastVisible ? 'Добавлено ✓' : label}</span>
            {toastVisible ? (
              <span aria-hidden="true" className="hidden @min-[12.5rem]:block text-lg leading-none">
                ✓
              </span>
            ) : (
              <span
                aria-hidden="true"
                data-icon="cart"
                className="hidden @min-[12.5rem]:block size-6 bg-[var(--color-lj-brand)] [mask:url(/img/icons/cart-alt-2-filled.svg)_center/contain_no-repeat] forced-color-adjust-none forced-colors:bg-[ButtonText]"
              />
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={handleClick}
            className="inline-flex items-center gap-3 px-6 py-3 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {label}
          </button>
        )}
        <AddToCartBurst burstKey={burstKey} ringClassName={compact ? 'rounded-[5px]' : undefined} />
      </span>
      {/* Постоянный live-регион: скринридер объявляет добавление товара.
          В компактной карточке текст не помещается в ряд со степпером —
          там он только для скринридера, видимый отклик даёт бёрст. */}
      <span
        role="status"
        aria-live="polite"
        className={compact ? 'sr-only' : 'text-sm text-green-700 font-medium'}
      >
        {toastVisible ? 'Товар добавлен ✓' : ''}
      </span>
    </div>
  )
}
