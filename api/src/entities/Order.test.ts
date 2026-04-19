import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from './Order.js'
import { OrderItem } from './OrderItem.js'

describe('Order entity', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize()
    }
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE TABLE "order_items", "orders" RESTART IDENTITY CASCADE'
    )
  })

  it('persists and retrieves an order round-trip', async () => {
    const repo = AppDataSource.getRepository(Order)
    const created = repo.create({
      orderNumber: 'ORD-0001',
      status: 'pending',
      customerName: 'Ivan Petrov',
      customerPhone: '+7 900 000-00-00',
      customerEmail: 'ivan@example.com',
      deliveryAddress: {
        street: 'Lenina 1',
        city: 'Moscow',
        postal: '101000',
        notes: null,
      },
      deliveryMethod: 'courier',
      subtotalRub: 1000,
      shippingRub: 300,
      totalRub: 1300,
      paymentProvider: 'yandex_pay',
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.orderNumber).toBe('ORD-0001')
    expect(found.status).toBe('pending')
    expect(found.totalRub).toBe(1300)
    expect(found.deliveryAddress.city).toBe('Moscow')
  })

  it('persists order with items and retrieves via relation', async () => {
    const orderRepo = AppDataSource.getRepository(Order)
    const itemRepo = AppDataSource.getRepository(OrderItem)

    const order = await orderRepo.save(
      orderRepo.create({
        orderNumber: 'ORD-0002',
        status: 'pending',
        customerName: 'Anna',
        customerPhone: '+7 911 111-11-11',
        customerEmail: 'anna@example.com',
        deliveryAddress: { street: 'A', city: 'B', postal: 'C', notes: null },
        deliveryMethod: 'pickup',
        subtotalRub: 2500,
        shippingRub: 0,
        totalRub: 2500,
        paymentProvider: 'yandex_pay',
      })
    )

    const productIdA = '11111111-1111-1111-1111-111111111111'
    const productIdB = '22222222-2222-2222-2222-222222222222'

    await itemRepo.save([
      itemRepo.create({
        orderId: order.id,
        productId: productIdA,
        productSnapshot: { name: 'Kit A', sku: 'SKU-A', priceRub: 1000 },
        quantity: 2,
        unitPriceRub: 1000,
      }),
      itemRepo.create({
        orderId: order.id,
        productId: productIdB,
        productSnapshot: { name: 'Kit B', sku: null, priceRub: 500 },
        quantity: 1,
        unitPriceRub: 500,
      }),
    ])

    const found = await orderRepo.findOneOrFail({
      where: { id: order.id },
      relations: { items: true },
    })
    expect(found.items).toHaveLength(2)
    const names = found.items.map((i) => i.productSnapshot.name).sort()
    expect(names).toEqual(['Kit A', 'Kit B'])
    const totalQuantity = found.items.reduce((acc, i) => acc + i.quantity, 0)
    expect(totalQuantity).toBe(3)
  })
})
