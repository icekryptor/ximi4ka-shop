import 'reflect-metadata'
import { createHmac } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { createApp } from '../app.js'

const SECRET = 'test-api-secret-not-real'
const BASE = '/api/webhooks/cloudpayments'

let app: ReturnType<typeof createApp>
let seq = 0

async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-8${String(seq).padStart(4, '0')}`,
      status: 'pending',
      customerName: 'Алесь Новик',
      customerPhone: '+375291234567',
      customerEmail: 'ales@example.com',
      deliveryAddress: { address: 'Минск, ул. Ленина, 5', comment: null },
      deliveryMethod: 'cdek_manual_cis',
      subtotalRub: 2000,
      shippingRub: 700,
      paymentSurchargeRub: 216,
      totalRub: 2916,
      paymentProvider: 'cloudpayments',
      paymentIntentId: 'gASGZ',
      statusHistory: [],
      ...overrides,
    }),
  )
}

const fields = (order: Order, extra: Record<string, string> = {}) => ({
  TransactionId: '504',
  Amount: `${order.totalRub}.00`,
  Currency: 'RUB',
  InvoiceId: order.orderNumber,
  TestMode: '0',
  Status: 'Completed',
  OperationType: 'Payment',
  ...extra,
})

function post(
  kind: string,
  data: Record<string, string>,
  opts: { secret?: string; signed?: boolean } = {},
) {
  const raw = new URLSearchParams(data).toString()
  const req = request(app)
    .post(`${BASE}/${kind}`)
    .set('Content-Type', 'application/x-www-form-urlencoded')
  if (opts.signed !== false) {
    req.set(
      'Content-HMAC',
      createHmac('sha256', opts.secret ?? SECRET)
        .update(raw)
        .digest('base64'),
    )
  }
  return req.send(raw)
}

const reload = (o: Order) => AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })
const statusEvents = (o: Order) =>
  AppDataSource.getRepository(OrderNotification).countBy({ orderId: o.id })

describe('вебхуки CloudPayments', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', SECRET)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('подпись', () => {
    it('без подписи и с чужим ключом — 401, заказ не меняется', async () => {
      const o = await seedOrder()
      expect((await post('pay', fields(o), { signed: false })).status).toBe(401)
      expect((await post('pay', fields(o), { secret: 'other' })).status).toBe(401)
      expect((await reload(o)).status).toBe('pending')
    })

    it('без ключей в env — 401', async () => {
      vi.stubEnv('CLOUDPAYMENTS_API_SECRET', '')
      const o = await seedOrder()
      expect((await post('check', fields(o))).status).toBe(401)
      vi.stubEnv('CLOUDPAYMENTS_API_SECRET', SECRET)
      vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', ' ')
      expect((await post('check', fields(o))).status).toBe(401)
    })

    it('подпись проверяется до любого обращения к базе', async () => {
      const o = await seedOrder()
      const repo = vi.spyOn(AppDataSource, 'getRepository')
      const query = vi.spyOn(AppDataSource, 'query')
      expect((await post('pay', fields(o), { signed: false })).status).toBe(401)
      expect((await post('check', fields(o), { secret: 'other' })).status).toBe(401)
      expect(repo).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('check', () => {
    it('верный заказ — code 0', async () => {
      const o = await seedOrder()
      const res = await post('check', fields(o))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ code: 0 })
    })

    it('неизвестный заказ и заказ Т-Кассы — 10', async () => {
      const o = await seedOrder()
      expect((await post('check', fields(o, { InvoiceId: 'XM-NOPE' }))).body).toEqual({ code: 10 })
      const t = await seedOrder({ paymentProvider: 'tbank' })
      expect((await post('check', fields(t))).body).toEqual({ code: 10 })
    })

    it('другая сумма или валюта — 12', async () => {
      const o = await seedOrder()
      expect((await post('check', fields(o, { Amount: '2700.00' }))).body).toEqual({ code: 12 })
      expect((await post('check', fields(o, { Currency: 'USD' }))).body).toEqual({ code: 12 })
      expect((await post('check', fields(o, { Amount: 'abc' }))).body).toEqual({ code: 12 })
    })

    it('отменённый или уже оплаченный заказ — 13', async () => {
      const cancelled = await seedOrder({ status: 'cancelled' })
      expect((await post('check', fields(cancelled))).body).toEqual({ code: 13 })
      const paid = await seedOrder({ status: 'paid' })
      expect((await post('check', fields(paid))).body).toEqual({ code: 13 })
    })

    it('тестовый платёж на production — 13, вне production — 0', async () => {
      const o = await seedOrder()
      vi.stubEnv('NODE_ENV', 'production')
      expect((await post('check', fields(o, { TestMode: '1' }))).body).toEqual({ code: 13 })
      vi.stubEnv('NODE_ENV', 'test')
      expect((await post('check', fields(o, { TestMode: '1' }))).body).toEqual({ code: 0 })
    })
  })

  describe('pay', () => {
    it('оплачивает заказ: статус, история, TransactionId, событие в очереди', async () => {
      const o = await seedOrder()
      const res = await post('pay', fields(o))
      expect(res.body).toEqual({ code: 0 })
      const after = await reload(o)
      expect(after.status).toBe('paid')
      expect(after.paidAt).not.toBeNull()
      expect(after.paymentIntentId).toBe('504')
      expect(after.statusHistory.at(-1)).toMatchObject({
        from: 'pending',
        to: 'paid',
        by: 'cloudpayments',
      })
      expect(await statusEvents(o)).toBeGreaterThan(0)
    })

    it('повтор Pay — без второго события и без изменений', async () => {
      const o = await seedOrder()
      await post('pay', fields(o))
      const events = await statusEvents(o)
      const history = (await reload(o)).statusHistory.length
      const again = await post('pay', fields(o))
      expect(again.body).toEqual({ code: 0 })
      expect(await statusEvents(o)).toBe(events)
      expect((await reload(o)).statusHistory.length).toBe(history)
    })

    it('несовпавшая сумма, чужой провайдер, тест на проде, не Completed — code 0, заказ не оплачен', async () => {
      const o = await seedOrder()
      expect((await post('pay', fields(o, { Amount: '1.00' }))).body).toEqual({ code: 0 })
      const t = await seedOrder({ paymentProvider: 'tbank' })
      await post('pay', fields(t))
      vi.stubEnv('NODE_ENV', 'production')
      await post('pay', fields(o, { TestMode: '1' }))
      vi.stubEnv('NODE_ENV', 'test')
      await post('pay', fields(o, { Status: 'Authorized' }))
      expect((await reload(o)).status).toBe('pending')
      expect((await reload(t)).status).toBe('pending')
    })

    it('OperationType не Payment — code 0, заказ не оплачен, в логе тип операции', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const o = await seedOrder()
      for (const extra of [{ OperationType: 'Refund' }, { OperationType: '' }]) {
        expect((await post('pay', fields(o, extra))).body).toEqual({ code: 0 })
      }
      expect((await reload(o)).status).toBe('pending')
      expect(log.mock.calls.flat().join(' ')).toContain('OperationType=Refund')
    })

    it('второе списание с другим TransactionId — лог «ПОВТОРНОЕ списание», заказ не меняется', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const o = await seedOrder()
      await post('pay', fields(o, { TransactionId: '504' }))
      const before = await reload(o)
      // Повтор того же уведомления — не двойное списание.
      await post('pay', fields(o, { TransactionId: '504' }))
      expect(log.mock.calls.flat().join(' ')).not.toContain('ПОВТОРНОЕ списание')

      const res = await post('pay', fields(o, { TransactionId: '777' }))
      expect(res.body).toEqual({ code: 0 })
      const logged = log.mock.calls.flat().join(' ')
      expect(logged).toContain(`ПОВТОРНОЕ списание по ${o.orderNumber}`)
      expect(logged).toContain('TransactionId=777 (в заказе 504)')
      const after = await reload(o)
      expect(after.paymentIntentId).toBe('504')
      expect(after.statusHistory).toEqual(before.statusHistory)
    })

    it('второе списание по отгруженному заказу — тоже лог «ПОВТОРНОЕ списание»', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const o = await seedOrder({ status: 'shipped', paymentIntentId: '504' })
      await post('pay', fields(o, { TransactionId: '505' }))
      expect(log.mock.calls.flat().join(' ')).toContain('ПОВТОРНОЕ списание')
      expect((await reload(o)).status).toBe('shipped')
    })

    it('оплата отменённого или неуспешного заказа — «оплачен» и лог для ручной проверки', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      for (const status of ['cancelled', 'failed'] as const) {
        const o = await seedOrder({ status })
        expect((await post('pay', fields(o))).body).toEqual({ code: 0 })
        expect((await reload(o)).status).toBe('paid')
        expect(log.mock.calls.flat().join(' ')).toContain(
          `оплата пришла по заказу ${o.orderNumber} в статусе ${status} — заказ переведён в «оплачен», проверьте вручную`,
        )
      }
    })

    it('обычная оплата ожидающего заказа — без предупреждений в логе', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const o = await seedOrder()
      await post('pay', fields(o))
      expect(log).not.toHaveBeenCalled()
    })

    it('JSON-тело с верной подписью тоже принимается', async () => {
      const o = await seedOrder()
      const raw = JSON.stringify({
        ...fields(o),
        TransactionId: 505,
        Amount: o.totalRub,
        TestMode: false,
      })
      const res = await request(app)
        .post(`${BASE}/pay`)
        .set('Content-Type', 'application/json')
        .set('Content-HMAC', createHmac('sha256', SECRET).update(raw).digest('base64'))
        .send(raw)
      expect(res.body).toEqual({ code: 0 })
      expect((await reload(o)).status).toBe('paid')
    })
  })

  describe('fail', () => {
    it('отказ банка (5113) — заказ остаётся pending, в логе код причины', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const o = await seedOrder()
      const res = await post(
        'fail',
        fields(o, {
          Status: 'Declined',
          ReasonCode: '5113',
          Reason: 'Card issuer is not supported',
        }),
      )
      expect(res.body).toEqual({ code: 0 })
      expect((await reload(o)).status).toBe('pending')
      expect(log.mock.calls.flat().join(' ')).toContain('5113')
    })
  })

  it('неизвестный тип уведомления — 404', async () => {
    const o = await seedOrder()
    expect((await post('refund', fields(o))).status).toBe(404)
  })
})
