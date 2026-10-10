import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import type { Order } from '../../entities/Order.js'
import type { OrderItem } from '../../entities/OrderItem.js'
import { loadShipmentInput } from './orderInput.js'

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_ID = '00000000-0000-4000-8000-000000000002'

function item(overrides: Partial<OrderItem>): OrderItem {
  return {
    productId: PRODUCT_ID,
    productSnapshot: { name: 'Соляная кислота 10%', sku: 'HCl', priceRub: 199 },
    quantity: 1,
    unitPriceRub: 199,
    lineTotalRub: 199,
    isGift: false,
    ...overrides,
  } as OrderItem
}

function order(items: OrderItem[]): Order {
  return { items, deliveryAddress: { packages: [] } } as unknown as Order
}

describe('loadShipmentInput', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  it('отдаёт СДЭК по одной позиции на товар: платная и подарочная строки одного реактива сливаются', async () => {
    const { lines } = await loadShipmentInput(
      order([item({}), item({ isGift: true, unitPriceRub: 0, lineTotalRub: 0 })]),
    )

    expect(lines).toHaveLength(1)
    expect(lines[0].productId).toBe(PRODUCT_ID)
    // Объявленная ценность — по оплаченной сумме, поделённой на все штуки в посылке.
    expect(lines[0].unitPriceRub).toBe(100)
  })

  it('подарок другого товара остаётся отдельной позицией за 0 ₽', async () => {
    const { lines } = await loadShipmentInput(
      order([
        item({}),
        item({
          productId: OTHER_ID,
          productSnapshot: { name: 'Йодат калия', sku: 'KIO3', priceRub: 249 },
          unitPriceRub: 0,
          lineTotalRub: 0,
          isGift: true,
        }),
      ]),
    )

    expect(lines.map((l) => [l.productId, l.unitPriceRub])).toEqual([
      [PRODUCT_ID, 199],
      [OTHER_ID, 0],
    ])
  })
})
