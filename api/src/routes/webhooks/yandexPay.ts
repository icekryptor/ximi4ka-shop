import { Router, type ErrorRequestHandler } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { applyPaymentStatus } from '../../lib/payments/orderStatus.js'
import { verifyYandexWebhook } from '../../lib/payments/yandexPay/webhook.js'
import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'

export const yandexPayWebhookRouter: Router = Router()

// HTTP-статус отказа по reasonCode. Любой не-200 Яндекс повторяет до суток.
const FAIL_STATUS = { UNAUTHORIZED: 401, TOKEN_EXPIRED: 401, OTHER: 400 } as const

// Уведомления Яндекс Пэй. Callback URL в кабинете — https://ximi4ka.ru/api/webhooks/yandex-pay,
// путь /v1/webhook Яндекс дописывает сам. 200 {"status":"success"} — обработано, в том
// числе неизвестный заказ, заказ другого провайдера и повтор статуса; не-200 — только
// при неудачной проверке токена. Статус применяется как у Т-Кассы: уведомления, выдача
// материалов и офлайн-конверсии Метрики срабатывают без доработок.
yandexPayWebhookRouter.post('/v1/webhook', async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined
    const result = await verifyYandexWebhook(rawBody)
    if (!result.ok) {
      res
        .status(FAIL_STATUS[result.reasonCode])
        .json({ status: 'fail', reasonCode: result.reasonCode, reason: result.reason })
      return
    }

    const order = await AppDataSource.getRepository(Order).findOneBy({
      orderNumber: result.orderNumber,
    })
    if (!order) {
      console.error(`yandex_pay webhook: заказ ${result.orderNumber} не найден — ответили 200`)
      res.status(200).json({ status: 'success' })
      return
    }
    // Подписанное событие не трогает заказы Т-Кассы и ручной оплаты с совпавшим номером.
    if (order.paymentProvider !== 'yandex_pay') {
      console.error(
        `yandex_pay webhook: заказ ${order.orderNumber} оплачивается не через Яндекс Пэй`,
      )
      res.status(200).json({ status: 'success' })
      return
    }

    let changed = false
    if (!order.paymentIntentId) {
      order.paymentIntentId = result.orderNumber
      changed = true
    }
    // Повтор того же статуса — no-op внутри applyPaymentStatus.
    const previousStatus = order.status
    if (applyPaymentStatus(order, result.status, 'yandex_pay')) changed = true
    if (changed) await saveOrderWithStatusEvent(order, previousStatus)

    res.status(200).json({ status: 'success' })
  } catch (err) {
    next(err)
  }
})

// express.raw отклоняет тело больше лимита (entity.too.large) — отвечаем в формате
// Яндекса, а не общим 500.
export const yandexPayWebhookErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if ((err as { type?: unknown } | null)?.type === 'entity.too.large') {
    res
      .status(413)
      .json({ status: 'fail', reasonCode: 'OTHER', reason: 'Request body is too large' })
    return
  }
  next(err)
}
