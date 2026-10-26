import { describe, expect, it } from 'vitest'
import {
  CIS_CITIES,
  CIS_COUNTRIES,
  CIS_DELIVERY_RULES,
  CIS_TAX_ID,
  cisShippingRub,
  cisTaxIdError,
  isCisCity,
  normalizeTaxId,
} from './cis.js'

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

describe('cisTaxIdError: ИИН Казахстана и ПИН Киргизии для таможни', () => {
  it('номер нужен только Казахстану и Киргизии', () => {
    expect(Object.keys(CIS_TAX_ID).sort()).toEqual(['KG', 'KZ'])
    expect(cisTaxIdError('BY', '')).toBeNull()
    expect(cisTaxIdError('AM', '')).toBeNull()
  })

  it('Казахстан: пустой ИИН — ошибка с причиной', () => {
    expect(cisTaxIdError('KZ', '  ')).toBe('Укажите ИИН — без него посылку не пропустит таможня')
  })

  it('Казахстан: ИИН — ровно 12 цифр', () => {
    expect(cisTaxIdError('KZ', '85010130050')).toBe('ИИН — 12 цифр')
    expect(cisTaxIdError('KZ', '8501013005001')).toBe('ИИН — 12 цифр')
    expect(cisTaxIdError('KZ', '85010130050a')).toBe('ИИН — 12 цифр')
  })

  it('Казахстан: контрольная цифра сходится — номер принят, пробелы не мешают', () => {
    expect(cisTaxIdError('KZ', '850101300500')).toBeNull()
    expect(cisTaxIdError('KZ', '920303400015')).toBeNull()
    expect(cisTaxIdError('KZ', ' 850101 300500 ')).toBeNull()
  })

  // Первый проход даёт 10 — контрольную цифру считают со вторыми весами (3…11, 1, 2).
  it('Казахстан: контрольная цифра по второму набору весов', () => {
    expect(cisTaxIdError('KZ', '850101300603')).toBeNull()
    expect(cisTaxIdError('KZ', '850101300600')).toBe('Проверьте ИИН — в номере опечатка')
  })

  it('Казахстан: опечатка в ИИН ловится контрольной цифрой', () => {
    expect(cisTaxIdError('KZ', '850101300501')).toBe('Проверьте ИИН — в номере опечатка')
    // Оба прохода дают 10 — такой номер не выдаётся вовсе.
    expect(cisTaxIdError('KZ', '850101300690')).toBe('Проверьте ИИН — в номере опечатка')
  })

  it('Киргизия: ПИН обязателен и состоит из 14 цифр', () => {
    expect(cisTaxIdError('KG', '')).toBe('Укажите ПИН — без него посылку не пропустит таможня')
    expect(cisTaxIdError('KG', '2150119901234')).toBe('ПИН — 14 цифр')
    expect(cisTaxIdError('KG', '21501199012345')).toBeNull()
    expect(cisTaxIdError('KG', '215 0119 9012345')).toBeNull()
  })

  it('normalizeTaxId убирает пробелы и дефисы', () => {
    expect(normalizeTaxId(' 850101-300 500 ')).toBe('850101300500')
  })
})
