import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Order } from '../../entities/Order.js'
import { generateToken, verifyToken } from './token.js'
import { TBankProvider, mapTbankStatus } from './tbank.js'
import { ManualProvider } from './manual.js'
import { getPaymentProvider, resolvePaymentProviderName } from './index.js'

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

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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
    const provider = new TBankProvider(CFG)
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

  it('returns null when Init responds Success=false', async () => {
    mockFetchOnce({ Success: false, ErrorCode: '9999', Message: 'nope' })
    const provider = new TBankProvider(CFG)
    expect(await provider.createPayment(makeOrder())).toBeNull()
  })

  it('returns null on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }))
    const provider = new TBankProvider(CFG)
    expect(await provider.createPayment(makeOrder())).toBeNull()
  })

  it('returns null without calling fetch when credentials are missing', async () => {
    const fetchMock = mockFetchOnce({})
    const provider = new TBankProvider({ ...CFG, terminalKey: '', password: '' })
    expect(await provider.createPayment(makeOrder())).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
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
    expect(
      provider.verifyAndParseWebhook(signedNotification({ Status: 'NEW' }))?.status,
    ).toBe('pending')
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
    const provider = new TBankProvider(CFG)
    expect(await provider.getStatus('700001')).toBe('paid')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://securepay.example.test/v2/GetState')
    const sent = JSON.parse(init.body as string) as Record<string, unknown>
    expect(sent.PaymentId).toBe('700001')
    expect(verifyToken(sent, CFG.password, sent.Token as string)).toBe(true)
  })

  it('maps failures and intermediates', async () => {
    mockFetchOnce({ Success: true, Status: 'CANCELED' })
    expect(await new TBankProvider(CFG).getStatus('1')).toBe('failed')
    mockFetchOnce({ Success: true, Status: 'FORM_SHOWED' })
    expect(await new TBankProvider(CFG).getStatus('1')).toBe('pending')
  })

  it('returns unknown on API error or network failure', async () => {
    mockFetchOnce({ Success: false, ErrorCode: '404' })
    expect(await new TBankProvider(CFG).getStatus('1')).toBe('unknown')
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom')
    }))
    expect(await new TBankProvider(CFG).getStatus('1')).toBe('unknown')
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
