import type { EntityManager } from 'typeorm'
import { CdekShipment } from '../../entities/CdekShipment.js'
import type { Order } from '../../entities/Order.js'
import { cdekOrdersEnabled } from './orders.js'

export function isCdekDelivery(method: string): boolean {
  return method === 'cdek_pvz' || method === 'cdek_courier'
}

// Ставит заказ в очередь создания в СДЭК. Вызывать в транзакции, которая
// переводит заказ в paid. При выключенном флаге — ничего: иначе включение
// флага отправило бы в СДЭК заказы, уже заведённые руками. Повтор — no-op
// (уникальный индекс + ON CONFLICT DO NOTHING).
export async function enqueueCdekShipment(
  em: EntityManager,
  order: Pick<Order, 'id' | 'deliveryMethod'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!cdekOrdersEnabled(env) || !isCdekDelivery(order.deliveryMethod)) return
  await em
    .createQueryBuilder()
    .insert()
    .into(CdekShipment)
    .values({ orderId: order.id })
    .orIgnore()
    .execute()
}
