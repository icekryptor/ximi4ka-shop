import { describe, expect, it, vi } from 'vitest'
import type { Order } from '../../../entities/Order.js'
import type { CloudPaymentsConfig } from './config.js'
import { createCloudPaymentsOrder, getCloudPaymentsStatus } from './client.js'

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

const config: CloudPaymentsConfig = {
  publicId: 'pk_test',
  apiSecret: 'secret_test',
  mode: 'live',
  enabled: true,
  surchargePercent: 8,
}
const env = { WEB_ORIGIN: 'https://ximi4ka.ru/', NODE_ENV: 'production' }

const order = (over: Partial<Order> = {}) =>
  ({
    orderNumber: 'XM-2026-00042',
    publicToken: 'tok en/1',
    customerEmail: 'ales@example.com',
    totalRub: 2916,
    ...over,
  }) as Order

const reply = (body: unknown, status = 200) =>
  vi.fn<FetchFn>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )

describe('createCloudPaymentsOrder', () => {
  it('создаёт ссылку: Basic-авторизация, сумма, номер заказа, возвраты на страницу заказа', async () => {
    const fetch = reply({
      Success: true,
      Model: { Id: 'gASGZ', Url: 'https://orders.cloudpayments.ru/d/gASGZ' },
    })
    const res = await createCloudPaymentsOrder(order(), { config, fetch, env })
    expect(res).toEqual({
      externalId: 'gASGZ',
      paymentUrl: 'https://orders.cloudpayments.ru/d/gASGZ',
    })

    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://api.cloudpayments.ru/orders/create')
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('pk_test:secret_test').toString('base64')}`,
    )
    expect(headers['X-Request-ID']).toBe('order-XM-2026-00042')
    expect(JSON.parse(String(init!.body))).toEqual({
      Amount: 2916,
      Currency: 'RUB',
      Description: 'Заказ XM-2026-00042 на ximi4ka.ru',
      InvoiceId: 'XM-2026-00042',
      Email: 'ales@example.com',
      RequireConfirmation: false,
      SendEmail: false,
      CultureName: 'ru-RU',
      SuccessRedirectUrl: 'https://ximi4ka.ru/order/XM-2026-00042?new=1#t=tok%20en%2F1',
      FailRedirectUrl: 'https://ximi4ka.ru/order/XM-2026-00042?payment=failed#t=tok%20en%2F1',
    })
  })

  it('без email — без поля Email', async () => {
    const fetch = reply({
      Success: true,
      Model: { Id: 'x', Url: 'https://orders.cloudpayments.ru/d/x' },
    })
    await createCloudPaymentsOrder(order({ customerEmail: '' }), { config, fetch, env })
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).not.toHaveProperty('Email')
  })

  it('ссылка не на домен CloudPayments — null; поддомены cloudpayments.ru принимаются', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const withUrl = (Url: string) => reply({ Success: true, Model: { Id: 'x', Url } })
    for (const bad of [
      'https://evil.example/d/x',
      'https://cloudpayments.ru.evil.example/d/x',
      'https://evilcloudpayments.ru/d/x',
      'http://orders.cloudpayments.ru/d/x',
      'not a url',
    ]) {
      expect(
        await createCloudPaymentsOrder(order(), { config, fetch: withUrl(bad), env }),
      ).toBeNull()
    }
    expect(
      await createCloudPaymentsOrder(order(), {
        config,
        fetch: withUrl('https://cloudpayments.ru/d/x'),
        env,
      }),
    ).toEqual({ externalId: 'x', paymentUrl: 'https://cloudpayments.ru/d/x' })
    log.mockRestore()
  })

  it('отказ, не-https ссылка, сеть, нет ключей, нет WEB_ORIGIN — null и лог без секретов', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await createCloudPaymentsOrder(order(), {
        config,
        fetch: reply({ Success: false, Message: 'secret_test bad' }),
        env,
      }),
    ).toBeNull()
    expect(
      await createCloudPaymentsOrder(order(), {
        config,
        fetch: reply({ Success: true, Model: { Id: 'x', Url: 'http://evil' } }),
        env,
      }),
    ).toBeNull()
    expect(
      await createCloudPaymentsOrder(order(), { config, fetch: reply({}, 401), env }),
    ).toBeNull()
    const down = vi.fn<FetchFn>(async () => {
      throw new Error('fetch failed')
    })
    expect(await createCloudPaymentsOrder(order(), { config, fetch: down, env })).toBeNull()
    expect(await createCloudPaymentsOrder(order(), { config: null, fetch: down, env })).toBeNull()
    expect(await createCloudPaymentsOrder(order(), { config, fetch: down, env: {} })).toBeNull()
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).not.toContain('secret_test')
    expect(logged).not.toContain('ales@example.com')
    log.mockRestore()
  })
})

describe('getCloudPaymentsStatus', () => {
  const found = (model: Record<string, unknown>, success = true) =>
    reply({
      Success: success,
      Message: null,
      Model: { InvoiceId: 'XM-2026-00042', Currency: 'RUB', TestMode: false, ...model },
    })

  it('Completed с верной суммой — paid; запрос по InvoiceId', async () => {
    const fetch = found({ Status: 'Completed', Amount: 2916 })
    expect(await getCloudPaymentsStatus(order(), { config, fetch, env })).toBe('paid')
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://api.cloudpayments.ru/payments/find')
    expect(JSON.parse(String(init!.body))).toEqual({ InvoiceId: 'XM-2026-00042' })
  })

  it('Completed с другой суммой, валютой, без валюты или тестовый на проде — unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 1 }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, Currency: 'USD' }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, Currency: undefined }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, TestMode: true }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, TestMode: true }),
        env: { NODE_ENV: 'test' },
      }),
    ).toBe('paid')
    vi.restoreAllMocks()
  })

  it('Declined / Authorized / Not found — pending (ссылка жива, покупатель может повторить)', async () => {
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Declined', Amount: 2916 }, false),
        env,
      }),
    ).toBe('pending')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Authorized', Amount: 2916 }),
        env,
      }),
    ).toBe('pending')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: reply({ Success: false, Message: 'Not found' }),
        env,
      }),
    ).toBe('pending')
  })

  it('HTTP-ошибка, сеть, нет ключей — unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getCloudPaymentsStatus(order(), { config, fetch: reply({}, 500), env })).toBe(
      'unknown',
    )
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: vi.fn<FetchFn>(async () => {
          throw new Error('x')
        }),
        env,
      }),
    ).toBe('unknown')
    expect(await getCloudPaymentsStatus(order(), { config: null, env })).toBe('unknown')
    vi.restoreAllMocks()
  })
})
