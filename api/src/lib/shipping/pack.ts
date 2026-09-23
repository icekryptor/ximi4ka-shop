import type { ShippingBox, ShippingPackage } from '@ximi4ka-shop/shared'

// Размеры коробок — от владельца (23.09.2026). Вес пустой коробки (tareG) —
// оценка: для мелочи его добавляем к весу товаров, а у наборов вес из
// каталога уже включает их собственную коробку.
export const BOXES: Record<
  ShippingBox,
  { lengthCm: number; widthCm: number; heightCm: number; tareG: number }
> = {
  small: { lengthCm: 10, widthCm: 10, heightCm: 4, tareG: 30 },
  medium: { lengthCm: 17, widthCm: 15, heightCm: 12, tareG: 120 },
  elektro: { lengthCm: 39, widthCm: 24, heightCm: 7, tareG: 200 },
  large: { lengthCm: 40, widthCm: 32, heightCm: 8, tareG: 250 },
}

// Лестница коробок для мелочи по числу предметов: до 5 — малая, до 15 —
// средняя, дальше — большая. Коробка Электро в лестницу не входит — это
// коробка конкретного набора.
const LOOSE_LADDER: { box: ShippingBox; maxUnits: number }[] = [
  { box: 'small', maxUnits: 5 },
  { box: 'medium', maxUnits: 15 },
  { box: 'large', maxUnits: Number.POSITIVE_INFINITY },
]

// Вес товара, у которого его нет в каталоге: типичный флакон/пакет.
export const DEFAULT_ITEM_WEIGHT_G = 100

export interface PackLine {
  productId: string
  quantity: number
  weightG: number | null
  // Непустой список — товар едет в своих коробках отдельными местами
  // (набор — одна, комбо — по коробке на каждый набор внутри).
  shipBoxes: ShippingBox[]
  // Сколько «предметов» мелочи занимает одна штука товара.
  looseUnits: number
  // Минимальная коробка для мелочи, которая не влезает в малую (методички).
  minBox: ShippingBox | null
}

function ladderIndex(box: ShippingBox): number {
  const i = LOOSE_LADDER.findIndex((step) => step.box === box)
  // Коробка вне лестницы (Электро) в роли минимальной — считаем как большую.
  return i === -1 ? LOOSE_LADDER.length - 1 : i
}

function packageFor(
  box: ShippingBox,
  weightG: number,
  estimated: boolean,
  items: ShippingPackage['items'],
): ShippingPackage {
  const { lengthCm, widthCm, heightCm } = BOXES[box]
  return { box, weightG: Math.ceil(weightG), lengthCm, widthCm, heightCm, estimated, items }
}

// Раскладывает корзину по местам отправления. Чистая функция: одна и та же
// корзина всегда даёт одни и те же места — это важно, потому что по ним
// считается цена в корзине, в чекауте и потом создаётся заказ в СДЭК.
export function packCart(lines: PackLine[]): ShippingPackage[] {
  const packages: ShippingPackage[] = []

  let looseUnits = 0
  let looseWeightG = 0
  let looseEstimated = false
  let looseMinIndex = 0
  const looseItems: ShippingPackage['items'] = []

  for (const line of lines) {
    if (line.quantity <= 0) continue
    const estimated = line.weightG == null
    const unitWeightG = line.weightG ?? DEFAULT_ITEM_WEIGHT_G

    if (line.shipBoxes.length > 0) {
      const perBoxWeightG = unitWeightG / line.shipBoxes.length
      for (let n = 0; n < line.quantity; n++) {
        line.shipBoxes.forEach((box, i) => {
          // Товар описываем в первом месте комплекта, остальные места — его
          // же коробки без отдельной позиции.
          const items = i === 0 ? [{ productId: line.productId, quantity: 1 }] : []
          packages.push(packageFor(box, perBoxWeightG, estimated, items))
        })
      }
      continue
    }

    looseUnits += line.looseUnits * line.quantity
    looseWeightG += unitWeightG * line.quantity
    looseEstimated ||= estimated
    if (line.minBox) looseMinIndex = Math.max(looseMinIndex, ladderIndex(line.minBox))
    looseItems.push({ productId: line.productId, quantity: line.quantity })
  }

  if (looseItems.length > 0) {
    const byCount = LOOSE_LADDER.findIndex((step) => looseUnits <= step.maxUnits)
    const box = LOOSE_LADDER[Math.max(byCount, looseMinIndex)].box
    packages.push(packageFor(box, looseWeightG + BOXES[box].tareG, looseEstimated, looseItems))
  }

  return packages
}
