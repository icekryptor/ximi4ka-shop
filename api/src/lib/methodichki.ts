import { In } from 'typeorm'
import { methodichkiForSlugs, type Methodichka, type OrderStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../config/dataSource.js'
import { OrderItem } from '../entities/OrderItem.js'
import { Product } from '../entities/Product.js'

// Электронную методичку отдаём только за оплаченный заказ — в том числе у
// ручных (manual): pending там значит «менеджер ещё не подтвердил оплату».
export function grantsMethodichki(status: OrderStatus): boolean {
  return status === 'paid' || status === 'shipped'
}

/** Методички по заказам: orderId → ссылки. Заказы без наборов дают []. */
export async function methodichkiByOrder(orderIds: string[]): Promise<Map<string, Methodichka[]>> {
  const result = new Map<string, Methodichka[]>(orderIds.map((id) => [id, []]))
  if (orderIds.length === 0) return result
  const items = await AppDataSource.getRepository(OrderItem).find({
    where: { orderId: In(orderIds) },
    select: { orderId: true, productId: true },
  })
  const productIds = [...new Set(items.map((i) => i.productId))]
  if (productIds.length === 0) return result
  const products = await AppDataSource.getRepository(Product).find({
    where: { id: In(productIds) },
    select: { id: true, slug: true },
  })
  const slugOf = new Map(products.map((p) => [p.id, p.slug]))
  const slugsByOrder = new Map<string, string[]>()
  for (const i of items) {
    const slug = slugOf.get(i.productId)
    if (!slug) continue
    slugsByOrder.set(i.orderId, [...(slugsByOrder.get(i.orderId) ?? []), slug])
  }
  for (const [orderId, slugs] of slugsByOrder) result.set(orderId, methodichkiForSlugs(slugs))
  return result
}
