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

  it('два одинаковых набора — одно место стопкой, вес складывается', () => {
    const packages = packCart([{ ...himichka, quantity: 2 }])
    expect(packages).toHaveLength(1)
    const [pkg] = packages
    expect(pkg.box).toBe('large')
    expect(pkg.weightG).toBe(2600)
    // Коробки стопкой: длина и ширина — как у одной, высота — сумма.
    expect([pkg.lengthCm, pkg.widthCm, pkg.heightCm]).toEqual([40, 32, 16])
    expect(pkg.items).toEqual([
      { productId: 'himichka', quantity: 1 },
      { productId: 'himichka', quantity: 1 },
    ])
  })

  it('комбо из двух наборов — одно место, вес целиком', () => {
    const combo = line({ productId: 'combo', weightG: 2200, shipBoxes: ['large', 'elektro'] })
    const packages = packCart([combo])
    expect(packages).toHaveLength(1)
    expect(packages[0].box).toBe('large')
    expect(packages[0].weightG).toBe(2200)
    expect([packages[0].lengthCm, packages[0].widthCm, packages[0].heightCm]).toEqual([40, 32, 15])
    expect(packages[0].items).toEqual([{ productId: 'combo', quantity: 1 }])
  })

  it('набор и мелочь — одно место: реактивы уложены в коробку набора', () => {
    const packages = packCart([elektro, reagent('a', 4)])
    expect(packages).toHaveLength(1)
    expect(packages[0].box).toBe('elektro')
    // Вес набора + вес реактивов, пустую коробку мелочи не добавляем.
    expect(packages[0].weightG).toBe(1000 + 4 * 50)
    expect(packages[0].items).toEqual([
      { productId: 'elektro', quantity: 1 },
      { productId: 'a', quantity: 4 },
    ])
  })

  it('несколько наборов и мелочь — всё одним местом', () => {
    const packages = packCart([himichka, elektro, reagent('a', 2)])
    expect(packages).toHaveLength(1)
    expect(packages[0].weightG).toBe(1300 + 1000 + 2 * 50)
    expect(packages[0].items).toEqual([
      { productId: 'himichka', quantity: 1 },
      { productId: 'elektro', quantity: 1 },
      { productId: 'a', quantity: 2 },
    ])
  })

  it('оценочный вес реактива делает место оценочным', () => {
    const packages = packCart([himichka, line({ productId: 'x', weightG: null })])
    expect(packages).toHaveLength(1)
    expect(packages[0].weightG).toBe(1300 + DEFAULT_ITEM_WEIGHT_G)
    expect(packages[0].estimated).toBe(true)
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
