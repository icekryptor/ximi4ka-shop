// Очередь уведомлений о заказах (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
export type NotificationChannel = 'sheets' | 'telegram'

export type OrderEventKey =
  | 'created'
  | 'status:paid'
  | 'status:shipped'
  | 'status:cancelled'
  | 'status:failed'

export interface OrderNotificationDto {
  channel: NotificationChannel
  eventKey: OrderEventKey
  attempts: number
  nextAttemptAt: string
  sentAt: string | null
  failedAt: string | null
  lastError: string | null
}
