import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { MetrikaConversion } from '../../entities/MetrikaConversion.js'
import { seedOrder } from '../../routes/testUtils.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaError } from './client.js'
import { processDueConversions, startMetrikaConversionWorker } from './worker.js'

const NOW = new Date('2026-10-05T13:00:00.000Z')
const MIN = 60 * 1000
const HOUR = 60 * MIN

function uploadOk(overrides: Record<string, number | string> = {}) {
  return vi.fn().mockResolvedValue({
    uploadId: 42,
    sourceQuantity: 1,
    lineQuantity: 1,
    status: 'PREPARED',
    ...overrides,
  })
}

describe('processDueConversions', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function enqueue(
    overrides: Partial<MetrikaConversion> = {},
    createdAt: Date = new Date(NOW.getTime() - 5 * MIN),
  ) {
    const order = await seedOrder({ status: 'paid', paidAt: new Date(NOW.getTime() - 10 * MIN) })
    const repo = AppDataSource.getRepository(MetrikaConversion)
    const row = await repo.save(
      repo.create({
        orderId: order.id,
        yclid: `yclid-${order.orderNumber}`,
        target: 'order_paid',
        priceRub: 1500,
        eventAt: new Date(NOW.getTime() - 10 * MIN),
        nextAttemptAt: createdAt,
        ...overrides,
      }),
    )
    await AppDataSource.query('UPDATE metrika_conversions SET created_at = $2 WHERE id = $1', [
      row.id,
      createdAt,
    ])
    return row
  }
  const reload = (id: string) =>
    AppDataSource.getRepository(MetrikaConversion).findOneByOrFail({ id })

  it('отправляет все готовые записи одним файлом и помечает отправленными', async () => {
    const a = await enqueue()
    const b = await enqueue()
    const upload = uploadOk({ uploadId: 777, sourceQuantity: 2, lineQuantity: 2 })

    const result = await processDueConversions({ uploadConversions: upload }, '113445304', {
      now: NOW,
    })

    expect(result).toEqual({ sent: 2, retried: 0, failed: 0, unknown: 0 })
    expect(upload).toHaveBeenCalledTimes(1)
    const [counterId, rows] = upload.mock.calls[0]
    expect(counterId).toBe('113445304')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ target: 'order_paid', priceRub: 1500 })
    for (const id of [a.id, b.id]) {
      const row = await reload(id)
      expect(row).toMatchObject({ state: 'sent', uploadId: '777', lastError: null })
      expect(row.sentAt).not.toBeNull()
    }
  })

  it('пустая очередь — запроса в Метрику нет', async () => {
    const upload = uploadOk()

    const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0, unknown: 0 })
    expect(upload).not.toHaveBeenCalled()
  })

  it('не берёт отправленные, проваленные и те, чей срок ещё не пришёл', async () => {
    await enqueue({ state: 'sent' })
    await enqueue({ state: 'failed' })
    await enqueue({ nextAttemptAt: new Date(NOW.getTime() + HOUR) })
    const due = await enqueue()
    const upload = uploadOk()

    await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    expect(upload.mock.calls[0][1]).toHaveLength(1)
    expect((await reload(due.id)).state).toBe('sent')
  })

  it('время конверсии не из будущего: Метрика отклоняет такие строки', async () => {
    await enqueue({ eventAt: new Date(NOW.getTime() + HOUR) })
    const upload = uploadOk()

    await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    const [, rows] = upload.mock.calls[0]
    expect(rows[0].eventAt.getTime()).toBeLessThan(NOW.getTime())
  })

  it('ошибка ответа Метрики: attempts растёт, повтор через минуту, причина сохранена', async () => {
    const row = await enqueue()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const upload = vi.fn().mockRejectedValue(new MetrikaError(500, 'Metrika 500: boom'))

    const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    expect(result).toEqual({ sent: 0, retried: 1, failed: 0, unknown: 0 })
    const after = await reload(row.id)
    expect(after.state).toBe('pending')
    expect(after.attempts).toBe(1)
    expect(after.nextAttemptAt.getTime()).toBe(NOW.getTime() + MIN)
    expect(after.lastError).toContain('boom')
  })

  it('паузы растут: 1 мин, 5 мин, 15 мин, 1 ч, 6 ч', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const upload = vi.fn().mockRejectedValue(new MetrikaError(503, 'down'))
    const row = await enqueue()
    const delays: number[] = []

    for (let i = 0; i < 5; i += 1) {
      const current = await reload(row.id)
      const at = new Date(current.nextAttemptAt.getTime() + 1000)
      await processDueConversions({ uploadConversions: upload }, '1', { now: at })
      delays.push((await reload(row.id)).nextAttemptAt.getTime() - at.getTime())
    }

    expect(delays).toEqual([MIN, 5 * MIN, 15 * MIN, HOUR, 6 * HOUR])
  })

  it('через сутки безуспешных попыток запись сдаётся: failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const row = await enqueue({}, new Date(NOW.getTime() - 25 * HOUR))
    const upload = vi.fn().mockRejectedValue(new MetrikaError(503, 'down'))

    const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    expect(result).toEqual({ sent: 0, retried: 0, failed: 1, unknown: 0 })
    expect(await reload(row.id)).toMatchObject({ state: 'failed', lastError: 'down' })
  })

  it('429: запись откладывается на паузу из ответа, попытка не засчитывается', async () => {
    const row = await enqueue()
    const upload = vi.fn().mockRejectedValue(new RateLimitError('slow', 10 * MIN))

    await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    const after = await reload(row.id)
    expect(after.attempts).toBe(0)
    expect(after.state).toBe('pending')
    expect(after.nextAttemptAt.getTime()).toBe(NOW.getTime() + 10 * MIN)
  })

  it('Метрика приняла не все строки: предупреждение без значений, записи всё равно sent', async () => {
    await enqueue()
    await enqueue()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const upload = uploadOk({ sourceQuantity: 2, lineQuantity: 1 })

    const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    expect(result.sent).toBe(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('yclid-')
  })

  describe('захват пакета и неясный исход (дубль в Метрике хуже, чем потеря)', () => {
    const stateOf = async (id: string) => (await reload(id)).state

    it('на время отправки записи захвачены: состояние sending', async () => {
      const row = await enqueue()
      let during: string | null = null
      const upload = vi.fn().mockImplementation(async () => {
        during = await stateOf(row.id)
        return { uploadId: 1, sourceQuantity: 1, lineQuantity: 1, status: 'PREPARED' }
      })

      await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

      expect(during).toBe('sending')
      expect(await stateOf(row.id)).toBe('sent')
    })

    it('два обработчика одновременно не берут одну запись дважды', async () => {
      for (let i = 0; i < 6; i += 1) await enqueue()
      const upload = uploadOk()

      await Promise.all([
        processDueConversions({ uploadConversions: upload }, '1', { now: NOW }),
        processDueConversions({ uploadConversions: upload }, '1', { now: NOW }),
      ])

      const sentRows = upload.mock.calls.flatMap((call) => call[1] as unknown[])
      expect(sentRows).toHaveLength(6)
      expect(new Set(sentRows.map((r) => (r as { yclid: string }).yclid)).size).toBe(6)
    })

    it('таймаут или оборванное соединение: исход неизвестен, записи не повторяются', async () => {
      const row = await enqueue()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const upload = vi.fn().mockRejectedValue(new Error('socket hang up'))

      const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

      expect(result).toEqual({ sent: 0, retried: 0, failed: 0, unknown: 1 })
      expect(await stateOf(row.id)).toBe('sending')

      const next = uploadOk()
      await processDueConversions({ uploadConversions: next }, '1', {
        now: new Date(NOW.getTime() + 5 * MIN),
      })
      expect(next).not.toHaveBeenCalled()
    })

    it('зависшая в sending запись через 15 минут сдаётся с объяснением, а не уходит второй раз', async () => {
      const row = await enqueue({ state: 'sending', claimedAt: new Date(NOW.getTime() - 16 * MIN) })
      const upload = uploadOk()

      await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

      expect(upload).not.toHaveBeenCalled()
      const after = await reload(row.id)
      expect(after.state).toBe('failed')
      expect(after.lastError).toContain('исход загрузки неизвестен')
    })

    it('свежая sending-запись (другой обработчик ещё работает) не трогается', async () => {
      const row = await enqueue({ state: 'sending', claimedAt: new Date(NOW.getTime() - MIN) })

      await processDueConversions({ uploadConversions: uploadOk() }, '1', { now: NOW })

      expect(await stateOf(row.id)).toBe('sending')
    })

    it('сеть недоступна до отправки (ECONNREFUSED): точно не ушло, обычный повтор', async () => {
      const row = await enqueue()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      const upload = vi.fn().mockRejectedValue(err)

      const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

      expect(result).toEqual({ sent: 0, retried: 1, failed: 0, unknown: 0 })
      const after = await reload(row.id)
      expect(after.state).toBe('pending')
      expect(after.lastError).toContain('ECONNREFUSED')
    })

    it('ответ 2xx без данных о загрузке — исход неизвестен, не повтор', async () => {
      const row = await enqueue()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const upload = vi
        .fn()
        .mockRejectedValue(new MetrikaError(200, 'Metrika: в ответе нет uploading'))

      const result = await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

      expect(result.unknown).toBe(1)
      expect(await stateOf(row.id)).toBe('sending')
    })

    it('загрузка прошла, но запись «sent» в базу не удалась: второй загрузки нет, ошибка в логе', async () => {
      const row = await enqueue()
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const repo = AppDataSource.getRepository(MetrikaConversion)
      const original = repo.update.bind(repo)
      // Падает только запись «sent»: служебные обновления проходят как обычно.
      const update = vi.spyOn(repo, 'update').mockImplementation(async (criteria, patch) => {
        if ((patch as { state?: string }).state === 'sent') throw new Error('connection lost')
        return original(criteria, patch)
      })
      const upload = uploadOk()

      await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })
      update.mockRestore()
      await processDueConversions({ uploadConversions: upload }, '1', {
        now: new Date(NOW.getTime() + 5 * MIN),
      })

      expect(upload).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalled()
      expect(await stateOf(row.id)).toBe('sending')
    })
  })

  it('частичный приём виден: запись sent, но с пометкой в lastError', async () => {
    const row = await enqueue()
    await enqueue()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const upload = uploadOk({ sourceQuantity: 3, lineQuantity: 1 })

    await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    const after = await reload(row.id)
    expect(after.state).toBe('sent')
    expect(after.lastError).toContain('приняла не все строки')
  })

  it('шапка файла не считается: принято столько же строк, сколько отправили — без предупреждения', async () => {
    await enqueue()
    await enqueue()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const upload = uploadOk({ sourceQuantity: 3, lineQuantity: 2 })

    await processDueConversions({ uploadConversions: upload }, '1', { now: NOW })

    expect(warn).not.toHaveBeenCalled()
  })

  it('в пакете не больше 200 записей, остальные уйдут следующим тиком', async () => {
    for (let i = 0; i < 3; i += 1) await enqueue()
    const upload = uploadOk()

    await processDueConversions({ uploadConversions: upload }, '1', { now: NOW, batchSize: 2 })

    expect(upload.mock.calls[0][1]).toHaveLength(2)
    const left = await AppDataSource.getRepository(MetrikaConversion).countBy({ state: 'pending' })
    expect(left).toBe(1)
  })
})

