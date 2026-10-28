import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

// Уведомления CloudPayments (developers.cloudpayments.ru, «Уведомления» и «Проверка
// уведомлений»). Тело — form-urlencoded (в кабинете можно включить JSON), подпись —
// HMAC-SHA256 ключом API Secret в base64: Content-HMAC — от тела как пришло,
// X-Content-HMAC — от раскодированного. Сравнение — за постоянное время.

export type CloudPaymentsNotification = Record<string, string>

function digest(secret: string, data: Buffer | string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

function header(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function matches(expected: Buffer, headerValue: string | null): boolean {
  if (!headerValue) return false
  const got = Buffer.from(headerValue, 'base64')
  return got.length === expected.length && timingSafeEqual(got, expected)
}

function decodeForm(text: string): string | null {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return null
  }
}

// Есть Content-HMAC — решает только он (по сырым байтам), без запасного пути: неверный
// Content-HMAC не спасает никакой X-Content-HMAC. Только когда Content-HMAC нет вовсе,
// проверяем X-Content-HMAC — от раскодированного тела.
export function verifyCloudPaymentsSignature(
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
  apiSecret: string,
): boolean {
  if (!apiSecret) return false
  const contentHmac = header(headers['content-hmac'])
  if (contentHmac) return matches(digest(apiSecret, rawBody), contentHmac)
  const decoded = decodeForm(rawBody.toString('utf8'))
  return decoded !== null && matches(digest(apiSecret, decoded), header(headers['x-content-hmac']))
}

export function parseCloudPaymentsBody(
  rawBody: Buffer,
  contentType: string | undefined,
): CloudPaymentsNotification | null {
  const text = rawBody.toString('utf8')
  if (!(contentType ?? '').toLowerCase().includes('application/json')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
      key,
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
    ]),
  )
}

// «2916.00» → 291600. Сумму сверяем с заказом целыми копейками, без float.
export function amountKopecks(value: string | undefined): number | null {
  const text = (value ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [rub, kop = ''] = text.split('.')
  return Number(rub) * 100 + Number(kop.padEnd(2, '0'))
}

// Fail closed: «не тест» — только явные пусто, 0 и false (в любом регистре); любое
// другое значение считаем тестовым, чтобы на production его отклонить.
const NOT_TEST_MODE = new Set(['', '0', 'false'])

export function isTestModeNotification(n: CloudPaymentsNotification): boolean {
  return !NOT_TEST_MODE.has((n.TestMode ?? '').trim().toLowerCase())
}
