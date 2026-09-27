import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import type { PublicOrderShipment } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { notFound } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'

export const publicOrdersRouter: Router = Router()

function tokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

export function cdekTrackingUrl(cdekNumber: string): string {
  return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(cdekNumber)}`
}

async function shipmentFor(orderId: string): Promise<PublicOrderShipment | null> {
  const s = await AppDataSource.getRepository(CdekShipment).findOneBy({ orderId })
  if (!s) return null
  if (s.state === 'created' && s.cdekNumber) {
    return {
      state: 'created',
      trackingNumber: s.cdekNumber,
      trackingUrl: cdekTrackingUrl(s.cdekNumber),
    }
  }
  return {
    state: s.state === 'failed' ? 'failed' : 'pending',
    trackingNumber: null,
    trackingUrl: null,
  }
}

// Public order-status lookup for the "спасибо за заказ" page. The payload is
// deliberately PII-free: order numbers travel in URLs, referrers and support
// chats, so knowing one must not expose the customer's name/phone/address.
// Трек СДЭК (по нему видны город и пункт выдачи) — только с секретом заказа
// `?t=`, который получает оформивший заказ: номера идут подряд и
// перебираются. Лимит запросов — против перебора номеров.
publicOrdersRouter.get(
  '/:number/status',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    try {
      const repo = AppDataSource.getRepository(Order)
      const order = await repo.findOneBy({ orderNumber: req.params.number })
      if (!order) throw notFound('order_not_found', 'Заказ не найден')
      const withSecret = tokenMatches(req.query.t, order.publicToken)
      res.json({
        data: {
          orderNumber: order.orderNumber,
          status: order.status,
          totalRub: order.totalRub,
          // Not PII: the status page uses the provider to decide whether to
          // poll for a payment result (tbank) or render the manual-order copy.
          paymentProvider: order.paymentProvider,
          createdAt: order.createdAt,
          paidAt: order.paidAt,
          ...(withSecret ? { shipment: await shipmentFor(order.id) } : {}),
        },
      })
    } catch (err) {
      next(err)
    }
  },
)
