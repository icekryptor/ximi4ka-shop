import type { EntityManager } from 'typeorm'
import type { NotificationChannel, OrderEventKey, OrderStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'

// Куда сообщаем о каждом событии заказа.
export const CHANNELS: NotificationChannel[] = ['sheets', 'telegram']

// pending — стартовое состояние, отдельным событием не считается: о нём
// сообщает `created`.
export function statusEventKey(status: OrderStatus): OrderEventKey | null {
  return status === 'pending' ? null : (`status:${status}` as OrderEventKey)
}

// Единственная точка постановки в очередь. Вызывать внутри транзакции,
// которая меняет заказ: событие и заказ сохраняются или откатываются вместе.
// Повтор того же события — no-op (уникальный индекс + ON CONFLICT DO NOTHING).
export async function enqueueOrderEvent(
  em: EntityManager,
  orderId: string,
  eventKey: OrderEventKey,
): Promise<void> {
  await em
    .createQueryBuilder()
    .insert()
    .into(OrderNotification)
    .values(CHANNELS.map((channel) => ({ orderId, channel, eventKey })))
    .orIgnore()
    .execute()
}

// Сохраняет смену статуса заказа и, если статус изменился, ставит событие —
// в одной транзакции. Для вебхука Т-Кассы, сверки и ручной смены статуса в
// админке. Пишем только колонки, которые эти вызовы меняют (status, paid_at,
// status_history и привязку платежа из вебхука), а не всю сущность: save()
// записал бы и устаревший telegram_message_id из памяти поверх id карточки,
// который обработчик очереди успел сохранить, пока шли сетевые вызовы.
export async function saveOrderWithStatusEvent(
  order: Order,
  previousStatus: OrderStatus,
): Promise<Order> {
  return AppDataSource.transaction(async (em) => {
    await em.update(Order, order.id, {
      status: order.status,
      paidAt: order.paidAt,
      statusHistory: order.statusHistory,
      // Привязку платежа никто не снимает — null из памяти не пишем.
      ...(order.paymentIntentId ? { paymentIntentId: order.paymentIntentId } : {}),
    })
    const key = order.status === previousStatus ? null : statusEventKey(order.status)
    if (key) await enqueueOrderEvent(em, order.id, key)
    return order
  })
}
