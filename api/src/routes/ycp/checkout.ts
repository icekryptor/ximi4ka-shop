import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import { createYcpOrder, inventoryConflict } from '../../lib/ycp/orders.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpBadRequest, ycpConflict } from './errors.js'
import { CreateCheckoutSchema } from './schemas.js'

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
