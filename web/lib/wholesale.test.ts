import { describe, it, expect } from 'vitest'
import { wholesaleUnitDiscounts } from './wholesale'

const line = (slug: string, quantity: number, priceRub = 3099) => ({ slug, quantity, priceRub })

describe('wholesaleUnitDiscounts', () => {
  it('gives no discount below 5 kits', () => {
    const d = wholesaleUnitDiscounts([line('himichka-30', 4)])
    expect(d.get('himichka-30')).toBe(0)
  })

  it.each([
    [5, 299],
    [9, 299],
    [10, 399],
    [19, 399],
    [20, 499],
    [49, 499],
    [50, 599],
    [120, 599],
  ])('Химичка 3.0 × %i → −%i ₽ per kit', (qty, off) => {
    expect(wholesaleUnitDiscounts([line('himichka-30', qty)]).get('himichka-30')).toBe(off)
  })

  it('counts Химичка 3.0 and Электрохимичка together', () => {
    const d = wholesaleUnitDiscounts([line('himichka-30', 3), line('elektrohimichka', 2)])
    expect(d.get('himichka-30')).toBe(299)
    expect(d.get('elektrohimichka')).toBe(299)
  })

  it('uses its own scale for Мини-Химичка and does not mix it with the big kits', () => {
    const d = wholesaleUnitDiscounts([line('himichka-30', 4), line('mini-himichka', 5, 1699)])
    expect(d.get('himichka-30')).toBe(0)
    expect(d.get('mini-himichka')).toBe(199)
    expect(wholesaleUnitDiscounts([line('mini-himichka', 10, 1699)]).get('mini-himichka')).toBe(299)
    expect(wholesaleUnitDiscounts([line('mini-himichka', 20, 1699)]).get('mini-himichka')).toBe(399)
    expect(wholesaleUnitDiscounts([line('mini-himichka', 50, 1699)]).get('mini-himichka')).toBe(499)
  })

  it('ignores other products, including combos', () => {
    const d = wholesaleUnitDiscounts([
      line('himichka-i-elektrohimichka', 10, 5678),
      line('probirka', 50, 19),
    ])
    expect(d.get('himichka-i-elektrohimichka')).toBe(0)
    expect(d.get('probirka')).toBe(0)
  })

  it('never makes a unit price lower than 1 ₽', () => {
    expect(wholesaleUnitDiscounts([line('mini-himichka', 50, 300)]).get('mini-himichka')).toBe(299)
  })
})
