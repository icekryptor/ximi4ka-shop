import { describe, it, expect } from 'vitest'
import { parseCharacteristics } from './parseCharacteristics'

const charBlock = (html: string) => ({ type: 'paragraph', html })

describe('parseCharacteristics', () => {
  it('finds the characteristics block by heading and parses keys/values', () => {
    const blocks = [
      charBlock('<p>some intro</p>'),
      charBlock(
        '<h3>Характеристики</h3>\n<ul>' +
          '<li><strong>Концентрация:</strong> 5%</li>' +
          '<li><strong>Объем:</strong> 35 мл</li>' +
          '<li><strong>Химическая формула:</strong> CuSO4</li>' +
          '</ul>',
      ),
    ]
    expect(parseCharacteristics(blocks)).toEqual({
      Концентрация: '5%',
      Объем: '35 мл',
      'Химическая формула': 'CuSO4',
    })
  })

  it('returns empty object when no characteristics block is present', () => {
    const blocks = [charBlock('<p>just description</p>')]
    expect(parseCharacteristics(blocks)).toEqual({})
  })

  it('returns empty object for empty array', () => {
    expect(parseCharacteristics([])).toEqual({})
  })

  it('returns empty object when input is not an array', () => {
    expect(parseCharacteristics(null as unknown as unknown[])).toEqual({})
    expect(parseCharacteristics(undefined as unknown as unknown[])).toEqual({})
  })

  it('handles broken / mismatched HTML gracefully (no throws, partial parse)', () => {
    const blocks = [
      charBlock(
        '<h3>Характеристики</h3><ul>' +
          '<li><strong>Объем:</strong> 35 мл</li>' +
          '<li>не li с strong</li>' +
          '<li><strong>ГОСТ:</strong> 4165-78</li>',
      ),
    ]
    expect(parseCharacteristics(blocks)).toEqual({
      Объем: '35 мл',
      ГОСТ: '4165-78',
    })
  })

  it('matches the characteristics heading case-insensitively', () => {
    const blocks = [
      charBlock(
        '<H3>ХАРАКТЕРИСТИКИ</H3><ul><li><strong>Возраст:</strong> с 10 лет</li></ul>',
      ),
    ]
    expect(parseCharacteristics(blocks)).toEqual({ Возраст: 'с 10 лет' })
  })

  it('strips inner tags and decodes common entities from values', () => {
    const blocks = [
      charBlock(
        '<h3>Характеристики</h3><ul>' +
          '<li><strong>Состав:</strong> медь&nbsp;сернокислая 5-водная&amp;вода</li>' +
          '<li><strong>Срок:</strong> <em>1,5</em> года</li>' +
          '</ul>',
      ),
    ]
    expect(parseCharacteristics(blocks)).toEqual({
      Состав: 'медь сернокислая 5-водная&вода',
      Срок: '1,5 года',
    })
  })

  it('skips non-paragraph blocks even if their content looks like characteristics', () => {
    const blocks = [
      { type: 'image', src: '<h3>Характеристики</h3>' },
      charBlock(
        '<h3>Характеристики</h3><ul><li><strong>K:</strong> V</li></ul>',
      ),
    ]
    expect(parseCharacteristics(blocks)).toEqual({ K: 'V' })
  })
})
