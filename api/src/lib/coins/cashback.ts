import { cashbackCoins } from '@ximi4ka-shop/shared/types/coins'
import type { EntityManager } from 'typeorm'
import { Order } from '../../entities/Order.js'
import type { SiteSettings } from '../../entities/SiteSettings.js'
import { applyCoinTransaction } from './ledger.js'

// Кэшбек, обещанный покупателю при оформлении: процент от суммы товаров после оптовых
// скидок и промокода. Доставка и надбавка за способ оплаты в базу не входят. 0, если
// программа выключена.
export function promisedCashback(
  order: Pick<Order, 'subtotalRub' | 'discountRub' | 'promoDiscountRub'>,
  settings: Pick<SiteSettings, 'coinsEnabled' | 'coinsCashbackPercent'>,
): number {
  if (!settings.coinsEnabled) return 0
  const goodsPaidRub = order.subtotalRub - order.discountRub - order.promoDiscountRub
  return cashbackCoins(goodsPaidRub, settings.coinsCashbackPercent)
}

// Текущий владелец заказа из базы, с блокировкой строки заказа. customerId в памяти мог
// устареть: вход привязал гостевой заказ или слияние переписало владельца, пока заказ
// был загружен. Блокировка здесь своя, а не расчёт на вызывающего; порядок «заказ →
// покупатель» тот же, что у слияния.
async function lockCurrentOwner(em: EntityManager, orderId: string): Promise<string | null> {
  const rows: { customer_id: string | null }[] = await em.query(
    'SELECT customer_id FROM orders WHERE id = $1 FOR UPDATE',
    [orderId],
  )
  return rows[0]?.customer_id ?? null
}

// Начисление при получении заказа: ровно то, что обещано при оформлении. Настройку
// `coinsEnabled` не смотрим — обещанное выполняется, даже если программу потом выключили.
// Идемпотентно по заказу (ключ в журнале), поэтому повтор и гонка двух переходов безопасны.
export async function accrueCashbackForOrder(em: EntityManager, order: Order): Promise<void> {
  if (order.status !== 'delivered' || order.cashbackPromisedCoins <= 0) return
  const customerId = await lockCurrentOwner(em, order.id)
  if (!customerId) return
  // Покупателя могли удалить (слияние): статус заказа важнее монет, не роняем переход.
  const exists: unknown[] = await em.query('SELECT 1 FROM customers WHERE id = $1', [customerId])
  if (exists.length === 0) return
  await applyCoinTransaction(em, {
    customerId,
    amount: order.cashbackPromisedCoins,
    kind: 'order_cashback',
    orderId: order.id,
    idempotencyKey: `order_cashback:${order.id}`,
  })
}

// Догоняющее начисление по всем полученным заказам покупателя, по которым кэшбек ещё не
// начислен (гостевой заказ получен до входа и привязан по email). Блокировки в порядке
// «строки заказов → строка покупателя», как у начисления и отзыва. Повтор безопасен:
// заказ с записью order_cashback в выборку не попадает, а ключ идемпотентности страхует гонку.
export async function accrueCashbackForCustomer(
  em: EntityManager,
  customerId: string,
): Promise<void> {
  const rows: { id: string }[] = await em.query(
    `SELECT o.id FROM orders o
      WHERE o.customer_id = $1 AND o.status = 'delivered' AND o.cashback_promised_coins > 0
        AND NOT EXISTS (
          SELECT 1 FROM coin_transactions t
           WHERE t.idempotency_key = 'order_cashback:' || o.id::text)
      ORDER BY o.id
        FOR UPDATE OF o`,
    [customerId],
  )
  for (const { id } of rows) {
    const order = await em.getRepository(Order).findOneByOrFail({ id })
    await accrueCashbackForOrder(em, order)
  }
}

// Отзыв начисленного при отмене полученного заказа: списываем min(начислено, баланс),
// остаток — недостача в заказе. Отмена заказа никогда не падает из-за монет, поэтому
// сумма считается под блокировкой строки покупателя (её же берёт applyCoinTransaction
// внутри той же транзакции): параллельное списание не успеет увести баланс ниже.
// «Уже отозван» — это строка order_cashback_revoke ИЛИ недостача > 0 (при балансе 0
// строки нет, а повтор списал бы монеты, заработанные позже).
export async function revokeCashbackForOrder(em: EntityManager, order: Order): Promise<void> {
  const customerId = await lockCurrentOwner(em, order.id)
  if (!customerId) return
  const locked: { coin_balance: number }[] = await em.query(
    'SELECT coin_balance FROM customers WHERE id = $1 FOR UPDATE',
    [customerId],
  )
  if (locked.length === 0) return
  const balance = locked[0].coin_balance

  const accrued: { amount: number }[] = await em.query(
    `SELECT amount FROM coin_transactions
      WHERE idempotency_key = $1 AND kind = 'order_cashback'`,
    [`order_cashback:${order.id}`],
  )
  if (accrued.length === 0) return
  const revoked: unknown[] = await em.query(
    'SELECT 1 FROM coin_transactions WHERE idempotency_key = $1',
    [`order_cashback_revoke:${order.id}`],
  )
  if (revoked.length > 0) return
  // Недостачу читаем из базы, а не из памяти: объект заказа мог устареть.
  const fresh: { shortfall: number }[] = await em.query(
    'SELECT cashback_shortfall_coins AS shortfall FROM orders WHERE id = $1',
    [order.id],
  )
  if ((fresh[0]?.shortfall ?? 0) > 0) return

  const promised = accrued[0].amount
  const toRevoke = Math.min(promised, balance)
  if (toRevoke > 0) {
    await applyCoinTransaction(em, {
      customerId,
      amount: -toRevoke,
      kind: 'order_cashback_revoke',
      orderId: order.id,
      idempotencyKey: `order_cashback_revoke:${order.id}`,
    })
  }
  const shortfall = promised - toRevoke
  if (shortfall > 0) {
    await em.update(Order, order.id, { cashbackShortfallCoins: shortfall })
  }
  order.cashbackShortfallCoins = shortfall
}
