import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { getPaymentProvider } from './index.js'
import { getYandexOrderStatus } from './yandexPay/client.js'
import { hasYandexPayMerchant } from './yandexPay/config.js'
import { applyPaymentStatus } from './orderStatus.js'
import { saveOrderWithStatusEvent } from '../notifications/outbox.js'
import type { PaymentProvider } from './types.js'

// Reconciliation job skeleton: webhooks can get lost (network, deploys),
// so pending orders that already have a provider-side payment are re-polled
// via GetState and settled to paid/failed.

// Don't poll orders younger than this — the customer is likely still on the
// payment form and the webhook will arrive on its own.
export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000
export const RECONCILE_INTERVAL_MS = 60 * 1000

export const YANDEX_RECONCILE_MAX_AGE_DAYS = 8

// Запуск по таймеру не наслаивается на незаконченный предыдущий: иначе два прогона
// могут применить один и тот же статус и дважды поставить в очередь исходящие события.
export function skipWhileRunning(run: () => Promise<unknown>): () => Promise<void> {
  let running = false
  return async () => {
    if (running) return
    running = true
    try {
      await run()
    } finally {
      running = false
    }
  }
}

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
    // Заказы из Яндекса оплачены у Яндекса: Т-Касса о них не знает.
    .andWhere("o.payment_provider <> 'ycp'")
    // Заказ Яндекса живёт YANDEX_ORDER_TTL_SEC (3 суток), потом Яндекс сам ставит FAILED.
    // Страховка, если статус так и не пришёл: старше 8 суток не опрашиваем.
    .andWhere(
      "(o.payment_provider <> 'yandex_pay' OR o.created_at > now() - make_interval(days => :maxDays))",
      { maxDays: YANDEX_RECONCILE_MAX_AGE_DAYS },
    )
    .andWhere('o.created_at < now() - make_interval(secs => :ageSec)', {
      ageSec: minAgeMs / 1000,
    })
    .orderBy('o.created_at', 'ASC')
    .getMany()

  let updated = 0
  for (const order of pending) {
    // Заказ Яндекс Пэй сверяется у Яндекса по номеру заказа, остальные — как раньше.
    const status =
      order.paymentProvider === 'yandex_pay'
        ? await getYandexOrderStatus(order.orderNumber)
        : await provider.getStatus(order.paymentIntentId!)
    if (status === 'unknown') continue
    const previousStatus = order.status
    if (applyPaymentStatus(order, status, 'reconcile')) {
      await saveOrderWithStatusEvent(order, previousStatus)
      updated += 1
    }
  }
  return { checked: pending.length, updated }
}

// Started from the api entry point. Only meaningful for providers that
// actually create online payments — in manual mode there is nothing to poll.
export function startReconciliationJob(
  provider: PaymentProvider = getPaymentProvider(),
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.Timeout | null {
  // Т-Касса — как раньше; Яндекс досверяется, пока задан его Merchant ID.
  if (provider.name !== 'tbank' && !hasYandexPayMerchant(env)) return null
  const tick = skipWhileRunning(() =>
    reconcilePendingOrders(provider).catch((err) => {
      console.error('payments: reconciliation run failed', err)
    }),
  )
  const timer = setInterval(() => void tick(), RECONCILE_INTERVAL_MS)
  // Never keep the process alive just for the poller.
  timer.unref()
  return timer
}
