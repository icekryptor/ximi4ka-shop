import type { EntityManager } from 'typeorm'
import type { CoinTransactionKind } from '@ximi4ka-shop/shared/types/coins'
import { CoinTransaction } from '../../entities/CoinTransaction.js'

export class InsufficientCoinsError extends Error {
  constructor(message = 'Недостаточно химикоинов') {
    super(message)
    this.name = 'InsufficientCoinsError'
  }
}

export interface CoinTransactionInput {
  customerId: string
  /** Со знаком, целое, не 0. */
  amount: number
  kind: CoinTransactionKind
  idempotencyKey: string
  orderId?: string | null
  comment?: string | null
  adminUserId?: string | null
}

// Единственный путь изменить баланс: строка покупателя блокируется (FOR UPDATE), поэтому
// параллельные операции одного покупателя идут по очереди, а баланс не уходит в минус.
// Запись истории и обновление кэша — в одной транзакции вызывающего; `em` обязан быть
// внутри транзакции (AppDataSource.transaction), иначе блокировка снимется сразу.
// Повтор ключа: applied=false, баланс не трогаем.
export async function applyCoinTransaction(
  em: EntityManager,
  input: CoinTransactionInput,
): Promise<{ applied: boolean; balance: number }> {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new Error(`amount должен быть ненулевым целым, получено ${input.amount}`)
  }
  const locked: { coin_balance: number }[] = await em.query(
    'SELECT coin_balance FROM customers WHERE id = $1 FOR UPDATE',
    [input.customerId],
  )
  if (locked.length === 0) throw new Error(`Покупатель ${input.customerId} не найден`)
  const current = locked[0].coin_balance

  const next = current + input.amount
  if (next < 0) {
    // Повтор уже применённой операции — не ошибка, а applied=false: проверяем ключ раньше.
    const seen = await em.query('SELECT 1 FROM coin_transactions WHERE idempotency_key = $1', [
      input.idempotencyKey,
    ])
    if (seen.length > 0) return { applied: false, balance: current }
    throw new InsufficientCoinsError()
  }

  const inserted: { id: string }[] = await em.query(
    `INSERT INTO coin_transactions
       (customer_id, amount, kind, order_id, comment, admin_user_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.customerId,
      input.amount,
      input.kind,
      input.orderId ?? null,
      input.comment ?? null,
      input.adminUserId ?? null,
      input.idempotencyKey,
    ],
  )
  if (inserted.length === 0) return { applied: false, balance: current }

  await em.query('UPDATE customers SET coin_balance = $2 WHERE id = $1', [input.customerId, next])
  return { applied: true, balance: next }
}

/** История операций покупателя, новые сверху. */
export function listCoinTransactions(
  em: EntityManager,
  customerId: string,
  limit = 50,
): Promise<CoinTransaction[]> {
  return em.getRepository(CoinTransaction).find({
    where: { customerId },
    order: { createdAt: 'DESC', id: 'DESC' },
    take: limit,
  })
}
