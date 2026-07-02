import type { OrderStatus, PaymentProvider } from '@ximi4ka-shop/shared'

// While a Т-Касса payment is in flight the status page re-fetches the public
// endpoint every 5 seconds, giving up after 5 minutes (the webhook or the
// reconcile job will still settle the order server-side after that).
export const ORDER_POLL_INTERVAL_MS = 5000
export const ORDER_POLL_MAX_ATTEMPTS = 60

/**
 * Human status for the meta row. `pending` reads differently per provider:
 * a manual order is simply «Принят» (менеджер свяжется), while a tbank order
 * is waiting for the payment to clear.
 */
export function orderStatusLabel(
  status: OrderStatus,
  provider: PaymentProvider,
): string {
  switch (status) {
    case 'pending':
      return provider === 'manual' ? 'Принят' : 'Ожидает оплаты'
    case 'paid':
      return 'Оплачен'
    case 'failed':
      return 'Ошибка оплаты'
    case 'cancelled':
      return 'Отменён'
  }
}

export type OrderTimelineStepState = 'done' | 'active' | 'upcoming'
export type OrderTimelineStepTone = 'default' | 'success' | 'danger'

export interface OrderTimelineStep {
  label: string
  state: OrderTimelineStepState
  tone: OrderTimelineStepTone
}

/**
 * Three-step order journey for the status page timeline:
 * Создан → Ожидает оплаты | Принят → Оплачен | Отменён | Ошибка оплаты.
 * The terminal step swaps its label/tone for cancelled and failed orders.
 */
export function orderTimelineSteps(
  status: OrderStatus,
  provider: PaymentProvider,
): OrderTimelineStep[] {
  const middleLabel = provider === 'manual' ? 'Принят' : 'Ожидает оплаты'

  switch (status) {
    case 'pending':
      return [
        { label: 'Создан', state: 'done', tone: 'default' },
        { label: middleLabel, state: 'active', tone: 'default' },
        { label: 'Оплачен', state: 'upcoming', tone: 'default' },
      ]
    case 'paid':
      return [
        { label: 'Создан', state: 'done', tone: 'default' },
        { label: middleLabel, state: 'done', tone: 'default' },
        { label: 'Оплачен', state: 'active', tone: 'success' },
      ]
    case 'failed':
      return [
        { label: 'Создан', state: 'done', tone: 'default' },
        { label: middleLabel, state: 'done', tone: 'default' },
        { label: 'Ошибка оплаты', state: 'active', tone: 'danger' },
      ]
    case 'cancelled':
      return [
        { label: 'Создан', state: 'done', tone: 'default' },
        { label: middleLabel, state: 'done', tone: 'default' },
        { label: 'Отменён', state: 'active', tone: 'danger' },
      ]
  }
}
