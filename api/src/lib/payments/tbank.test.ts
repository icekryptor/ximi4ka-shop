import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Order } from '../../entities/Order.js'
import { generateToken, verifyToken } from './token.js'
import { TBankProvider, mapTbankStatus, type Fetch } from './tbank.js'
import { ManualProvider } from './manual.js'
import { getPaymentProvider, resolvePaymentProviderName } from './index.js'

// Провайдер по умолчанию берёт fetch из tbankTransport.js (tbankFetch) —
// подменяем модуль, чтобы «дефолтный» путь тоже не бил в сеть, если тест его
// не переопределит явным cfg.fetch (см. describe ниже про дефолтный транспорт).
// vi.mock поднимается вверх файла автоматически — переменную для фабрики
// приходится объявлять через vi.hoisted, иначе она ещё не инициализирована
// в момент подъёма (см. документацию vitest).
const tbankFetchMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ Success: true, PaymentId: 1, PaymentURL: 'https://pay/1' }),
  })),
)
vi.mock('./tbankTransport.js', () => ({ tbankFetch: tbankFetchMock }))

const CFG = {
  terminalKey: 'TestTerminal',
  password: 'secret-password',
  apiUrl: 'https://securepay.example.test/v2/',
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    orderNumber: 'XM-2026-00001',
    totalRub: 3450,
    customerPhone: '+79001234567',
    customerEmail: 'buyer@example.com',
    ...overrides,
  } as Order
}

// Мок fetch, инжектируемый через TBankConfig.fetch — НИКОГДА не бьёт в
// реальную сеть (провайдер больше не трогает глобальный/undici fetch
// напрямую, когда конфиг задаёт свой).
function mockFetchOnce(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> & Fetch {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as ReturnType<typeof vi.fn> & Fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  tbankFetchMock.mockClear()
})

