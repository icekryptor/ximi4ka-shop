import { beforeEach, describe, it, expect } from 'vitest'
import {
  SHIPPING_RULES,
  formatPhoneInput,
  phoneDigits,
  validateCheckoutForm,
  getOrCreateIdempotencyKey,
  clearIdempotencyKey,
  normalizeTelegramHandle,
  type CheckoutFormFields,
  type DeliveryFormState,
} from './checkout'

const validFields: CheckoutFormFields = {
  name: 'Мария',
  phone: '+7 (912) 345-67-89',
  email: '',
  telegram: '',
  comment: '',
}

// Город выбран, пункт выбран, цена готова.
const PVZ_READY: DeliveryFormState = {
  city: { code: 44 },
  method: 'cdek_pvz',
  point: { code: 'MSK65' },
  courier: { street: '', postalCode: '' },
  quoteStatus: 'ready',
}

describe('shipping rules', () => {
  it('mirror the server: ПВЗ 350 ₽ / бесплатно от 3000 ₽', () => {
    expect(SHIPPING_RULES.cdek_pvz).toEqual({ freeFromRub: 3000, priceRub: 350 })
  })

  it('mirror the server: курьер 500 ₽ / бесплатно от 5000 ₽', () => {
    expect(SHIPPING_RULES.cdek_courier).toEqual({ freeFromRub: 5000, priceRub: 500 })
  })
})

describe('formatPhoneInput (+7 mask)', () => {
  it('formats a full mobile number', () => {
    expect(formatPhoneInput('9123456789')).toBe('+7 (912) 345-67-89')
  })

  it('normalizes leading 8 to +7', () => {
    expect(formatPhoneInput('89123456789')).toBe('+7 (912) 345-67-89')
  })

  it('normalizes a pasted +7 number', () => {
    expect(formatPhoneInput('+7 912 345 67 89')).toBe('+7 (912) 345-67-89')
  })

  it('formats progressively while typing', () => {
    expect(formatPhoneInput('9')).toBe('+7 (9')
    expect(formatPhoneInput('912')).toBe('+7 (912')
    expect(formatPhoneInput('9123')).toBe('+7 (912) 3')
    expect(formatPhoneInput('912345')).toBe('+7 (912) 345')
    expect(formatPhoneInput('9123456')).toBe('+7 (912) 345-6')
    expect(formatPhoneInput('912345678')).toBe('+7 (912) 345-67-8')
  })

  it('returns empty string for empty input so the field can be cleared', () => {
    expect(formatPhoneInput('')).toBe('')
  })

  it('ignores excess digits beyond the 10-digit subscriber number', () => {
    expect(formatPhoneInput('912345678999')).toBe('+7 (912) 345-67-89')
  })

  it('extracts digits via phoneDigits', () => {
    expect(phoneDigits('+7 (912) 345-67-89')).toBe('79123456789')
  })
})

describe('validateCheckoutForm', () => {
  it('accepts a valid form', () => {
    expect(validateCheckoutForm(validFields, PVZ_READY)).toEqual({})
  })

  it('requires the name', () => {
    const errors = validateCheckoutForm({ ...validFields, name: '   ' }, PVZ_READY)
    expect(errors.name).toMatch(/укажите имя/i)
  })

  it('requires a complete phone number', () => {
    const errors = validateCheckoutForm({ ...validFields, phone: '+7 (912) 345' }, PVZ_READY)
    expect(errors.phone).toMatch(/телефон/i)
  })

  it('rejects a malformed email but allows an empty one', () => {
    expect(validateCheckoutForm({ ...validFields, email: 'нет-собаки' }, PVZ_READY).email).toMatch(
      /email/i,
    )
    expect(validateCheckoutForm({ ...validFields, email: '' }, PVZ_READY).email).toBeUndefined()
    expect(
      validateCheckoutForm({ ...validFields, email: 'a@b.ru' }, PVZ_READY).email,
    ).toBeUndefined()
  })

  it('без города — «Укажите город»', () => {
    expect(validateCheckoutForm(validFields, { ...PVZ_READY, city: null }).city).toBe(
      'Укажите город',
    )
  })
})

describe('validateCheckoutForm — доставка', () => {
  it('ПВЗ без пункта — «Выберите пункт получения»', () => {
    expect(validateCheckoutForm(validFields, { ...PVZ_READY, point: null })).toEqual({
      point: 'Выберите пункт получения',
    })
  })

  it('курьер: улица с домом обязательна, пункт не нужен', () => {
    const courier: DeliveryFormState = { ...PVZ_READY, method: 'cdek_courier', point: null }
    expect(validateCheckoutForm(validFields, courier).street).toBe('Укажите улицу и дом')
    expect(
      validateCheckoutForm(validFields, {
        ...courier,
        courier: { street: 'Тверская ул., 1', postalCode: '' },
      }),
    ).toEqual({})
  })

  it('индекс необязателен, но если указан — 6 цифр', () => {
    const courier: DeliveryFormState = {
      ...PVZ_READY,
      method: 'cdek_courier',
      point: null,
      courier: { street: 'Тверская ул., 1', postalCode: '1250' },
    }
    expect(validateCheckoutForm(validFields, courier).postalCode).toBe('Индекс — 6 цифр')
  })

  it('без готовой цены оформить нельзя', () => {
    expect(
      validateCheckoutForm(validFields, { ...PVZ_READY, quoteStatus: 'loading' }).delivery,
    ).toBe('Считаем доставку — подождите секунду')
    expect(validateCheckoutForm(validFields, { ...PVZ_READY, quoteStatus: 'error' }).delivery).toBe(
      'Не удалось рассчитать доставку — нажмите «Повторить расчёт»',
    )
  })
})

describe('normalizeTelegramHandle (форма)', () => {
  it('приводит ник к виду @username', () => {
    expect(normalizeTelegramHandle('t.me/maria_ivanova')).toBe('@maria_ivanova')
    expect(normalizeTelegramHandle('@maria_ivanova')).toBe('@maria_ivanova')
  })
  it('null для невалидного', () => {
    expect(normalizeTelegramHandle('мария')).toBeNull()
  })
})

describe('validateCheckoutForm — Telegram', () => {
  it('пустой Telegram — не ошибка', () => {
    expect(validateCheckoutForm({ ...validFields, telegram: '' }, PVZ_READY)).toEqual({})
  })
  it('невалидный ник — ошибка', () => {
    const errors = validateCheckoutForm({ ...validFields, telegram: 'мария' }, PVZ_READY)
    expect(errors.telegram).toMatch(/латинских/)
  })
})

describe('idempotency key', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('generates a uuid once and returns the same key on repeat calls', () => {
    const first = getOrCreateIdempotencyKey()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(getOrCreateIdempotencyKey()).toBe(first)
  })

  it('survives across "page reloads" via sessionStorage', () => {
    const first = getOrCreateIdempotencyKey()
    // A new call in a fresh module instance would read from sessionStorage.
    expect(window.sessionStorage.getItem('ximi4ka-checkout-idempotency-key')).toBe(first)
  })

  it('clearIdempotencyKey issues a fresh key for the next order', () => {
    const first = getOrCreateIdempotencyKey()
    clearIdempotencyKey()
    const second = getOrCreateIdempotencyKey()
    expect(second).not.toBe(first)
  })
})
