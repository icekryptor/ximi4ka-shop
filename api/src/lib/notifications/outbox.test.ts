import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { enqueueOrderEvent, saveOrderWithStatusEvent, statusEventKey } from './outbox.js'

async function seedOrder(): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: 'pending',
      customerName: 'Мария',
      customerPhone: '+79123456789',
      customerEmail: '',
      deliveryAddress: { address: 'Москва', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 100,
      shippingRub: 0,
      totalRub: 100,
      paymentProvider: 'manual',
      statusHistory: [],
    }),
  )
}

function rows(orderId: string) {
  return AppDataSource.getRepository(OrderNotification).find({
    where: { orderId },
    order: { channel: 'ASC' },
  })
}

describe('statusEventKey', () => {
  it('pending — не событие, остальные статусы — status:*', () => {
    expect(statusEventKey('pending')).toBeNull()
    expect(statusEventKey('paid')).toBe('status:paid')
    expect(statusEventKey('shipped')).toBe('status:shipped')
    expect(statusEventKey('cancelled')).toBe('status:cancelled')
    expect(statusEventKey('failed')).toBe('status:failed')
  })
})

describe('outbox', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders RESTART IDENTITY CASCADE')
  })

  it('ставит событие в оба канала', async () => {
    const order = await seedOrder()
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    expect((await rows(order.id)).map((r) => [r.channel, r.eventKey])).toEqual([
      ['sheets', 'created'],
      ['telegram', 'created'],
    ])
  })

  it('повторная постановка не дублирует записи', async () => {
    const order = await seedOrder()
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    expect(await rows(order.id)).toHaveLength(2)
  })

  it('откатывается вместе с транзакцией заказа', async () => {
    const order = await seedOrder()
    await expect(
      AppDataSource.transaction(async (em) => {
        await enqueueOrderEvent(em, order.id, 'created')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await rows(order.id)).toHaveLength(0)
  })

  it('saveOrderWithStatusEvent сохраняет статус и ставит событие', async () => {
    const order = await seedOrder()
    order.status = 'paid'
    await saveOrderWithStatusEvent(order, 'pending')
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.status).toBe('paid')
    expect((await rows(order.id)).map((r) => r.eventKey)).toEqual(['status:paid', 'status:paid'])
  })

  it('без смены статуса событие не ставится', async () => {
    const order = await seedOrder()
    order.customerName = 'Мария Иванова'
    await saveOrderWithStatusEvent(order, 'pending')
    expect(await rows(order.id)).toHaveLength(0)
  })
})
