import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { notFound } from '../errors.js'

export const publicOrdersRouter: Router = Router()

// Public order-status lookup for the "спасибо за заказ" page. The payload is
// deliberately PII-free: order numbers travel in URLs, referrers and support
// chats, so knowing one must not expose the customer's name/phone/address.
publicOrdersRouter.get('/:number/status', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Order)
    const order = await repo.findOneBy({ orderNumber: req.params.number })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')
    res.json({
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        totalRub: order.totalRub,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      },
    })
  } catch (err) {
    next(err)
  }
})
