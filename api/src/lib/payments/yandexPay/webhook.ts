import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose'
import type { PaymentStatus } from '../types.js'
import { mapYandexStatus } from './client.js'
import { getYandexPayConfig, type YandexPayConfig } from './config.js'

// Вебхук Яндекс Пэй: тело — JWT ES256 (application/octet-stream). Ключ — из JWKS
// Яндекса по kid (адрес — из режима магазина, не из запроса); проверяются alg, typ,
// exp и iat (Яндекс кладёт их в заголовок), затем merchantId. reasonCode — по таблице
// Яндекса: UNAUTHORIZED (подпись), TOKEN_EXPIRED (срок), OTHER (прочее).

export type YandexWebhookReason = 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'OTHER'
export type YandexWebhookResult =
  | { ok: true; orderNumber: string; status: PaymentStatus }
  | { ok: false; reasonCode: YandexWebhookReason; reason: string }

export interface YandexWebhookDeps {
  /** Подмена конфигурации; не задана — getYandexPayConfig(). */
  config?: YandexPayConfig | null
  /** Подмена ключей — только для тестов. */
  keys?: JWTVerifyGetKey
}

// Допуск расхождения часов для iat/exp.
const CLOCK_SKEW_SEC = 60

// Один набор ключей на адрес на процесс: createRemoteJWKSet сам кеширует ключи и
// перезапрашивает набор, когда встречается неизвестный kid.
const keySets = new Map<string, JWTVerifyGetKey>()
function keysFor(url: string): JWTVerifyGetKey {
  let keys = keySets.get(url)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url))
    keySets.set(url, keys)
  }
  return keys
}

// iat/exp в заголовке: в примере Яндекса числа, в описании — строки.
function numericClaim(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function fail(reasonCode: YandexWebhookReason, reason: string): YandexWebhookResult {
  return { ok: false, reasonCode, reason }
}

export async function verifyYandexWebhook(
  rawBody: Buffer | undefined,
  deps: YandexWebhookDeps = {},
): Promise<YandexWebhookResult> {
  const cfg = deps.config !== undefined ? deps.config : await getYandexPayConfig()
  if (!cfg) return fail('UNAUTHORIZED', 'Yandex Pay is not configured')
  if (!rawBody || rawBody.length === 0) return fail('UNAUTHORIZED', 'Empty body')
  const token = rawBody.toString('utf8').trim()

  let header: ReturnType<typeof decodeProtectedHeader>
  try {
    header = decodeProtectedHeader(token)
  } catch (err) {
    console.error(
      `yandex_pay: webhook verification failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
    )
    return fail('UNAUTHORIZED', 'Body is not a JWT')
  }
  if (header.alg !== 'ES256') return fail('UNAUTHORIZED', 'Unexpected token algorithm')

  const now = Math.floor(Date.now() / 1000)
  const headerExp = numericClaim(header.exp)
  const headerIat = numericClaim(header.iat)
  if (headerExp !== undefined && headerExp + CLOCK_SKEW_SEC <= now) {
    return fail('TOKEN_EXPIRED', 'JWT token has expired')
  }
  if (headerIat !== undefined && headerIat > now + CLOCK_SKEW_SEC) {
    return fail('OTHER', 'JWT token is issued in the future')
  }

  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, deps.keys ?? keysFor(cfg.jwksUrl), {
      algorithms: ['ES256'],
      typ: 'JWT',
      clockTolerance: CLOCK_SKEW_SEC,
    }))
  } catch (err) {
    // Только имя и код ошибки: текст сообщения может повторять фрагмент токена.
    const code = (err as { code?: unknown } | null)?.code
    const name = err instanceof Error ? err.name : 'UnknownError'
    console.error(
      `yandex_pay: webhook verification failed: ${name}${typeof code === 'string' ? ` ${code}` : ''}`,
    )
    if (code === 'ERR_JWT_EXPIRED') return fail('TOKEN_EXPIRED', 'JWT token has expired')
    if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') return fail('OTHER', 'Invalid token claims')
    return fail('UNAUTHORIZED', 'Invalid token signature')
  }

  // Токен без срока годился бы для повтора вечно.
  if (headerExp === undefined && typeof payload.exp !== 'number') {
    return fail('OTHER', 'JWT token has no expiry')
  }
  if (payload.merchantId !== cfg.merchantId) return fail('OTHER', 'Invalid merchantId')

  const order = payload.order as { orderId?: unknown; paymentStatus?: unknown } | undefined
  const operation = payload.operation as { orderId?: unknown } | undefined
  const orderId = order?.orderId ?? operation?.orderId
  if (typeof orderId !== 'string' || orderId === '') return fail('OTHER', 'No orderId in event')

  // Меняет заказ только ORDER_STATUS_UPDATED; остальные проверенные события — pending.
  const status: PaymentStatus =
    payload.event === 'ORDER_STATUS_UPDATED' && typeof order?.paymentStatus === 'string'
      ? mapYandexStatus(order.paymentStatus)
      : 'pending'
  return { ok: true, orderNumber: orderId, status }
}
