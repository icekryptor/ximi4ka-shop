'use client'

import { useEffect } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { ecommerceDetail } from '@/lib/metrika'

interface Props {
  product: Pick<Product, 'id' | 'name' | 'priceRub'>
}

/**
 * Невидимый маркер просмотра карточки: шлёт ecommerce detail в Метрику.
 * Страница товара — Server Component, поэтому событие вынесено сюда.
 * Название берём то же, что кладёт в корзину AddToCartWithQuantity (RU).
 */
export function ProductViewTracker({ product }: Props) {
  const { id, name, priceRub } = product
  useEffect(() => {
    ecommerceDetail({ id, name, price: priceRub })
  }, [id, name, priceRub])
  return null
}
