import { Router } from 'express'
import { requireYcpToken } from './auth.js'
import { ycpBasketRouter } from './basket.js'
import { ycpCheckoutRouter } from './checkout.js'
import { ycpDeliveryRouter } from './delivery.js'
import { ycpOrdersRouter } from './orders.js'
import { ycpWarehousesRouter } from './warehouses.js'

// Методы, которые Яндекс вызывает у магазина (docs/ycp/ycp-openapi-0.0.14.json,
// servers[0].url = api/v1). Токен проверяется до любого маршрута, поэтому и на
// неизвестный путь без токена ответ — 401. GET /order и POST /order/delivered
// не реализованы: они нужны только при доставке силами Яндекса.
export function createYcpRouter(): Router {
  const router = Router()
  router.use(requireYcpToken)
  router.use('/warehouses', ycpWarehousesRouter)
  router.use('/checkout/basket', ycpBasketRouter)
  router.use('/checkout/delivery', ycpDeliveryRouter)
  router.use('/checkout', ycpCheckoutRouter)
  router.use('/order', ycpOrdersRouter)
  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  return router
}
