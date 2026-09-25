import type { EntityManager } from 'typeorm'
import type { NotificationChannel, OrderEventKey, OrderStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { enqueueCdekShipment } from '../cdek/queue.js'

// Куда сообщаем о каждом событии заказа.
export const CHANNELS: NotificationChannel[] = ['sheets', 'telegram']

// Куда уходит событие. Карточка нового заказа — в таблицу и в чат; смены
// статуса — только в таблицу: ответы на карточку заспамливали рабочий чат и
// мешали складу (решение владельца, docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §6).
export function channelsForEvent(eventKey: OrderEventKey): NotificationChannel[] {
  return eventKey === 'created' ? CHANNELS : ['sheets']
}

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
    .values(channelsForEvent(eventKey).map((channel) => ({ orderId, channel, eventKey })))
    .orIgnore()
    .execute()
}

// Сохраняет смену статуса заказа и, если статус изменился, ставит событие и,
// при оплате, заказ в очередь СДЭК — в одной транзакции. Для вебхука
// Т-Кассы, сверки и ручной смены статуса в админке. Пишем только колонки,
// которые эти вызовы меняют (status, paid_at, status_history и привязку
// платежа из вебхука), а не всю сущность: save() записал бы и устаревший
// telegram_message_id из памяти поверх id карточки, который обработчик
// очереди успел сохранить, пока шли сетевые вызовы.
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
    // Оплаченный заказ — в очередь создания в СДЭК, той же транзакцией.
    if (order.status === 'paid' && previousStatus !== 'paid') {
      await enqueueCdekShipment(em, order)
    }
    return order
  })
}
