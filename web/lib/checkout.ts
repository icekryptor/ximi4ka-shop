import type { DeliveryMethod } from '@ximi4ka-shop/shared'

// Пороги бесплатной доставки — зеркало api/src/lib/shipping/rates.ts, только
// для подсказки в интерфейсе. Саму цену доставки считает сервер
// (/api/public/shipping/quote) по калькулятору СДЭК.
export const SHIPPING_RULES: Record<DeliveryMethod, { freeFromRub: number; priceRub: number }> = {
  cdek_pvz: { freeFromRub: 3000, priceRub: 350 },
  cdek_courier: { freeFromRub: 5000, priceRub: 500 },
}

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  cdek_pvz: 'СДЭК — пункт выдачи',
  cdek_courier: 'СДЭК — курьером',
}

/** Digits of the full number including the country code, e.g. '79123456789'. */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits === '') return ''
  // Normalize the RU trunk prefix: 8XXXXXXXXXX and 7XXXXXXXXXX both mean +7.
  const subscriber = digits[0] === '7' || digits[0] === '8' ? digits.slice(1) : digits
  return `7${subscriber.slice(0, 10)}`
}

/**
 * Progressive +7 input mask: '9123456789' → '+7 (912) 345-67-89'.
 * Empty input returns '' so the field can actually be cleared.
 */
export function formatPhoneInput(raw: string): string {
  const full = phoneDigits(raw)
  if (full === '') return ''
  const d = full.slice(1) // subscriber digits after the country code
  let out = '+7 ('
  out += d.slice(0, 3)
  if (d.length > 3) out += ') ' + d.slice(3, 6)
  if (d.length > 6) out += '-' + d.slice(6, 8)
  if (d.length > 8) out += '-' + d.slice(8, 10)
  return out
}

// Ник Telegram покупателя → «@username»; null — не ник. Зеркало
// api/src/lib/telegramHandle.ts.
const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{5,32}$/

export function normalizeTelegramHandle(raw: string): string | null {
  const bare = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
  return TELEGRAM_HANDLE_RE.test(bare) ? `@${bare}` : null
}

export interface CheckoutFormFields {
  name: string
  phone: string
  email: string
  telegram: string
  // Квартира, подъезд, этаж — для курьера. Виджет СДЭК геокодирует только
  // улицу и дом.
  apartment: string
  comment: string
}

export type CheckoutFormErrors = Partial<
  Record<'name' | 'phone' | 'email' | 'telegram' | 'delivery', string>
>

// Client-side validation with Russian messages. Mirrors the zod schema on
// the server (checkout.schemas.ts) so a valid form never bounces off a 400.
// hasDelivery — выбран ли пункт выдачи или адрес на карте СДЭК.
export function validateCheckoutForm(
  fields: CheckoutFormFields,
  hasDelivery: boolean,
): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {}
  if (fields.name.trim() === '') {
    errors.name = 'Укажите имя'
  }
  if (phoneDigits(fields.phone).length !== 11) {
    errors.phone = 'Укажите телефон полностью: +7 (XXX) XXX-XX-XX'
  }
  const email = fields.email.trim()
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Проверьте email — похоже, в нём опечатка'
  }
  if (fields.telegram.trim() !== '' && !normalizeTelegramHandle(fields.telegram)) {
    errors.telegram = 'Проверьте ник: 5–32 латинских букв, цифр или _'
  }
  if (!hasDelivery) {
    errors.delivery = 'Выберите пункт выдачи или адрес доставки на карте'
  }
  return errors
}

const IDEMPOTENCY_STORAGE_KEY = 'ximi4ka-checkout-idempotency-key'

// One uuid per checkout attempt, persisted in sessionStorage: a re-click of
// «Оформить заказ» (or a retry after a network hiccup) re-sends the same
// Idempotency-Key, so the server returns the already-created order instead
// of taking the money twice.
export function getOrCreateIdempotencyKey(): string {
  const existing = window.sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY)
  if (existing) return existing
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : // Extremely old browsers: a random-enough fallback in uuid shape.
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return v.toString(16)
        })
  window.sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, key)
  return key
}

// Called after a successful order so the NEXT checkout gets a fresh key.
export function clearIdempotencyKey(): void {
  window.sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY)
}

// Full-page navigation to an external payment URL (Т-Касса). Kept as a
// module export instead of an inline `window.location.assign` so page tests
// can mock the module and assert the redirect without jsdom navigation.
export function redirectTo(url: string): void {
  window.location.assign(url)
}
