import { Router } from 'express'
import { z } from 'zod'
import type {
  AdminCoinTransaction,
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomersPage,
} from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { applyCoinTransaction, InsufficientCoinsError } from '../../lib/coins/ledger.js'
import { conflict, notFound } from '../errors.js'
import { requireAdminAuth, requireCsrfToken, requireRole } from '../middleware/requireAdminAuth.js'
import {
  CoinAdjustSchema,
  CUSTOMERS_PAGE_SIZE,
  CustomersListQuerySchema,
} from './customers.schemas.js'

export const adminCustomersRouter: Router = Router()

adminCustomersRouter.use(requireAdminAuth)
adminCustomersRouter.use(requireCsrfToken)
// Покупатели и их баланс — персональные данные и деньги: только admin, как заказы.
adminCustomersRouter.use(requireRole('admin'))

const uuid = z.string().uuid()

// Спецсимволы LIKE (и сам escape-символ) — обычные символы поиска.
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`
}

adminCustomersRouter.get('/', async (req, res, next) => {
  try {
    const { q, page } = CustomersListQuerySchema.parse(req.query)
    const params: unknown[] = []
    let where = ''
    if (q) {
      params.push(likePattern(q))
      where = `WHERE c.email ILIKE $1 ESCAPE '\\' OR c.telegram_username ILIKE $1 ESCAPE '\\'`
    }
    const total: { n: number }[] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS n FROM customers c ${where}`,
      params,
    )
    const rows: {
      id: string
      email: string | null
      telegram_username: string | null
      name: string | null
      coin_balance: number
      orders_count: number
    }[] = await AppDataSource.query(
      `SELECT c.id, c.email, c.telegram_username, c.name, c.coin_balance,
              (SELECT COUNT(*)::int FROM orders o
                WHERE o.customer_id = c.id AND o.deleted_at IS NULL) AS orders_count
         FROM customers c
         ${where}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ${CUSTOMERS_PAGE_SIZE} OFFSET ${(page - 1) * CUSTOMERS_PAGE_SIZE}`,
      params,
    )
    const items: AdminCustomerListItem[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      telegramUsername: r.telegram_username,
      name: r.name,
      coinBalance: r.coin_balance,
      ordersCount: r.orders_count,
    }))
    const data: AdminCustomersPage = { items, total: total[0].n }
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

adminCustomersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = uuid.safeParse(req.params.id)
    if (!id.success) throw notFound('customer_not_found', 'Покупатель не найден')
    const customer = await AppDataSource.getRepository(Customer).findOneBy({ id: id.data })
    if (!customer) throw notFound('customer_not_found', 'Покупатель не найден')

    const [txRows, orders]: [
      {
        id: string
        amount: number
        kind: AdminCoinTransaction['kind']
        order_id: string | null
        order_number: string | null
        comment: string | null
        admin_user_id: string | null
        created_at: Date
      }[],
      Order[],
    ] = await Promise.all([
      AppDataSource.query(
        `SELECT t.id, t.amount, t.kind, t.order_id, o.order_number, t.comment,
                t.admin_user_id, t.created_at
           FROM coin_transactions t
           LEFT JOIN orders o ON o.id = t.order_id
          WHERE t.customer_id = $1
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 100`,
        [customer.id],
      ),
      AppDataSource.getRepository(Order).find({
        where: { customerId: customer.id },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
    ])
    const data: AdminCustomerDetail = {
      customer: {
        id: customer.id,
        email: customer.email,
        telegramUsername: customer.telegramUsername,
        name: customer.name,
        phone: customer.phone,
        createdAt: customer.createdAt.toISOString(),
      },
      coinBalance: customer.coinBalance,
      transactions: txRows.map((t) => ({
        id: t.id,
        amount: t.amount,
        kind: t.kind,
        orderId: t.order_id,
        orderNumber: t.order_number,
        comment: t.comment,
        adminUserId: t.admin_user_id,
        createdAt: t.created_at.toISOString(),
      })),
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalRub: o.totalRub,
        createdAt: o.createdAt.toISOString(),
        cashbackPromisedCoins: o.cashbackPromisedCoins,
      })),
    }
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

// Ручная правка баланса. Повтор с тем же requestId — 200 с текущим балансом, без второй строки.
adminCustomersRouter.post('/:id/coins', async (req, res, next) => {
  try {
    const id = uuid.safeParse(req.params.id)
    if (!id.success) throw notFound('customer_not_found', 'Покупатель не найден')
    const { amount, comment, requestId } = CoinAdjustSchema.parse(req.body)
    const exists = await AppDataSource.getRepository(Customer).exists({ where: { id: id.data } })
    if (!exists) throw notFound('customer_not_found', 'Покупатель не найден')

    try {
      const result = await AppDataSource.transaction((em) =>
        applyCoinTransaction(em, {
          customerId: id.data,
          amount,
          kind: 'admin_adjust',
          idempotencyKey: `admin_adjust:${requestId}`,
          comment,
          adminUserId: req.adminUser!.id,
        }),
      )
      res.json({ data: { balance: result.balance } })
    } catch (err) {
      if (err instanceof InsufficientCoinsError) {
        throw conflict('insufficient_coins', 'На балансе недостаточно химикоинов')
      }
      throw err
    }
  } catch (err) {
    next(err)
  }
})
