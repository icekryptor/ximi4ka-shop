import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { SheetsConfigError } from '../google/sheets.js'
import { enqueueOrderEvent } from './outbox.js'
import { RateLimitError } from './rateLimit.js'
import { TelegramBot } from '../telegram/bot.js'
import {
  GIVE_UP_AFTER_MS,
  MAX_DELIVERIES_PER_TICK,
  channelsFromEnv,
  nextDelayMs,
  processDueNotifications,
  retryWindowMs,
  type NotificationChannels,
} from './worker.js'

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

// Секретов в этих тестах нет (каналы — фейки), но лог не должен случайно
// протащить что-то похожее на токен, даже если сообщение об ошибке однажды
// станет богаче деталями запроса.
const FAKE_SECRET = 'FAKE_TELEGRAM_BOT_TOKEN_should_never_be_logged'

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined)
}

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
    const errorSpy = silenceConsoleError()

    await processDueNotifications(channels, { now: NOW })

    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(1)
    const status = await row(order.id, 'telegram', 'status:paid')
    expect(status.attempts).toBe(0)
    expect(status.sentAt).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('socket hang up'))
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(FAKE_SECRET)
    errorSpy.mockRestore()
  })

  it('карточка и статус в одном тике — статус отвечает на свежий id карточки', async () => {
    const order = await seedOrder({ status: 'paid' })
    await enqueue(order.id, 'created', minutesAgo(2))
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    const channels = fakeChannels()

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result).toEqual({ sent: 4, retried: 0, failed: 0 })
    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(2)
    expect(channels.telegram.sendMessage).toHaveBeenNthCalledWith(2, '✅ оплачен', 501)
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.telegramMessageId).toBe(501)
    expect((await row(order.id, 'telegram', 'status:paid')).sentAt).not.toBeNull()
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
    const errorSpy = silenceConsoleError()

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

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('socket hang up'))
    for (const call of errorSpy.mock.calls) expect(call.join(' ')).not.toContain(FAKE_SECRET)
    errorSpy.mockRestore()
  })

  it('ошибка настройки — сразу сдаёмся, без повторов', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(
      new SheetsConfigError('Google Sheets 400: Unable to parse range'),
    )
    const errorSpy = silenceConsoleError()

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result.failed).toBe(1)
    const sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.failedAt).not.toBeNull()
    expect(sheets.lastError).toContain('Unable to parse range')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to parse range'))
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(FAKE_SECRET)
    errorSpy.mockRestore()
  })

  it('сдаётся, когда суммарное окно повторов достигает суток', async () => {
    // Сдача считается по времени повторов, а не по возрасту записи: запись
    // сдаётся на той неудаче, после которой окно повторов доходит до суток.
    const lastAttempts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find(
      (n) => retryWindowMs(n) >= GIVE_UP_AFTER_MS,
    )!
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    await AppDataSource.query(
      `UPDATE order_notifications SET attempts = $2 WHERE order_id = $1 AND channel = 'sheets'`,
      [order.id, lastAttempts - 2],
    )
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(new Error('503'))
    const errorSpy = silenceConsoleError()

    await processDueNotifications(channels, { now: NOW })
    let sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(lastAttempts - 1)
    expect(sheets.failedAt).toBeNull()

    await processDueNotifications(channels, { now: new Date(sheets.nextAttemptAt.getTime()) })
    sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(lastAttempts)
    expect(sheets.failedAt).not.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('503'))
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(FAKE_SECRET)
    errorSpy.mockRestore()
  })

  it('старая запись, впервые встретившая временную ошибку, уходит в повтор', async () => {
    // Ключи добавили через три дня после заказа — запись ни разу не
    // пробовали, у неё целое окно повторов.
    const order = await seedOrder()
    await enqueue(order.id, 'created', new Date(NOW.getTime() - 3 * 24 * 3600_000))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(new Error('503'))
    const errorSpy = silenceConsoleError()

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result).toEqual({ sent: 1, retried: 1, failed: 0 })
    const sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.failedAt).toBeNull()
    expect(sheets.attempts).toBe(1)
    expect(sheets.nextAttemptAt.getTime()).toBe(NOW.getTime() + nextDelayMs(1))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('503'))
    errorSpy.mockRestore()
  })

  it('лимит Telegram — пауза, попытка не считается, остальные записи канала ждут', async () => {
    const orders = [await seedOrder(), await seedOrder(), await seedOrder()]
    for (const [i, o] of orders.entries()) await enqueue(o.id, 'created', minutesAgo(10 - i))
    const channels = fakeChannels()
    channels.telegram.sendMessage.mockRejectedValueOnce(
      new RateLimitError('Telegram 429: Too Many Requests: retry after 5', 5_000),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result).toEqual({ sent: 3, retried: 1, failed: 0 })
    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(1)
    const limited = await row(orders[0].id, 'telegram', 'created')
    expect(limited.attempts).toBe(0)
    expect(limited.failedAt).toBeNull()
    // Пауза не короче 30 с, даже если Telegram просит меньше.
    expect(limited.nextAttemptAt.getTime()).toBe(NOW.getTime() + 30_000)
    expect(limited.lastError).toBe('лимит Telegram, повтор через 30 с')
    for (const o of orders.slice(1)) {
      const waiting = await row(o.id, 'telegram', 'created')
      expect(waiting.attempts).toBe(0)
      expect(waiting.lastError).toBeNull()
      expect(waiting.nextAttemptAt.getTime()).toBeLessThanOrEqual(NOW.getTime())
    }
    // Другой канал доставлен как обычно.
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('лимит Telegram'))
    warnSpy.mockRestore()
  })

  it('лимит Google — пауза по Retry-After и без сдачи даже у старой записи', async () => {
    const old = await seedOrder()
    await enqueue(old.id, 'created', new Date(NOW.getTime() - 3 * 24 * 3600_000))
    await AppDataSource.query(
      `UPDATE order_notifications SET attempts = 20 WHERE order_id = $1 AND channel = 'sheets'`,
      [old.id],
    )
    const next = await seedOrder()
    await enqueue(next.id, 'created', minutesAgo(1))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValueOnce(
      new RateLimitError('Google Sheets 429: Quota exceeded', 90_000),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await processDueNotifications(channels, { now: NOW })

    const limited = await row(old.id, 'sheets', 'created')
    expect(limited.attempts).toBe(20)
    expect(limited.failedAt).toBeNull()
    expect(limited.nextAttemptAt.getTime()).toBe(NOW.getTime() + 90_000)
    expect(limited.lastError).toBe('лимит Google Таблицы, повтор через 90 с')
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(1)
    expect((await row(next.id, 'sheets', 'created')).sentAt).toBeNull()
    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })

  it('за тик не больше лимита доставок на канал, остальное ждёт следующего тика', async () => {
    // 3 за тик (10 с) — около 18 в минуту: Telegram пускает ~20 сообщений в
    // минуту в группу, Google — ~60 запросов в минуту (upsert — 2–3 запроса).
    expect(MAX_DELIVERIES_PER_TICK).toEqual({ sheets: 3, telegram: 3 })
    const perTick = Math.max(...Object.values(MAX_DELIVERIES_PER_TICK))
    const orders: Order[] = []
    for (let i = 0; i < 2 * perTick + 1; i += 1) {
      const o = await seedOrder()
      await enqueue(o.id, 'created', minutesAgo(60 - i))
      orders.push(o)
    }
    const channels = fakeChannels()

    await processDueNotifications(channels, { now: NOW })

    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(MAX_DELIVERIES_PER_TICK.telegram)
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(MAX_DELIVERIES_PER_TICK.sheets)
    // Самые старые — первыми; хвост остаётся готовым к следующему тику.
    const tail = orders[orders.length - 1]
    expect((await row(orders[0].id, 'telegram', 'created')).sentAt).not.toBeNull()
    const waiting = await row(tail.id, 'telegram', 'created')
    expect(waiting.sentAt).toBeNull()
    expect(waiting.attempts).toBe(0)

    await processDueNotifications(channels, { now: new Date(NOW.getTime() + 10_000) })
    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(
      2 * MAX_DELIVERIES_PER_TICK.telegram,
    )
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(2 * MAX_DELIVERIES_PER_TICK.sheets)
    expect((await row(tail.id, 'sheets', 'created')).sentAt).toBeNull()
  })

  it('очередь одного канала не вытесняет другой из тика', async () => {
    // Старый хвост Telegram длиннее партии; запись таблицы моложе всех.
    for (let i = 0; i < 25; i += 1) {
      const o = await seedOrder()
      await enqueue(o.id, 'created', minutesAgo(120 - i))
      await AppDataSource.query(
        `UPDATE order_notifications SET sent_at = $2 WHERE order_id = $1 AND channel = 'sheets'`,
        [o.id, minutesAgo(60)],
      )
    }
    const fresh = await seedOrder()
    await enqueue(fresh.id, 'created', minutesAgo(1))
    const channels = fakeChannels()

    await processDueNotifications(channels, { now: NOW })

    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledWith(
      fresh.orderNumber,
      expect.any(Array),
    )
    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(MAX_DELIVERIES_PER_TICK.telegram)
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

  it('заблокированные статусы не съедают партию — здоровая запись сверху доходит', async () => {
    // 21 заказ, у каждого карточка ('created' в телеграме) в бэкоффе после
    // неудачной попытки, а смена статуса уже готова к повтору — раньше эти
    // «зависшие» строки статуса всё равно попадали в выборку (next_attempt_at
    // уже прошёл) и съедали место в партии (BATCH_SIZE=20), просто пропускаясь
    // в цикле — здоровая запись вообще не доходила до обработки.
    for (let i = 0; i < 21; i += 1) {
      const order = await seedOrder({ status: 'paid' })
      await enqueue(order.id, 'created', minutesAgo(120))
      // Sheets-канал этого заказа не участвует в сценарии — считаем уже
      // доставленным, чтобы он не занимал место в партии сам по себе.
      await AppDataSource.query(
        `UPDATE order_notifications SET sent_at = $2
         WHERE order_id = $1 AND channel = 'sheets' AND event_key = 'created'`,
        [order.id, minutesAgo(119)],
      )
      // Карточка в телеграме: одна попытка уже была и ушла в бэкофф на час.
      await AppDataSource.query(
        `UPDATE order_notifications SET attempts = 1, next_attempt_at = $2
         WHERE order_id = $1 AND channel = 'telegram' AND event_key = 'created'`,
        [order.id, new Date(NOW.getTime() + 3_600_000)],
      )
      await enqueue(order.id, 'status:paid', minutesAgo(1))
      await AppDataSource.query(
        `UPDATE order_notifications SET sent_at = $2
         WHERE order_id = $1 AND channel = 'sheets' AND event_key = 'status:paid'`,
        [order.id, minutesAgo(1)],
      )
    }
    const healthy = await seedOrder()
    await enqueue(healthy.id, 'created', minutesAgo(1))

    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })

    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledWith(
      healthy.orderNumber,
      expect.any(Array),
    )
    expect(channels.telegram.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining(`Новый заказ ${healthy.orderNumber}`),
    )
  })
})

