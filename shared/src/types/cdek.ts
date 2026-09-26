// Заказ в СДЭК после оплаты (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md).
export type CdekShipmentState = 'queued' | 'registering' | 'created' | 'failed'

export interface CdekShipmentDto {
  state: CdekShipmentState
  cdekNumber: string | null
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  updatedAt: string
}
