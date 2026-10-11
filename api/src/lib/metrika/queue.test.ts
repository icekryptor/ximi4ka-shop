import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import type { AttributionTouch, OrderAttribution } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { MetrikaConversion } from '../../entities/MetrikaConversion.js'
import { Order } from '../../entities/Order.js'
import { seedOrder } from '../../routes/testUtils.js'
import { saveOrderWithStatusEvent } from '../notifications/outbox.js'
import { enqueueMetrikaConversion, metrikaOfflineEnabled, pickYclid } from './queue.js'

const DAY = 24 * 60 * 60 * 1000
const PAID_AT = new Date('2026-10-05T12:30:00.000Z')

function touch(overrides: Partial<AttributionTouch> = {}): AttributionTouch {
  return { at: new Date(PAID_AT.getTime() - DAY).toISOString(), landing: '/', ...overrides }
}

const ENABLED = { METRIKA_OFFLINE_ENABLED: 'true' } as NodeJS.ProcessEnv

describe('pickYclid', () => {
  const order = (attribution: OrderAttribution | null, paidAt: Date | null = PAID_AT) => ({
    attribution,
    paidAt,
  })

  it('берёт yclid последнего рекламного касания', () => {
    expect(pickYclid(order({ first: touch({ yclid: '11' }), last: touch({ yclid: '22' }) }))).toBe(
      '22',
    )
  })

  it('нет yclid в last — берёт из first', () => {
    expect(pickYclid(order({ first: touch({ yclid: '11' }), last: touch() }))).toBe('11')
  })

  it.each([
    ['нет атрибуции', null],
    ['только utm, без yclid', { last: touch({ utm_source: 'yandex' }) }],
    ['ysclid — органика, не реклама', { first: touch({ ysclid: 'lx1' }) }],
    ['yclid не из цифр (мусор или подделка)', { last: touch({ yclid: 'abc,\"def' }) }],
    ['слишком длинный yclid', { last: touch({ yclid: '1'.repeat(40) }) }],
  ])('%s — null', (_name, attribution) => {
    expect(pickYclid(order(attribution as OrderAttribution | null))).toBeNull()
  })

  it('клик старше 21 дня к моменту оплаты — null: Метрика такой визит уже не свяжет', () => {
    const old = touch({ yclid: '33', at: new Date(PAID_AT.getTime() - 22 * DAY).toISOString() })

    expect(pickYclid(order({ last: old }))).toBeNull()
  })

  it('ровно на границе 21 дня ещё подходит', () => {
    const edge = touch({ yclid: '44', at: new Date(PAID_AT.getTime() - 21 * DAY).toISOString() })

    expect(pickYclid(order({ last: edge }))).toBe('44')
  })

  it('нет paidAt — null (время конверсии неизвестно)', () => {
    expect(pickYclid(order({ last: touch({ yclid: '66' }) }, null))).toBeNull()
  })
})

describe('metrikaOfflineEnabled', () => {
  it('включено только значением true', () => {
    expect(metrikaOfflineEnabled({ METRIKA_OFFLINE_ENABLED: 'true' })).toBe(true)
    expect(metrikaOfflineEnabled({ METRIKA_OFFLINE_ENABLED: '1' })).toBe(false)
    expect(metrikaOfflineEnabled({})).toBe(false)
  })
})

