import { Router } from 'express'
import { ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import { YcpError } from './errors.js'
import { PageQuerySchema } from './schemas.js'

export const ycpWarehousesRouter: Router = Router()

// Кнопка «Обновить склады через YCP» в кабинете. Самовывоза нет, доставку
// считаем сами (merchant_ship) — доставка силами YCP со склада выключена.
ycpWarehousesRouter.get('/', (req, res, next) => {
  try {
    const { limit, offset } = PageQuerySchema.parse(req.query)
    const warehouse = ycpWarehouseFromEnv()
    if (!warehouse) throw new YcpError(500, 'Warehouse is not configured')
    const all = [
      {
        ...warehouse,
        self_pickup_options: { enabled: false },
        ycp_delivery_options: { enabled: false },
      },
    ]
    res.json({ warehouses: all.slice(offset, offset + limit), total_count: all.length })
  } catch (err) {
    next(err)
  }
})
