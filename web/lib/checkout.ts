import type { DeliveryMethod } from '@ximi4ka-shop/shared'
import { cisTaxIdError, isCisCity, type CisCountry } from '@ximi4ka-shop/shared/types/cis'
import { isPostalCode } from './shipping'

// Пороги бесплатной доставки — зеркало api/src/lib/shipping/rates.ts, только
// для подсказки в интерфейсе. Саму цену доставки считает сервер
// (/api/public/shipping/quote) по калькулятору СДЭК.
export const SHIPPING_RULES: Record<DeliveryMethod, { freeFromRub: number; priceRub: number }> = {
  cdek_pvz: { freeFromRub: 3000, priceRub: 350 },
  cdek_courier: { freeFromRub: 5000, priceRub: 500 },
}

/** Digits of the full number including the country code, e.g. '79123456789'. */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits === '') return ''
  // Normalize the RU trunk prefix: 8XXXXXXXXXX and 7XXXXXXXXXX both mean +7.
  const subscriber = digits[0] === '7' || digits[0] === '8' ? digits.slice(1) : digits
  return `7${subscriber.slice(0, 10)}`
}

const MAX_CIS_EMAIL_LENGTH = 64

// Телефон покупателя из страны ЕАЭС: код страны любой (+375, +996, +374, +7), без маски.
export function internationalPhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function isInternationalPhone(value: string): boolean {
  const digits = internationalPhoneDigits(value)
  // Ведущая 8 — внутренний префикс КЗ/BY (8 701…): такой номер ушёл бы как +8…
  if (digits.startsWith('8')) return false
  return digits.length >= 8 && digits.length <= 15
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
  comment: string
}

export type CheckoutFormErrors = Partial<
  Record<
    | 'name'
    | 'phone'
    | 'email'
    | 'telegram'
    | 'city'
    | 'point'
    | 'street'
    | 'postalCode'
    | 'delivery'
    | 'country'
    | 'cisCity'
    | 'cisAddress'
    | 'cisTaxId',
    string
  >
>

// Что выбрано в блоке доставки — для проверки формы (спека §5.3).
export interface DeliveryFormState {
  city: { code: number } | null
  method: DeliveryMethod
  point: { code: string } | null
  courier: { street: string; postalCode: string }
  // Расчёт выбранного способа: оформить можно только с готовой ценой.
  quoteStatus: 'idle' | 'loading' | 'ready' | 'error'
}

// Общие проверки контактов: имя, телефон, email, ник Telegram. Для заказа в
// страну ЕАЭС телефон международный, а email обязателен.
function validateContacts(
  fields: CheckoutFormFields,
  { international }: { international: boolean },
): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {}
  if (fields.name.trim() === '') {
    errors.name = 'Укажите имя'
  }
  if (international) {
    if (!isInternationalPhone(fields.phone)) {
      errors.phone = 'Укажите телефон с кодом страны, например +375 29 123-45-67'
    }
  } else if (phoneDigits(fields.phone).length !== 11) {
    errors.phone = 'Укажите телефон полностью: +7 (XXX) XXX-XX-XX'
  }
  const email = fields.email.trim()
  if (international && email === '') {
    // Чек Т-Кассы принимает только email или номер +7…
    errors.email = 'Укажите email — на него придёт чек'
  } else if (international && email.length > MAX_CIS_EMAIL_LENGTH) {
    // Чек Т-Кассы берёт email не длиннее 64 символов (api/lib/payments/receipt.ts).
    errors.email = 'Email не длиннее 64 символов'
  } else if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Проверьте email — похоже, в нём опечатка'
  }
  if (fields.telegram.trim() !== '' && !normalizeTelegramHandle(fields.telegram)) {
    errors.telegram = 'Проверьте ник: 5–32 латинских букв, цифр или _'
  }
  return errors
}

