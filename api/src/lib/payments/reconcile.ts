import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { getPaymentProvider } from './index.js'
import { applyPaymentStatus } from './orderStatus.js'
import type { PaymentProvider } from './types.js'

// Reconciliation job skeleton: webhooks can get lost (network, deploys),
// so pending orders that already have a provider-side payment are re-polled
// via GetState and settled to paid/failed.

// Don't poll orders younger than this — the customer is likely still on the
// payment form and the webhook will arrive on its own.
export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000
export const RECONCILE_INTERVAL_MS = 60 * 1000

export interface ReconcileResult {
  checked: number
  updated: number
}

export async function reconcilePendingOrders(
  provider: PaymentProvider,
  minAgeMs: number = RECONCILE_MIN_AGE_MS,
): Promise<ReconcileResult> {
  const repo = AppDataSource.getRepository(Order)
  // The age cutoff is computed IN SQL: created_at is `timestamp without
  // time zone` filled by the DB's now(), so comparing it against a JS Date
  // parameter would silently shift by the server/session timezone offset.
  const pending = await repo
    .createQueryBuilder('o')
    .where('o.status = :status', { status: 'pending' })
    .andWhere('o.payment_intent_id IS NOT NULL')
    .andWhere('o.created_at < now() - make_interval(secs => :ageSec)', {
      ageSec: minAgeMs / 1000,
    })
    .orderBy('o.created_at', 'ASC')
    .getMany()

  let updated = 0
  for (const order of pending) {
    const status = await provider.getStatus(order.paymentIntentId!)
    if (status === 'unknown') continue
    if (applyPaymentStatus(order, status, 'reconcile')) {
      await repo.save(order)
      updated += 1
    }
  }
  return { checked: pending.length, updated }
}

// Started from the api entry point. Only meaningful for providers that
// actually create online payments — in manual mode there is nothing to poll.
export function startReconciliationJob(
  provider: PaymentProvider = getPaymentProvider(),
): NodeJS.Timeout | null {
  if (provider.name !== 'tbank') return null
  const timer = setInterval(() => {
    reconcilePendingOrders(provider).catch((err) => {
      console.error('payments: reconciliation run failed', err)
    })
  }, RECONCILE_INTERVAL_MS)
  // Never keep the process alive just for the poller.
  timer.unref()
  return timer
}
