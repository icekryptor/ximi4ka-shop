import { describe, expect, test } from 'vitest'
import { DEFAULT_CASHBACK_PERCENT, cashbackCoins } from './coins.js'
import { PAID_ORDER_STATUSES, isPaidOrderStatus } from './order.js'

describe('cashbackCoins', () => {
  test('считает процент от суммы товаров', () => {
    expect(cashbackCoins(1900, 10)).toBe(190)
  })
  test('округляет вниз', () => {
    expect(cashbackCoins(1999, 10)).toBe(199)
    expect(cashbackCoins(9, 10)).toBe(0)
  })
  test('ноль и отрицательная сумма дают 0', () => {
    expect(cashbackCoins(0, 10)).toBe(0)
    expect(cashbackCoins(-50, 10)).toBe(0)
  })
  test('нулевой процент даёт 0', () => {
    expect(cashbackCoins(1000, 0)).toBe(0)
  })
  test('нецелая сумма сначала округляется вниз до рубля', () => {
    expect(cashbackCoins(1000.9, 10)).toBe(100)
  })
  test('процент по умолчанию — 10', () => {
    expect(DEFAULT_CASHBACK_PERCENT).toBe(10)
  })
})

describe('isPaidOrderStatus', () => {
  test('оплаченные статусы включают delivered', () => {
    expect(PAID_ORDER_STATUSES).toEqual(['paid', 'shipped', 'delivered'])
    expect(isPaidOrderStatus('paid')).toBe(true)
    expect(isPaidOrderStatus('shipped')).toBe(true)
    expect(isPaidOrderStatus('delivered')).toBe(true)
  })
  test('неоплаченные статусы', () => {
    expect(isPaidOrderStatus('cancelled')).toBe(false)
    expect(isPaidOrderStatus('pending')).toBe(false)
    expect(isPaidOrderStatus('failed')).toBe(false)
  })
})
