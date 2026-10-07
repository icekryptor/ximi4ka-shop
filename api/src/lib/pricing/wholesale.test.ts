import { describe, it, expect } from 'vitest'
import { wholesaleUnitDiscounts, wholesaleLineTotals } from './wholesale.js'

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

const rl = (slug: string, quantity: number, priceRub: number, categories: string[]) => ({
  slug,
  quantity,
  priceRub,
  categories,
})
const total = (l: { slug: string; quantity: number; priceRub: number; categories?: string[] }) =>
  wholesaleLineTotals([l]).get(l.slug)

describe('wholesaleUnitDiscounts: наборы считаются раздельно', () => {
  it('не складывает количества Химичка 3.0, Электрохимичка и набора для ОГЭ', () => {
    const d = wholesaleUnitDiscounts([
      line('himichka-30', 3),
      line('elektrohimichka', 2),
      line('bolshoi-nabor-dlya-oge', 4),
    ])
    expect(d.get('himichka-30')).toBe(0)
    expect(d.get('elektrohimichka')).toBe(0)
    expect(d.get('bolshoi-nabor-dlya-oge')).toBe(0)
  })

  it('у каждого набора своя ступень по его количеству', () => {
    const d = wholesaleUnitDiscounts([
      line('himichka-30', 5),
      line('elektrohimichka', 10),
      line('bolshoi-nabor-dlya-oge', 20),
    ])
    expect(d.get('himichka-30')).toBe(299)
    expect(d.get('elektrohimichka')).toBe(399)
    expect(d.get('bolshoi-nabor-dlya-oge')).toBe(499)
  })
})

describe('wholesaleLineTotals', () => {
  describe('реагенты и оборудование: процент на позицию', () => {
    it.each([
      [4, 400],
      [5, 425],
      [9, 765],
      [10, 800],
      [19, 1520],
      [20, 1500],
      [49, 3675],
      [50, 3500],
    ])('реактив по 100 ₽ × %i → %i ₽', (qty, expected) => {
      expect(total(rl('copper-sulfate', qty, 100, ['reagents']))).toBe(expected)
    })

    it('оборудование считается так же, как реагенты', () => {
      expect(total(rl('beaker', 10, 100, ['equipment']))).toBe(800)
    })

    it('округляет сумму строки до рубля (80,75 → 81)', () => {
      expect(total(rl('beaker', 5, 19, ['equipment']))).toBe(81)
    })

    it('не складывает количества разных позиций', () => {
      const t = wholesaleLineTotals([rl('a', 3, 100, ['reagents']), rl('b', 3, 100, ['reagents'])])
      expect(t.get('a')).toBe(300)
      expect(t.get('b')).toBe(300)
    })

    it('не опускает цену ниже 1 ₽ за штуку', () => {
      expect(total(rl('cheap', 50, 1, ['reagents']))).toBe(50)
    })

    it('без категорий или с чужой категорией скидки нет', () => {
      expect(total(rl('x', 10, 100, []))).toBe(1000)
      expect(total({ slug: 'x', quantity: 10, priceRub: 100 })).toBe(1000)
      expect(total(rl('x', 10, 100, ['combo']))).toBe(1000)
      expect(total(rl('x', 10, 100, ['print']))).toBe(1000)
    })
  })

  describe('пробирки: цена партии', () => {
    it.each([
      [1, 29],
      [2, 39],
      [3, 87],
      [4, 116],
      [5, 99],
      [7, 203],
      [10, 169],
      [19, 551],
      [20, 299],
      [21, 313],
      [50, 719],
    ])('пробирка по 29 ₽ × %i → %i ₽', (qty, expected) => {
      expect(total(rl('probirka', qty, 29, ['equipment']))).toBe(expected)
    })

    it('не берёт процентную скидку оборудования', () => {
      expect(total(rl('probirka', 5, 29, ['equipment']))).toBe(99)
      expect(total(rl('probirka', 7, 29, ['equipment']))).toBe(203)
    })

    it('партия не применяется, если дороже обычной цены (19 ₽ за штуку)', () => {
      expect(total(rl('probirka', 2, 19, ['equipment']))).toBe(38)
      expect(total(rl('probirka', 5, 19, ['equipment']))).toBe(95)
      expect(total(rl('probirka', 10, 19, ['equipment']))).toBe(169)
      expect(total(rl('probirka', 20, 19, ['equipment']))).toBe(299)
    })
  })

  describe('пипетки: цена партии', () => {
    it.each([
      [1, 19],
      [2, 29],
      [3, 57],
      [5, 69],
      [10, 119],
      [20, 199],
      [21, 208],
      [50, 469],
    ])('пипетка по 19 ₽ × %i → %i ₽', (qty, expected) => {
      expect(total(rl('pipetka-pastera', qty, 19, ['equipment']))).toBe(expected)
    })
  })

  it('наборы считаются как раньше: сумма строки = (цена − скидка) × количество', () => {
    expect(total(rl('himichka-30', 5, 3099, ['kits']))).toBe(14000)
    expect(total(rl('mini-himichka', 5, 1699, ['kits']))).toBe(7500)
    expect(total(rl('himichka-30', 4, 3099, ['kits']))).toBe(12396)
  })

  it('комбо и печать без скидки, даже при больших количествах', () => {
    expect(total(rl('himichka-i-elektrohimichka', 10, 5678, ['combo']))).toBe(56780)
    expect(total(rl('poster', 50, 100, ['print']))).toBe(5000)
  })

  it('ignores prototype-like slugs', () => {
    expect(total(rl('constructor', 5, 100, []))).toBe(500)
    expect(total(rl('toString', 5, 100, []))).toBe(500)
  })

  it('считает смешанную корзину по строкам независимо', () => {
    const t = wholesaleLineTotals([
      rl('himichka-30', 5, 3099, ['kits']),
      rl('bolshoi-nabor-dlya-oge', 3, 3099, ['kits']),
      rl('copper-sulfate', 10, 100, ['reagents']),
      rl('probirka', 5, 29, ['equipment']),
    ])
    expect(t.get('himichka-30')).toBe(5 * 2800)
    expect(t.get('bolshoi-nabor-dlya-oge')).toBe(3 * 3099)
    expect(t.get('copper-sulfate')).toBe(800)
    expect(t.get('probirka')).toBe(99)
  })
  it('набор с категорией реагентов сохраняет скидку набора, а не процентную', () => {
    expect(total(rl('himichka-30', 5, 3099, ['kits', 'reagents']))).toBe(14000)
  })

  it('цена не поднимается выше обычной: бесплатный товар остаётся бесплатным', () => {
    expect(total(rl('free-reagent', 5, 0, ['reagents']))).toBe(0)
  })
})
