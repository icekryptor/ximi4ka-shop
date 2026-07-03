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
 * Компактная карточка каталога для реактивов/оборудования: маленькое фото,
 * название в 1–2 строки, цена, степпер количества и кнопка «В корзину».
 * Клиентская — держит выбранное количество, которое AddToCartButton
 * добавляет разом (проп quantity). Плотная сетка: до 6 в ряд на десктопе.
 */
export function CompactProductCard({ product, images }: Props) {
  const [qty, setQty] = useState(1)
  const sku = product.sku || product.slug
  const formattedPrice = product.priceRub
    .toLocaleString('ru-RU')
    .replace(/,/g, ' ')
  const outOfStock = product.stockStatus === 'out_of_stock'

  return (
    <article
      className="group/compact lj-lift flex flex-col bg-transparent"
      data-density="compact"
    >
      <Link href={`/product/${product.slug}`} className="block">
        {images.length === 0 ? (
          <SpecimenCard
            sku={sku}
            size="pdp"
            className="rounded-[var(--radius-lj-bright-sm)]"
          />
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

      <div className="pt-3 flex flex-col gap-2 flex-1">
        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-55">
          № {sku}
        </span>
        <h3 className="font-lj-display font-[700] text-[0.9375rem] leading-[1.15] tracking-[-0.02em] line-clamp-2 min-h-[2.3em]">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>

        <div className="mt-auto flex items-baseline gap-1 pt-1">
          <span className="font-lj-display font-[900] text-xl tracking-[-0.03em] leading-none">
            {formattedPrice}
          </span>
          <span className="font-lj-mono text-xs opacity-70">₽</span>
        </div>

        {!outOfStock && (
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <QuantityStepper
              value={qty}
              onChange={setQty}
              size="sm"
              ariaLabel={`Количество: ${product.name}`}
            />
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
        )}
        {outOfStock && (
          <span className="pt-2 font-lj-mono text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-55">
            Нет в наличии
          </span>
        )}
      </div>
    </article>
  )
}
