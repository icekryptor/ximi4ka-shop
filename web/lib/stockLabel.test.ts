import { describe, it, expect } from 'vitest'
import { stockLabel, formatRub } from './stockLabel'

describe('stockLabel', () => {
  it('returns "В наличии" for in_stock', () => {
    expect(stockLabel('in_stock')).toBe('В наличии')
  })
  it('returns "Нет в наличии" for out_of_stock', () => {
    expect(stockLabel('out_of_stock')).toBe('Нет в наличии')
  })
  it('returns "Предзаказ" for preorder', () => {
    expect(stockLabel('preorder')).toBe('Предзаказ')
  })
})

describe('formatRub', () => {
  it('formats integer rubles in ru-RU with ₽ sign', () => {
    // Narrow no-break space is locale-dependent; match digits + ₽.
    expect(formatRub(2490)).toMatch(/2\D490\D*₽/u)
  })
  it('drops fractional digits', () => {
    expect(formatRub(100)).toMatch(/^100\D*₽$/u)
  })
})
