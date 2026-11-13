import { describe, it, expect } from 'vitest'
import { WB_PRICES, buildWbPrices, formatAsOf, wbComparison, type WbPrice } from './wbPrices'

const NOW = new Date('2026-11-14T12:00:00+03:00')
const prices: Record<string, WbPrice> = {
  'himichka-30': { priceRub: 3790, asOf: '2026-11-14' },
  'mini-himichka': { priceRub: 1400, asOf: '2026-11-14' },
  'old-one': { priceRub: 5000, asOf: '2026-10-20' },
  'almost-same': { priceRub: 3000, asOf: '2026-11-14' },
}

describe('wbComparison', () => {
  it('считает выгоду в рублях и процентах от цены WB, проценты вниз', () => {
    // (3790 − 2949) / 3790 = 22,19% → 22
    expect(wbComparison('himichka-30', 2949, NOW, prices)).toEqual({
      wbPriceRub: 3790,
      savingRub: 841,
      savingPct: 22,
      asOf: '2026-11-14',
      sumOfParts: false,
    })
  })

  it('нет цены WB — нет сравнения', () => {
    expect(wbComparison('elektrohimichka', 2949, NOW, prices)).toBeNull()
  })

  it('на WB дешевле или так же — сравнения нет', () => {
    expect(wbComparison('mini-himichka', 1499, NOW, prices)).toBeNull()
    expect(wbComparison('almost-same', 2990, NOW, prices)).toBeNull()
  })

  it('цена старше двух недель не показывается', () => {
    expect(wbComparison('old-one', 3000, NOW, prices)).toBeNull()
  })

  it('товар без цены в таблице владельца — без сравнения', () => {
    expect(wbComparison('zapas-vseh-reaktivov', 6999, NOW)).toBeNull()
  })
})

describe('formatAsOf', () => {
  it('переводит дату в привычный вид', () => {
    expect(formatAsOf('2026-11-14')).toBe('14.11.2026')
  })
})

describe('WB_PRICES — цены владельца от 14.11.2026', () => {
  it('наборы — как прислал владелец', () => {
    expect(WB_PRICES['himichka-30'].priceRub).toBe(3617)
    expect(WB_PRICES['elektrohimichka'].priceRub).toBe(3617)
    expect(WB_PRICES['mini-himichka'].priceRub).toBe(1858)
    expect(WB_PRICES['bolshoi-nabor-dlya-oge'].priceRub).toBe(4114)
  })

  it('комбо — сумма наборов по отдельности', () => {
    expect(WB_PRICES['all-4-kits']).toEqual({
      priceRub: 3617 + 3617 + 1858 + 4114,
      asOf: '2026-11-14',
      sumOfParts: true,
    })
    expect(WB_PRICES['vse-tri-nabora'].priceRub).toBe(3617 + 3617 + 1858)
    expect(WB_PRICES['himichka-i-elektrohimichka'].priceRub).toBe(3617 + 3617)
  })

  it('видны до конца акции и гаснут после двух недель', () => {
    expect(wbComparison('himichka-30', 2949, new Date('2026-11-28T23:00:00+03:00'))).not.toBeNull()
    expect(wbComparison('himichka-30', 2949, new Date('2026-11-29T01:00:00+03:00'))).toBeNull()
  })
})

describe('buildWbPrices', () => {
  it('не считает сумму комбо, если цены хоть одного набора нет', () => {
    const out = buildWbPrices({ a: 100 }, { ab: ['a', 'b'] }, '2026-11-14')
    expect(out.ab).toBeUndefined()
    expect(out.a).toEqual({ priceRub: 100, asOf: '2026-11-14' })
  })
})
