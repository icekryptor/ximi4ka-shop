import { describe, it, expect } from 'vitest'
import { unitShipping } from './unit.js'

describe('unitShipping — одна штука в упаковке', () => {
  it('мелочь — в малой коробке, вес с тарой', () => {
    expect(
      unitShipping({ id: 'p', weightG: 100, shipBoxes: [], looseUnits: 1, minBox: null }),
    ).toEqual({ weightG: 130, lengthCm: 10, widthCm: 10, heightCm: 4 })
  })

  it('набор в своей коробке — её размеры и вес из каталога', () => {
    expect(
      unitShipping({ id: 'k', weightG: 1200, shipBoxes: ['large'], looseUnits: 1, minBox: null }),
    ).toEqual({ weightG: 1200, lengthCm: 40, widthCm: 32, heightCm: 8 })
  })

  it('комбо из двух коробок — стопкой: высота и вес складываются', () => {
    expect(
      unitShipping({
        id: 'c',
        weightG: 2000,
        shipBoxes: ['medium', 'medium'],
        looseUnits: 1,
        minBox: null,
      }),
    ).toEqual({ weightG: 2000, lengthCm: 17, widthCm: 15, heightCm: 24 })
  })

  it('без веса — вес по умолчанию; минимальная коробка учитывается', () => {
    expect(
      unitShipping({ id: 'm', weightG: null, shipBoxes: [], looseUnits: 1, minBox: 'medium' }),
    ).toEqual({ weightG: 220, lengthCm: 17, widthCm: 15, heightCm: 12 })
  })
})
