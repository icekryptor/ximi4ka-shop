import { describe, expect, it } from 'vitest'
import { MAX_PAYMENT_SURCHARGE_PERCENT, paymentSurchargeRub } from './payment'

describe('paymentSurchargeRub', () => {
  it('процент от базы, округление до рубля', () => {
    expect(paymentSurchargeRub(2700, 8)).toBe(216)
    expect(paymentSurchargeRub(1234, 8)).toBe(99) // 98.72
    expect(paymentSurchargeRub(25, 2)).toBe(1) // 0.5 → вверх
  })

  it('0% и отрицательный процент — без надбавки', () => {
    expect(paymentSurchargeRub(2700, 0)).toBe(0)
    expect(paymentSurchargeRub(2700, -5)).toBe(0)
  })

  it('дробный процент и не-число — без надбавки', () => {
    expect(paymentSurchargeRub(2700, 7.5)).toBe(0)
    expect(paymentSurchargeRub(2700, Number.NaN)).toBe(0)
    expect(paymentSurchargeRub(Number.NaN, 8)).toBe(0)
  })

  it('нулевая и отрицательная база — без надбавки', () => {
    expect(paymentSurchargeRub(0, 8)).toBe(0)
    expect(paymentSurchargeRub(-100, 8)).toBe(0)
  })

  it('процент выше потолка режется до потолка', () => {
    expect(paymentSurchargeRub(1000, 50)).toBe((1000 * MAX_PAYMENT_SURCHARGE_PERCENT) / 100)
  })
})
