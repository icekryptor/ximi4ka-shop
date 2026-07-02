import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { TBankProvider } from '../../lib/payments/tbank.js'
import { applyPaymentStatus } from '../../lib/payments/orderStatus.js'

export const tbankWebhookRouter: Router = Router()

// Т-Касса payment notifications (NotificationURL).
//
// Contract: answer HTTP 200 with the plain-text body `OK` as fast as
// possible — anything else makes Т-Касса retry hourly for 24h, then daily
// for a month. So every recognized-but-uninteresting case (unknown order,
// repeat of an already-applied status, intermediate statuses) still gets
// an `OK`; only a failed signature check is rejected.
tbankWebhookRouter.post('/', async (req, res, next) => {
  try {
    // Always the tbank adapter here regardless of PAYMENT_PROVIDER — the
    // endpoint exists only for Т-Касса, and signature verification fails
    // closed when TBANK_* credentials are not configured.
    const provider = new TBankProvider()
    const event = provider.verifyAndParseWebhook(req.body)
    if (!event) {
      res.status(403).json({
        error: {
          code: 'invalid_notification',
          message: 'Notification signature check failed',
        },
      })
      return
    }

    const repo = AppDataSource.getRepository(Order)
    let order = await repo.findOneBy({ paymentIntentId: event.externalId })
    if (!order && event.orderNumber) {
      order = await repo.findOneBy({ orderNumber: event.orderNumber })
    }

    if (!order) {
      console.error(
        `tbank webhook: no order for PaymentId=${event.externalId} OrderId=${event.orderNumber}`,
      )
      res.status(200).type('text/plain').send('OK')
      return
    }

    let changed = false
    if (!order.paymentIntentId) {
      order.paymentIntentId = event.externalId
      changed = true
    }
    // Idempotent by payment_intent_id + status: a repeat notification for an
    // already-applied status is a no-op inside applyPaymentStatus.
    if (applyPaymentStatus(order, event.status, 'tbank')) changed = true
    if (changed) await repo.save(order)

    res.status(200).type('text/plain').send('OK')
  } catch (err) {
    next(err)
  }
})
