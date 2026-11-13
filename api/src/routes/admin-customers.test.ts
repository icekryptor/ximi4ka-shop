import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { AppDataSource } from '../config/dataSource.js'
import { AdminUser } from '../entities/AdminUser.js'
import { Customer } from '../entities/Customer.js'
import { applyCoinTransaction } from '../lib/coins/ledger.js'
import {
  authHeaders,
  loginAsAdmin,
  loginAsEditor,
  resetAccountTables,
  seedOrder,
  type AdminAuth,
} from './testUtils.js'

describe('админка: покупатели и химикоины', () => {
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
    await resetAccountTables()
    auth = await loginAsAdmin(app)
  })

  const repo = () => AppDataSource.getRepository(Customer)
  const mk = (over: Partial<Customer>) => repo().save(repo().create(over))
  const apply = (
    customerId: string,
    amount: number,
    key: string,
    orderId?: string,
    kind: 'order_cashback' | 'admin_adjust' = orderId ? 'order_cashback' : 'admin_adjust',
  ) =>
    AppDataSource.transaction((em) =>
      applyCoinTransaction(em, {
        customerId,
        amount,
        kind,
        idempotencyKey: key,
        orderId: orderId ?? null,
        comment: 'внутренний комментарий',
      }),
    )
  const adjust = (id: string, body: unknown, headers = authHeaders(auth)) =>
    request(app)
      .post(`/api/admin/customers/${id}/coins`)
      .set(headers)
      .send(body as object)
  const adjustRows = (id: string) =>
    AppDataSource.query(
      `SELECT * FROM coin_transactions WHERE customer_id = $1 AND kind = 'admin_adjust'`,
      [id],
    )

  describe('авторизация', () => {
    it('без сессии — 401 на всех маршрутах', async () => {
      const c = await mk({ email: 'a@y.ru' })
      expect((await request(app).get('/api/admin/customers')).status).toBe(401)
      expect((await request(app).get(`/api/admin/customers/${c.id}`)).status).toBe(401)
      expect(
        (
          await request(app)
            .post(`/api/admin/customers/${c.id}/coins`)
            .send({ amount: 1, comment: 'abc', requestId: randomUUID() })
        ).status,
      ).toBe(401)
    })

    it('редактору — 403', async () => {
      const editor = await loginAsEditor(app)
      const c = await mk({ email: 'a@y.ru' })
      expect((await request(app).get('/api/admin/customers').set(authHeaders(editor))).status).toBe(
        403,
      )
      expect(
        (
          await adjust(
            c.id,
            { amount: 5, comment: 'abc', requestId: randomUUID() },
            authHeaders(editor),
          )
        ).status,
      ).toBe(403)
      expect(await adjustRows(c.id)).toHaveLength(0)
    })

    it('POST без CSRF-токена — 403', async () => {
      const c = await mk({ email: 'a@y.ru' })
      const res = await request(app)
        .post(`/api/admin/customers/${c.id}/coins`)
        .set('Cookie', `${auth.sessionCookie}; ${auth.csrfCookie}`)
        .send({ amount: 5, comment: 'abc', requestId: randomUUID() })
      expect(res.status).toBe(403)
      expect(await adjustRows(c.id)).toHaveLength(0)
    })
  })

  describe('GET /api/admin/customers', () => {
    it('список: поля, баланс, число заказов без удалённых, новые сверху', async () => {
      const older = await mk({ email: 'old@y.ru', name: 'Старый' })
      await AppDataSource.query(
        `UPDATE customers SET created_at = now() - interval '1 day' WHERE id = $1`,
        [older.id],
      )
      const fresh = await mk({ email: 'new@y.ru', telegramUsername: 'newbie' })
      await apply(fresh.id, 120, 'admin_adjust:x')
      await seedOrder({ customerId: fresh.id })
      await seedOrder({ customerId: fresh.id })
      const gone = await seedOrder({ customerId: fresh.id })
      await AppDataSource.query(`UPDATE orders SET deleted_at = now() WHERE id = $1`, [gone.id])

      const res = await request(app).get('/api/admin/customers').set(authHeaders(auth))

      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(2)
      expect(res.body.data.items.map((i: { id: string }) => i.id)).toEqual([fresh.id, older.id])
      expect(res.body.data.items[0]).toEqual({
        id: fresh.id,
        email: 'new@y.ru',
        telegramUsername: 'newbie',
        name: null,
        coinBalance: 120,
        ordersCount: 2,
      })
      expect(res.body.data.items[1].ordersCount).toBe(0)
    })

    it('поиск q: по почте и по telegram_username, без учёта регистра, подстрока', async () => {
      await mk({ email: 'Anna.Petrova@mail.ru' })
      await mk({ email: 'bob@y.ru', telegramUsername: 'CoolChemist' })
      await mk({ email: 'zed@y.ru' })

      const byMail = await request(app).get('/api/admin/customers?q=PETROV').set(authHeaders(auth))
      expect(byMail.body.data.items.map((i: { email: string }) => i.email)).toEqual([
        'Anna.Petrova@mail.ru',
      ])
      expect(byMail.body.data.total).toBe(1)

      const byTg = await request(app).get('/api/admin/customers?q=chemist').set(authHeaders(auth))
      expect(byTg.body.data.items.map((i: { email: string }) => i.email)).toEqual(['bob@y.ru'])
    })

    it('q: % и _ — обычные символы, а не шаблон; кавычки безопасны', async () => {
      await mk({ email: 'a_b@y.ru' })
      await mk({ email: 'axb@y.ru' })
      const under = await request(app).get('/api/admin/customers?q=a_b').set(authHeaders(auth))
      expect(under.body.data.total).toBe(1)
      const pct = await request(app).get('/api/admin/customers?q=%25').set(authHeaders(auth))
      expect(pct.body.data.total).toBe(0)
      const quote = await request(app)
        .get(`/api/admin/customers?q=${encodeURIComponent("'; DROP TABLE customers; --")}`)
        .set(authHeaders(auth))
      expect(quote.status).toBe(200)
      expect(quote.body.data.total).toBe(0)
      expect(await repo().count()).toBe(2)
    })

    it('страницы по 50, page 1-based', async () => {
      for (let i = 0; i < 55; i++) await mk({ email: `u${String(i).padStart(2, '0')}@y.ru` })
      const p1 = await request(app).get('/api/admin/customers?page=1').set(authHeaders(auth))
      const p2 = await request(app).get('/api/admin/customers?page=2').set(authHeaders(auth))
      expect(p1.body.data.items).toHaveLength(50)
      expect(p2.body.data.items).toHaveLength(5)
      expect(p1.body.data.total).toBe(55)
      const ids = new Set(
        [...p1.body.data.items, ...p2.body.data.items].map((i: { id: string }) => i.id),
      )
      expect(ids.size).toBe(55)
    })

    it('некорректный page — 400', async () => {
      expect(
        (await request(app).get('/api/admin/customers?page=0').set(authHeaders(auth))).status,
      ).toBe(400)
    })
  })

  describe('GET /api/admin/customers/:id', () => {
    it('карточка: покупатель, баланс, операции с настоящим комментарием и админом, заказы', async () => {
      const c = await mk({ email: 'a@y.ru', name: 'Анна' })
      const other = await mk({ email: 'o@y.ru' })
      const order = await seedOrder({ customerId: c.id, status: 'paid', cashbackPromisedCoins: 30 })
      await seedOrder({ customerId: other.id })
      await apply(c.id, 25, 'admin_adjust:y')
      await apply(other.id, 77, 'admin_adjust:z')
      await apply(c.id, 30, `order_cashback:${order.id}`, order.id)

      const res = await request(app).get(`/api/admin/customers/${c.id}`).set(authHeaders(auth))

      expect(res.status).toBe(200)
      const d = res.body.data
      expect(d.customer).toMatchObject({ id: c.id, email: 'a@y.ru', name: 'Анна' })
      expect(d.coinBalance).toBe(55)
      expect(d.transactions).toHaveLength(2)
      expect(d.transactions[0]).toMatchObject({
        amount: 30,
        kind: 'order_cashback',
        orderNumber: order.orderNumber,
      })
      expect(d.transactions[1]).toMatchObject({
        amount: 25,
        kind: 'admin_adjust',
        comment: 'внутренний комментарий',
        orderNumber: null,
      })
      expect(d.orders).toHaveLength(1)
      expect(d.orders[0]).toMatchObject({
        id: order.id,
        orderNumber: order.orderNumber,
        status: 'paid',
      })
    })

    it('неизвестный и не-uuid id — 404', async () => {
      expect(
        (await request(app).get(`/api/admin/customers/${randomUUID()}`).set(authHeaders(auth)))
          .status,
      ).toBe(404)
      expect(
        (await request(app).get('/api/admin/customers/not-a-uuid').set(authHeaders(auth))).status,
      ).toBe(404)
    })
  })

  describe('POST /api/admin/customers/:id/coins', () => {
    it('+500 начисляет, пишет админа и комментарий', async () => {
      const c = await mk({ email: 'a@y.ru' })
      const res = await adjust(c.id, {
        amount: 500,
        comment: '  Подарок  ',
        requestId: randomUUID(),
      })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ balance: 500 })
      const rows = await adjustRows(c.id)
      expect(rows).toHaveLength(1)
      const admin = await AppDataSource.getRepository(AdminUser).findOneByOrFail({
        email: 'admin@test.local',
      })
      expect(rows[0]).toMatchObject({ amount: 500, comment: 'Подарок', admin_user_id: admin.id })
      expect((await repo().findOneByOrFail({ id: c.id })).coinBalance).toBe(500)
    })

    it('один requestId дважды — баланс вырос один раз, второй ответ 200', async () => {
      const c = await mk({ email: 'a@y.ru' })
      const requestId = randomUUID()
      const first = await adjust(c.id, { amount: 500, comment: 'бонус', requestId })
      const second = await adjust(c.id, { amount: 500, comment: 'бонус', requestId })
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body.data.balance).toBe(500)
      expect(await adjustRows(c.id)).toHaveLength(1)
      expect((await repo().findOneByOrFail({ id: c.id })).coinBalance).toBe(500)
    })

    it('баланс 100, −150 → 409 insufficient_coins, баланс 100, строк admin_adjust 0', async () => {
      const c = await mk({ email: 'a@y.ru' })
      await apply(c.id, 100, 'order_cashback:seed', undefined, 'order_cashback')
      const res = await adjust(c.id, { amount: -150, comment: 'штраф', requestId: randomUUID() })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('insufficient_coins')
      expect((await repo().findOneByOrFail({ id: c.id })).coinBalance).toBe(100)
      expect(await adjustRows(c.id)).toHaveLength(0)
      const own = await AppDataSource.query(`SELECT 1 FROM coin_transactions WHERE amount = -150`)
      expect(own).toHaveLength(0)
    })

    it('списание в пределах баланса проходит', async () => {
      const c = await mk({ email: 'a@y.ru' })
      await apply(c.id, 100, 'seed')
      const res = await adjust(c.id, { amount: -40, comment: 'возврат', requestId: randomUUID() })
      expect(res.status).toBe(200)
      expect(res.body.data.balance).toBe(60)
    })

    it.each([
      ['без комментария', { amount: 5 }],
      ['комментарий из пробелов', { amount: 5, comment: '   ' }],
      ['комментарий короче 3', { amount: 5, comment: 'ab' }],
      ['комментарий длиннее 500', { amount: 5, comment: 'x'.repeat(501) }],
      ['amount 0', { amount: 0, comment: 'abc' }],
      ['amount 1.5', { amount: 1.5, comment: 'abc' }],
      ['amount 100001', { amount: 100001, comment: 'abc' }],
      ['amount −100001', { amount: -100001, comment: 'abc' }],
      ['amount строкой', { amount: '5', comment: 'abc' }],
      ['без requestId', { amount: 5, comment: 'abc', noId: true }],
      ['requestId не uuid', { amount: 5, comment: 'abc', requestId: 'zzz' }],
    ])('400: %s', async (_name, body) => {
      const c = await mk({ email: 'a@y.ru' })
      const { noId, ...rest } = body as Record<string, unknown>
      const payload = noId || 'requestId' in rest ? rest : { ...rest, requestId: randomUUID() }
      const res = await adjust(c.id, payload)
      expect(res.status).toBe(400)
      expect(await adjustRows(c.id)).toHaveLength(0)
    })

    it('граница ±100000 допустима', async () => {
      const c = await mk({ email: 'a@y.ru' })
      const res = await adjust(c.id, { amount: 100000, comment: 'макс', requestId: randomUUID() })
      expect(res.status).toBe(200)
    })

    it('неизвестный покупатель и не-uuid — 404', async () => {
      const body = { amount: 5, comment: 'abc', requestId: randomUUID() }
      expect((await adjust(randomUUID(), body)).status).toBe(404)
      expect((await adjust('nope', { ...body, requestId: randomUUID() })).status).toBe(404)
    })
  })

  describe('карточка заказа в админке', () => {
    it('содержит поля кэшбека; cashbackAccruedCoins — сумма начисления или 0', async () => {
      const c = await mk({ email: 'a@y.ru' })
      const accrued = await seedOrder({
        customerId: c.id,
        status: 'delivered',
        cashbackPromisedCoins: 190,
        cashbackShortfallCoins: 10,
        deliveredAt: new Date('2026-11-01T10:00:00Z'),
        deliveryProblem: 'потеряна',
      })
      const open = await seedOrder({ customerId: c.id, status: 'paid', cashbackPromisedCoins: 50 })
      await apply(c.id, 180, `order_cashback:${accrued.id}`, accrued.id)

      const a = await request(app).get(`/api/admin/orders/${accrued.id}`).set(authHeaders(auth))
      expect(a.body.data).toMatchObject({
        cashbackPromisedCoins: 190,
        cashbackAccruedCoins: 180,
        cashbackShortfallCoins: 10,
        deliveryProblem: 'потеряна',
      })
      expect(a.body.data.deliveredAt).toBe('2026-11-01T10:00:00.000Z')

      const o = await request(app).get(`/api/admin/orders/${open.id}`).set(authHeaders(auth))
      expect(o.body.data).toMatchObject({ cashbackPromisedCoins: 50, cashbackAccruedCoins: 0 })
    })
  })
})
