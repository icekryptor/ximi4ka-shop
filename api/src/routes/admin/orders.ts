import { Router } from 'express'
import { z } from 'zod'
import { IsNull, Not } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { OrdersListQuerySchema, OrderStatusPatchSchema } from './orders.schemas.js'
import { conflict, notFound } from '../errors.js'
import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'

export const adminOrdersRouter: Router = Router()

adminOrdersRouter.use(requireAdminAuth)
adminOrdersRouter.use(requireCsrfToken)

async function orderNotifications(orderId: string) {
  const rows = await AppDataSource.getRepository(OrderNotification).find({
    where: { orderId },
    order: { createdAt: 'ASC', channel: 'ASC' },
  })
  return rows.map((n) => ({
    channel: n.channel,
    eventKey: n.eventKey,
    attempts: n.attempts,
    nextAttemptAt: n.nextAttemptAt.toISOString(),
    sentAt: n.sentAt?.toISOString() ?? null,
    failedAt: n.failedAt?.toISOString() ?? null,
    lastError: n.lastError,
  }))
}

// List — newest first, optional status filter.
adminOrdersRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, status } = OrdersListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Order)
    const [items, total] = await repo.findAndCount({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Detail — items included (snapshots carry the composition even if the
// products were later edited or deleted).
adminOrdersRouter.get('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const repo = AppDataSource.getRepository(Order)
    const order = await repo.findOne({
      where: { id: id.data },
      relations: { items: true },
    })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')
    res.json({ data: { ...order, notifications: await orderNotifications(order.id) } })
  } catch (err) {
    next(err)
  }
})

// Ручная смена статуса: «Отметить оплаченным» / «Отменить» / «Отметить отправленным».
adminOrdersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const { status, comment } = OrderStatusPatchSchema.parse(req.body)

    const repo = AppDataSource.getRepository(Order)
    const order = await repo.findOne({
      where: { id: id.data },
      relations: { items: true },
    })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')

    if (order.status === status) {
      throw conflict('status_unchanged', 'Заказ уже находится в этом статусе')
    }
    // «Отправлен» ставится только оплаченному заказу. Оплаченный заказ — это
    // деньги: вернуть его в другое состояние можно только отправкой (возвраты —
    // отдельная будущая история). Отправленный заказ вручную не меняется.
    if (status === 'shipped' && order.status !== 'paid') {
      throw conflict('order_not_paid', 'Отправить можно только оплаченный заказ')
    }
    if (order.status === 'paid' && status !== 'shipped') {
      throw conflict('order_already_paid', 'Оплаченный заказ нельзя изменить вручную')
    }
    if (order.status === 'shipped') {
      throw conflict('order_already_shipped', 'Отправленный заказ нельзя изменить вручную')
    }

    const now = new Date()
    const from = order.status
    order.status = status
    if (status === 'paid' && !order.paidAt) order.paidAt = now
    order.statusHistory = [
      ...(order.statusHistory ?? []),
      {
        from,
        to: status,
        at: now.toISOString(),
        by: 'admin' as const,
        ...(comment ? { comment } : {}),
      },
    ]
    const saved = await saveOrderWithStatusEvent(order, from)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// «Отправить ещё раз»: несданные записи возвращаются в очередь как новые.
adminOrdersRouter.post('/:id/notifications/retry', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const exists = await AppDataSource.getRepository(Order).exists({ where: { id: id.data } })
    if (!exists) throw notFound('order_not_found', 'Заказ не найден')
    await AppDataSource.getRepository(OrderNotification).update(
      { orderId: id.data, failedAt: Not(IsNull()) },
      { failedAt: null, attempts: 0, lastError: null, nextAttemptAt: new Date() },
    )
    res.json({ data: await orderNotifications(id.data) })
  } catch (err) {
    next(err)
  }
})
