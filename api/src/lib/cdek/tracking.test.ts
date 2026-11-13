import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { resetAccountTables, seedOrder } from '../../routes/testUtils.js'
import { CdekError } from './client.js'
import type { CdekOrderConfig } from './orders.js'
import {
  CDEK_STATUS_DELIVERED,
  CDEK_STATUS_NOT_DELIVERED,
  CDEK_TRACK_INTERVAL_MS,
  CDEK_TRACK_MAX_AGE_MS,
  MAX_TRACKED_PER_TICK,
  classifyCdekStatuses,
  processDueTracking,
} from './tracking.js'
import { processDueShipments } from './worker.js'

const NOW = new Date('2026-11-13T12:00:00Z')
const at = (ms: number) => new Date(NOW.getTime() + ms)
const UUID = '1aa05817-5e99-4bae-99af-69b3b3c16233'

const config: CdekOrderConfig = {
  shipmentPoint: 'MSK310',
  sender: { company: 'ИП Тестова', name: 'Тестова Анна', phone: '+79990000000', email: null },
  sellerName: 'ИП Тестова',
  tariffPvz: 136,
  tariffCourier: 137,
}

// Элементы entity.statuses[] в документированной форме:
// https://apidoc.cdek.ru/#tag/order/operation/get_2
const st = (code: string, date_time: string, extra: Record<string, unknown> = {}) => ({
  code,
  name: code,
  date_time,
  ...extra,
})
const delivered = (date = '2026-11-12T10:00:00+0000', extra = {}) => st('DELIVERED', date, extra)
const info = (...statuses: unknown[]) => ({ entity: { uuid: UUID, statuses } })

describe('classifyCdekStatuses', () => {
  it('DELIVERED → delivered', () => {
    expect(classifyCdekStatuses([st('CREATED', '2026-11-01T10:00:00+0000'), delivered()])).toEqual({
      outcome: 'delivered',
      code: CDEK_STATUS_DELIVERED,
    })
  })

  it('NOT_DELIVERED → not_delivered', () => {
    expect(
      classifyCdekStatuses([st('NOT_DELIVERED', '2026-11-12T10:00:00+0000', { reason_code: '5' })]),
    ).toEqual({ outcome: 'not_delivered', code: CDEK_STATUS_NOT_DELIVERED })
  })

  it('DELIVERED с reason_code 20 → partial', () => {
    expect(classifyCdekStatuses([delivered(undefined, { reason_code: '20' })])).toEqual({
      outcome: 'partial',
      code: CDEK_STATUS_DELIVERED,
    })
  })

  it('в пути → in_transit с последним по времени кодом', () => {
    expect(
      classifyCdekStatuses([
        st('SENT_TO_RECIPIENT_CITY', '2026-11-05T10:00:00+0000'),
        st('ACCEPTED', '2026-11-01T10:00:00+0000'),
      ]),
    ).toEqual({ outcome: 'in_transit', code: 'SENT_TO_RECIPIENT_CITY' })
  })

  it('порядок элементов не важен: финальный статус не в конце', () => {
    expect(
      classifyCdekStatuses([delivered(), st('RETURNED_TO_RECIPIENT_CITY', '2026-11-13T10:00:00Z')]),
    ).toMatchObject({ outcome: 'delivered' })
  })

  it('удалённый (deleted) финальный статус игнорируется', () => {
    expect(
      classifyCdekStatuses([
        st('CREATED', '2026-11-01T10:00:00+0000'),
        delivered(undefined, { deleted: true }),
      ]),
    ).toEqual({ outcome: 'in_transit', code: 'CREATED' })
  })

  it('и DELIVERED, и NOT_DELIVERED: побеждает более поздний', () => {
    expect(
      classifyCdekStatuses([
        delivered('2026-11-10T10:00:00+0000'),
        st('NOT_DELIVERED', '2026-11-11T10:00:00+0000'),
      ]).outcome,
    ).toBe('not_delivered')
    expect(
      classifyCdekStatuses([
        delivered('2026-11-12T10:00:00+0000'),
        st('NOT_DELIVERED', '2026-11-11T10:00:00+0000'),
      ]).outcome,
    ).toBe('delivered')
  })

  it.each([undefined, null, [], 'x', 42, {}, [null, 5, { name: 'без кода' }, { code: 7 }]])(
    'мусор %j → in_transit, code null, не падает',
    (input) => {
      expect(classifyCdekStatuses(input)).toEqual({ outcome: 'in_transit', code: null })
    },
  )
})

const fakeCdek = () => ({ get: vi.fn(), post: vi.fn() })

