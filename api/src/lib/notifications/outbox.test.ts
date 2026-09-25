import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { enqueueOrderEvent, saveOrderWithStatusEvent, statusEventKey } from './outbox.js'

async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
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
      ...overrides,
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
  afterEach(() => vi.unstubAllEnvs())

  const shipments = (orderId: string) =>
    AppDataSource.getRepository(CdekShipment).findBy({ orderId })

  it('новый заказ — в оба канала', async () => {
    const order = await seedOrder()
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    expect((await rows(order.id)).map((r) => [r.channel, r.eventKey])).toEqual([
      ['sheets', 'created'],
      ['telegram', 'created'],
    ])
  })

  it('смена статуса — только в таблицу: ответы в чате мешают складу', async () => {
    const order = await seedOrder()
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'status:paid'))
    expect((await rows(order.id)).map((r) => [r.channel, r.eventKey])).toEqual([
      ['sheets', 'status:paid'],
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
    expect((await rows(order.id)).map((r) => r.eventKey)).toEqual(['status:paid'])
  })

  it('без смены статуса событие не ставится, привязка платежа сохраняется', async () => {
    const order = await seedOrder()
    order.paymentIntentId = '777888'
    await saveOrderWithStatusEvent(order, 'pending')
    expect(await rows(order.id)).toHaveLength(0)
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.paymentIntentId).toBe('777888')
  })

  it('устаревшая сущность не затирает id карточки, записанный обработчиком', async () => {
    // Сверка: заказ загружен, пока шли сетевые вызовы обработчик очереди
    // успел записать id карточки, затем сохраняется устаревшая сущность.
    const order = await seedOrder()
    const stale = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(stale.telegramMessageId).toBeNull()
    await AppDataSource.query(`UPDATE orders SET telegram_message_id = 501 WHERE id = $1`, [
      order.id,
    ])

    const paidAt = new Date('2026-09-25T12:00:00Z')
    stale.status = 'paid'
    stale.paidAt = paidAt
    stale.statusHistory = [
      { from: 'pending', to: 'paid', at: paidAt.toISOString(), by: 'reconcile' },
    ]
    await saveOrderWithStatusEvent(stale, 'pending')

    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.telegramMessageId).toBe(501)
    expect(saved.status).toBe('paid')
    expect(saved.paidAt).toEqual(paidAt)
    expect(saved.statusHistory).toEqual(stale.statusHistory)
    expect((await rows(order.id)).map((r) => r.eventKey)).toEqual(['status:paid'])
  })

  it('оплата заказа СДЭК ставит его в очередь создания в СДЭК', async () => {
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
    const order = await seedOrder()
    order.status = 'paid'
    await saveOrderWithStatusEvent(order, 'pending')
    expect(await shipments(order.id)).toMatchObject([{ state: 'queued', attempts: 0 }])
  })

  it('вебхук и сверка дважды отметили оплату — одна запись', async () => {
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
    const order = await seedOrder()
    order.status = 'paid'
    await Promise.all([
      saveOrderWithStatusEvent(order, 'pending'),
      saveOrderWithStatusEvent(order, 'pending'),
    ])
    expect(await shipments(order.id)).toHaveLength(1)
  })

  it('флаг выключен — в очередь СДЭК не ставим', async () => {
    // dotenv читает api/.env и под тестами — не полагаемся на то, что там пусто.
    vi.stubEnv('CDEK_ORDERS_ENABLED', '')
    const order = await seedOrder()
    order.status = 'paid'
    await saveOrderWithStatusEvent(order, 'pending')
    expect(await shipments(order.id)).toHaveLength(0)
  })

  it('доставка не СДЭК и не оплата — не ставим', async () => {
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
    const pickup = await seedOrder({ deliveryMethod: 'pickup' })
    pickup.status = 'paid'
    await saveOrderWithStatusEvent(pickup, 'pending')
    const cancelled = await seedOrder()
    cancelled.status = 'cancelled'
    await saveOrderWithStatusEvent(cancelled, 'pending')
    expect(await shipments(pickup.id)).toHaveLength(0)
    expect(await shipments(cancelled.id)).toHaveLength(0)
  })
})
