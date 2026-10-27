import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { SiteSettings } from '../../entities/SiteSettings.js'
import { reconcilePendingOrders, startReconciliationJob } from './reconcile.js'
import type { PaymentProvider } from './types.js'

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

const fakeProvider = (): PaymentProvider => ({
  name: 'tbank',
  createPayment: vi.fn(),
  verifyAndParseWebhook: vi.fn(),
  getStatus: vi.fn(async () => 'paid' as const),
})

async function seedCloudOrder(over: Partial<Order> = {}, ageMinutes = 10): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  const o = await repo.save(
    repo.create({
      orderNumber: `XM-2026-9${Math.random().toString().slice(2, 6)}`,
      status: 'pending',
      customerName: 'Алесь Новик',
      customerPhone: '+375291234567',
      customerEmail: 'ales@example.com',
      deliveryAddress: { address: 'Минск', comment: null },
      deliveryMethod: 'cdek_manual_cis',
      subtotalRub: 2000,
      shippingRub: 700,
      paymentSurchargeRub: 216,
      totalRub: 2916,
      paymentProvider: 'cloudpayments',
      paymentIntentId: 'gASGZ',
      statusHistory: [],
      ...over,
    }),
  )
  await AppDataSource.query(
    `UPDATE orders SET created_at = now() - make_interval(mins => $1) WHERE id = $2`,
    [ageMinutes, o.id],
  )
  return o
}

const setMode = (mode: 'test' | 'live') =>
  AppDataSource.getRepository(SiteSettings).save({ id: 'default', cloudpaymentsMode: mode })

const stubFind = (model: Record<string, unknown> | null, message: string | null = null) =>
  vi.stubGlobal(
    'fetch',
    vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            Success: model?.Status === 'Completed',
            Message: message,
            Model: model,
          }),
          { status: 200 },
        ),
    ),
  )

describe('сверка CloudPayments', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', 'secret_test')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Completed с верной суммой — paid от сверки; глобальный провайдер не спрашивается', async () => {
    const provider = fakeProvider()
    const o = await seedCloudOrder()
    stubFind({ Status: 'Completed', Amount: 2916, Currency: 'RUB', TestMode: false })
    const result = await reconcilePendingOrders(provider)
    expect(result).toEqual({ checked: 1, updated: 1 })
    const after = await AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })
    expect(after.status).toBe('paid')
    expect(after.statusHistory.at(-1)).toMatchObject({ by: 'reconcile' })
    expect(provider.getStatus).not.toHaveBeenCalled()
  })

  it('другая сумма и Not found — заказ остаётся pending', async () => {
    const o = await seedCloudOrder()
    stubFind({ Status: 'Completed', Amount: 1, Currency: 'RUB', TestMode: false })
    await reconcilePendingOrders(fakeProvider())
    stubFind(null, 'Not found')
    await reconcilePendingOrders(fakeProvider())
    expect((await AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })).status).toBe(
      'pending',
    )
  })

  it('тестовый платёж на production: режим «Тест» — paid, режим «Боевой» — pending', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await setMode('test')
      const o = await seedCloudOrder()
      stubFind({ Status: 'Completed', Amount: 2916, Currency: 'RUB', TestMode: true })
      await reconcilePendingOrders(fakeProvider())
      const repo = AppDataSource.getRepository(Order)
      expect((await repo.findOneByOrFail({ id: o.id })).status).toBe('paid')

      await setMode('live')
      const live = await seedCloudOrder()
      await reconcilePendingOrders(fakeProvider())
      expect((await repo.findOneByOrFail({ id: live.id })).status).toBe('pending')
    } finally {
      await setMode('test')
    }
  })

  it('заказы старше 8 суток не опрашиваются', async () => {
    await seedCloudOrder({}, 9 * 24 * 60)
    stubFind({ Status: 'Completed', Amount: 2916, Currency: 'RUB', TestMode: false })
    expect(await reconcilePendingOrders(fakeProvider())).toEqual({ checked: 0, updated: 0 })
  })

  it('джоб стартует при одних ключах CloudPayments', () => {
    const manual: PaymentProvider = { ...fakeProvider(), name: 'manual' }
    const timer = startReconciliationJob(manual, {
      CLOUDPAYMENTS_PUBLIC_ID: 'pk',
      CLOUDPAYMENTS_API_SECRET: 's',
    })
    expect(timer).not.toBeNull()
    if (timer) clearInterval(timer)
    expect(startReconciliationJob(manual, {})).toBeNull()
  })
})
