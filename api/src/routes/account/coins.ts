import { Router } from 'express'
import type { AccountCoins } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'

// Химикоины в кабинете: баланс, ожидаемый кэшбек и последние операции. Каждый запрос
// фильтруется по id покупателя из сессии — чужую историю получить нельзя.
export function createAccountCoinsRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.get('/coins', async (req, res, next) => {
    try {
      const customerId = req.customer!.id
      const [balanceRows, pendingRows, txRows] = await Promise.all([
        AppDataSource.query('SELECT coin_balance FROM customers WHERE id = $1', [customerId]),
        // Ожидаемый кэшбек: оплачен или отправлен, ещё не вручён.
        AppDataSource.query(
          `SELECT COALESCE(SUM(cashback_promised_coins), 0)::int AS pending
             FROM orders
            WHERE customer_id = $1 AND status IN ('paid', 'shipped') AND deleted_at IS NULL`,
          [customerId],
        ),
        // Комментарий админа внутренний: покупателю вместо него подпись на клиенте.
        AppDataSource.query(
          `SELECT t.id, t.amount, t.kind, t.created_at,
                  o.order_number,
                  CASE WHEN t.kind = 'admin_adjust' THEN NULL ELSE t.comment END AS comment
             FROM coin_transactions t
             LEFT JOIN orders o ON o.id = t.order_id
            WHERE t.customer_id = $1
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT 50`,
          [customerId],
        ),
      ])
      const data: AccountCoins = {
        balance: balanceRows[0]?.coin_balance ?? 0,
        pending: pendingRows[0].pending,
        transactions: txRows.map(
          (t: {
            id: string
            amount: number
            kind: AccountCoins['transactions'][number]['kind']
            created_at: Date
            order_number: string | null
            comment: string | null
          }) => ({
            id: t.id,
            amount: t.amount,
            kind: t.kind,
            orderNumber: t.order_number,
            comment: t.comment,
            createdAt: t.created_at.toISOString(),
          }),
        ),
      }
      res.json({ data })
    } catch (err) {
      next(err)
    }
  })

  return router
}
