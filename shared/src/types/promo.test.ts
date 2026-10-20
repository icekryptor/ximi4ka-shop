import { describe, expect, it } from 'vitest'
import { findPromo, normalizePromoCode, promoDiscountRub } from './promo'

describe('normalizePromoCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizePromoCode('  renata2026 ')).toBe('RENATA2026')
  })
})

describe('findPromo', () => {
  it('finds RENATA2026 regardless of case and spaces', () => {
    expect(findPromo('RENATA2026')).toEqual({ code: 'RENATA2026', percent: 5 })
    expect(findPromo(' renata2026 ')).toEqual({ code: 'RENATA2026', percent: 5 })
  })

  it('returns null for unknown or empty codes', () => {
    expect(findPromo('NOPE')).toBeNull()
    expect(findPromo('')).toBeNull()
    expect(findPromo('   ')).toBeNull()
  })

  it('does not match inherited object keys', () => {
    expect(findPromo('constructor')).toBeNull()
    expect(findPromo('__proto__')).toBeNull()
  })
})

describe('promoDiscountRub', () => {
  it('takes the percent of the goods total, rounded to whole rubles', () => {
    expect(promoDiscountRub(3099, 5)).toBe(155)
    expect(promoDiscountRub(1000, 5)).toBe(50)
    expect(promoDiscountRub(0, 5)).toBe(0)
  })

  it('never goes below zero or above the goods total', () => {
    expect(promoDiscountRub(-10, 5)).toBe(0)
    expect(promoDiscountRub(100, 150)).toBe(100)
  })
})
