import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from './Order.js'
import { OrderNotification } from './OrderNotification.js'

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

describe('OrderNotification entity', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders RESTART IDENTITY CASCADE')
  })

  it('хранит запись очереди с умолчаниями', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    const saved = await repo.save(
      repo.create({ orderId: order.id, channel: 'telegram', eventKey: 'created' }),
    )
    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found).toMatchObject({
      channel: 'telegram',
      eventKey: 'created',
      attempts: 0,
      sentAt: null,
      failedAt: null,
      lastError: null,
    })
    expect(found.nextAttemptAt).toBeInstanceOf(Date)
    expect(found.createdAt).toBeInstanceOf(Date)
  })

  it('не даёт поставить одно событие канала дважды', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    await repo.save(repo.create({ orderId: order.id, channel: 'sheets', eventKey: 'created' }))
    await expect(
      repo.save(repo.create({ orderId: order.id, channel: 'sheets', eventKey: 'created' })),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('удаляется вместе с заказом', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    await repo.save(repo.create({ orderId: order.id, channel: 'sheets', eventKey: 'created' }))
    await AppDataSource.getRepository(Order).delete(order.id)
    expect(await repo.count()).toBe(0)
  })

  it('заказ хранит ник Telegram и id карточки числом', async () => {
    const order = await seedOrder()
    await AppDataSource.getRepository(Order).update(order.id, {
      customerTelegram: '@maria',
      telegramMessageId: 4242,
    })
    const found = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(found.customerTelegram).toBe('@maria')
    expect(found.telegramMessageId).toBe(4242)
  })
})
