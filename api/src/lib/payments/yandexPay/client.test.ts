import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Order } from '../../../entities/Order.js'
import { createYandexOrder, getYandexOrderStatus, mapYandexStatus } from './client.js'
import { yandexPayConfigFrom, type YandexPayConfig } from './config.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const API_KEY = 'test-api-key-not-real'
const ENV = {
  WEB_ORIGIN: 'https://ximi4ka.ru',
  TBANK_RECEIPT_TAX: 'none',
} as unknown as NodeJS.ProcessEnv

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

function cfg(mode: 'sandbox' | 'production' = 'production', apiKey = API_KEY): YandexPayConfig {
  return yandexPayConfigFrom({ yandexPayEnabled: true, yandexPayMode: mode }, {
    YANDEX_PAY_MERCHANT_ID: MERCHANT,
    YANDEX_PAY_API_KEY: apiKey,
  } as unknown as NodeJS.ProcessEnv)!
}

function order(extra: Partial<Order> = {}): Order {
  return {
    orderNumber: 'XM-2026-00042',
    publicToken: 'tok 123',
    items: [
      {
        productId: 'p1',
        productSnapshot: { name: 'Реагент', sku: null, priceRub: 100 },
        quantity: 2,
        unitPriceRub: 100,
        lineTotalRub: 200,
        isGift: false,
      },
    ],
    shippingRub: 350,
    promoDiscountRub: 0,
    totalRub: 550,
    customerEmail: 'buyer@example.com',
    customerPhone: '+79001234567',
    ...extra,
  } as unknown as Order
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const created = () =>
  vi.fn<FetchFn>(async () =>
    json({ code: 200, status: 'success', data: { paymentUrl: 'https://pay.ya.ru/l/abc' } }),
  )

function sent(fetchMock: ReturnType<typeof vi.fn<FetchFn>>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('mapYandexStatus', () => {
  it('сводит статусы Яндекса к статусам заказа', () => {
    expect(mapYandexStatus('CAPTURED')).toBe('paid')
    expect(mapYandexStatus('CONFIRMED')).toBe('paid')
    expect(mapYandexStatus('FAILED')).toBe('failed')
    expect(mapYandexStatus('VOIDED')).toBe('failed')
    for (const s of [
      'PENDING',
      'AUTHORIZED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      '',
      null,
      undefined,
    ]) {
      expect(mapYandexStatus(s)).toBe('pending')
    }
  })
})

describe('createYandexOrder', () => {
  it('боевой API, Api-Key, корзина, CARD+SPLIT, адреса возврата с секретом во фрагменте', async () => {
    const fetchMock = created()
    const result = await createYandexOrder(
      order(),
      {},
      { config: cfg(), fetch: fetchMock, env: ENV },
    )

    expect(result).toEqual({ externalId: 'XM-2026-00042', paymentUrl: 'https://pay.ya.ru/l/abc' })
    const { url, init, headers, body } = sent(fetchMock)
    expect(url).toBe('https://pay.yandex.ru/api/merchant/v1/orders')
    expect(init.method).toBe('POST')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(headers.Authorization).toBe(`Api-Key ${API_KEY}`)
    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(body).toMatchObject({
      orderId: 'XM-2026-00042',
      currencyCode: 'RUB',
      availablePaymentMethods: ['CARD', 'SPLIT'],
      fiscalContact: 'buyer@example.com',
      cart: { total: { amount: '550.00' } },
    })
    expect(body).not.toHaveProperty('preferredPaymentMethod')
    expect(body?.redirectUrls).toEqual({
      onSuccess: 'https://ximi4ka.ru/order/XM-2026-00042?new=1#t=tok%20123',
      onError: 'https://ximi4ka.ru/order/XM-2026-00042?payment=failed#t=tok%20123',
      onAbort: 'https://ximi4ka.ru/order/XM-2026-00042?payment=failed#t=tok%20123',
    })
  })

  it('ttl заказа — 3 суток: потом Яндекс сам переводит его в FAILED и сверка его отпускает', async () => {
    const fetchMock = created()
    await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV })
    expect(sent(fetchMock).body).toMatchObject({ ttl: 259200 })
  })

  it('Сплит — preferredPaymentMethod = SPLIT', async () => {
    const fetchMock = created()
    await createYandexOrder(
      order(),
      { preferSplit: true },
      { config: cfg(), fetch: fetchMock, env: ENV },
    )
    expect(sent(fetchMock).body).toMatchObject({ preferredPaymentMethod: 'SPLIT' })
  })

  it('песочница: свой хост, ключ — Merchant ID', async () => {
    const fetchMock = created()
    await createYandexOrder(order(), {}, { config: cfg('sandbox'), fetch: fetchMock, env: ENV })
    const { url, headers } = sent(fetchMock)
    expect(url).toBe('https://sandbox.pay.yandex.ru/api/merchant/v1/orders')
    expect(headers.Authorization).toBe(`Api-Key ${MERCHANT}`)
  })

  it('налог позиций — из TBANK_RECEIPT_TAX', async () => {
    const fetchMock = created()
    await createYandexOrder(
      order(),
      {},
      {
        config: cfg(),
        fetch: fetchMock,
        env: { ...ENV, TBANK_RECEIPT_TAX: 'vat22' } as NodeJS.ProcessEnv,
      },
    )
    const items = (sent(fetchMock).body?.cart as { items: Array<{ receipt: { tax: number } }> })
      .items
    expect(items.every((i) => i.receipt.tax === 11)).toBe(true)
  })

  it('отказ Яндекса → null; в логе HTTP и код, без ключа, секрета и почты', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<FetchFn>(async () =>
      json(
        {
          status: 'fail',
          reasonCode: 'ORDER_CART_DATA_ERROR',
          reason: 'bad cart for buyer@example.com tok 123',
        },
        400,
      ),
    )
    expect(
      await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV }),
    ).toBeNull()
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('HTTP 400')
    expect(line).toContain('ORDER_CART_DATA_ERROR')
    expect(line).not.toContain(API_KEY)
    expect(line).not.toContain('buyer@example.com')
    expect(line).not.toContain('tok 123')
  })

  it('сеть упала → null, код причины в логе', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<FetchFn>(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    })
    expect(
      await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV }),
    ).toBeNull()
    expect(String(spy.mock.calls[0]?.[0])).toContain('ECONNREFUSED')
  })

  it('ответ без paymentUrl → null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<FetchFn>(async () => json({ status: 'success', data: {} }))
    expect(
      await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV }),
    ).toBeNull()
  })

  it('корзина не сходится, нет конфигурации, ключа или WEB_ORIGIN — null и запроса нет', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = created()
    expect(
      await createYandexOrder(
        order({ totalRub: 1 }),
        {},
        { config: cfg(), fetch: fetchMock, env: ENV },
      ),
    ).toBeNull()
    expect(
      await createYandexOrder(order(), {}, { config: null, fetch: fetchMock, env: ENV }),
    ).toBeNull()
    expect(
      await createYandexOrder(
        order(),
        {},
        { config: cfg('production', ''), fetch: fetchMock, env: ENV },
      ),
    ).toBeNull()
    expect(
      await createYandexOrder(
        order(),
        {},
        { config: cfg(), fetch: fetchMock, env: {} as NodeJS.ProcessEnv },
      ),
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getYandexOrderStatus', () => {
  it('читает data.order.paymentStatus', async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      json({
        status: 'success',
        data: { order: { orderId: 'XM-2026-00042', paymentStatus: 'CAPTURED' } },
      }),
    )
    expect(await getYandexOrderStatus('XM-2026-00042', { config: cfg(), fetch: fetchMock })).toBe(
      'paid',
    )
    const { url, init } = sent(fetchMock)
    expect(url).toBe('https://pay.yandex.ru/api/merchant/v1/orders/XM-2026-00042')
    expect(init.method).toBe('GET')
  })

  it('ошибка, пустой статус, нет конфигурации или ключа → unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await getYandexOrderStatus('X', {
        config: cfg(),
        fetch: vi.fn<FetchFn>(async () => json({}, 500)),
      }),
    ).toBe('unknown')
    expect(
      await getYandexOrderStatus('X', {
        config: cfg(),
        fetch: vi.fn<FetchFn>(async () => json({ data: { order: { paymentStatus: null } } })),
      }),
    ).toBe('unknown')
    const never = vi.fn<FetchFn>()
    expect(await getYandexOrderStatus('X', { config: null, fetch: never })).toBe('unknown')
    expect(await getYandexOrderStatus('X', { config: cfg('production', ''), fetch: never })).toBe(
      'unknown',
    )
    expect(never).not.toHaveBeenCalled()
  })
})
