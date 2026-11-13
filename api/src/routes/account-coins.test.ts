import 'reflect-metadata'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { AppDataSource } from '../config/dataSource.js'
import { Customer } from '../entities/Customer.js'
import { applyCoinTransaction } from '../lib/coins/ledger.js'
import { setMailerForTests } from '../lib/mail/mailer.js'
import {
  customerHeaders,
  loginAsCustomer,
  resetAccountTables,
  seedOrder,
  type CustomerAuth,
} from './testUtils.js'

describe('химикоины в кабинете', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  const customerByEmail = (email: string) =>
    AppDataSource.getRepository(Customer).findOneByOrFail({ email })
  const apply = (
    customerId: string,
    amount: number,
    key: string,
    over: {
      kind?: 'order_cashback' | 'order_cashback_revoke' | 'admin_adjust'
      orderId?: string
      comment?: string
    } = {},
  ) =>
    AppDataSource.transaction((em) =>
      applyCoinTransaction(em, {
        customerId,
        amount,
        kind: over.kind ?? 'order_cashback',
        idempotencyKey: key,
        orderId: over.orderId ?? null,
        comment: over.comment ?? null,
      }),
    )
  const login = (email = 'buyer@test.local'): Promise<CustomerAuth> => loginAsCustomer(app, email)

  describe('GET /api/account/coins', () => {
    it('без сессии — 401', async () => {
      expect((await request(app).get('/api/account/coins')).status).toBe(401)
    })

    it('balance 190, pending 380 при одном начисленном и одном оплаченном заказе', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      const done = await seedOrder({
        customerId: c.id,
        status: 'delivered',
        cashbackPromisedCoins: 190,
      })
      await seedOrder({ customerId: c.id, status: 'paid', cashbackPromisedCoins: 380 })
      await apply(c.id, 190, `order_cashback:${done.id}`, { orderId: done.id })

      const res = await request(app).get('/api/account/coins').set(customerHeaders(auth))

      expect(res.status).toBe(200)
      expect(res.body.data.balance).toBe(190)
      expect(res.body.data.pending).toBe(380)
      expect(res.body.data.transactions).toHaveLength(1)
      expect(res.body.data.transactions[0]).toMatchObject({
        amount: 190,
        kind: 'order_cashback',
        orderNumber: done.orderNumber,
        comment: null,
      })
    })

    it('pending считает только paid и shipped этого покупателя', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      const other = await AppDataSource.getRepository(Customer).save({ email: 'o@y.ru' })
      await seedOrder({ customerId: c.id, status: 'paid', cashbackPromisedCoins: 100 })
      await seedOrder({ customerId: c.id, status: 'shipped', cashbackPromisedCoins: 50 })
      await seedOrder({ customerId: c.id, status: 'delivered', cashbackPromisedCoins: 7 })
      await seedOrder({ customerId: c.id, status: 'pending', cashbackPromisedCoins: 7 })
      await seedOrder({ customerId: c.id, status: 'cancelled', cashbackPromisedCoins: 7 })
      await seedOrder({ customerId: c.id, status: 'failed', cashbackPromisedCoins: 7 })
      await seedOrder({ customerId: other.id, status: 'paid', cashbackPromisedCoins: 999 })

      const res = await request(app).get('/api/account/coins').set(customerHeaders(auth))
      expect(res.body.data.pending).toBe(150)
    })

    it('pending не включает заказ, который СДЭК не вручил (cdek_not_delivered)', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      await seedOrder({ customerId: c.id, status: 'shipped', cashbackPromisedCoins: 100 })
      await seedOrder({
        customerId: c.id,
        status: 'shipped',
        cashbackPromisedCoins: 40,
        deliveryProblem: 'cdek_not_delivered',
      })
      await seedOrder({
        customerId: c.id,
        status: 'shipped',
        cashbackPromisedCoins: 5,
        deliveryProblem: 'cdek_partial_delivery',
      })
      const res = await request(app).get('/api/account/coins').set(customerHeaders(auth))
      expect(res.body.data.pending).toBe(105)
    })

    it('комментарий админской корректировки скрыт, у операции без заказа orderNumber null', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      await apply(c.id, 500, 'admin_adjust:1', {
        kind: 'admin_adjust',
        comment: 'внутренняя пометка',
      })

      const res = await request(app).get('/api/account/coins').set(customerHeaders(auth))

      expect(res.body.data.transactions[0]).toMatchObject({
        amount: 500,
        kind: 'admin_adjust',
        orderNumber: null,
        comment: null,
      })
      expect(JSON.stringify(res.body)).not.toContain('внутренняя пометка')
      expect(res.body.data.transactions[0]).not.toHaveProperty('adminUserId')
    })

    it('отдаёт не больше 50 последних операций, новые сверху', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      for (let i = 1; i <= 55; i++)
        await apply(c.id, i, `admin_adjust:k${i}`, { kind: 'admin_adjust' })

      const res = await request(app).get('/api/account/coins').set(customerHeaders(auth))
      expect(res.body.data.transactions).toHaveLength(50)
      expect(res.body.data.transactions[0].amount).toBe(55)
    })

    it('изоляция: баланс, история и ожидаемое другого покупателя не видны', async () => {
      const authA = await login('a@test.local')
      const authB = await login('b@test.local')
      const a = await customerByEmail('a@test.local')
      const b = await customerByEmail('b@test.local')
      const orderB = await seedOrder({
        customerId: b.id,
        status: 'paid',
        cashbackPromisedCoins: 400,
      })
      await apply(b.id, 900, `order_cashback:${orderB.id}`, { orderId: orderB.id })
      await apply(a.id, 5, 'admin_adjust:a', { kind: 'admin_adjust' })

      const resA = await request(app).get('/api/account/coins').set(customerHeaders(authA))
      expect(resA.body.data).toMatchObject({ balance: 5, pending: 0 })
      expect(resA.body.data.transactions).toHaveLength(1)
      expect(JSON.stringify(resA.body)).not.toContain(orderB.orderNumber)

      const resB = await request(app).get('/api/account/coins').set(customerHeaders(authB))
      expect(resB.body.data).toMatchObject({ balance: 900, pending: 400 })
      expect(resB.body.data.transactions).toHaveLength(1)
    })
  })

  describe('GET /api/account/me', () => {
    it('содержит coinBalance', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      await apply(c.id, 70, 'admin_adjust:me', { kind: 'admin_adjust' })

      const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
      expect(res.status).toBe(200)
      expect(res.body.data.coinBalance).toBe(70)
    })

    it('PATCH /me тоже возвращает coinBalance', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      await apply(c.id, 70, 'admin_adjust:me2', { kind: 'admin_adjust' })
      const res = await request(app)
        .patch('/api/account/me')
        .set(customerHeaders(auth))
        .send({ name: 'Анна' })
      expect(res.body.data.coinBalance).toBe(70)
    })
  })

  describe('GET /api/account/orders', () => {
    it('заказ содержит cashbackPromisedCoins и cashbackAccrued', async () => {
      const auth = await login()
      const c = await customerByEmail('buyer@test.local')
      const accrued = await seedOrder({
        customerId: c.id,
        status: 'delivered',
        cashbackPromisedCoins: 190,
      })
      const open = await seedOrder({ customerId: c.id, status: 'paid', cashbackPromisedCoins: 380 })
      await apply(c.id, 190, `order_cashback:${accrued.id}`, { orderId: accrued.id })

      const res = await request(app).get('/api/account/orders').set(customerHeaders(auth))
      const byNumber = new Map(
        res.body.data.orders.map((o: { orderNumber: string }) => [o.orderNumber, o]),
      )
      expect(byNumber.get(accrued.orderNumber)).toMatchObject({
        cashbackPromisedCoins: 190,
        cashbackAccrued: true,
      })
      expect(byNumber.get(open.orderNumber)).toMatchObject({
        cashbackPromisedCoins: 380,
        cashbackAccrued: false,
      })
    })
  })
})
