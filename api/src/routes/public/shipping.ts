import { Router } from 'express'
import { z } from 'zod'
import { getCdekClient } from '../../lib/cdek/index.js'
import { loadCart } from '../../lib/shipping/cart.js'
import { deliveryEta } from '../../lib/shipping/eta.js'
import { packCart } from '../../lib/shipping/pack.js'
import { deliveryConfigFromEnv, quoteDelivery } from '../../lib/shipping/quote.js'
import { CheckoutSchema, QuoteDestinationSchema } from '../checkout.schemas.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const publicShippingRouter: Router = Router()

const QuoteSchema = z.object({
  items: CheckoutSchema.shape.items,
  destination: QuoteDestinationSchema.optional(),
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
      const { subtotalRub, discountRub, packLines } = await loadCart(items)
      const packages = packCart(packLines)
      const config = deliveryConfigFromEnv()
      const quote = destination
        ? await quoteDelivery(
            { destination, subtotalRub: subtotalRub - discountRub, packages },
            { cdek: getCdekClient(), config },
          )
        : null
      // Коды тарифов отдаём виджету отсюда же, чтобы карта и чекаут считали
      // по одним тарифам.
      const tariffs = { pvz: config.tariffPvz, courier: config.tariffCourier }
      res.json({ data: { subtotalRub, discountRub, packages, quote, tariffs } })
    } catch (err) {
      next(err)
    }
  },
)

const EtaQuery = z.object({
  cityCode: z.coerce.number().int().positive().max(2_147_483_647).optional(),
})

// GET /api/public/shipping/eta?cityCode=424 — когда заказ приедет в город:
// даты для чипа с грузовиком на витрине. Без города — самый быстрый возможный
// срок. data: null — СДЭК не ответил, чип не показываем.
publicShippingRouter.get(
  '/eta',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    const parsed = EtaQuery.safeParse(req.query)
    if (!parsed.success) {
      next(parsed.error)
      return
    }
    try {
      const eta = await deliveryEta(
        { cityCode: parsed.data.cityCode },
        { cdek: getCdekClient(), config: deliveryConfigFromEnv() },
      )
      // Дата меняется в полночь по Москве — в браузере ответ живёт минуту.
      res.set('Cache-Control', eta ? 'public, max-age=60' : 'no-store')
      res.json({ data: eta })
    } catch (err) {
      next(err)
    }
  },
)
