// Заказ в СДЭК после оплаты (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md).
export type CdekShipmentState = 'queued' | 'registering' | 'created' | 'failed'

// Слежение за вручением (cdek_shipments.tracking_state): none — не следим (созданные
// до этой версии), tracking — опрашиваем, delivered/not_delivered — итог, stopped —
// следить больше не за чем (заказ отменён, срок вышел, частичная доставка).
export type CdekTrackingState = 'none' | 'tracking' | 'delivered' | 'not_delivered' | 'stopped'

export interface CdekShipmentDto {
  state: CdekShipmentState
  cdekNumber: string | null
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  updatedAt: string
}
