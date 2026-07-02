import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { createApp } from '../app.js'
import { generateToken } from '../lib/payments/token.js'

const TERMINAL_KEY = 'WebhookTestTerminal'
const PASSWORD = 'webhook-test-password'

async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-9${Math.floor(Math.random() * 9000 + 1000)}`,
      status: 'pending',
      customerName: 'Тест Тестов',
      customerPhone: '+79001112233',
      customerEmail: 'test@example.com',
      deliveryAddress: { address: 'Москва', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 2000,
      shippingRub: 350,
      totalRub: 2350,
      paymentProvider: 'tbank',
      paymentIntentId: '555001',
      statusHistory: [],
      ...overrides,
    }),
  )
}

function notification(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    TerminalKey: TERMINAL_KEY,
    OrderId: 'XM-2026-99999',
    Success: true,
    Status: 'CONFIRMED',
    PaymentId: 555001,
    ErrorCode: '0',
    Amount: 235000,
    ...overrides,
  }
  body.Token = generateToken(body, PASSWORD)
  return body
}

describe('POST /api/webhooks/tbank', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('TBANK_TERMINAL_KEY', TERMINAL_KEY)
    vi.stubEnv('TBANK_PASSWORD', PASSWORD)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('marks a pending order paid on CONFIRMED and answers OK', async () => {
    const order = await seedOrder()
    const res = await request(app)
      .post('/api/webhooks/tbank')
      .send(notification({ OrderId: order.orderNumber }))

    expect(res.status).toBe(200)
    expect(res.text).toBe('OK')

    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.status).toBe('paid')
    expect(updated.paidAt).not.toBeNull()
    expect(updated.statusHistory).toHaveLength(1)
    expect(updated.statusHistory[0]).toMatchObject({ from: 'pending', to: 'paid', by: 'tbank' })
  })

  it('is idempotent: a repeated notification does not duplicate history', async () => {
    const order = await seedOrder()
    const body = notification({ OrderId: order.orderNumber })
    await request(app).post('/api/webhooks/tbank').send(body).expect(200)
    const res = await request(app).post('/api/webhooks/tbank').send(body)
    expect(res.status).toBe(200)
    expect(res.text).toBe('OK')
    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.statusHistory).toHaveLength(1)
  })

  it('marks a pending order failed on REJECTED', async () => {
    const order = await seedOrder()
    await request(app)
      .post('/api/webhooks/tbank')
      .send(notification({ OrderId: order.orderNumber, Status: 'REJECTED', Success: false }))
      .expect(200)
    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.status).toBe('failed')
    expect(updated.paidAt).toBeNull()
  })

  it('never downgrades a paid order', async () => {
    const paidAt = new Date('2026-07-01T10:00:00Z')
    const order = await seedOrder({ status: 'paid', paidAt })
    await request(app)
      .post('/api/webhooks/tbank')
      .send(notification({ OrderId: order.orderNumber, Status: 'REJECTED', Success: false }))
      .expect(200)
    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.status).toBe('paid')
    expect(updated.statusHistory).toHaveLength(0)
  })

  it('ignores intermediate statuses (FORM_SHOWED) but still answers OK', async () => {
    const order = await seedOrder()
    const res = await request(app)
      .post('/api/webhooks/tbank')
      .send(notification({ OrderId: order.orderNumber, Status: 'FORM_SHOWED' }))
    expect(res.status).toBe(200)
    expect(res.text).toBe('OK')
    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.status).toBe('pending')
  })

  it('matches by order number and backfills payment_intent_id', async () => {
    const order = await seedOrder({ paymentIntentId: null })
    await request(app)
      .post('/api/webhooks/tbank')
      .send(notification({ OrderId: order.orderNumber, PaymentId: 777888 }))
      .expect(200)
    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.paymentIntentId).toBe('777888')
    expect(updated.status).toBe('paid')
  })

  it('rejects a notification with a broken signature (403)', async () => {
    const order = await seedOrder()
    const body = notification({ OrderId: order.orderNumber })
    body.Amount = 1 // tamper after signing
    const res = await request(app).post('/api/webhooks/tbank').send(body)
    expect(res.status).toBe(403)
    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(updated.status).toBe('pending')
  })

  it('answers OK for a valid notification about an unknown order', async () => {
    const res = await request(app)
      .post('/api/webhooks/tbank')
      .send(notification({ OrderId: 'XM-2026-00404', PaymentId: 999999 }))
    expect(res.status).toBe(200)
    expect(res.text).toBe('OK')
  })
})

describe('GET /api/public/orders/:number/status', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
  })

  it('returns the status payload without any PII', async () => {
    const order = await seedOrder()
    const res = await request(app).get(`/api/public/orders/${order.orderNumber}/status`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      orderNumber: order.orderNumber,
      status: 'pending',
      totalRub: 2350,
      paidAt: null,
    })
    expect(res.body.data.createdAt).toBeTruthy()
    // PII must never leak through the public endpoint.
    expect(Object.keys(res.body.data).sort()).toEqual([
      'createdAt',
      'orderNumber',
      'paidAt',
      'status',
      'totalRub',
    ])
  })

  it('returns 404 for an unknown order number', async () => {
    const res = await request(app).get('/api/public/orders/XM-2026-00404/status')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('order_not_found')
  })
})
