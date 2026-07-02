import { Router } from 'express'
import { z } from 'zod'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrdersListQuerySchema, OrderStatusPatchSchema } from './orders.schemas.js'
import { conflict, notFound } from '../errors.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'

export const adminOrdersRouter: Router = Router()

adminOrdersRouter.use(requireAdminAuth)
adminOrdersRouter.use(requireCsrfToken)

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
    res.json({ data: order })
  } catch (err) {
    next(err)
  }
})

// Manual status transition: «Отметить оплаченным» / «Отменить».
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
    // A paid order is settled money — refunds are a separate future flow,
    // not a status PATCH.
    if (order.status === 'paid') {
      throw conflict('order_already_paid', 'Оплаченный заказ нельзя изменить вручную')
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
    const saved = await repo.save(order)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})
