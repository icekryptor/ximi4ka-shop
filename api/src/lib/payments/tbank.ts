import type { Order } from '../../entities/Order.js'
import { generateToken, verifyToken } from './token.js'
import type {
  CreatePaymentResult,
  PaymentEvent,
  PaymentProvider,
  PaymentStatus,
} from './types.js'

// Т-Касса (Т-Банк, ex-Tinkoff Kassa) internet acquiring.
// Docs: https://developer.tbank.ru (Прием платежей): Init / GetState /
// NotificationURL webhooks; request signature — see token.ts.

export const TBANK_DEFAULT_API_URL = 'https://securepay.tinkoff.ru/v2/'

// Provider payment statuses → our order-status domain.
//   AUTHORIZED — money reserved on the card (one-stage payments confirm
//   automatically, so treat as paid); CONFIRMED — written off.
//   REJECTED / CANCELED / DEADLINE_EXPIRED / AUTH_FAIL — terminal failures.
//   Everything else (NEW, FORM_SHOWED, AUTHORIZING, 3DS_*, CONFIRMING, ...)
//   is an intermediate state → pending.
export function mapTbankStatus(status: string): PaymentStatus {
  switch (status) {
    case 'AUTHORIZED':
    case 'CONFIRMED':
      return 'paid'
    case 'REJECTED':
    case 'CANCELED':
    case 'DEADLINE_EXPIRED':
    case 'AUTH_FAIL':
      return 'failed'
    default:
      return 'pending'
  }
}

export interface TBankConfig {
  terminalKey: string
  password: string
  apiUrl: string
  notificationUrl?: string
  successUrl?: string
  failUrl?: string
}

interface TBankInitResponse {
  Success?: boolean
  ErrorCode?: string
  Message?: string
  PaymentId?: string | number
  PaymentURL?: string
  Status?: string
}

interface TBankGetStateResponse {
  Success?: boolean
  ErrorCode?: string
  Message?: string
  Status?: string
  PaymentId?: string | number
  OrderId?: string
}

export class TBankProvider implements PaymentProvider {
  readonly name = 'tbank' as const
  private readonly cfg: TBankConfig

  constructor(cfg: Partial<TBankConfig> = {}) {
    const apiUrl = cfg.apiUrl ?? process.env.TBANK_API_URL ?? TBANK_DEFAULT_API_URL
    this.cfg = {
      terminalKey: cfg.terminalKey ?? process.env.TBANK_TERMINAL_KEY ?? '',
      password: cfg.password ?? process.env.TBANK_PASSWORD ?? '',
      // Trailing slash matters: new URL('Init', base) drops the last path
      // segment of a slashless base.
      apiUrl: apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`,
      notificationUrl: cfg.notificationUrl ?? process.env.TBANK_NOTIFICATION_URL,
      successUrl: cfg.successUrl ?? process.env.TBANK_SUCCESS_URL,
      failUrl: cfg.failUrl ?? process.env.TBANK_FAIL_URL,
    }
  }

  private get configured(): boolean {
    return this.cfg.terminalKey.length > 0 && this.cfg.password.length > 0
  }

  private async post<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const body: Record<string, unknown> = {
      TerminalKey: this.cfg.terminalKey,
      ...params,
    }
    body.Token = generateToken(body, this.cfg.password)
    const res = await fetch(new URL(method, this.cfg.apiUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`tbank ${method} failed: HTTP ${res.status}`)
    }
    return (await res.json()) as T
  }

  // Init → PaymentURL. Amounts are in KOPECKS on the wire (we store rubles).
  // Returns null on any failure: checkout must degrade to manual follow-up
  // rather than lose the order.
  async createPayment(order: Order): Promise<CreatePaymentResult | null> {
    if (!this.configured) {
      console.error('tbank: TBANK_TERMINAL_KEY / TBANK_PASSWORD are not set — skipping Init')
      return null
    }
    try {
      const params: Record<string, unknown> = {
        Amount: order.totalRub * 100,
        OrderId: order.orderNumber,
        Description: `Заказ ${order.orderNumber} на ximi4ka.ru`,
        // DATA is a nested object — excluded from the Token by design.
        DATA: {
          Phone: order.customerPhone,
          ...(order.customerEmail ? { Email: order.customerEmail } : {}),
        },
      }
      if (this.cfg.notificationUrl) params.NotificationURL = this.cfg.notificationUrl
      if (this.cfg.successUrl) params.SuccessURL = this.cfg.successUrl
      if (this.cfg.failUrl) params.FailURL = this.cfg.failUrl

      const body = await this.post<TBankInitResponse>('Init', params)
      if (!body.Success || body.PaymentId == null || !body.PaymentURL) {
        console.error(
          `tbank: Init rejected for ${order.orderNumber}: ErrorCode=${body.ErrorCode} Message=${body.Message}`,
        )
        return null
      }
      return { externalId: String(body.PaymentId), paymentUrl: body.PaymentURL }
    } catch (err) {
      console.error(`tbank: Init request failed for ${order.orderNumber}`, err)
      return null
    }
  }

  // Notification webhook body: root-level scalars signed with the terminal
  // password (the Token field itself excluded). Respond 'OK' upstream —
  // Т-Касса retries anything else hourly for 24h, then daily for a month.
  verifyAndParseWebhook(body: unknown): PaymentEvent | null {
    if (!this.configured) return null
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    const record = body as Record<string, unknown>

    if (record.TerminalKey !== this.cfg.terminalKey) return null
    if (typeof record.Token !== 'string' || record.Token.length === 0) return null
    if (!verifyToken(record, this.cfg.password, record.Token)) return null

    const status = typeof record.Status === 'string' ? record.Status : ''
    const paymentId = record.PaymentId
    if (typeof paymentId !== 'string' && typeof paymentId !== 'number') return null

    return {
      externalId: String(paymentId),
      orderNumber:
        typeof record.OrderId === 'string' || typeof record.OrderId === 'number'
          ? String(record.OrderId)
          : null,
      status: mapTbankStatus(status),
      raw: record,
    }
  }

  async getStatus(externalId: string): Promise<PaymentStatus | 'unknown'> {
    if (!this.configured) return 'unknown'
    try {
      const body = await this.post<TBankGetStateResponse>('GetState', {
        PaymentId: externalId,
      })
      if (!body.Success || typeof body.Status !== 'string') return 'unknown'
      return mapTbankStatus(body.Status)
    } catch (err) {
      console.error(`tbank: GetState failed for payment ${externalId}`, err)
      return 'unknown'
    }
  }
}
