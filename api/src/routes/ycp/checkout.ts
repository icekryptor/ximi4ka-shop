import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import {
  cancelYcpSession,
  createYcpOrder,
  inventoryConflict,
  markYcpOrderPlaced,
} from '../../lib/ycp/orders.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpBadRequest, ycpConflict, ycpNotFound } from './errors.js'
import { CheckoutPlacedSchema, CreateCheckoutSchema, SessionQuerySchema } from './schemas.js'

export const ycpCheckoutRouter: Router = Router()

function sessionConflict(order: Order): YcpError {
  return ycpConflict('Checkout session already exists', {
    checkout_canceled: order.status === 'cancelled',
  })
}

// Сессия оформления (спека YCP, POST /checkout): повтор сессии — 409, затем
// перепроверка цен и наличия, затем заказ. Внешних вызовов нет.
ycpCheckoutRouter.post('/', async (req, res, next) => {
  try {
    const body = CreateCheckoutSchema.parse(req.body)
    const method = body.delivery.delivery_method
    if (method === 'self_pickup') throw ycpBadRequest('Self pickup is not supported')
    const warehouse = ycpWarehouseFromEnv()
    if (!warehouse) throw new YcpError(500, 'Warehouse is not configured')
    const existing = await AppDataSource.getRepository(Order).findOneBy({
      externalSessionId: body.session_id,
    })
    if (existing) throw sessionConflict(existing)
    const lines = await loadYcpLines(body.items)
    const actual = inventoryConflict(body.items, lines, warehouse.id)
    if (actual) throw ycpConflict('Prices or availability changed', { actual_inventory: actual })
    const result = await createYcpOrder(
      { ...body, delivery: { ...body.delivery, delivery_method: method } },
      [...lines.values()],
    )
    if ('existing' in result) throw sessionConflict(result.existing)
    res.status(201).json({ order_number: result.created.orderNumber })
  } catch (err) {
    next(err)
  }
})

ycpCheckoutRouter.post('/placed', async (req, res, next) => {
  try {
    const body = CheckoutPlacedSchema.parse({
      ...req.query,
      ...(typeof req.body === 'object' && req.body !== null ? req.body : {}),
    })
    const outcome = await markYcpOrderPlaced({
      sessionId: body.session_id,
      orderId: body.order_id,
      paymentMethod: body.payment_method,
      onlinePaymentMethod: body.online_payment_method ?? null,
      acquiringId: body.acquiring_id ?? null,
    })
    if (outcome === 'not_found') throw ycpNotFound('Order not found')
    if (outcome === 'cancelled') throw ycpConflict('Order already cancelled')
    if (outcome === 'on_delivery') throw ycpConflict('Payment on delivery is not supported')
    res.status(200).end()
  } catch (err) {
    next(err)
  }
})

ycpCheckoutRouter.post('/cancel', async (req, res, next) => {
  try {
    const { session_id } = SessionQuerySchema.parse(req.query)
    if ((await cancelYcpSession(session_id)) === 'not_found') throw ycpNotFound('Session not found')
    res.status(200).end()
  } catch (err) {
    next(err)
  }
})
