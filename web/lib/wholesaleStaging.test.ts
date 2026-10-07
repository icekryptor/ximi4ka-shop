import { describe, it, expect } from 'vitest'
import {
  MAX_QTY,
  initialQuantity,
  nextTierHint,
  priceStaged,
  stepQuantity,
  toStagedLine,
  wholesaleBadge,
  wholesaleFromPrice,
  type StagedLine,
} from './wholesaleStaging'

const line = (
  slug: string,
  quantity: number,
  priceRub: number,
  categories: string[],
): StagedLine => ({
  productId: `id-${slug}`,
  slug,
  name: slug,
  priceRub,
  image: null,
  categories,
  stockStatus: 'in_stock',
  quantity,
})

describe('initialQuantity', () => {
  it('партии начинаются с первой ступени (2), остальное — с 5', () => {
    expect(initialQuantity('probirka')).toBe(2)
    expect(initialQuantity('pipetka-pastera')).toBe(2)
    expect(initialQuantity('himichka-30')).toBe(5)
    expect(initialQuantity('copper-sulfate')).toBe(5)
  })

  it('toStagedLine кладёт стартовое количество и поля товара', () => {
    const staged = toStagedLine({
      id: 'p1',
      slug: 'probirka',
      name: 'Пробирка',
      priceRub: 29,
      image: 'x.png',
      stockStatus: 'in_stock',
      categories: ['equipment'],
    })
    expect(staged).toMatchObject({ productId: 'p1', quantity: 2, image: 'x.png' })
  })
})

describe('stepQuantity', () => {
  it('пробирки идут по ступеням 2 → 5 → 10 → 20 → 21 → 22', () => {
    expect(stepQuantity('probirka', 2, 1)).toBe(5)
    expect(stepQuantity('probirka', 5, 1)).toBe(10)
    expect(stepQuantity('probirka', 10, 1)).toBe(20)
    expect(stepQuantity('probirka', 20, 1)).toBe(21)
    expect(stepQuantity('probirka', 21, 1)).toBe(22)
  })

  it('и назад: 22 → 21 → 20 → 10 → 5 → 2, ниже 2 не опускается', () => {
    expect(stepQuantity('probirka', 22, -1)).toBe(21)
    expect(stepQuantity('probirka', 21, -1)).toBe(20)
    expect(stepQuantity('probirka', 20, -1)).toBe(10)
    expect(stepQuantity('probirka', 10, -1)).toBe(5)
    expect(stepQuantity('probirka', 5, -1)).toBe(2)
    expect(stepQuantity('probirka', 2, -1)).toBe(2)
  })

  it('не выходит за 99', () => {
    expect(stepQuantity('probirka', MAX_QTY, 1)).toBe(MAX_QTY)
    expect(stepQuantity('copper-sulfate', MAX_QTY, 1)).toBe(MAX_QTY)
  })

  it('остальные товары — по одному, от 1 до 99', () => {
    expect(stepQuantity('copper-sulfate', 5, 1)).toBe(6)
    expect(stepQuantity('copper-sulfate', 5, -1)).toBe(4)
    expect(stepQuantity('copper-sulfate', 1, -1)).toBe(1)
  })
})

describe('priceStaged', () => {
  it('считает строки, итог и экономию тем же движком, что корзина', () => {
    const priced = priceStaged([
      line('probirka', 5, 29, ['equipment']),
      line('copper-sulfate', 5, 100, ['reagents']),
    ])
    expect(priced.lines.map((l) => [l.slug, l.listRub, l.totalRub])).toEqual([
      ['probirka', 145, 99],
      ['copper-sulfate', 500, 425],
    ])
    expect(priced.listRub).toBe(645)
    expect(priced.totalRub).toBe(524)
    expect(priced.savingsRub).toBe(121)
  })

  it('наборы считаются каждый по своему количеству', () => {
    const priced = priceStaged([
      line('himichka-30', 5, 3099, ['kits']),
      line('bolshoi-nabor-dlya-oge', 3, 3099, ['kits']),
    ])
    expect(priced.totalRub).toBe(5 * 2800 + 3 * 3099)
  })

  it('пустой список — нули', () => {
    expect(priceStaged([])).toEqual({ lines: [], listRub: 0, totalRub: 0, savingsRub: 0 })
  })
})

describe('nextTierHint', () => {
  it('реактив: сколько штук до следующей ступени', () => {
    const l = line('copper-sulfate', 5, 100, ['reagents'])
    expect(nextTierHint(l)).toBe('ещё 5 шт — и цена станет ниже')
  })

  it('набор: считается по его собственному количеству', () => {
    const a = line('himichka-30', 3, 3099, ['kits'])
    expect(nextTierHint(a)).toBe('ещё 2 шт — и цена станет ниже')
  })

  it('партия: следующая ступень таблицы', () => {
    const l = line('probirka', 2, 29, ['equipment'])
    expect(nextTierHint(l)).toBe('ещё 3 шт — и цена станет ниже')
  })

  it('на верхней ступени подсказки нет', () => {
    const l = line('copper-sulfate', 50, 100, ['reagents'])
    expect(nextTierHint(l)).toBeNull()
    const t = line('probirka', 21, 29, ['equipment'])
    expect(nextTierHint(t)).toBeNull()
  })
})

describe('wholesaleBadge', () => {
  it('описывает правило товара коротко', () => {
    expect(wholesaleBadge('himichka-30', ['kits'])).toBe('от 5 шт: −299 ₽ с набора')
    expect(wholesaleBadge('mini-himichka', ['kits'])).toBe('от 5 шт: −199 ₽ с набора')
    expect(wholesaleBadge('copper-sulfate', ['reagents'])).toBe('от 5 шт: −15%')
    expect(wholesaleBadge('probirka', ['equipment'])).toBe('партиями от 2 шт')
    expect(wholesaleBadge('poster', ['print'])).toBeNull()
  })
})

describe('wholesaleFromPrice', () => {
  it('набор: цена за штуку на первой скидочной ступени', () => {
    expect(wholesaleFromPrice('himichka-30', ['kits'], 3099)).toEqual({ unitRub: 2800, minQty: 5 })
    expect(wholesaleFromPrice('mini-himichka', ['kits'], 1699)).toEqual({
      unitRub: 1500,
      minQty: 5,
    })
  })

  it('реагент: процент на первой ступени, округление до рубля', () => {
    // 99 × 5 = 495 → −15% = 420,75 → 421 ₽ за пять → 84 ₽ за штуку
    expect(wholesaleFromPrice('copper-sulfate', ['reagents'], 99)).toEqual({
      unitRub: 84,
      minQty: 5,
    })
  })

  it('партия: первая ступень, на которой выходит дешевле обычной цены', () => {
    expect(wholesaleFromPrice('probirka', ['equipment'], 29)).toEqual({ unitRub: 20, minQty: 2 })
    // при цене 19 ₽ партии из 2 и 5 штук не дешевле обычной — берём ступень 10
    expect(wholesaleFromPrice('probirka', ['equipment'], 19)).toEqual({ unitRub: 17, minQty: 10 })
  })

  it('без оптового правила или без выгоды — null', () => {
    expect(wholesaleFromPrice('poster', ['print'], 300)).toBeNull()
    expect(wholesaleFromPrice('probirka', ['equipment'], 5)).toBeNull()
  })
})
