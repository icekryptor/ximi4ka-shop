import { randomUUID } from 'node:crypto'
import type { Order } from '../../../entities/Order.js'
import { clip, errMessage } from '../logText.js'
import { parseReceiptConfig } from '../receipt.js'
import type { Fetch } from '../tbank.js'
import type { CreatePaymentResult, PaymentStatus } from '../types.js'
import { buildYandexCart } from './cart.js'
import { getYandexPayConfig, type YandexPayConfig } from './config.js'

// Yandex Pay API (pay.yandex.ru/docs/ru/custom/backend/yandex-pay-api). Заказ создаёт
// сервер, покупатель уходит на paymentUrl. Внешний id платежа — наш номер заказа:
// Яндекс знает заказ по orderId, он же ключ идемпотентности создания.

// Чекаут ждёт ответ — запрос к Яндексу не должен висеть.
// Срок жизни ссылки на оплату (сек, Яндекс допускает 120…604800). По истечении Яндекс
// сам переводит заказ в FAILED и шлёт вебхук — брошенные заказы уходят из сверки.
// Трое суток: покупатель успевает вернуться к «Оплатить» со страницы заказа.
export const YANDEX_ORDER_TTL_SEC = 3 * 24 * 60 * 60

export const YANDEX_REQUEST_TIMEOUT_MS = 15_000

// CAPTURED — списано, CONFIRMED — подтверждено; FAILED/VOIDED — окончательный провал.
// PENDING, AUTHORIZED, REFUNDED и прочее заказ не меняют (возвраты — вручную).
export function mapYandexStatus(status: string | null | undefined): PaymentStatus {
  switch (status) {
    case 'CAPTURED':
    case 'CONFIRMED':
      return 'paid'
    case 'FAILED':
    case 'VOIDED':
      return 'failed'
    default:
      return 'pending'
  }
}

export interface YandexClientDeps {
  /** Подмена конфигурации; не задана — getYandexPayConfig() (env + настройки сайта). */
  config?: YandexPayConfig | null
  fetch?: Fetch
  env?: NodeJS.ProcessEnv
}

interface YandexResponse {
  status?: string
  reasonCode?: string
  reason?: string
  data?: { paymentUrl?: string; order?: { orderId?: string; paymentStatus?: string | null } }
}

async function resolveConfig(deps: YandexClientDeps): Promise<YandexPayConfig | null> {
  return deps.config !== undefined ? deps.config : getYandexPayConfig(deps.env ?? process.env)
}

async function call(
  cfg: YandexPayConfig,
  deps: YandexClientDeps,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ httpStatus: number; ok: boolean; body: YandexResponse }> {
  const doFetch: Fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Api-Key ${cfg.authKey}`,
      'Content-Type': 'application/json',
      'X-Request-Id': randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(YANDEX_REQUEST_TIMEOUT_MS),
  })
  const parsed = (await res.json().catch(() => null)) as YandexResponse | null
  return { httpStatus: res.status, ok: res.ok, body: parsed ?? {} }
}

// Любой сбой — null с записью в лог: заказ остаётся pending без ссылки и уходит
// менеджеру, как при отказе Т-Кассы.
export async function createYandexOrder(
  order: Order,
  opts: { preferSplit?: boolean } = {},
  deps: YandexClientDeps = {},
): Promise<CreatePaymentResult | null> {
  const env = deps.env ?? process.env
  const cfg = await resolveConfig(deps)
  if (!cfg || !cfg.authKey) {
    console.error(
      'yandex_pay: YANDEX_PAY_MERCHANT_ID / YANDEX_PAY_API_KEY не заданы — заказ не отправлен',
    )
    return null
  }
  const origin = (env.WEB_ORIGIN ?? '').replace(/\/+$/, '')
  if (!origin) {
    console.error('yandex_pay: WEB_ORIGIN не задан — некуда вернуть покупателя, заказ не отправлен')
    return null
  }

  let payload: Record<string, unknown>
  let contact: string
  try {
    // Неверная ставка в env или корзина, не сходящаяся с итогом, — отказ с логом.
    const { cart, fiscalContact } = buildYandexCart(order, parseReceiptConfig(env).tax)
    contact = fiscalContact
    const page = `${origin}/order/${encodeURIComponent(order.orderNumber)}`
    // Секрет — во фрагменте (#t=): браузер не шлёт его ни серверу, ни счётчикам.
    const t = encodeURIComponent(order.publicToken)
    const onError = `${page}?payment=failed#t=${t}`
    payload = {
      orderId: order.orderNumber,
      currencyCode: 'RUB',
      cart,
      availablePaymentMethods: ['CARD', 'SPLIT'],
      ...(opts.preferSplit ? { preferredPaymentMethod: 'SPLIT' } : {}),
      redirectUrls: { onSuccess: `${page}?new=1#t=${t}`, onError, onAbort: onError },
      fiscalContact,
      purpose: `Заказ ${order.orderNumber} на ximi4ka.ru`,
      ttl: YANDEX_ORDER_TTL_SEC,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(
      `yandex_pay: корзина не собрана для ${order.orderNumber} — заказ не отправлен: ${reason}`,
    )
    return null
  }

  const secrets = [
    order.publicToken,
    order.publicToken ? encodeURIComponent(order.publicToken) : null,
    order.customerEmail,
    order.customerPhone,
    contact,
    cfg.apiKey,
    cfg.merchantId,
  ]
  try {
    const res = await call(cfg, deps, 'POST', '/api/merchant/v1/orders', payload)
    const paymentUrl = res.body.data?.paymentUrl
    if (!res.ok || res.body.status !== 'success' || typeof paymentUrl !== 'string' || !paymentUrl) {
      console.error(
        `yandex_pay: заказ ${order.orderNumber} не принят: HTTP ${res.httpStatus} status=${clip(res.body.status)} reasonCode=${clip(res.body.reasonCode, secrets)} reason=${clip(res.body.reason, secrets)}`,
      )
      return null
    }
    return { externalId: order.orderNumber, paymentUrl }
  } catch (err) {
    console.error(
      `yandex_pay: создание заказа ${order.orderNumber} не удалось: ${errMessage(err, secrets)}`,
    )
    return null
  }
}

export async function getYandexOrderStatus(
  orderNumber: string,
  deps: YandexClientDeps = {},
): Promise<PaymentStatus | 'unknown'> {
  const cfg = await resolveConfig(deps)
  if (!cfg || !cfg.authKey) return 'unknown'
  try {
    const res = await call(
      cfg,
      deps,
      'GET',
      `/api/merchant/v1/orders/${encodeURIComponent(orderNumber)}`,
    )
    if (!res.ok) {
      console.error(
        `yandex_pay: статус заказа ${orderNumber} не получен: HTTP ${res.httpStatus} reasonCode=${clip(res.body.reasonCode)}`,
      )
      return 'unknown'
    }
    const status = res.body.data?.order?.paymentStatus
    return typeof status === 'string' ? mapYandexStatus(status) : 'unknown'
  } catch (err) {
    console.error(
      `yandex_pay: статус заказа ${orderNumber} не получен: ${errMessage(err, [cfg.apiKey, cfg.merchantId])}`,
    )
    return 'unknown'
  }
}