describe('слежение за вручением', () => {
  let customerId: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await AppDataSource.query('TRUNCATE cdek_shipments RESTART IDENTITY CASCADE')
    const repo = AppDataSource.getRepository(Customer)
    customerId = (await repo.save(repo.create({ email: 'track@example.com' }))).id
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  const order = (overrides: Partial<Order> = {}) =>
    seedOrder({ status: 'shipped', customerId, cashbackPromisedCoins: 190, ...overrides })
  const ship = (orderId: string, overrides: Partial<CdekShipment> = {}) => {
    const repo = AppDataSource.getRepository(CdekShipment)
    return repo.save(
      repo.create({
        orderId,
        state: 'created',
        cdekUuid: UUID,
        cdekNumber: '10325990882',
        submittedAt: at(-3 * 24 * 3600_000),
        trackingState: 'tracking',
        nextTrackAt: at(-1000),
        ...overrides,
      }),
    )
  }
  const shipmentOf = (id: string) =>
    AppDataSource.getRepository(CdekShipment).findOneByOrFail({ id })
  const orderOf = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })
  const balance = async () =>
    (await AppDataSource.query('SELECT coin_balance FROM customers WHERE id = $1', [customerId]))[0]
      .coin_balance as number
  const run = (cdek: ReturnType<typeof fakeCdek>) => processDueTracking({ cdek, config }, NOW)

  it('poll: переход в created включает слежение, nextTrackAt = now + 3 ч', async () => {
    const o = await order({ status: 'paid' })
    const repo = AppDataSource.getRepository(CdekShipment)
    const s = await repo.save(
      repo.create({
        orderId: o.id,
        state: 'registering',
        cdekUuid: UUID,
        submittedAt: at(-30_000),
        nextAttemptAt: at(-1000),
      }),
    )
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID, cdek_number: '10325990882' },
      requests: [{ type: 'CREATE', state: 'SUCCESSFUL' }],
    })

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipmentOf(s.id)).toMatchObject({
      state: 'created',
      trackingState: 'tracking',
      nextTrackAt: at(CDEK_TRACK_INTERVAL_MS),
    })
  })

  it('вручён, заказ shipped → delivered, deliveredAt, кэшбек, trackingState delivered', async () => {
    const o = await order()
    const s = await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(delivered()))

    expect(await run(cdek)).toBe(1)

    expect(cdek.get).toHaveBeenCalledWith(`/orders/${UUID}`)
    const after = await orderOf(o.id)
    expect(after.status).toBe('delivered')
    expect(after.deliveredAt).not.toBeNull()
    expect(after.statusHistory.at(-1)).toMatchObject({ from: 'shipped', to: 'delivered' })
    expect(await balance()).toBe(190)
    expect(await shipmentOf(s.id)).toMatchObject({
      trackingState: 'delivered',
      lastCdekStatus: 'DELIVERED',
    })
  })

  it('то же для заказа в статусе paid', async () => {
    const o = await order({ status: 'paid' })
    const s = await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(delivered()))

    await run(cdek)

    expect((await orderOf(o.id)).status).toBe('delivered')
    expect(await balance()).toBe(190)
    expect((await shipmentOf(s.id)).trackingState).toBe('delivered')
  })

  it('заказ уже delivered (админ успел): статус не трогаем, кэшбек не дублируется', async () => {
    const o = await order({ status: 'delivered', deliveredAt: at(-5000) })
    const s = await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(delivered()))

    await run(cdek)

    expect((await orderOf(o.id)).deliveredAt).toEqual(at(-5000))
    expect(await balance()).toBe(0)
    expect((await shipmentOf(s.id)).trackingState).toBe('delivered')
  })

  it('не вручён → заказ остаётся shipped, deliveryProblem, not_delivered', async () => {
    const o = await order()
    const s = await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(st('NOT_DELIVERED', '2026-11-12T10:00:00+0000')))

    await run(cdek)

    expect(await orderOf(o.id)).toMatchObject({
      status: 'shipped',
      deliveryProblem: 'cdek_not_delivered',
    })
    expect(await balance()).toBe(0)
    expect((await shipmentOf(s.id)).trackingState).toBe('not_delivered')
  })

  it('частичная доставка → статус не меняется, cdek_partial_delivery, stopped', async () => {
    const o = await order()
    const s = await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(delivered(undefined, { reason_code: '20' })))

    await run(cdek)

    expect(await orderOf(o.id)).toMatchObject({
      status: 'shipped',
      deliveryProblem: 'cdek_partial_delivery',
    })
    expect(await balance()).toBe(0)
    expect((await shipmentOf(s.id)).trackingState).toBe('stopped')
  })

  it('в пути → nextTrackAt + 3 ч, lastCdekStatus обновлён', async () => {
    const o = await order()
    const s = await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(st('SENT_TO_RECIPIENT_CITY', '2026-11-12T10:00:00+0000')))

    await run(cdek)

    expect((await orderOf(o.id)).status).toBe('shipped')
    expect(await shipmentOf(s.id)).toMatchObject({
      trackingState: 'tracking',
      lastCdekStatus: 'SENT_TO_RECIPIENT_CITY',
      nextTrackAt: at(CDEK_TRACK_INTERVAL_MS),
    })
  })

  it.each(['cancelled', 'failed', 'pending'] as const)(
    'заказ %s → stopped, статус заказа не меняется, СДЭК не опрашиваем',
    async (status) => {
      const o = await order({ status })
      const s = await ship(o.id)
      const cdek = fakeCdek()

      await run(cdek)

      expect(cdek.get).not.toHaveBeenCalled()
      expect((await orderOf(o.id)).status).toBe(status)
      expect((await shipmentOf(s.id)).trackingState).toBe('stopped')
    },
  )

  it('старше 60 дней от submittedAt → stopped и cdek_tracking_timeout', async () => {
    const o = await order()
    const s = await ship(o.id, { submittedAt: at(-CDEK_TRACK_MAX_AGE_MS - 1000) })
    const cdek = fakeCdek()

    await run(cdek)

    expect(cdek.get).not.toHaveBeenCalled()
    expect(await orderOf(o.id)).toMatchObject({
      status: 'shipped',
      deliveryProblem: 'cdek_tracking_timeout',
    })
    expect((await shipmentOf(s.id)).trackingState).toBe('stopped')
  })

  it.each([429, 500, 503])(
    'ошибка СДЭК %i → состояние то же, nextTrackAt сдвинут, тик не падает',
    async (status) => {
      const o = await order()
      const s = await ship(o.id)
      const cdek = fakeCdek()
      cdek.get.mockRejectedValue(new CdekError(status, 'http_error', 'boom'))

      await expect(run(cdek)).resolves.toBe(1)

      expect((await orderOf(o.id)).status).toBe('shipped')
      expect(await shipmentOf(s.id)).toMatchObject({
        trackingState: 'tracking',
        nextTrackAt: at(CDEK_TRACK_INTERVAL_MS),
      })
    },
  )

  it('ошибка СДЭК попадает в лог с кодом и статусом, без текста СДЭК', async () => {
    const o = await order()
    await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockRejectedValue(new CdekError(503, 'http_error', 'ПДн покупателя в тексте'))

    await run(cdek)

    const lines = vi.mocked(console.warn).mock.calls.map((c) => c.join(' '))
    expect(
      lines.some((l) => l.includes(o.id) && l.includes('http_error') && l.includes('503')),
    ).toBe(true)
    expect(lines.join('\n')).not.toContain('ПДн')
  })

  it('не удалось перенести следующий опрос — это логируется, тик не падает', async () => {
    const o = await order()
    await ship(o.id)
    const cdek = fakeCdek()
    cdek.get.mockRejectedValue(new CdekError(500, 'http_error', 'boom'))
    const repo = AppDataSource.getRepository(CdekShipment)
    vi.spyOn(repo, 'update').mockRejectedValue(new Error('db down'))

    await expect(run(cdek)).resolves.toBe(1)

    const lines = vi.mocked(console.warn).mock.calls.map((c) => c.join(' '))
    expect(lines.some((l) => l.includes('не удалось перенести') && l.includes(o.id))).toBe(true)
  })

  it('заказ уже delivered (отметил админ), а СДЭК финала нет 60 дней → stopped без deliveryProblem', async () => {
    const o = await order({ status: 'delivered' })
    const s = await ship(o.id, { submittedAt: at(-CDEK_TRACK_MAX_AGE_MS - 1000) })
    const cdek = fakeCdek()

    await run(cdek)

    expect(cdek.get).not.toHaveBeenCalled()
    expect(await orderOf(o.id)).toMatchObject({ status: 'delivered', deliveryProblem: null })
    expect(await shipmentOf(s.id)).toMatchObject({ trackingState: 'stopped', nextTrackAt: null })
  })

  it("отправления с trackingState='none' и ещё не подошедшие по времени не опрашиваются", async () => {
    const a = await order()
    const b = await order()
    await ship(a.id, { trackingState: 'none', nextTrackAt: null })
    await ship(b.id, { nextTrackAt: at(60_000) })
    const cdek = fakeCdek()

    expect(await run(cdek)).toBe(0)
    expect(cdek.get).not.toHaveBeenCalled()
  })

  it('не больше MAX_TRACKED_PER_TICK отправлений за тик', async () => {
    for (let i = 0; i < MAX_TRACKED_PER_TICK + 2; i += 1) {
      const o = await order()
      await ship(o.id, { cdekUuid: `00000000-0000-4000-8000-00000000000${i}` })
    }
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(info(st('ACCEPTED', '2026-11-12T10:00:00+0000')))

    expect(await run(cdek)).toBe(MAX_TRACKED_PER_TICK)
  })
})