describe('startMetrikaConversionWorker', () => {
  const PROD = { NODE_ENV: 'production' }

  it('выключен флагом — не запускается', () => {
    expect(startMetrikaConversionWorker({ env: { ...PROD } })).toBeNull()
  })

  it('вне production не запускается: боевой токен в dev-окружении не должен получать тестовые оплаты', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const timer = startMetrikaConversionWorker({
      env: { METRIKA_OFFLINE_ENABLED: 'true', METRIKA_OAUTH_TOKEN: 'tok' },
    })

    expect(timer).toBeNull()
    expect(String(warn.mock.calls[0][0])).toContain('production')
    warn.mockRestore()
  })

  it('флаг включён, но токена нет — не запускается и пишет в лог причину без секретов', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const timer = startMetrikaConversionWorker({
      env: { ...PROD, METRIKA_OFFLINE_ENABLED: 'true' },
    })

    expect(timer).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('METRIKA_OAUTH_TOKEN')
    warn.mockRestore()
  })

  it('флаг и токен есть — запускается, таймер не держит процесс', () => {
    const timer = startMetrikaConversionWorker({
      env: { ...PROD, METRIKA_OFFLINE_ENABLED: 'true', METRIKA_OAUTH_TOKEN: 'tok' },
      intervalMs: 3_600_000,
    })

    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })
})
