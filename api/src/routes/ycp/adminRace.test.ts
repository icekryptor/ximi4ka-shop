import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { createApp } from '../../app.js'
import { markYcpOrderPlaced } from '../../lib/ycp/orders.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from '../testUtils.js'
import { applyYcpTestEnv, createYcpCheckout } from './testHelpers.js'

// Ручная смена статуса в админке против /checkout/placed от Яндекса: без
// блокировки строки админская отмена затирала бы оплату (потерянное обновление).
describe('админка и /checkout/placed: гонка за статус заказа', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, cdek_shipments, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const reload = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })
  const placedInput = (sessionId: string) => ({
    sessionId,
    orderId: `ya-${sessionId}`,
    paymentMethod: 'online' as const,
    onlinePaymentMethod: 'card',
    acquiringId: 'acq-1',
  })

  it('админская отмена ждёт блокировку и видит оплату: 409, а не затирание', async () => {
    const order = await createYcpCheckout(app, 'sess-lock')
    // Держим строку заказа под FOR UPDATE и «оплачиваем» её в этой же транзакции,
    // как делает /checkout/placed; админский запрос в это время уже в пути.
    const runner = AppDataSource.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()
    try {
      await runner.manager
        .getRepository(Order)
        .findOne({ where: { id: order.id }, lock: { mode: 'pessimistic_write' } })
      const pending = request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(authHeaders(auth))
        .send({ status: 'cancelled' })
        .then((r) => r)
      // Админский запрос успевает дойти до чтения заказа (с блокировкой он встанет).
      await new Promise((resolve) => setTimeout(resolve, 400))
      await runner.manager.update(Order, order.id, { status: 'paid', paidAt: new Date() })
      await runner.commitTransaction()
      const res = await pending
      expect(res.status).toBe(409)
      expect(res.body.error?.code ?? res.body.code).toBe('order_already_paid')
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction()
      await runner.release()
    }
    expect((await reload(order.id)).status).toBe('paid')
  })

  it('параллельные отмена в админке и /placed: никогда «оплачен» и «отменён» одновременно', async () => {
    for (let i = 0; i < 5; i++) {
      const sessionId = `sess-race-${i}`
      const order = await createYcpCheckout(app, sessionId)
      const [adminRes, placed] = await Promise.all([
        request(app)
          .patch(`/api/admin/orders/${order.id}/status`)
          .set(authHeaders(auth))
          .send({ status: 'cancelled' }),
        markYcpOrderPlaced(placedInput(sessionId)),
      ])
      const finalStatus = (await reload(order.id)).status
      expect(adminRes.status === 200 && placed === 'paid').toBe(false)
      if (finalStatus === 'paid') {
        expect(placed).toBe('paid')
        expect(adminRes.status).toBe(409)
      } else {
        expect(finalStatus).toBe('cancelled')
        expect(adminRes.status).toBe(200)
        expect(placed).toBe('cancelled')
      }
    }
  })
})
