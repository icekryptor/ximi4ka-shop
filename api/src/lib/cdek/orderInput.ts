import { In } from 'typeorm'
import type { ShippingPackage } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import type { Order } from '../../entities/Order.js'
import { Product } from '../../entities/Product.js'
import { DEFAULT_ITEM_WEIGHT_G, packCart, type PackLine } from '../shipping/pack.js'
import type { CdekOrderLine } from './orders.js'

// Места и позиции заказа для СДЭК. Места — сохранённые на чекауте; у заказов
// до этапа 4 их нет, тогда раскладываем заново по текущим карточкам товаров.
// Удалённый товар — вес по умолчанию и «мелочь», как в packCart.
export async function loadShipmentInput(
  order: Order,
): Promise<{ packages: ShippingPackage[]; lines: CdekOrderLine[] }> {
  const ids = [...new Set(order.items.map((i) => i.productId))]
  const products =
    ids.length > 0 ? await AppDataSource.getRepository(Product).findBy({ id: In(ids) }) : []
  const byId = new Map(products.map((p) => [p.id, p]))

  const lines: CdekOrderLine[] = order.items.map((i) => ({
    productId: i.productId,
    name: i.productSnapshot.name,
    sku: i.productSnapshot.sku ?? null,
    unitPriceRub: i.unitPriceRub,
    unitWeightG: byId.get(i.productId)?.weightG ?? DEFAULT_ITEM_WEIGHT_G,
  }))

  const saved = order.deliveryAddress.packages
  if (saved && saved.length > 0) return { packages: saved, lines }

  const packLines: PackLine[] = order.items.map((i) => {
    const p = byId.get(i.productId)
    return {
      productId: i.productId,
      quantity: i.quantity,
      weightG: p?.weightG ?? null,
      shipBoxes: p?.shipBoxes ?? [],
      looseUnits: p?.looseUnits ?? 1,
      minBox: p?.minBox ?? null,
    }
  })
  return { packages: packCart(packLines), lines }
}