describe('mapTbankStatus', () => {
  it('maps AUTHORIZED and CONFIRMED to paid', () => {
    expect(mapTbankStatus('AUTHORIZED')).toBe('paid')
    expect(mapTbankStatus('CONFIRMED')).toBe('paid')
  })

  it('maps terminal failures to failed', () => {
    for (const s of ['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'AUTH_FAIL']) {
      expect(mapTbankStatus(s)).toBe('failed')
    }
  })

  it('maps intermediate statuses to pending', () => {
    for (const s of ['NEW', 'FORM_SHOWED', 'AUTHORIZING', '3DS_CHECKING', 'CONFIRMING']) {
      expect(mapTbankStatus(s)).toBe('pending')
    }
  })
})

describe('TBankProvider.createPayment', () => {
  it('POSTs Init with kopecks, order number and a valid Token', async () => {
    const fetchMock = mockFetchOnce({
      Success: true,
      PaymentId: 700001,
      PaymentURL: 'https://securepay.example.test/pay/1',
      Status: 'NEW',
    })
    const provider = new TBankProvider({ ...CFG, fetch: fetchMock })
    const result = await provider.createPayment(makeOrder())

    expect(result).toEqual({
      externalId: '700001',
      paymentUrl: 'https://securepay.example.test/pay/1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://securepay.example.test/v2/Init')
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.TerminalKey).toBe(CFG.terminalKey)
    expect(sent.Amount).toBe(345000) // 3450 ₽ → kopecks
    expect(sent.OrderId).toBe('XM-2026-00001')
    expect(sent.DATA).toEqual({ Phone: '+79001234567', Email: 'buyer@example.com' })
    // The Token must verify against the sent body with the terminal password
    // (DATA is nested → excluded automatically).
    expect(verifyToken(sent, CFG.password, sent.Token as string)).toBe(true)
  })

  it('returns the buyer to their own order page, secret included, when the site origin is known', async () => {
    const fetchMock = mockFetchOnce({ Success: true, PaymentId: 1, PaymentURL: 'https://pay/1' })
    const provider = new TBankProvider({
      ...CFG,
      returnOrigin: 'https://new.ximi4ka.ru/',
      successUrl: 'https://new.ximi4ka.ru/success',
      fetch: fetchMock,
    })
    await provider.createPayment(makeOrder({ publicToken: 'a1b2c3' }))
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.SuccessURL).toBe('https://new.ximi4ka.ru/order/XM-2026-00001?new=1#t=a1b2c3')
    expect(sent.FailURL).toBe('https://new.ximi4ka.ru/order/XM-2026-00001?payment=failed#t=a1b2c3')
    // Адреса — строки верхнего уровня, они входят в подпись.
    expect(verifyToken(sent, CFG.password, sent.Token as string)).toBe(true)
  })

  it('falls back to the static success/fail URLs without a site origin', async () => {
    const fetchMock = mockFetchOnce({ Success: true, PaymentId: 1, PaymentURL: 'https://pay/1' })
    const provider = new TBankProvider({
      ...CFG,
      returnOrigin: '',
      successUrl: 'https://shop.test/success',
      failUrl: 'https://shop.test/fail',
      fetch: fetchMock,
    })
    await provider.createPayment(makeOrder({ publicToken: 'a1b2c3' }))
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].body as string,
    )
    expect(sent.SuccessURL).toBe('https://shop.test/success')
    expect(sent.FailURL).toBe('https://shop.test/fail')
  })

  it('returns null when Init responds Success=false', async () => {
    const fetchMock = mockFetchOnce({ Success: false, ErrorCode: '9999', Message: 'nope' })
    const provider = new TBankProvider({ ...CFG, fetch: fetchMock })
    expect(await provider.createPayment(makeOrder())).toBeNull()
  })

  describe('Init rejection log', () => {
    const rejected = {
      Success: false,
      ErrorCode: '309',
      Message: 'Неверные параметры.',
      Details: 'Поле Phone имеет неверный формат',
    }

    // Возвращает единственную строку лога и ключи тела, реально ушедшего в банк.
    async function rejectedLog(body: unknown): Promise<{ line: string; sentKeys: string[] }> {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        const fetchMock = mockFetchOnce(body)
        const provider = new TBankProvider({
          ...CFG,
          returnOrigin: 'https://shop.test',
          notificationUrl: 'https://shop.test/api/webhooks/tbank',
          fetch: fetchMock,
        })
        expect(await provider.createPayment(makeOrder({ publicToken: 'a1b2c3d4' }))).toBeNull()
        expect(spy).toHaveBeenCalledTimes(1)
        const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
        return {
          line: spy.mock.calls[0].join(' '),
          sentKeys: Object.keys(JSON.parse(init.body as string) as Record<string, unknown>),
        }
      } finally {
        spy.mockRestore()
      }
    }

    it('shows the bank Details so the failing parameter can be named', async () => {
      const { line } = await rejectedLog(rejected)
      expect(line).toContain('ErrorCode=309')
      expect(line).toContain('Неверные параметры.')
      expect(line).toContain('Details=Поле Phone имеет неверный формат')
    })

    it('lists exactly the parameter names that were sent, never their values', async () => {
      const { line, sentKeys } = await rejectedLog(rejected)
      const logged = /params=(\S+)/.exec(line)?.[1].split(',') ?? []
      expect([...logged].sort()).toEqual([...sentKeys].sort())
      // Ни пароль терминала, ни подпись, ни секрет заказа, ни данные покупателя.
      expect(line).not.toContain('a1b2c3d4')
      expect(line).not.toContain('+79001234567')
      expect(line).not.toContain('buyer@example.com')
      expect(line).not.toMatch(/[0-9a-f]{64}/)
    })

    it('keeps one line and caps Details at 300 characters', async () => {
      const { line } = await rejectedLog({
        ...rejected,
        Details: `первая\nвторая\r\n${'x'.repeat(1000)}`,
      })
      expect(line).not.toMatch(/[\r\n]/)
      const details = /Details=(.*) params=/.exec(line)?.[1]
      expect(details).toHaveLength(300)
      expect(details?.startsWith('первая вторая x')).toBe(true)
    })

    it('shows a blank Details as a dash', async () => {
      const { line } = await rejectedLog({ ...rejected, Details: '  \n ' })
      expect(line).toContain('Details=- ')
    })

    it('strips control characters and bidi overrides from every bank text', async () => {
      const { line } = await rejectedLog({
        Success: false,
        ErrorCode: '3\x1b[31m09',
        Message: 'a\x1b[31mb\u0085c\u202ed',
        Details: 'x\x00y\x07z',
      })
      expect(line).toContain('ErrorCode=3 [31m09')
      expect(line).toContain('Message=a [31mb c d')
      expect(line).toContain('Details=x y z')
      // eslint-disable-next-line no-control-regex
      expect(line).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202e]/)
    })

    it('masks our own secrets when the bank quotes them back in the text', async () => {
      const { line } = await rejectedLog({
        Success: false,
        ErrorCode: '309',
        Message: 'Неверные параметры.',
        Details:
          'SuccessURL https://shop.test/order/XM-2026-00001#t=a1b2c3d4 телефон +79001234567 почта buyer@example.com пароль secret-password',
      })
      expect(line).toContain('Details=SuccessURL https://shop.test/order/XM-2026-00001#t=')
      for (const secret of ['a1b2c3d4', '+79001234567', 'buyer@example.com', 'secret-password']) {
        expect(line).not.toContain(secret)
      }
      expect(line).toContain('[redacted]')
    })

    it('still logs a response without Details', async () => {
      const { line } = await rejectedLog({ Success: false, ErrorCode: '9999', Message: 'nope' })
      expect(line).toContain('ErrorCode=9999')
      expect(line).toContain('Details=-')
    })

    it('ignores a non-string Details', async () => {
      const { line } = await rejectedLog({ ...rejected, Details: { a: 1 } })
      expect(line).toContain('Details=-')
    })
  })

  it('returns null on network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as Fetch
    const provider = new TBankProvider({ ...CFG, fetch: fetchMock })
    expect(await provider.createPayment(makeOrder())).toBeNull()
  })

  it('returns null without calling fetch when credentials are missing', async () => {
    const fetchMock = mockFetchOnce({})
    const provider = new TBankProvider({ ...CFG, terminalKey: '', password: '', fetch: fetchMock })
    expect(await provider.createPayment(makeOrder())).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs the underlying TLS/network cause on Init failure (e.g. SELF_SIGNED_CERT_IN_CHAIN)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cause = Object.assign(new Error('self-signed certificate in certificate chain'), {
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
    })
    const err = new TypeError('fetch failed', { cause })
    const fetchMock = vi.fn(async () => {
      throw err
    }) as unknown as Fetch
    const provider = new TBankProvider({ ...CFG, fetch: fetchMock })

    expect(await provider.createPayment(makeOrder())).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Init request failed'), err, cause)
    spy.mockRestore()
  })
})

