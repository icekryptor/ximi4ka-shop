'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Product, ProductImage } from '@ximi4ka-shop/shared'
import { AddToCartButton } from '@/components/AddToCartButton'
import { formulaForSlug } from '@/lib/reagentFormulas'
import { QuantityStepper } from './QuantityStepper'

interface Props {
  product: Product
  images: ProductImage[]
}

/**
 * Строка каталога в виде «списком» (Figma 56:10373, ProductCard в ряд):
 * фото 80 со скруглением 12, фиолетовый чип формулы, название Mazzard 15;
 * справа степпер, цена Mazzard 20 и иконка корзины 40×40. Линия #e5e5e5
 * снизу. Ниже md правый блок уходит на вторую строку под названием.
 * У цены минимальная ширина — степперы соседних строк стоят в колонку.
 *
 * `@container` нужен AddToCartButton compact: в контейнере шире 12.5rem
 * он рисуется иконкой, как в макете.
 */
export function CompactProductRow({ product, images }: Props) {
  const [qty, setQty] = useState(1)
  const formula = formulaForSlug(product.slug)
  const formattedPrice = product.priceRub.toLocaleString('ru-RU').replace(/,/g, ' ')
  const outOfStock = product.stockStatus === 'out_of_stock'
  const href = `/product/${product.slug}`

  return (
    <article
      data-density="row"
      className="@container flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-2.5 border-b border-[#e5e5e5]"
    >
      <div className="flex items-center gap-[15px] min-w-0 flex-1 basis-72">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="relative size-20 shrink-0 overflow-hidden rounded-[12px] border border-[var(--color-lj-rule)] bg-white"
        >
          {images[0] && (
            <Image src={images[0].url} alt="" fill sizes="80px" className="object-cover" />
          )}
        </Link>
        <div className="flex min-w-0 flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-2">
          {formula && (
            <span
              data-formula
              className="inline-flex min-w-20 shrink-0 items-center justify-center rounded-full bg-[var(--color-lj-brand)] px-2.5 py-1.5 font-lj-mazzard font-bold text-sm leading-[16.5px] whitespace-nowrap text-[var(--color-lj-on-bright)]"
            >
              {formula}
            </span>
          )}
          <h3 className="font-lj-mazzard text-[0.9375rem] leading-[1.2] text-[var(--color-lj-ink)]">
            <Link href={href} className="hover:text-[var(--color-lj-brand-deep)] transition-colors">
              {product.name}
            </Link>
          </h3>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3.5">
        <div className="flex items-center gap-2">
          {!outOfStock && (
            <QuantityStepper
              value={qty}
              onChange={setQty}
              size="sm"
              ariaLabel={`Количество: ${product.name}`}
            />
          )}
          <span className="flex min-w-16 items-baseline gap-1 pt-1 whitespace-nowrap text-[var(--color-lj-ink)]">
            <span className="font-lj-mazzard text-xl leading-none tracking-[-0.03em]">
              {formattedPrice}
            </span>
            <span className="font-lj-mono text-xs opacity-70">₽</span>
          </span>
        </div>
        {outOfStock ? (
          <span className="font-lj-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-55">
            Нет в наличии
          </span>
        ) : (
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
        )}
      </div>
    </article>
  )
}