describe('enqueueMetrikaConversion', () => {
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
    vi.unstubAllEnvs()
  })

  const enqueue = (order: Order, env: NodeJS.ProcessEnv = ENABLED) =>
    AppDataSource.transaction((em) => enqueueMetrikaConversion(em, order, env))
  const rows = () => AppDataSource.getRepository(MetrikaConversion).find()

  async function paidOrder(attribution: OrderAttribution | null, totalRub = 2490) {
    return seedOrder({ status: 'paid', paidAt: PAID_AT, totalRub, attribution })
  }

  it('ставит в очередь оплаченный заказ с yclid: цель, сумма, время оплаты', async () => {
    const order = await paidOrder({ last: touch({ yclid: '1234567890' }) })

    await enqueue(order)

    const [row] = await rows()
    expect(row).toMatchObject({
      orderId: order.id,
      yclid: '1234567890',
      target: 'order_paid',
      priceRub: 2490,
      state: 'pending',
      attempts: 0,
      uploadId: null,
    })
    expect(row.eventAt.toISOString()).toBe(PAID_AT.toISOString())
  })

  it('цель берётся из METRIKA_OFFLINE_TARGET', async () => {
    const order = await paidOrder({ last: touch({ yclid: '1' }) })

    await enqueue(order, { ...ENABLED, METRIKA_OFFLINE_TARGET: 'my_goal' })

    expect((await rows())[0].target).toBe('my_goal')
  })

  it('без yclid ничего не ставит', async () => {
    await enqueue(await paidOrder({ last: touch({ utm_source: 'yandex' }) }))
    await enqueue(await paidOrder(null))

    expect(await rows()).toHaveLength(0)
  })

  it('при выключенном флаге ничего не ставит (иначе включение отправило бы старые заказы)', async () => {
    await enqueue(await paidOrder({ last: touch({ yclid: '1' }) }), {})

    expect(await rows()).toHaveLength(0)
  })

  it('слишком длинная цель из env обрезается до 64 знаков, а не роняет оплату', async () => {
    const order = await paidOrder({ last: touch({ yclid: '1' }) })

    await enqueue(order, { ...ENABLED, METRIKA_OFFLINE_TARGET: 'g'.repeat(100) })

    expect((await rows())[0].target).toHaveLength(64)
  })

  it('сбой постановки в очередь не откатывает остальное в транзакции оплаты', async () => {
    const order = await paidOrder({ last: touch({ yclid: '1' }) })
    const ghost = { ...order, id: '00000000-0000-4000-8000-000000000000' } as Order
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await AppDataSource.transaction(async (em) => {
      await em.update(Order, order.id, { customerName: 'Сохранено' })
      await enqueueMetrikaConversion(em, ghost, ENABLED)
    })

    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.customerName).toBe('Сохранено')
    expect(await rows()).toHaveLength(0)
  })

  it('повтор по тому же заказу — no-op (одна конверсия на заказ)', async () => {
    const order = await paidOrder({ last: touch({ yclid: '1' }) })

    await enqueue(order)
    await enqueue(order)

    expect(await rows()).toHaveLength(1)
  })

  describe('единая точка оплаты saveOrderWithStatusEvent', () => {
    async function pendingOrder() {
      return seedOrder({
        status: 'pending',
        totalRub: 1500,
        attribution: { last: touch({ yclid: '77' }) },
      })
    }

    function markPaid(order: Order, by: 'tbank' | 'admin' | 'reconcile') {
      const from = order.status
      order.status = 'paid'
      order.paidAt = PAID_AT
      order.statusHistory = [
        ...order.statusHistory,
        { from, to: 'paid', at: PAID_AT.toISOString(), by },
      ]
      return from
    }

    it.each(['tbank', 'reconcile', 'admin'] as const)(
      'оплата (%s) ставит конверсию',
      async (by) => {
        vi.stubEnv('METRIKA_OFFLINE_ENABLED', 'true')
        const order = await pendingOrder()

        await saveOrderWithStatusEvent(order, markPaid(order, by))

        const [row] = await rows()
        expect(row).toMatchObject({ orderId: order.id, yclid: '77', priceRub: 1500 })
      },
    )

    it('смена paid → shipped и повторное сохранение paid новых конверсий не создают', async () => {
      vi.stubEnv('METRIKA_OFFLINE_ENABLED', 'true')
      const order = await pendingOrder()
      await saveOrderWithStatusEvent(order, markPaid(order, 'tbank'))
      await AppDataSource.query('DELETE FROM metrika_conversions')

      await saveOrderWithStatusEvent(order, 'paid')
      order.status = 'shipped'
      await saveOrderWithStatusEvent(order, 'paid')

      expect(await rows()).toHaveLength(0)
    })

    it('оплата без флага не ставит конверсию и не мешает оплате', async () => {
      const order = await pendingOrder()

      await saveOrderWithStatusEvent(order, markPaid(order, 'tbank'))

      expect(await rows()).toHaveLength(0)
      const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
      expect(saved.status).toBe('paid')
    })
  })
})
