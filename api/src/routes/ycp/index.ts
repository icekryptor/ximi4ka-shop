import { Router } from 'express'
import { requireYcpToken } from './auth.js'
import { ycpBasketRouter } from './basket.js'
import { ycpWarehousesRouter } from './warehouses.js'

// Методы, которые Яндекс вызывает у магазина (docs/ycp/ycp-openapi-0.0.14.json,
// servers[0].url = api/v1). Токен проверяется до любого маршрута, поэтому и на
// неизвестный путь без токена ответ — 401.
export function createYcpRouter(): Router {
  const router = Router()
  router.use(requireYcpToken)
  router.use('/warehouses', ycpWarehousesRouter)
  router.use('/checkout/basket', ycpBasketRouter)
  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  return router
}
