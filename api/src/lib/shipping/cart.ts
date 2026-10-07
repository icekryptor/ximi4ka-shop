import { In, IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ApiError } from '../../routes/errors.js'
import { wholesaleLineTotals } from '../pricing/wholesale.js'
import type { PackLine } from './pack.js'

export interface CartLine {
  product: Product
  quantity: number
  /** Сумма строки с оптовой скидкой, ₽ — то, что платит покупатель за позицию. */
  lineTotalRub: number
  /** Цена за штуку для читателей, которым нужна целая цена: сумма строки / количество, округлённая. */
  unitPriceRub: number
}

export interface LoadedCart {
  lines: CartLine[]
  /** Сумма товаров по обычным ценам. */
  subtotalRub: number
  /** Оптовая скидка (наборы, проценты, партии); к оплате за товары — subtotalRub − discountRub. */
  discountRub: number
  packLines: PackLine[]
}

// Корзина, пересчитанная по базе: клиент присылает только id и количества.
// Один и тот же расчёт используют чекаут и расчёт доставки в корзине, чтобы
// цена доставки на экране и в заказе не могли разойтись.
export async function loadCart(
  items: { productId: string; quantity: number }[],
): Promise<LoadedCart> {
  // Повторяющиеся id складываем.
  const qtyByProduct = new Map<string, number>()
  for (const item of items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity)
  }
  const productIds = [...qtyByProduct.keys()]

  const products = await AppDataSource.getRepository(Product).find({
    where: { id: In(productIds), deletedAt: IsNull() },
    relations: { categories: true },
  })
  const productById = new Map(products.map((p) => [p.id, p]))

  // Неизвестные, удалённые и неопубликованные товары заказать нельзя.
  const unavailable = productIds.filter((id) => {
    const p = productById.get(id)
    return !p || !p.isPublished
  })
  if (unavailable.length > 0) {
    throw new ApiError(409, 'products_unavailable', 'Некоторые товары недоступны для заказа', {
      productIds: unavailable,
    })
  }

  const outOfStock = products.filter((p) => p.stockStatus === 'out_of_stock')
  if (outOfStock.length > 0) {
    throw new ApiError(409, 'out_of_stock', 'Некоторые товары закончились', {
      items: outOfStock.map((p) => ({ productId: p.id, name: p.name })),
    })
  }

  const lineTotals = wholesaleLineTotals(
    productIds.map((id) => {
      const p = productById.get(id)!
      return {
        slug: p.slug,
        quantity: qtyByProduct.get(id)!,
        priceRub: p.priceRub,
        categories: (p.categories ?? []).map((c) => c.slug),
      }
    }),
  )
  const lines = productIds.map((id) => {
    const product = productById.get(id)!
    const quantity = qtyByProduct.get(id)!
    const lineTotalRub = lineTotals.get(product.slug)!
    return { product, quantity, lineTotalRub, unitPriceRub: Math.round(lineTotalRub / quantity) }
  })
  const subtotalRub = lines.reduce((sum, l) => sum + l.product.priceRub * l.quantity, 0)
  const discountRub = lines.reduce(
    (sum, l) => sum + (l.product.priceRub * l.quantity - l.lineTotalRub),
    0,
  )
  const packLines: PackLine[] = lines.map(({ product, quantity }) => ({
    productId: product.id,
    quantity,
    weightG: product.weightG,
    shipBoxes: product.shipBoxes ?? [],
    looseUnits: product.looseUnits ?? 1,
    minBox: product.minBox,
  }))
  return { lines, subtotalRub, discountRub, packLines }
}
