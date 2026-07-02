import type { Order } from '../../entities/Order.js'
import type { PaymentStatus } from './types.js'

// Applies a provider-reported payment status to an order in place.
// Returns true when the order actually changed (caller must save).
//
// Transition rules:
//   * `pending` events are informational — never change the order;
//   * a repeat of the current status is a no-op (webhook retries are
//     idempotent);
//   * `paid` is terminal — nothing downgrades it (a late REJECTED
//     retry must not undo a confirmed payment);
//   * `failed` only applies to `pending` orders — a manually cancelled
//     order stays cancelled;
//   * `paid` DOES apply to cancelled/failed orders: if the money actually
//     arrived, the books must say so.
export function applyPaymentStatus(
  order: Order,
  status: PaymentStatus,
  by: 'tbank' | 'reconcile',
  now: Date = new Date(),
): boolean {
  if (status === 'pending') return false
  if (order.status === status) return false
  if (order.status === 'paid') return false
  if (status === 'failed' && order.status !== 'pending') return false

  const from = order.status
  order.status = status
  if (status === 'paid' && !order.paidAt) order.paidAt = now
  order.statusHistory = [
    ...(order.statusHistory ?? []),
    { from, to: status, at: now.toISOString(), by },
  ]
  return true
}
