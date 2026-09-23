import { describe, it, expect } from 'vitest'
import { BOXES, DEFAULT_ITEM_WEIGHT_G, packCart, type PackLine } from './pack.js'

function line(overrides: Partial<PackLine> & { productId: string }): PackLine {
  return {
    quantity: 1,
    weightG: 50,
    shipBoxes: [],
    looseUnits: 1,
    minBox: null,
    ...overrides,
  }
}

const reagent = (id: string, quantity = 1) => line({ productId: id, quantity, weightG: 50 })
const himichka = line({ productId: 'himichka', weightG: 1300, shipBoxes: ['large'] })
const elektro = line({ productId: 'elektro', weightG: 1000, shipBoxes: ['elektro'] })

describe('packCart — мелочь по количеству предметов', () => {
  it('до 5 предметов — малая коробка 10×10×4', () => {
    const [pkg] = packCart([reagent('a', 3), reagent('b', 2)])
    expect(pkg.box).toBe('small')
    expect([pkg.lengthCm, pkg.widthCm, pkg.heightCm]).toEqual([10, 10, 4])
  })

  it('6–15 предметов — средняя 17×15×12', () => {
    expect(packCart([reagent('a', 6)])[0].box).toBe('medium')
    expect(packCart([reagent('a', 15)])[0].box).toBe('medium')
  })

  it('от 16 предметов — большая 40×32×8', () => {
    expect(packCart([reagent('a', 16)])[0].box).toBe('large')
  })

  it('товар-«комплект» считается за несколько предметов', () => {
    // «Три кислоты» — один товар, три флакона.
    const [pkg] = packCart([line({ productId: 'three-acids', looseUnits: 3, quantity: 2 })])
    expect(pkg.box).toBe('medium')
  })

  it('методичка требует минимум большую коробку, даже одна', () => {
    const [pkg] = packCart([line({ productId: 'metodichka', minBox: 'large', weightG: 100 })])
    expect(pkg.box).toBe('large')
  })

  it('вес посылки = товары + пустая коробка', () => {
    const [pkg] = packCart([reagent('a', 3)])
    expect(pkg.weightG).toBe(3 * 50 + BOXES.small.tareG)
  })

  it('вся мелочь едет одним местом и перечисляет свои товары', () => {
    const packages = packCart([reagent('a', 2), reagent('b', 1)])
    expect(packages).toHaveLength(1)
    expect(packages[0].items).toEqual([
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
    ])
  })
})

describe('packCart — наборы в своих коробках', () => {
  it('Химичка 3.0 — отдельное место в своей коробке, без тары сверху', () => {
    const [pkg] = packCart([himichka])
    expect(pkg.box).toBe('large')
    // Вес набора из каталога уже включает его коробку.
    expect(pkg.weightG).toBe(1300)
    expect(pkg.items).toEqual([{ productId: 'himichka', quantity: 1 }])
  })

  it('два одинаковых набора — два места', () => {
    const packages = packCart([{ ...himichka, quantity: 2 }])
    expect(packages).toHaveLength(2)
    expect(packages.every((p) => p.box === 'large')).toBe(true)
  })

  it('комбо из двух наборов — два места, вес делится между ними', () => {
    const combo = line({ productId: 'combo', weightG: 2200, shipBoxes: ['large', 'elektro'] })
    const packages = packCart([combo])
    expect(packages.map((p) => p.box)).toEqual(['large', 'elektro'])
    expect(packages.reduce((sum, p) => sum + p.weightG, 0)).toBe(2200)
    // Товар числится в первом месте — его и опишем в заказе СДЭК.
    expect(packages[0].items).toEqual([{ productId: 'combo', quantity: 1 }])
    expect(packages[1].items).toEqual([])
  })

  it('набор и мелочь — набор отдельно, мелочь своей коробкой', () => {
    const packages = packCart([elektro, reagent('a', 4)])
    expect(packages.map((p) => p.box)).toEqual(['elektro', 'small'])
  })
})

describe('packCart — неизвестный вес', () => {
  it('подставляет вес по умолчанию и помечает посылку как оценочную', () => {
    const [pkg] = packCart([line({ productId: 'x', weightG: null })])
    expect(pkg.weightG).toBe(DEFAULT_ITEM_WEIGHT_G + BOXES.small.tareG)
    expect(pkg.estimated).toBe(true)
  })

  it('пустая корзина — нет мест', () => {
    expect(packCart([])).toEqual([])
  })
})
