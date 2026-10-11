import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, seedOrder, type AdminAuth } from './testUtils.js'

// Все метки времени заданы со смещением +03:00: границы дней считаются по Москве.
const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const V3 = '33333333-3333-4333-8333-333333333333'
const V4 = '44444444-4444-4444-8444-444444444444'

async function seedOrderAt(
  overrides: Parameters<typeof seedOrder>[0],
  createdAt: string,
  paidAt: string | null,
  deletedAt: string | null = null,
): Promise<void> {
  const order = await seedOrder(overrides)
  await AppDataSource.query(
    // orders.created_at/deleted_at — timestamp без пояса, в проде их пишет now() во времени
    // сессии БД. Тот же момент записываем во времени сессии, иначе Postgres молча отбросил
    // бы смещение +03:00.
    `UPDATE orders
        SET created_at = ($1::timestamptz AT TIME ZONE current_setting('TimeZone')),
            paid_at = $2,
            deleted_at = ($3::timestamptz AT TIME ZONE current_setting('TimeZone'))
      WHERE id = $4`,
    [createdAt, paidAt, deletedAt, order.id],
  )
}

async function seedEvent(type: string, visitorId: string, occurredAt: string): Promise<void> {
  await AppDataSource.query(
    'INSERT INTO analytics_events (type, visitor_id, path, occurred_at) VALUES ($1, $2, $3, $4)',
    [type, visitorId, '/', occurredAt],
  )
}

async function seedCustomer(createdAt: string): Promise<string> {
  const [row] = await AppDataSource.query(
    'INSERT INTO customers (email, created_at) VALUES ($1, $2) RETURNING id',
    [`${randomUUID()}@test.local`, createdAt],
  )
  return row.id as string
}

