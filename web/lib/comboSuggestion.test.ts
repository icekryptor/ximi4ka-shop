import { describe, it, expect } from 'vitest'
import { suggestCombo, type ComboProduct } from './comboSuggestion'
import type { StagedLine } from './wholesaleStaging'

const kit = (slug: string, quantity: number, priceRub: number): StagedLine => ({
  productId: `id-${slug}`,
  slug,
  name: slug,
  priceRub,
  image: null,
  categories: ['kits'],
  stockStatus: 'in_stock',
  quantity,
})

const combo = (
  slug: string,
  priceRub: number,
  extra: Partial<ComboProduct> = {},
): ComboProduct => ({
  productId: `id-${slug}`,
  slug,
  name: slug,
  priceRub,
  image: null,
  categories: ['combo'],
  stockStatus: 'in_stock',
  ...extra,
})

const H = (q: number) => kit('himichka-30', q, 3099)
const E = (q: number) => kit('elektrohimichka', q, 3099)
const M = (q: number) => kit('mini-himichka', q, 1699)
const O = (q: number) => kit('bolshoi-nabor-dlya-oge', q, 3490)

const pair = combo('himichka-i-elektrohimichka', 5678)
const triple = combo('vse-tri-nabora', 6499)
const offers = new Map([
  [pair.slug, pair],
  [triple.slug, triple],
])

describe('suggestCombo', () => {
  it('предлагает комбо на пару наборов: 3099 + 3099 → 5678', () => {
    const s = suggestCombo([H(1), E(1)], offers)
    expect(s?.combo.slug).toBe('himichka-i-elektrohimichka')
    expect(s?.times).toBe(1)
    expect(s?.savingsRub).toBe(520)
    expect(s?.nextLines.map((l) => [l.slug, l.quantity])).toEqual([
      ['himichka-i-elektrohimichka', 1],
    ])
  })

  it('из нескольких комбо берёт самое выгодное: три набора лучше пары', () => {
    const s = suggestCombo([H(1), E(1), M(1)], offers)
    expect(s?.combo.slug).toBe('vse-tri-nabora')
    expect(s?.savingsRub).toBe(1398)
    expect(s?.nextLines.map((l) => l.slug)).toEqual(['vse-tri-nabora'])
  })

  it('«Все четыре набора» выигрывает у «Трёх наборов», когда он есть в каталоге', () => {
    const four = combo('vse-chetyre-nabora', 9000)
    const s = suggestCombo([H(1), E(1), M(1), O(1)], new Map([...offers, [four.slug, four]]))
    expect(s?.combo.slug).toBe('vse-chetyre-nabora')
    expect(s?.savingsRub).toBe(3099 + 3099 + 1699 + 3490 - 9000)
  })

  it('заменяет только полные комплекты, остаток наборов остаётся в списке', () => {
    const s = suggestCombo([H(2), E(1)], offers)
    expect(s?.times).toBe(1)
    expect(s?.savingsRub).toBe(520)
    expect(s?.nextLines.map((l) => [l.slug, l.quantity])).toEqual([
      ['himichka-30', 1],
      ['himichka-i-elektrohimichka', 1],
    ])
  })

  it('не предлагает комбо, если наборы с оптовой скидкой выходят дешевле', () => {
    // 5 + 5 по 2800 = 28000, а пять комбо по 5678 = 28390.
    expect(suggestCombo([H(5), E(5)], offers)).toBeNull()
  })

  it('добавляет к уже выбранным комбо, а не дублирует строку', () => {
    const s = suggestCombo(
      [H(1), E(1), { ...kit(pair.slug, 1, 5678), categories: ['combo'] }],
      offers,
    )
    expect(s?.nextLines).toHaveLength(1)
    expect(s?.nextLines[0].quantity).toBe(2)
  })

  it('не предлагает без полного набора компонентов или без данных о комбо', () => {
    expect(suggestCombo([H(1)], offers)).toBeNull()
    expect(suggestCombo([H(1), E(1)], new Map())).toBeNull()
  })

  it('пропускает комбо, которого нет в наличии', () => {
    const sold = new Map([[pair.slug, { ...pair, stockStatus: 'out_of_stock' as const }]])
    expect(suggestCombo([H(1), E(1)], sold)).toBeNull()
  })
})
