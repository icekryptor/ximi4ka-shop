import { describe, it, expect } from 'vitest'
import type { Product } from '../../entities/Product.js'
import { ycpBasketItem } from './basket.js'
import { ycpUnitPrice, type YcpLine } from './pricing.js'

function line(product: Partial<Product>): YcpLine {
  return {
    product: {
      id: 'p-1',
      slug: 'nabor',
      name: 'Набор',
      canonicalUrl: null,
      images: [],
      ...product,
    } as Product,
    quantity: 2,
    regularPriceRub: 1500,
    finalPriceRub: 1400,
    availableQuantity: 99,
    shipping: { weightG: 830, lengthCm: 10, widthCm: 10, heightCm: 4 },
  }
}

describe('ycpUnitPrice', () => {
  it('округляет цену за штуку вниз', () => {
    expect(ycpUnitPrice(506, 5)).toBe(101)
    expect(ycpUnitPrice(99, 5)).toBe(19)
    expect(ycpUnitPrice(14000, 5)).toBe(2800)
  })
})

describe('ycpBasketItem', () => {
  it('собирает товар в формате Яндекса: мм и граммы, без вариантов', () => {
    const item = ycpBasketItem(
      line({
        images: [
          { url: '/uploads/b.webp', sortOrder: 1 },
          { url: '/uploads/a b.webp', sortOrder: 0 },
        ] as Product['images'],
      }),
      'msk-1',
      'https://new.ximi4ka.ru',
    )
    expect(item).toEqual({
      id: 'p-1',
      name: 'Набор',
      regular_price: 1500,
      final_price: 1400,
      img: 'https://new.ximi4ka.ru/uploads/a%20b.webp',
      url: 'https://new.ximi4ka.ru/product/nabor',
      warehouses: [{ id: 'msk-1', available_quantity: 99 }],
      dimensions: { width: 100, height: 40, depth: 100, weight: 830 },
      characteristics: [],
      variations: [],
    })
  })

  it('канонический адрес товара важнее адреса по слагу; без фото нет img', () => {
    const item = ycpBasketItem(
      line({ canonicalUrl: 'https://ximi4ka.ru/product/x' }),
      'msk-1',
      'https://new.ximi4ka.ru',
    )
    expect(item.url).toBe('https://ximi4ka.ru/product/x')
    expect(item).not.toHaveProperty('img')
  })
})
