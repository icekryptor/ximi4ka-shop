// Очередь уведомлений о заказах (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
export type NotificationChannel = 'sheets' | 'telegram'

export type OrderEventKey =
  | 'created'
  | 'status:paid'
  | 'status:shipped'
  | 'status:cancelled'
  | 'status:failed'
  // Сигналы менеджеру по заказам из Яндекса (YCP): оплата при получении и
  // отмена оплаченного (или уже отправленного) заказа.
  | 'ycp:on_delivery'
  | 'ycp:cancel_after_ship'

export interface OrderNotificationDto {
  channel: NotificationChannel
  eventKey: OrderEventKey
  attempts: number
  nextAttemptAt: string
  sentAt: string | null
  failedAt: string | null
  lastError: string | null
}