async function seedSession(customerId: string, createdAt: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO customer_sessions (token_hash, customer_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4)`,
    [
      randomUUID().replaceAll('-', '').repeat(2),
      customerId,
      '2027-01-01T00:00:00+03:00',
      createdAt,
    ],
  )
}

describe('GET /api/admin/stats', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  const get = (query: string) =>
    request(app).get(`/api/admin/stats?${query}`).set(authHeaders(auth))

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
    auth = await loginAsAdmin(app)
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE analytics_events, customer_sessions, customers, order_items, orders RESTART IDENTITY CASCADE',
    )
  })

  it('без сессии админа — 401', async () => {
    const res = await request(app).get('/api/admin/stats?from=2026-10-05&to=2026-10-07')
    expect(res.status).toBe(401)
  })

  it('считает итоги и ряд по дням; границы дней — по Москве', async () => {
    // Период 2026-10-05..2026-10-07 по Москве = [04.10 21:00Z, 07.10 21:00Z).
    // A: создан и оплачен 05.10 → заказ и выручка 05.10.
    await seedOrderAt(
      { status: 'paid', totalRub: 1000 },
      '2026-10-05T10:00:00+03:00',
      '2026-10-05T10:05:00+03:00',
    )
    // B: создан за секунду до периода, оплачен ровно в 00:00 06.10 → только выручка 06.10.
    await seedOrderAt(
      { status: 'shipped', totalRub: 2500 },
      '2026-10-04T23:59:59+03:00',
      '2026-10-06T00:00:00+03:00',
    )
    // C: ожидает оплаты → заказ 06.10, выручки нет.
    await seedOrderAt({ status: 'pending', totalRub: 700 }, '2026-10-06T12:00:00+03:00', null)
    // D: отменён, но с paid_at → заказ 07.10 (последняя секунда), в выручку не входит.
    await seedOrderAt(
      { status: 'cancelled', totalRub: 900 },
      '2026-10-07T23:59:59+03:00',
      '2026-10-07T12:00:00+03:00',
    )
    // E: после периода (00:00 08.10) — не считается нигде.
    await seedOrderAt(
      { status: 'paid', totalRub: 5000 },
      '2026-10-08T00:00:00+03:00',
      '2026-10-08T00:00:00+03:00',
    )
    // G: создан 06.10 в 00:30 по Москве (= 05.10 21:30Z): по UTC попал бы на 05.10, по Москве — на 06.10.
    await seedOrderAt({ status: 'pending', totalRub: 400 }, '2026-10-06T00:30:00+03:00', null)
    // F: удалён мягко — не считается нигде.
    await seedOrderAt(
      { status: 'paid', totalRub: 3000 },
      '2026-10-05T11:00:00+03:00',
      '2026-10-05T11:05:00+03:00',
      '2026-10-06T09:00:00+03:00',
    )

    await seedEvent('add_to_cart', V1, '2026-10-05T12:00:00+03:00')
    await seedEvent('add_to_cart', V1, '2026-10-06T12:00:00+03:00') // тот же посетитель
    await seedEvent('add_to_cart', V2, '2026-10-07T23:59:59+03:00')
    await seedEvent('open_cart', V1, '2026-10-05T12:01:00+03:00')
    // Событие не add_to_cart от посетителя без add_to_cart в периоде: в clicks входит, в carts нет.
    await seedEvent('begin_checkout', V3, '2026-10-06T10:00:00+03:00')
    await seedEvent('begin_checkout', V3, '2026-10-04T23:59:59+03:00') // до периода
    await seedEvent('add_to_cart', V4, '2026-10-08T00:00:00+03:00') // после периода

    const c1 = await seedCustomer('2026-10-05T09:00:00+03:00')
    await seedCustomer('2026-10-06T09:00:00+03:00')
    await seedCustomer('2026-10-04T23:59:59+03:00') // до периода
    const cAfter = await seedCustomer('2026-10-08T00:00:00+03:00') // после периода
    await seedSession(c1, '2026-10-05T09:00:00+03:00')
    await seedSession(c1, '2026-10-06T09:00:00+03:00')
    await seedSession(c1, '2026-10-07T09:00:00+03:00')
    await seedSession(c1, '2026-10-04T23:59:59+03:00') // до периода
    await seedSession(cAfter, '2026-10-08T00:00:00+03:00') // после периода

    const res = await get('from=2026-10-05&to=2026-10-07')
    expect(res.status).toBe(200)
    const data = res.body.data as StatsResponse
    expect(data.from).toBe('2026-10-05')
    expect(data.to).toBe('2026-10-07')
    expect(data.totals).toEqual({
      clicks: 5, // три add_to_cart, open_cart и begin_checkout (V3) внутри периода
      carts: 2, // V1 и V2, V1 засчитан один раз; V3 только с begin_checkout — не считается
      orders: 4, // A, C, D, G
      revenueRub: 3500, // A 1000 + B 2500
      logins: 3,
      newUsers: 2,
    })
    expect(data.days).toEqual([
      { date: '2026-10-05', orders: 1, revenueRub: 1000 },
      { date: '2026-10-06', orders: 2, revenueRub: 2500 },
      { date: '2026-10-07', orders: 1, revenueRub: 0 },
    ])
  })

  it('пустая база: нули и ряд без дыр', async () => {
    const res = await get('from=2026-10-05&to=2026-10-07')
    expect(res.status).toBe(200)
    expect(res.body.data.totals).toEqual({
      clicks: 0,
      carts: 0,
      orders: 0,
      revenueRub: 0,
      logins: 0,
      newUsers: 0,
    })
    expect(res.body.data.days).toEqual([
      { date: '2026-10-05', orders: 0, revenueRub: 0 },
      { date: '2026-10-06', orders: 0, revenueRub: 0 },
      { date: '2026-10-07', orders: 0, revenueRub: 0 },
    ])
  })

  it('период из одного дня', async () => {
    const res = await get('from=2026-10-05&to=2026-10-05')
    expect(res.status).toBe(200)
    expect(res.body.data.days).toEqual([{ date: '2026-10-05', orders: 0, revenueRub: 0 }])
  })

  it('ровно 366 дней можно, 367 — нет', async () => {
    const ok = await get('from=2025-10-07&to=2026-10-07')
    expect(ok.status).toBe(200)
    expect(ok.body.data.days).toHaveLength(366)

    const tooLong = await get('from=2025-10-06&to=2026-10-07')
    expect(tooLong.status).toBe(400)
  })

  it.each([
    ['формат даты', 'from=foo&to=2026-10-07'],
    ['нет to', 'from=2026-10-05'],
    ['from позже to', 'from=2026-10-08&to=2026-10-07'],
    ['несуществующая дата', 'from=2026-02-31&to=2026-03-05'],
  ])('400: %s', async (_name, query) => {
    const res = await get(query)
    expect(res.status).toBe(400)
  })
})