// Client-side validation with Russian messages. Mirrors the zod schema on
// the server (checkout.schemas.ts) so a valid form never bounces off a 400.
// Доставка (§5.3): город, способ, пункт или улица с домом, готовая цена.
export function validateCheckoutForm(
  fields: CheckoutFormFields,
  delivery: DeliveryFormState,
): CheckoutFormErrors {
  const errors = validateContacts(fields, { international: false })
  if (!delivery.city) {
    errors.city = 'Укажите город'
  } else {
    if (delivery.method === 'cdek_pvz') {
      if (!delivery.point) errors.point = 'Выберите пункт получения'
    } else {
      if (delivery.courier.street.trim() === '') errors.street = 'Укажите улицу и дом'
      const postal = delivery.courier.postalCode.trim()
      if (postal !== '' && !isPostalCode(postal)) errors.postalCode = 'Индекс — 6 цифр'
    }
    if (delivery.quoteStatus === 'loading') {
      errors.delivery = 'Считаем доставку — подождите секунду'
    } else if (delivery.quoteStatus !== 'ready') {
      errors.delivery = 'Не удалось рассчитать доставку — нажмите «Повторить расчёт»'
    }
  }
  return errors
}

// Что выбрано в блоке «страны ЕАЭС»: страна, город из списка, адрес пункта и
// ИИН/ПИН получателя (нужен только Казахстану и Киргизии).
export interface CisFormState {
  country: CisCountry | null
  city: string
  address: string
  taxId: string
}

// Зеркало серверных проверок для доставки в страны ЕАЭС (checkout.ts в api):
// международный телефон, обязательный email, город только из списка страны,
// ИИН/ПИН для таможни Казахстана и Киргизии.
export function validateCisCheckoutForm(
  fields: CheckoutFormFields,
  cis: CisFormState,
): CheckoutFormErrors {
  const errors = validateContacts(fields, { international: true })
  if (!cis.country) {
    errors.country = 'Выберите страну'
  } else if (cis.city === '') {
    errors.cisCity = 'Выберите город из списка'
  } else if (!isCisCity(cis.country, cis.city)) {
    errors.cisCity = 'Доставка в этот город недоступна'
  }
  if (cis.address.trim() === '') {
    errors.cisAddress = 'Укажите адрес пункта выдачи СДЭК'
  }
  const taxIdError = cis.country ? cisTaxIdError(cis.country, cis.taxId) : null
  if (taxIdError) errors.cisTaxId = taxIdError
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

const AWAITING_PAYMENT_STORAGE_KEY = 'ximi4ka-checkout-awaiting-payment'
// Ссылка Т-Кассы живёт недолго: старую запись не показываем, чтобы не вести на
// истёкшую оплату. Сценарий — «Назад» со шлюза, это минуты, а не часы.
const AWAITING_PAYMENT_TTL_MS = 60 * 60 * 1000

export interface AwaitingPayment {
  orderNumber: string
  publicToken: string
  paymentUrl: string
}

// Заказ создан и браузер уходит на шлюз; корзина к этому моменту очищена. Если
// покупатель вернётся «Назад», чекаут предложит оплатить этот заказ, а не
// покажет тупик «Корзина пуста». sessionStorage — только эта вкладка.
export function rememberAwaitingPayment(value: AwaitingPayment): void {
  try {
    window.sessionStorage.setItem(
      AWAITING_PAYMENT_STORAGE_KEY,
      JSON.stringify({ ...value, ts: Date.now() }),
    )
  } catch {
    // закрытое хранилище — плашки просто не будет
  }
}

export function readAwaitingPayment(now = Date.now()): AwaitingPayment | null {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(AWAITING_PAYMENT_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<AwaitingPayment & { ts: number }>
    if (
      typeof v.orderNumber !== 'string' ||
      typeof v.publicToken !== 'string' ||
      typeof v.paymentUrl !== 'string' ||
      !v.paymentUrl.startsWith('https://') ||
      typeof v.ts !== 'number' ||
      now - v.ts > AWAITING_PAYMENT_TTL_MS
    ) {
      return null
    }
    return { orderNumber: v.orderNumber, publicToken: v.publicToken, paymentUrl: v.paymentUrl }
  } catch {
    return null
  }
}

export function forgetAwaitingPayment(): void {
  try {
    window.sessionStorage.removeItem(AWAITING_PAYMENT_STORAGE_KEY)
  } catch {
    // см. выше
  }
}

// Full-page navigation to an external payment URL (Т-Касса). Kept as a
// module export instead of an inline `window.location.assign` so page tests
// can mock the module and assert the redirect without jsdom navigation.
export function redirectTo(url: string): void {
  window.location.assign(url)
}
