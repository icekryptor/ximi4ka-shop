import { Router } from 'express'
import { ycpSiteOrigin, ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import { ycpBasketItem } from '../../lib/ycp/basket.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpNotFound } from './errors.js'
import { BasketCheckSchema } from './schemas.js'

export const ycpBasketRouter: Router = Router()

// Цены и наличие для корзины Яндекса — без внешних вызовов. Неизвестный или
// недоступный товар не включается; ни одного товара — 404 по спецификации.
ycpBasketRouter.post('/check', async (req, res, next) => {
  try {
    const { items } = BasketCheckSchema.parse(req.body)
    const warehouse = ycpWarehouseFromEnv()
    if (!warehouse) throw new YcpError(500, 'Warehouse is not configured')
    const lines = await loadYcpLines(items)
    if (lines.size === 0) throw ycpNotFound('Products not found')
    const origin = ycpSiteOrigin()
    res.json({ items: [...lines.values()].map((l) => ycpBasketItem(l, warehouse.id, origin)) })
  } catch (err) {
    next(err)
  }
})
