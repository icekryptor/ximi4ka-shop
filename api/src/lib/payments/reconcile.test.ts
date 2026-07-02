import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { applyPaymentStatus } from './orderStatus.js'
import {
  reconcilePendingOrders,
  startReconciliationJob,
} from './reconcile.js'
import { ManualProvider } from './manual.js'
import type { PaymentProvider, PaymentStatus } from './types.js'

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    status: 'pending',
    paidAt: null,
    statusHistory: [],
    ...overrides,
  } as Order
}

describe('applyPaymentStatus (mapping rules)', () => {
  it('pending → paid sets paidAt and appends history', () => {
    const order = makeOrder()
    const now = new Date('2026-07-02T12:00:00Z')
    expect(applyPaymentStatus(order, 'paid', 'reconcile', now)).toBe(true)
    expect(order.status).toBe('paid')
    expect(order.paidAt).toEqual(now)
    expect(order.statusHistory).toEqual([
      { from: 'pending', to: 'paid', at: now.toISOString(), by: 'reconcile' },
    ])
  })

  it('pending → failed does not set paidAt', () => {
    const order = makeOrder()
    expect(applyPaymentStatus(order, 'failed', 'tbank')).toBe(true)
    expect(order.status).toBe('failed')
    expect(order.paidAt).toBeNull()
  })

  it('pending events and same-status repeats are no-ops', () => {
    const order = makeOrder()
    expect(applyPaymentStatus(order, 'pending', 'tbank')).toBe(false)
    order.status = 'paid'
    expect(applyPaymentStatus(order, 'paid', 'tbank')).toBe(false)
    expect(order.statusHistory).toEqual([])
  })

  it('paid is terminal: failed never downgrades it', () => {
    const order = makeOrder({ status: 'paid', paidAt: new Date() })
    expect(applyPaymentStatus(order, 'failed', 'tbank')).toBe(false)
    expect(order.status).toBe('paid')
  })

  it('failed does not override a manual cancellation', () => {
    const order = makeOrder({ status: 'cancelled' })
    expect(applyPaymentStatus(order, 'failed', 'tbank')).toBe(false)
    expect(order.status).toBe('cancelled')
  })

  it('paid overrides cancelled/failed — money arrived', () => {
    const cancelled = makeOrder({ status: 'cancelled' })
    expect(applyPaymentStatus(cancelled, 'paid', 'tbank')).toBe(true)
    expect(cancelled.status).toBe('paid')

    const failed = makeOrder({ status: 'failed' })
    expect(applyPaymentStatus(failed, 'paid', 'reconcile')).toBe(true)
    expect(failed.status).toBe('paid')
  })
})

function fakeProvider(status: PaymentStatus | 'unknown'): PaymentProvider & {
  calls: string[]
} {
  const calls: string[] = []
  return {
    name: 'tbank',
    calls,
    async createPayment() {
      return null
    },
    verifyAndParseWebhook() {
      return null
    },
    async getStatus(externalId: string) {
      calls.push(externalId)
      return status
    },
  }
}

describe('reconcilePendingOrders', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
  })

  async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
    const repo = AppDataSource.getRepository(Order)
    const order = await repo.save(
      repo.create({
        orderNumber: `XM-2026-8${Math.floor(Math.random() * 9000 + 1000)}`,
        status: 'pending',
        customerName: 'Тест',
        customerPhone: '+79000000000',
        customerEmail: '',
        deliveryAddress: { address: 'СПб', comment: null },
        deliveryMethod: 'cdek_pvz',
        subtotalRub: 1000,
        shippingRub: 350,
        totalRub: 1350,
        paymentProvider: 'tbank',
        paymentIntentId: '9001',
        statusHistory: [],
        ...overrides,
      }),
    )
    return order
  }

  async function ageOrder(id: string, minutes: number): Promise<void> {
    await AppDataSource.query(
      `UPDATE orders SET created_at = now() - ($2 || ' minutes')::interval WHERE id = $1`,
      [id, String(minutes)],
    )
  }

  it('settles stale pending orders with an external id to paid', async () => {
    const stale = await seedOrder()
    await ageOrder(stale.id, 5)
    const provider = fakeProvider('paid')

    const result = await reconcilePendingOrders(provider)
    expect(result).toEqual({ checked: 1, updated: 1 })
    expect(provider.calls).toEqual(['9001'])

    const updated = await AppDataSource.getRepository(Order).findOneByOrFail({ id: stale.id })
    expect(updated.status).toBe('paid')
    expect(updated.paidAt).not.toBeNull()
    expect(updated.statusHistory[0]).toMatchObject({ by: 'reconcile', to: 'paid' })
  })

  it('skips fresh orders, orders without external id, and non-pending orders', async () => {
    await seedOrder() // fresh — younger than 2 minutes
    const noIntent = await seedOrder({ paymentIntentId: null })
    await ageOrder(noIntent.id, 10)
    const paid = await seedOrder({ status: 'paid' })
    await ageOrder(paid.id, 10)

    const provider = fakeProvider('paid')
    const result = await reconcilePendingOrders(provider)
    expect(result).toEqual({ checked: 0, updated: 0 })
    expect(provider.calls).toEqual([])
  })

  it('leaves orders untouched when the provider answers unknown or pending', async () => {
    const stale = await seedOrder()
    await ageOrder(stale.id, 5)

    expect(await reconcilePendingOrders(fakeProvider('unknown'))).toEqual({
      checked: 1,
      updated: 0,
    })
    expect(await reconcilePendingOrders(fakeProvider('pending'))).toEqual({
      checked: 1,
      updated: 0,
    })
    const untouched = await AppDataSource.getRepository(Order).findOneByOrFail({ id: stale.id })
    expect(untouched.status).toBe('pending')
  })
})

describe('startReconciliationJob', () => {
  it('does not start for the manual provider', () => {
    expect(startReconciliationJob(new ManualProvider())).toBeNull()
  })

  it('starts an interval timer for tbank and can be stopped', () => {
    const timer = startReconciliationJob(fakeProvider('unknown'))
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })
})