describe('channelsFromEnv', () => {
  it('битый ключ Google выключает только таблицу — Telegram работает, api не падает', () => {
    const errorSpy = silenceConsoleError()
    const channels = channelsFromEnv({
      GOOGLE_SERVICE_ACCOUNT_JSON: 'не json',
      GOOGLE_SHEETS_ID: 'SHEET123',
      TELEGRAM_BOT_TOKEN: FAKE_SECRET,
      TELEGRAM_CHAT_ID: '-1001234',
    })
    expect(channels.sheets).toBeNull()
    expect(channels.telegram).toBeInstanceOf(TelegramBot)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Google Таблица выключена — GOOGLE_SERVICE_ACCOUNT_JSON'),
    )
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(FAKE_SECRET)
    errorSpy.mockRestore()
  })
})

describe('retryWindowMs', () => {
  it('сумма запланированных пауз по таблице задержек', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(retryWindowMs)
    const minutes = table.map((ms) => ms / 60_000)
    // 1 + 5 + 15 + 60 + 360 + 360 + …
    expect(minutes).toEqual([1, 6, 21, 81, 441, 801, 1161, 1521, 1881])
    expect(retryWindowMs(0)).toBe(0)
  })

  it('впервые доходит до суток на восьмой неудаче', () => {
    expect(retryWindowMs(7)).toBeLessThan(GIVE_UP_AFTER_MS)
    expect(retryWindowMs(8)).toBeGreaterThanOrEqual(GIVE_UP_AFTER_MS)
  })
})

describe('nextDelayMs', () => {
  it('1 мин, 5 мин, 15 мин, 1 ч, 6 ч, дальше 6 ч', () => {
    expect([1, 2, 3, 4, 5, 9].map(nextDelayMs)).toEqual([
      60_000, 300_000, 900_000, 3_600_000, 21_600_000, 21_600_000,
    ])
  })
})
