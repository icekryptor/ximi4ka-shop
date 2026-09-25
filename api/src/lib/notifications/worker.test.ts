import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { SheetsConfigError } from '../google/sheets.js'
import { enqueueOrderEvent } from './outbox.js'
import { nextDelayMs, processDueNotifications, type NotificationChannels } from './worker.js'

const NOW = new Date('2026-09-25T12:00:00Z')

async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      orderNumber: `XM-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: 'pending',
      customerName: 'Мария',
      customerPhone: '+79123456789',
      customerEmail: '',
      deliveryAddress: {
        address: 'Новосибирск, ул. Кривощековская, 15',
        comment: null,
        deliveryPointCode: 'NSK1',
      },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 238,
      shippingRub: 0,
      totalRub: 238,
      paymentProvider: 'manual',
      statusHistory: [],
      ...overrides,
    }),
  )
  const items = AppDataSource.getRepository(OrderItem)
  await items.save(
    items.create({
      orderId: order.id,
      productId: '00000000-0000-4000-8000-000000000001',
      productSnapshot: { name: 'Серная кислота 7%', sku: 'H2SO4', priceRub: 119 },
      quantity: 2,
      unitPriceRub: 119,
    }),
  )
  return order
}

async function enqueue(
  orderId: string,
  key: Parameters<typeof enqueueOrderEvent>[2],
  createdAt: Date,
) {
  await AppDataSource.transaction((em) => enqueueOrderEvent(em, orderId, key))
  await AppDataSource.query(
    `UPDATE order_notifications SET created_at = $3, next_attempt_at = $3 WHERE order_id = $1 AND event_key = $2`,
    [orderId, key, createdAt],
  )
}

function row(orderId: string, channel: 'sheets' | 'telegram', eventKey: string) {
  return AppDataSource.getRepository(OrderNotification).findOneByOrFail({
    orderId,
    channel,
    eventKey: eventKey as never,
  })
}

function fakeChannels(): NotificationChannels & {
  sheets: { upsertOrderRow: ReturnType<typeof vi.fn> }
  telegram: { sendMessage: ReturnType<typeof vi.fn> }
} {
  return {
    sheets: { upsertOrderRow: vi.fn().mockResolvedValue(undefined) },
    telegram: { sendMessage: vi.fn().mockResolvedValue(501) },
  }
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

describe('processDueNotifications', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
  })

  it('created: строка в таблицу, карточка в чат, id карточки сохраняется', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result).toEqual({ sent: 2, retried: 0, failed: 0 })
    const [number, sheet] = channels.sheets.upsertOrderRow.mock.calls[0]
    expect(number).toBe(order.orderNumber)
    expect(sheet[0]).toBe(order.orderNumber)
    expect(sheet[7]).toBe('Серная кислота 7% · H2SO4 · 2 × 119 ₽')
    const [card, replyTo] = channels.telegram.sendMessage.mock.calls[0]
    expect(card).toContain(`Новый заказ ${order.orderNumber}`)
    expect(replyTo).toBeUndefined()
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.telegramMessageId).toBe(501)
    expect((await row(order.id, 'telegram', 'created')).sentAt).not.toBeNull()
    expect((await row(order.id, 'sheets', 'created')).attempts).toBe(1)
  })

  it('смена статуса — ответ на карточку', async () => {
    const order = await seedOrder({ status: 'paid', telegramMessageId: 501 })
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })
    expect(channels.telegram.sendMessage).toHaveBeenCalledWith('✅ оплачен', 501)
  })

  it('строка таблицы собирается из текущего состояния заказа', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(2))
    await AppDataSource.getRepository(Order).update(order.id, { status: 'paid' })
    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })
    expect(channels.sheets.upsertOrderRow.mock.calls[0][1][11]).toBe('оплачен')
  })

  it('статус не обгоняет карточку, которую ещё не отправили', async () => {
    const order = await seedOrder({ status: 'paid' })
    await enqueue(order.id, 'created', minutesAgo(2))
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    const channels = fakeChannels()
    channels.telegram.sendMessage.mockRejectedValueOnce(new Error('socket hang up'))

    await processDueNotifications(channels, { now: NOW })

    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(1)
    const status = await row(order.id, 'telegram', 'status:paid')
    expect(status.attempts).toBe(0)
    expect(status.sentAt).toBeNull()
  })

  it('карточка не ушла совсем — статус отдельным сообщением с номером заказа', async () => {
    const order = await seedOrder({ status: 'paid' })
    await enqueue(order.id, 'created', minutesAgo(2))
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    await AppDataSource.query(
      `UPDATE order_notifications SET failed_at = $2 WHERE order_id = $1 AND channel = 'telegram' AND event_key = 'created'`,
      [order.id, minutesAgo(1)],
    )
    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })
    expect(channels.telegram.sendMessage).toHaveBeenCalledWith(
      `✅ Заказ ${order.orderNumber}: оплачен`,
      null,
    )
  })

  it('временная ошибка — повтор по расписанию', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(new Error('socket hang up'))

    await processDueNotifications(channels, { now: NOW })
    let sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(1)
    expect(sheets.failedAt).toBeNull()
    expect(sheets.lastError).toContain('socket hang up')
    expect(sheets.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000)

    await processDueNotifications(channels, { now: new Date(NOW.getTime() + 30_000) })
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(1)

    await processDueNotifications(channels, { now: new Date(NOW.getTime() + 61_000) })
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(2)
    sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(2)
  })

  it('ошибка настройки — сразу сдаёмся, без повторов', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(
      new SheetsConfigError('Google Sheets 400: Unable to parse range'),
    )

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result.failed).toBe(1)
    const sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.failedAt).not.toBeNull()
    expect(sheets.lastError).toContain('Unable to parse range')
  })

  it('через сутки временные ошибки тоже сдаются', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', new Date(NOW.getTime() - 25 * 3600_000))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(new Error('503'))
    await processDueNotifications(channels, { now: NOW })
    expect((await row(order.id, 'sheets', 'created')).failedAt).not.toBeNull()
  })

  it('ненастроенный канал не трогается — его записи ждут', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = { sheets: null, telegram: fakeChannels().telegram }
    await processDueNotifications(channels, { now: NOW })
    const sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(0)
    expect(sheets.sentAt).toBeNull()
    expect((await row(order.id, 'telegram', 'created')).sentAt).not.toBeNull()
  })
})

describe('nextDelayMs', () => {
  it('1 мин, 5 мин, 15 мин, 1 ч, 6 ч, дальше 6 ч', () => {
    expect([1, 2, 3, 4, 5, 9].map(nextDelayMs)).toEqual([
      60_000, 300_000, 900_000, 3_600_000, 21_600_000, 21_600_000,
    ])
  })
})
