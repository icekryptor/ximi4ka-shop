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
  // Компактный вариант для плотной сетки каталога: та же логика/бёрст,
  // но кнопка меньше (иконка-корзина без текстового лейбла на узких
  // экранах), чтобы уместиться под мелким фото реактива/оборудования.
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

  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex">
        <button
          type="button"
          disabled={disabled}
          onClick={handleClick}
          className={
            compact
              ? 'inline-flex items-center justify-center gap-2 px-3 py-2.5 font-lj-mono text-[0.6875rem] font-medium uppercase tracking-[0.06em] rounded-full lj-cta-bright disabled:opacity-50 disabled:cursor-not-allowed'
              : 'inline-flex items-center gap-3 px-6 py-3 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {product.stockStatus === 'out_of_stock'
            ? 'Нет в наличии'
            : compact
              ? 'В корзину'
              : 'В корзину'}
        </button>
        <AddToCartBurst burstKey={burstKey} />
      </span>
      {/* Постоянный live-регион: скринридер объявляет добавление товара. */}
      <span role="status" aria-live="polite" className="text-sm text-green-700 font-medium">
        {toastVisible ? 'Товар добавлен ✓' : ''}
      </span>
    </div>
  )
}
