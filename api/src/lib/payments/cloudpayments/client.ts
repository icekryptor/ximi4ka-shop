import type { Order } from '../../../entities/Order.js'
import { clip, errMessage } from '../logText.js'
import type { Fetch } from '../tbank.js'
import type { CreatePaymentResult, PaymentStatus } from '../types.js'
import {
  acceptsTestPayments,
  CLOUDPAYMENTS_API_URL,
  getCloudPaymentsConfig,
  type CloudPaymentsConfig,
} from './config.js'

// CloudPayments API (developers.cloudpayments.ru): заказ на оплату создаёт сервер
// (POST /orders/create), покупатель уходит на одноразовую ссылку Model.Url. Наш номер
// заказа — InvoiceId: по нему сверка ищет платёж и вебхук находит заказ. Чек 54-ФЗ
// пока не передаём (решение B4 в плане 2026-10-27) — боевой режим без него не включаем.

// Чекаут ждёт ответ — запрос не должен висеть.
export const CLOUDPAYMENTS_REQUEST_TIMEOUT_MS = 15_000

export interface CloudPaymentsClientDeps {
  /** Подмена конфигурации; не задана — getCloudPaymentsConfig() (env + настройки сайта). */
  config?: CloudPaymentsConfig | null
  fetch?: Fetch
  env?: NodeJS.ProcessEnv
}

interface CloudPaymentsResponse {
  Success?: boolean
  Message?: string | null
  Model?: {
    Id?: string
    Url?: string
    Status?: string
    Amount?: number
    Currency?: string
    TestMode?: boolean
  } | null
}

async function resolveConfig(deps: CloudPaymentsClientDeps): Promise<CloudPaymentsConfig | null> {
  return deps.config !== undefined ? deps.config : getCloudPaymentsConfig(deps.env ?? process.env)
}

async function call(
  cfg: CloudPaymentsConfig,
  deps: CloudPaymentsClientDeps,
  path: string,
  body: unknown,
  requestId?: string,
): Promise<{ httpStatus: number; ok: boolean; body: CloudPaymentsResponse }> {
  const doFetch: Fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const auth = Buffer.from(`${cfg.publicId}:${cfg.apiSecret}`).toString('base64')
  const res = await doFetch(`${CLOUDPAYMENTS_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      // Повтор с тем же X-Request-ID в течение часа вернёт тот же результат.
      ...(requestId ? { 'X-Request-ID': requestId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CLOUDPAYMENTS_REQUEST_TIMEOUT_MS),
  })
  const parsed = (await res.json().catch(() => null)) as CloudPaymentsResponse | null
  return { httpStatus: res.status, ok: res.ok, body: parsed ?? {} }
}

// Любой сбой — null с записью в лог: заказ остаётся pending без ссылки и уходит
// менеджеру, как при отказе Т-Кассы и Яндекса.
export async function createCloudPaymentsOrder(
  order: Order,
  deps: CloudPaymentsClientDeps = {},
): Promise<CreatePaymentResult | null> {
  const env = deps.env ?? process.env
  const cfg = await resolveConfig(deps)
  if (!cfg) {
    console.error(
      'cloudpayments: CLOUDPAYMENTS_PUBLIC_ID / CLOUDPAYMENTS_API_SECRET не заданы — ссылка не создана',
    )
    return null
  }
  const origin = (env.WEB_ORIGIN ?? '').replace(/\/+$/, '')
  if (!origin) {
    console.error(
      'cloudpayments: WEB_ORIGIN не задан — некуда вернуть покупателя, ссылка не создана',
    )
    return null
  }

  const page = `${origin}/order/${encodeURIComponent(order.orderNumber)}`
  // Секрет — во фрагменте (#t=): браузер не шлёт его ни серверу, ни счётчикам.
  const t = encodeURIComponent(order.publicToken)
  const payload = {
    Amount: order.totalRub,
    Currency: 'RUB',
    Description: `Заказ ${order.orderNumber} на ximi4ka.ru`,
    InvoiceId: order.orderNumber,
    ...(order.customerEmail ? { Email: order.customerEmail } : {}),
    RequireConfirmation: false,
    SendEmail: false,
    CultureName: 'ru-RU',
    SuccessRedirectUrl: `${page}?new=1#t=${t}`,
    FailRedirectUrl: `${page}?payment=failed#t=${t}`,
  }
  const secrets = [order.publicToken, t, order.customerEmail, cfg.apiSecret, cfg.publicId]

  try {
    const res = await call(cfg, deps, '/orders/create', payload, `order-${order.orderNumber}`)
    const id = res.body.Model?.Id
    const url = res.body.Model?.Url
    if (
      !res.ok ||
      res.body.Success !== true ||
      typeof id !== 'string' ||
      !id ||
      typeof url !== 'string' ||
      !url.startsWith('https://')
    ) {
      console.error(
        `cloudpayments: ссылка для ${order.orderNumber} не создана: HTTP ${res.httpStatus} Success=${clip(String(res.body.Success))} Message=${clip(res.body.Message, secrets)}`,
      )
      return null
    }
    return { externalId: id, paymentUrl: url }
  } catch (err) {
    console.error(
      `cloudpayments: создание ссылки для ${order.orderNumber} не удалось: ${errMessage(err, secrets)}`,
    )
    return null
  }
}

// Сверка зависших платежей (reconcile.ts). paid — только Completed с той же суммой в
// рублях и не тестовый на проде; Declined и прочее — pending: ссылка живёт, покупатель
// может заплатить другой картой. Сбой — unknown, заказ не трогаем.
export async function getCloudPaymentsStatus(
  order: Order,
  deps: CloudPaymentsClientDeps = {},
): Promise<PaymentStatus | 'unknown'> {
  const env = deps.env ?? process.env
  const cfg = await resolveConfig(deps)
  if (!cfg) return 'unknown'
  try {
    const res = await call(cfg, deps, '/payments/find', { InvoiceId: order.orderNumber })
    if (!res.ok) {
      console.error(`cloudpayments: статус ${order.orderNumber} не получен: HTTP ${res.httpStatus}`)
      return 'unknown'
    }
    const model = res.body.Model
    if (!model || typeof model.Status !== 'string') {
      if (/not found/i.test(res.body.Message ?? '')) return 'pending'
      console.error(
        `cloudpayments: статус ${order.orderNumber} не получен: Message=${clip(res.body.Message)}`,
      )
      return 'unknown'
    }
    if (model.Status !== 'Completed') return 'pending'
    const amountOk =
      typeof model.Amount === 'number' && Math.round(model.Amount * 100) === order.totalRub * 100
    const currencyOk = (model.Currency ?? 'RUB') === 'RUB'
    const testOk = model.TestMode !== true || acceptsTestPayments(env)
    if (!amountOk || !currencyOk || !testOk) {
      console.error(
        `cloudpayments: платёж по ${order.orderNumber} не засчитан сверкой: Amount=${clip(model.Amount)} Currency=${clip(model.Currency)} TestMode=${clip(String(model.TestMode))}`,
      )
      return 'unknown'
    }
    return 'paid'
  } catch (err) {
    console.error(
      `cloudpayments: статус ${order.orderNumber} не получен: ${errMessage(err, [cfg.apiSecret, cfg.publicId])}`,
    )
    return 'unknown'
  }
}
