import { describe, it, expect } from 'vitest'
import type { CdekPoint } from '@ximi4ka-shop/shared'
import { POINTS_SHOWN, cityRegion, normalizeSearchText, searchPoints } from './cdekPoints'

function point(code: string, address: string, name = `${code}, Москва`): CdekPoint {
  return { code, name, address, location: [37.6, 55.7], workTime: 'Пн-Пт 10:00-20:00' }
}

const MIRA = point('MSK310', 'пр-т Мира, 108', 'MSK310, Москва, пр-т Мира')
const DINAMO = point('MSK65', 'ул. Динамовская, 1А, 110а', 'MSK65, Москва, ул. Динамовская')
const KOROLEV = point('KRL2', 'ул. Королёва, 5')

describe('normalizeSearchText', () => {
  it('нижний регистр, ё как е, знаки препинания — пробелы', () => {
    expect(normalizeSearchText('  Пр-т Мира, 108 ')).toBe('пр т мира 108')
    expect(normalizeSearchText('Королёв')).toBe('королев')
  })
})

describe('searchPoints', () => {
  const points = [MIRA, DINAMO, KOROLEV]

  it('«мира 108» находит «пр-т Мира, 108»: каждое слово — где угодно', () => {
    expect(searchPoints(points, 'мира 108').matches).toEqual([MIRA])
  })

  it('«ё» и «е» не различаются в обе стороны', () => {
    expect(searchPoints(points, 'королева').matches).toEqual([KOROLEV])
    expect(searchPoints([point('X1', 'ул. Королева, 5')], 'королёва').total).toBe(1)
  })

  it('находит по коду пункта без учёта регистра', () => {
    expect(searchPoints(points, 'msk65').matches).toEqual([DINAMO])
  })

  it('знаки препинания в запросе не мешают', () => {
    expect(searchPoints(points, 'Мира,108.').matches).toEqual([MIRA])
  })

  it('все слова обязательны: «мира 5» не находит ничего', () => {
    expect(searchPoints(points, 'мира 5')).toEqual({ matches: [], total: 0 })
  })

  it('пустой запрос — все пункты', () => {
    expect(searchPoints(points, '  ').total).toBe(3)
  })

  it('показывает первые 50, а total — сколько совпало всего', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      point(`MSK${1000 + i}`, `ул. Тестовая, ${i}`),
    )
    const result = searchPoints(many, 'тестовая')
    expect(POINTS_SHOWN).toBe(50)
    expect(result.matches).toHaveLength(50)
    expect(result.matches[0]).toBe(many[0])
    expect(result.total).toBe(120)
  })
})

describe('cityRegion', () => {
  it('регион — часть перед страной', () => {
    expect(cityRegion('Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия')).toBe(
      'Кабардино-Балкария',
    )
    expect(cityRegion('Королёв, Московская область, Россия')).toBe('Московская область')
  })

  it('у «Москва, Россия» региона нет', () => {
    expect(cityRegion('Москва, Россия')).toBeNull()
  })
})
