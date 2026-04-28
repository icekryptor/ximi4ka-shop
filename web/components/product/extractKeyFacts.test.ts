import { describe, it, expect } from 'vitest'
import { extractKeyFacts } from './extractKeyFacts'

describe('extractKeyFacts', () => {
  it('returns empty array when characteristics is empty', () => {
    expect(extractKeyFacts({})).toEqual([])
  })

  it('picks up to 4 priority keys in priority order', () => {
    const facts = extractKeyFacts({
      ГОСТ: '4165-78',
      Возраст: '10+',
      'Химическая формула': 'CuSO4',
      Концентрация: '5%',
      Объем: '35 мл',
      Производитель: 'Россия',
    })
    // Priority order is: Возраст, Концентрация, Объем, Масса, Хим. формула, ...
    expect(facts).toEqual([
      { label: 'Возраст', value: '10+' },
      { label: 'Концентрация', value: '5%' },
      { label: 'Объем', value: '35 мл' },
      { label: 'Химическая формула', value: 'CuSO4' },
    ])
  })

  it('returns fewer than 4 when not enough priority keys are present', () => {
    const facts = extractKeyFacts({ Объем: '35 мл', ГОСТ: '4165-78' })
    expect(facts).toEqual([
      { label: 'Объем', value: '35 мл' },
      { label: 'ГОСТ', value: '4165-78' },
    ])
  })

  it('ignores keys not in the priority list', () => {
    expect(extractKeyFacts({ 'Не приоритетный ключ': 'значение' })).toEqual([])
  })
})

import { extractUseFacts, extractGalleryImages } from './extractKeyFacts'
import type { Product, ProductImage } from '@ximi4ka-shop/shared'

describe('extractUseFacts', () => {
  it('returns up to 4 use-facts in priority order', () => {
    const chars = {
      'Возраст': '10+',
      'Время опыта': '5–20 минут',
      'Срок изготовления': '1 день',
      'Гарантия': '12 месяцев',
      'Кол-во гнезд': '12',  // not a use-fact, ignored
    }
    const result = extractUseFacts(chars)
    expect(result).toEqual([
      { key: 'age',     label: 'возраст',  big: '10+',         bottomLeft: 'от 10 лет',     bottomRight: 'рекомендуется' },
      { key: 'time',    label: 'время',    big: '5–20 минут',  bottomLeft: 'минут',          bottomRight: 'на один опыт' },
      { key: 'lead',    label: 'срок',     big: '1 день',      bottomLeft: 'готовность',     bottomRight: 'к отправке' },
      { key: 'warranty',label: 'гарантия', big: '12 месяцев',  bottomLeft: 'на компоненты',  bottomRight: 'возврат 30 дней' },
    ])
  })

  it('hides individual cells when characteristic is missing', () => {
    const chars = { 'Возраст': '8+', 'Гарантия': '6 месяцев' }
    const result = extractUseFacts(chars)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.key)).toEqual(['age', 'warranty'])
  })

  it('returns empty array when no use-facts present', () => {
    expect(extractUseFacts({ 'Кол-во гнезд': '12' })).toEqual([])
  })
})

describe('extractGalleryImages', () => {
  const mkImg = (i: number, url: string): ProductImage => ({
    id: `img-${i}`, productId: 'p', url, alt: '', sortOrder: i,
  })

  it('returns images sorted by sortOrder ascending', () => {
    const product = {
      images: [mkImg(2, 'b.jpg'), mkImg(0, 'a.jpg'), mkImg(1, 'mid.jpg')],
    } as unknown as Product
    expect(extractGalleryImages(product).map(i => i.url)).toEqual(['a.jpg', 'mid.jpg', 'b.jpg'])
  })

  it('returns empty array when product has no images', () => {
    expect(extractGalleryImages({ images: [] } as unknown as Product)).toEqual([])
  })
})
