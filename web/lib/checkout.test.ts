import { beforeEach, describe, it, expect } from 'vitest'
import {
  SHIPPING_RULES,
  calcShippingRub,
  formatPhoneInput,
  phoneDigits,
  validateCheckoutForm,
  getOrCreateIdempotencyKey,
  clearIdempotencyKey,
  type CheckoutFormFields,
} from './checkout'

const validFields: CheckoutFormFields = {
  name: 'Мария',
  phone: '+7 (912) 345-67-89',
  email: '',
  method: 'cdek_pvz',
  address: 'Москва, ул. Ленина, 1',
  comment: '',
}

describe('shipping rules', () => {
  it('mirror the server: ПВЗ 350 ₽ / бесплатно от 3000 ₽', () => {
    expect(SHIPPING_RULES.cdek_pvz).toEqual({ freeFromRub: 3000, priceRub: 350 })
  })

  it('mirror the server: курьер 500 ₽ / бесплатно от 5000 ₽', () => {
    expect(SHIPPING_RULES.cdek_courier).toEqual({ freeFromRub: 5000, priceRub: 500 })
  })

  it('charges below the threshold and is free at/above it (inclusive)', () => {
    expect(calcShippingRub('cdek_pvz', 2999)).toBe(350)
    expect(calcShippingRub('cdek_pvz', 3000)).toBe(0)
    expect(calcShippingRub('cdek_courier', 4999)).toBe(500)
    expect(calcShippingRub('cdek_courier', 5000)).toBe(0)
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
    expect(validateCheckoutForm(validFields)).toEqual({})
  })

  it('requires the name', () => {
    const errors = validateCheckoutForm({ ...validFields, name: '   ' })
    expect(errors.name).toMatch(/укажите имя/i)
  })

  it('requires a complete phone number', () => {
    const errors = validateCheckoutForm({ ...validFields, phone: '+7 (912) 345' })
    expect(errors.phone).toMatch(/телефон/i)
  })

  it('rejects a malformed email but allows an empty one', () => {
    expect(validateCheckoutForm({ ...validFields, email: 'нет-собаки' }).email).toMatch(
      /email/i,
    )
    expect(validateCheckoutForm({ ...validFields, email: '' }).email).toBeUndefined()
    expect(
      validateCheckoutForm({ ...validFields, email: 'a@b.ru' }).email,
    ).toBeUndefined()
  })

  it('requires the address', () => {
    const errors = validateCheckoutForm({ ...validFields, address: '' })
    expect(errors.address).toMatch(/адрес/i)
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
