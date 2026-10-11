import { In, IsNull } from 'typeorm'
import type { ProductShippingUnit } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { wholesaleLineTotals } from '../pricing/wholesale.js'
import type { PackLine } from '../shipping/pack.js'
import { unitShipping } from '../shipping/unit.js'
import { YCP_IN_STOCK_QUANTITY } from './config.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface YcpLine {
  product: Product
  /** Количество после сложения повторяющихся id. */
  quantity: number
  regularPriceRub: number
  /** Цена за штуку, которую спишет Яндекс (× quantity); см. ycpUnitPrice. */
  finalPriceRub: number
  availableQuantity: number
  shipping: ProductShippingUnit
}

// id товара в Яндексе = Product.id (uuid, он же offer id фида).
export function normalizeYcpId(id: string): string {
  return id.trim().toLowerCase()
}

// Повторяющиеся id складываем, как loadCart: цена партии и процент зависят от
// общего количества.
export function mergeYcpItems(
  items: readonly { id: string; quantity: number }[],
): Map<string, number> {
  const qty = new Map<string, number>()
  for (const item of items) {
    const id = normalizeYcpId(item.id)
    qty.set(id, (qty.get(id) ?? 0) + item.quantity)
  }
  return qty
}

// Яндекс берёт final_price × quantity. Сумма строки на сайте
// (wholesaleLineTotals) делится на штуки нацело не всегда: процентные ступени
// дают round(list × (100 − p) / 100), цены партий — 5 пробирок за 99 ₽.
// Округляем вниз: в Яндексе покупатель не платит больше, чем на сайте, а
// магазин теряет меньше рубля на штуке.
export function ycpUnitPrice(lineTotalRub: number, quantity: number): number {
  return Math.floor(lineTotalRub / quantity)
}

// Товары, которые можно купить через Яндекс: опубликованы, не удалены,
// отмечены ycpEnabled. Остальные id (в т.ч. не-uuid) в результат не попадают.
// Порядок — как в запросе.
export async function loadYcpLines(
  items: readonly { id: string; quantity: number }[],
): Promise<Map<string, YcpLine>> {
  const qty = mergeYcpItems(items)
  // Не-uuid в запрос к базе не пускаем: Postgres ответил бы ошибкой приведения
  // типа (500), а за 5xx Яндекс ставит кнопку на паузу (client_5xx).
  const ids = [...qty.keys()].filter((id) => UUID_RE.test(id))
  if (ids.length === 0) return new Map()
  const products = await AppDataSource.getRepository(Product).find({
    where: { id: In(ids), isPublished: true, ycpEnabled: true, deletedAt: IsNull() },
    relations: { categories: true, images: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))
  const totals = wholesaleLineTotals(
    products.map((p) => ({
      slug: p.slug,
      quantity: qty.get(p.id)!,
      priceRub: p.priceRub,
      categories: (p.categories ?? []).map((c) => c.slug),
    })),
  )
  const lines = new Map<string, YcpLine>()
  for (const id of ids) {
    const product = byId.get(id)
    if (!product) continue
    const quantity = qty.get(id)!
    lines.set(id, {
      product,
      quantity,
      regularPriceRub: product.priceRub,
      finalPriceRub: ycpUnitPrice(totals.get(product.slug)!, quantity),
      availableQuantity: product.stockStatus === 'in_stock' ? YCP_IN_STOCK_QUANTITY : 0,
      shipping: unitShipping(product),
    })
  }
  return lines
}

export function ycpPackLines(lines: Iterable<YcpLine>): PackLine[] {
  return [...lines].map(({ product: p, quantity }) => ({
    productId: p.id,
    quantity,
    weightG: p.weightG,
    shipBoxes: p.shipBoxes ?? [],
    looseUnits: p.looseUnits ?? 1,
    minBox: p.minBox,
  }))
}

// Сумма за товары, которую спишет Яндекс.
export function ycpGoodsTotal(lines: Iterable<YcpLine>): number {
  let sum = 0
  for (const l of lines) sum += l.finalPriceRub * l.quantity
  return sum
}
