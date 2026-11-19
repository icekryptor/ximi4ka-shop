import { describe, it, expect } from 'vitest'
import { calcShippingRub } from './rates.js'

describe('calcShippingRub', () => {
  it('СДЭК ПВЗ: 350 ₽ below 2900 ₽, free from 2900 ₽ (inclusive)', () => {
    expect(calcShippingRub('cdek_pvz', 0)).toBe(350)
    expect(calcShippingRub('cdek_pvz', 2899)).toBe(350)
    expect(calcShippingRub('cdek_pvz', 2900)).toBe(0)
    expect(calcShippingRub('cdek_pvz', 10000)).toBe(0)
  })

  it('СДЭК курьер: 500 ₽ below 5000 ₽, free from 5000 ₽ (inclusive)', () => {
    expect(calcShippingRub('cdek_courier', 0)).toBe(500)
    expect(calcShippingRub('cdek_courier', 4999)).toBe(500)
    expect(calcShippingRub('cdek_courier', 5000)).toBe(0)
    expect(calcShippingRub('cdek_courier', 12345)).toBe(0)
  })
})
