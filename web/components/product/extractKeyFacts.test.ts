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
