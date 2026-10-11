import { Router } from 'express'
import { getCdekClient } from '../../lib/cdek/index.js'
import { ycpCdekTimeoutMs } from '../../lib/ycp/config.js'
import {
  UnknownPickupPointError,
  ycpDeliveryOption,
  type YcpDeliveryTarget,
} from '../../lib/ycp/deliveryOptions.js'
import { pickupPointsPage } from '../../lib/ycp/pickupPoints.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpBadRequest } from './errors.js'
import { DeliveryOptionsSchema, PageQuerySchema } from './schemas.js'

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

// Цена и срок доставки СДЭК для выбранного покупателем способа.
ycpDeliveryRouter.post('/options', async (req, res, next) => {
  try {
    const { items, delivery_target: t } = DeliveryOptionsSchema.parse(req.body)
    const lines = [...(await loadYcpLines(items)).values()]
    if (lines.length === 0) throw ycpBadRequest('Products not found')
    // Обязательность полей адреса уже проверила схема (checkAddressFor).
    const target: YcpDeliveryTarget =
      t.delivery_method === 'pickup_point'
        ? { method: 'pickup_point', pickupPointId: t.address.pickup_point_id ?? '' }
        : {
            method: 'courier',
            locality: t.address.locality ?? '',
            address: t.address.address ?? '',
          }
    const option = await ycpDeliveryOption(
      { target, lines, now: new Date() },
      { cdek: getCdekClient(), timeoutMs: ycpCdekTimeoutMs() },
    )
    // Схема Яндекса называет ключ delivery_options, а пример — options: отдаём оба.
    res.json({ options: [option], delivery_options: [option] })
  } catch (err) {
    next(err instanceof UnknownPickupPointError ? ycpBadRequest('Unknown pickup point') : err)
  }
})
