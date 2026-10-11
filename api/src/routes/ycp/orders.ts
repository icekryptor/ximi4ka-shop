import { Router } from 'express'
import { cancelYcpOrder } from '../../lib/ycp/orders.js'
import { ycpNotFound } from './errors.js'
import { OrderQuerySchema } from './schemas.js'

export const ycpOrdersRouter: Router = Router()

// order_id — id заказа в Яндексе из /checkout/placed (orders.external_order_id).
ycpOrdersRouter.post('/cancel', async (req, res, next) => {
  try {
    const { order_id } = OrderQuerySchema.parse(req.query)
    if ((await cancelYcpOrder(order_id)) === 'not_found') throw ycpNotFound('Order not found')
    res.status(200).end()
  } catch (err) {
    next(err)
  }
})
