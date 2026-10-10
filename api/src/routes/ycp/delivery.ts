import { Router } from 'express'
import { pickupPointsPage } from '../../lib/ycp/pickupPoints.js'
import { YcpError } from './errors.js'
import { PageQuerySchema } from './schemas.js'

export const ycpDeliveryRouter: Router = Router()

// Пункты выдачи — только из кеша (lib/ycp/pickupPoints.ts). До первой сборки
// — 500: Яндекс повторит запрос позже (спека YCP).
ycpDeliveryRouter.get('/pickup_points', (req, res, next) => {
  try {
    const { limit, offset } = PageQuerySchema.parse(req.query)
    const page = pickupPointsPage(limit, offset)
    if (!page) throw new YcpError(500, 'Pickup points are not loaded yet')
    res.json({ pickup_points: page.points, total_count: page.total })
  } catch (err) {
    next(err)
  }
})
