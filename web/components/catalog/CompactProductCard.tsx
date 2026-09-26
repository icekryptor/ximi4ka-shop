'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Product, ProductImage } from '@ximi4ka-shop/shared'
import { AddToCartButton } from '@/components/AddToCartButton'
import { SpecimenCard } from '@/components/ui/SpecimenCard'
import { QuantityStepper } from './QuantityStepper'

interface Props {
  product: Product
  images: ProductImage[]
}

/**
 * Компактная карточка каталога для реактивов/оборудования (Figma «Карточки»,
 * Density=Compact): квадратное фото, название в 1–2 строки, цена, степпер
 * количества и кнопка корзины. Клиентская — держит выбранное количество,
 * которое AddToCartButton добавляет разом (проп quantity).
 *
 * Два вида из макета: Mobile — артикул над названием, под рядом «цена ·
 * степпер» текстовая «В корзину»; Desktop — без артикула, иконка корзины в
 * одном ряду со степпером. Артикул переключается по ширине экрана, кнопка —
 * по ширине самой карточки (@container): в сетке на 6 колонок карточка бывает
 * уже 200px и на десктопе, тогда кнопка уходит под ряд, а не вылезает за край.
 */
export function CompactProductCard({ product, images }: Props) {
  const [qty, setQty] = useState(1)
  const sku = product.sku || product.slug
  const formattedPrice = product.priceRub.toLocaleString('ru-RU').replace(/,/g, ' ')
  const outOfStock = product.stockStatus === 'out_of_stock'

  return (
    <article
      className="@container group/compact lj-lift flex flex-col bg-transparent"
      data-density="compact"
    >
      <Link href={`/product/${product.slug}`} className="block">
        {images.length === 0 ? (
          <SpecimenCard sku={sku} size="pdp" className="rounded-[var(--radius-lj-bright-sm)]" />
        ) : (
          <div className="relative aspect-square bg-white rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color,box-shadow] duration-500 group-hover/compact:border-[var(--color-lj-brand)] group-hover/compact:shadow-[var(--shadow-lj-bright)]">
            <Image
              src={images[0].url}
              alt={images[0].alt}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 16vw"
              className="object-cover transition-transform duration-500 group-hover/compact:scale-[1.04]"
            />
          </div>
        )}
      </Link>

      <div className="pt-3 flex flex-col gap-2 flex-1 md:pt-2.5 md:gap-2.5">
        <span className="md:hidden font-lj-mazzard font-bold text-sm leading-[1.18] text-[var(--color-lj-ink)] opacity-55">
          № {sku}
        </span>
        <h3 className="font-lj-mazzard text-[0.9375rem] leading-[1.2] line-clamp-2 min-h-[2.4em]">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>

        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <span className="mr-auto flex items-baseline gap-1 pt-1 whitespace-nowrap">
            <span className="font-lj-mazzard text-xl leading-none tracking-[-0.03em]">
              {formattedPrice}
            </span>
            <span className="font-lj-mono text-xs opacity-70">₽</span>
          </span>
          {!outOfStock && (
            // Узкая карточка: группа «растворена» (contents) — степпер в ряду
            // с ценой, кнопка отдельной строкой. Широкая: степпер и иконка —
            // одна группа, при длинной цене переносится целиком вправо.
            <div className="contents @min-[12.5rem]:ml-auto @min-[12.5rem]:flex @min-[12.5rem]:items-center @min-[12.5rem]:gap-2.5">
              <QuantityStepper
                value={qty}
                onChange={setQty}
                size="sm"
                ariaLabel={`Количество: ${product.name}`}
              />
              <div className="basis-full @min-[12.5rem]:basis-auto">
                <AddToCartButton
                  product={{
                    id: product.id,
                    slug: product.slug,
                    name: product.name,
                    priceRub: product.priceRub,
                    stockStatus: product.stockStatus,
                    images,
                  }}
                  quantity={qty}
                  compact
                />
              </div>
            </div>
          )}
        </div>
        {outOfStock && (
          <span className="font-lj-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-55">
            Нет в наличии
          </span>
        )}
      </div>
    </article>
  )
}
