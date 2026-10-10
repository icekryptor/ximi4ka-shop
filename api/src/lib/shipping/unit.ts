import type { ProductShippingUnit, ShippingBox } from '@ximi4ka-shop/shared'
import { packCart } from './pack.js'

export interface UnitSource {
  id: string
  weightG?: number | null
  shipBoxes?: ShippingBox[] | null
  looseUnits?: number | null
  minBox?: ShippingBox | null
}

// Вес и габариты одной штуки в упаковке — для YCP (basket/check) и фида
// (weight, dimensions). Считает тот же packCart, что и доставка. Несколько
// мест (комбо) кладём стопкой: длина и ширина — наибольшие, высота и вес — сумма.
export function unitShipping(product: UnitSource): ProductShippingUnit {
  const packages = packCart([
    {
      productId: product.id,
      quantity: 1,
      weightG: product.weightG ?? null,
      shipBoxes: product.shipBoxes ?? [],
      looseUnits: product.looseUnits ?? 1,
      minBox: product.minBox ?? null,
    },
  ])
  return packages.reduce<ProductShippingUnit>(
    (acc, p) => ({
      weightG: acc.weightG + p.weightG,
      lengthCm: Math.max(acc.lengthCm, p.lengthCm),
      widthCm: Math.max(acc.widthCm, p.widthCm),
      heightCm: acc.heightCm + p.heightCm,
    }),
    { weightG: 0, lengthCm: 0, widthCm: 0, heightCm: 0 },
  )
}
