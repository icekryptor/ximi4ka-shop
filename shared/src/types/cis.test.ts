import { describe, expect, it } from 'vitest'
import { CIS_CITIES, CIS_COUNTRIES, CIS_DELIVERY_RULES, cisShippingRub, isCisCity } from './cis.js'

describe('cisShippingRub', () => {
  it('Беларусь: 700 ₽ ниже 3000, бесплатно от 3000', () => {
    expect(cisShippingRub('BY', 2999)).toBe(700)
    expect(cisShippingRub('BY', 3000)).toBe(0)
  })

  it('Казахстан и Киргизия: 900 ₽ ниже 5000, бесплатно от 5000', () => {
    for (const c of ['KZ', 'KG'] as const) {
      expect(cisShippingRub(c, 4999)).toBe(900)
      expect(cisShippingRub(c, 5000)).toBe(0)
    }
  })

  it('Армения: 1200 ₽ ниже 5000, бесплатно от 5000', () => {
    expect(cisShippingRub('AM', 4999)).toBe(1200)
    expect(cisShippingRub('AM', 5000)).toBe(0)
  })

  // Текст страницы /order-process описывает Казахстан и Киргизию одной строкой, а порог
  // бесплатной доставки Армении — тем же, что у Казахстана: правило должно совпадать.
  it('Казахстан и Киргизия имеют одинаковое правило, порог Армении как у Казахстана', () => {
    expect(CIS_DELIVERY_RULES.KG.freeFromRub).toBe(CIS_DELIVERY_RULES.KZ.freeFromRub)
    expect(CIS_DELIVERY_RULES.KG.priceRub).toBe(CIS_DELIVERY_RULES.KZ.priceRub)
    expect(CIS_DELIVERY_RULES.AM.freeFromRub).toBe(CIS_DELIVERY_RULES.KZ.freeFromRub)
  })

  it('пороги и цены заданы для каждой страны', () => {
    for (const c of CIS_COUNTRIES) {
      expect(CIS_DELIVERY_RULES[c].priceRub).toBeGreaterThan(0)
      expect(CIS_DELIVERY_RULES[c].freeFromRub).toBeGreaterThan(0)
    }
  })
})

describe('CIS_CITIES / isCisCity', () => {
  it('city принимается только в своей стране', () => {
    expect(isCisCity('BY', 'Минск')).toBe(true)
    expect(isCisCity('KZ', 'Минск')).toBe(false)
    expect(isCisCity('KZ', 'Алматы')).toBe(true)
    expect(isCisCity('AM', 'Ереван')).toBe(true)
    expect(isCisCity('KG', 'Бишкек')).toBe(true)
  })

  it('неизвестный и пустой город отклоняется', () => {
    expect(isCisCity('BY', 'Атлантида')).toBe(false)
    expect(isCisCity('BY', '')).toBe(false)
  })

  it('в данных нет пустых и повторяющихся названий', () => {
    for (const country of CIS_COUNTRIES) {
      const cities = CIS_CITIES[country]
      expect(cities.length).toBeGreaterThan(0)
      expect(cities.every((c) => c.trim() === c && c.length > 0)).toBe(true)
      expect(new Set(cities).size).toBe(cities.length)
    }
  })
})
