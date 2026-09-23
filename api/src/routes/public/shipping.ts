import { Router } from 'express'
import { z } from 'zod'
import { getCdekClient } from '../../lib/cdek/index.js'
import { loadCart } from '../../lib/shipping/cart.js'
import { packCart } from '../../lib/shipping/pack.js'
import { deliveryConfigFromEnv, quoteDelivery } from '../../lib/shipping/quote.js'
import { CheckoutSchema, DeliverySchema } from '../checkout.schemas.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const publicShippingRouter: Router = Router()

const QuoteSchema = z.object({
  items: CheckoutSchema.shape.items,
  destination: DeliverySchema.optional(),
})

// POST /api/public/shipping/quote — расчёт доставки для корзины.
// Без адреса — только сумма и места отправления: ими виджет СДЭК считает
// тарифы на карте. С адресом — цена для покупателя по тем же правилам, что
// и в чекауте (тот же loadCart → packCart → quoteDelivery).
publicShippingRouter.post(
  '/quote',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    try {
      const { items, destination } = QuoteSchema.parse(req.body)
      const { subtotalRub, packLines } = await loadCart(items)
      const packages = packCart(packLines)
      const config = deliveryConfigFromEnv()
      const quote = destination
        ? await quoteDelivery(
            { destination, subtotalRub, packages },
            { cdek: getCdekClient(), config },
          )
        : null
      // Коды тарифов отдаём виджету отсюда же, чтобы карта и чекаут считали
      // по одним тарифам.
      const tariffs = { pvz: config.tariffPvz, courier: config.tariffCourier }
      res.json({ data: { subtotalRub, packages, quote, tariffs } })
    } catch (err) {
      next(err)
    }
  },
)
