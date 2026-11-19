import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { ManualProvider } from './manual.js'
import { reconcilePendingOrders, skipWhileRunning, startReconciliationJob } from './reconcile.js'
import type { PaymentProvider } from './types.js'

const yandex = vi.hoisted(() => ({ getYandexOrderStatus: vi.fn() }))
vi.mock('./yandexPay/client.js', () => yandex)

function tbankProvider(calls: string[]): PaymentProvider {
  return {
    name: 'tbank',
    async createPayment() {
      return null
    },
    verifyAndParseWebhook() {
      return null
    },
    async getStatus(externalId: string) {
      calls.push(externalId)
      return 'paid'
    },
  }
}

async function seedOrder(overrides: Partial<Order>): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      status: 'pending',
      customerName: 'Тест',
      customerPhone: '+79000000000',
      customerEmail: '',
      deliveryAddress: { address: 'СПб', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 1000,
      shippingRub: 350,
      totalRub: 1350,
      statusHistory: [],
      ...overrides,
    }),
  )
  await AppDataSource.query(
    `UPDATE orders SET created_at = now() - interval '5 minutes' WHERE id = $1`,
    [order.id],
  )
  return order
}

describe('сверка: заказы Яндекс Пэй', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    yandex.getYandexOrderStatus.mockReset()
  })

  it('заказ Яндекса — к Яндексу по номеру, заказ Т-Кассы — как раньше', async () => {
    const tbankOrder = await seedOrder({
      orderNumber: 'XM-2026-81001',
      paymentProvider: 'tbank',
      paymentIntentId: '9001',
    })
    const yandexOrder = await seedOrder({
      orderNumber: 'XM-2026-81002',
      paymentProvider: 'yandex_pay',
      paymentIntentId: 'XM-2026-81002',
    })
    yandex.getYandexOrderStatus.mockResolvedValue('failed')
    const calls: string[] = []

    expect(await reconcilePendingOrders(tbankProvider(calls))).toEqual({ checked: 2, updated: 2 })
    expect(calls).toEqual(['9001'])
    expect(yandex.getYandexOrderStatus).toHaveBeenCalledWith('XM-2026-81002')
    const repo = AppDataSource.getRepository(Order)
    expect((await repo.findOneByOrFail({ id: tbankOrder.id })).status).toBe('paid')
    expect(await repo.findOneByOrFail({ id: yandexOrder.id })).toMatchObject({
      status: 'failed',
      statusHistory: [expect.objectContaining({ by: 'reconcile', to: 'failed' })],
    })
  })

  it('заказ Яндекса старше 8 суток больше не опрашивается, старый заказ Т-Кассы — как раньше', async () => {
    const oldYandex = await seedOrder({
      orderNumber: 'XM-2026-81004',
      paymentProvider: 'yandex_pay',
      paymentIntentId: 'XM-2026-81004',
    })
    const oldTbank = await seedOrder({
      orderNumber: 'XM-2026-81005',
      paymentProvider: 'tbank',
      paymentIntentId: '9005',
    })
    await AppDataSource.query(
      `UPDATE orders SET created_at = now() - interval '9 days' WHERE id IN ($1, $2)`,
      [oldYandex.id, oldTbank.id],
    )
    const calls: string[] = []
    expect(await reconcilePendingOrders(tbankProvider(calls))).toEqual({ checked: 1, updated: 1 })
    expect(calls).toEqual(['9005'])
    expect(yandex.getYandexOrderStatus).not.toHaveBeenCalled()
  })

  it('Яндекс ответил unknown — заказ не трогаем', async () => {
    const order = await seedOrder({
      orderNumber: 'XM-2026-81003',
      paymentProvider: 'yandex_pay',
      paymentIntentId: 'XM-2026-81003',
    })
    yandex.getYandexOrderStatus.mockResolvedValue('unknown')
    expect(await reconcilePendingOrders(new ManualProvider())).toEqual({ checked: 1, updated: 0 })
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })).status,
    ).toBe('pending')
  })
})

describe('startReconciliationJob: Яндекс', () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

  it('ручная оплата без Merchant ID — не стартует; с Merchant ID — стартует', () => {
    expect(startReconciliationJob(new ManualProvider(), env({}))).toBeNull()
    const timer = startReconciliationJob(
      new ManualProvider(),
      env({ YANDEX_PAY_MERCHANT_ID: 'M-1' }),
    )
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })
})

describe('skipWhileRunning', () => {
  it('новый запуск не стартует, пока не закончился предыдущий', async () => {
    let finish: () => void = () => {}
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const tick = skipWhileRunning(run)
    void tick()
    void tick()
    expect(run).toHaveBeenCalledTimes(1)
    finish()
    await Promise.resolve()
    await Promise.resolve()
    void tick()
    expect(run).toHaveBeenCalledTimes(2)
  })
})