describe('TBankProvider default transport', () => {
  it('uses tbankFetch from tbankTransport.js when no fetch is injected', async () => {
    const provider = new TBankProvider(CFG)
    const result = await provider.createPayment(makeOrder())
    expect(result).toEqual({ externalId: '1', paymentUrl: 'https://pay/1' })
    expect(tbankFetchMock).toHaveBeenCalledTimes(1)
  })

  it('prefers the injected fetch over tbankFetch when both are available', async () => {
    const fetchMock = mockFetchOnce({ Success: true, PaymentId: 2, PaymentURL: 'https://pay/2' })
    const provider = new TBankProvider({ ...CFG, fetch: fetchMock })
    await provider.createPayment(makeOrder())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tbankFetchMock).not.toHaveBeenCalled()
  })
})

describe('TBankProvider.verifyAndParseWebhook', () => {
  function signedNotification(overrides: Record<string, unknown> = {}) {
    const body: Record<string, unknown> = {
      TerminalKey: CFG.terminalKey,
      OrderId: 'XM-2026-00001',
      Success: true,
      Status: 'CONFIRMED',
      PaymentId: 700001,
      ErrorCode: '0',
      Amount: 345000,
      ...overrides,
    }
    body.Token = generateToken(body, CFG.password)
    return body
  }

  it('accepts a correctly signed notification and maps the status', () => {
    const provider = new TBankProvider(CFG)
    const event = provider.verifyAndParseWebhook(signedNotification())
    expect(event).not.toBeNull()
    expect(event).toMatchObject({
      externalId: '700001',
      orderNumber: 'XM-2026-00001',
      status: 'paid',
    })
  })

  it('maps REJECTED to failed and NEW to pending', () => {
    const provider = new TBankProvider(CFG)
    expect(
      provider.verifyAndParseWebhook(signedNotification({ Status: 'REJECTED', Success: false }))
        ?.status,
    ).toBe('failed')
    expect(provider.verifyAndParseWebhook(signedNotification({ Status: 'NEW' }))?.status).toBe(
      'pending',
    )
  })

  it('rejects a tampered payload', () => {
    const provider = new TBankProvider(CFG)
    const body = signedNotification()
    body.Amount = 1 // tamper after signing
    expect(provider.verifyAndParseWebhook(body)).toBeNull()
  })

  it('rejects a foreign TerminalKey', () => {
    const provider = new TBankProvider(CFG)
    const body: Record<string, unknown> = {
      TerminalKey: 'OtherTerminal',
      Status: 'CONFIRMED',
      PaymentId: 1,
    }
    body.Token = generateToken(body, CFG.password)
    expect(provider.verifyAndParseWebhook(body)).toBeNull()
  })

  it('rejects bodies without a Token and non-object bodies', () => {
    const provider = new TBankProvider(CFG)
    expect(provider.verifyAndParseWebhook({ TerminalKey: CFG.terminalKey })).toBeNull()
    expect(provider.verifyAndParseWebhook('OK')).toBeNull()
    expect(provider.verifyAndParseWebhook(null)).toBeNull()
    expect(provider.verifyAndParseWebhook([1, 2])).toBeNull()
  })

  it('rejects everything when credentials are missing', () => {
    const provider = new TBankProvider({ ...CFG, password: '' })
    expect(provider.verifyAndParseWebhook(signedNotification())).toBeNull()
  })
})

describe('TBankProvider.getStatus', () => {
  it('POSTs GetState and maps the returned status', async () => {
    const fetchMock = mockFetchOnce({ Success: true, Status: 'CONFIRMED', PaymentId: '700001' })
    const provider = new TBankProvider({ ...CFG, fetch: fetchMock })
    expect(await provider.getStatus('700001')).toBe('paid')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://securepay.example.test/v2/GetState')
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.PaymentId).toBe('700001')
    expect(verifyToken(sent, CFG.password, sent.Token as string)).toBe(true)
  })

  it('maps failures and intermediates', async () => {
    const fetchMock1 = mockFetchOnce({ Success: true, Status: 'CANCELED' })
    expect(await new TBankProvider({ ...CFG, fetch: fetchMock1 }).getStatus('1')).toBe('failed')
    const fetchMock2 = mockFetchOnce({ Success: true, Status: 'FORM_SHOWED' })
    expect(await new TBankProvider({ ...CFG, fetch: fetchMock2 }).getStatus('1')).toBe('pending')
  })

  it('returns unknown on API error or network failure', async () => {
    const fetchMock1 = mockFetchOnce({ Success: false, ErrorCode: '404' })
    expect(await new TBankProvider({ ...CFG, fetch: fetchMock1 }).getStatus('1')).toBe('unknown')

    const fetchMock2 = vi.fn(async () => {
      throw new Error('boom')
    }) as unknown as Fetch
    expect(await new TBankProvider({ ...CFG, fetch: fetchMock2 }).getStatus('1')).toBe('unknown')
  })

  it('logs the underlying cause on GetState failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cause = Object.assign(new Error('self-signed certificate in certificate chain'), {
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
    })
    const err = new TypeError('fetch failed', { cause })
    const fetchMock = vi.fn(async () => {
      throw err
    }) as unknown as Fetch
    expect(await new TBankProvider({ ...CFG, fetch: fetchMock }).getStatus('1')).toBe('unknown')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('GetState failed'), err, cause)
    spy.mockRestore()
  })
})

describe('provider selection (PAYMENT_PROVIDER env)', () => {
  it('defaults to manual', () => {
    vi.stubEnv('PAYMENT_PROVIDER', '')
    expect(resolvePaymentProviderName()).toBe('manual')
    expect(getPaymentProvider()).toBeInstanceOf(ManualProvider)
  })

  it('selects tbank when PAYMENT_PROVIDER=tbank', () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    expect(resolvePaymentProviderName()).toBe('tbank')
    expect(getPaymentProvider()).toBeInstanceOf(TBankProvider)
  })

  it('falls back to manual on unknown values', () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'stripe')
    expect(resolvePaymentProviderName()).toBe('manual')
  })
})

describe('ManualProvider', () => {
  it('never creates payments and never accepts webhooks', async () => {
    const provider = new ManualProvider()
    expect(await provider.createPayment(makeOrder())).toBeNull()
    expect(provider.verifyAndParseWebhook({ anything: true })).toBeNull()
    expect(await provider.getStatus('x')).toBe('unknown')
  })
})
