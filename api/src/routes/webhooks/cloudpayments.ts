import { Router, type ErrorRequestHandler, type Request, type Response } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'
import {
  acceptsTestPayments,
  hasCloudPaymentsKeys,
} from '../../lib/payments/cloudpayments/config.js'
import {
  amountKopecks,
  isTestModeNotification,
  parseCloudPaymentsBody,
  verifyCloudPaymentsSignature,
  type CloudPaymentsNotification,
} from '../../lib/payments/cloudpayments/webhook.js'
import { clip } from '../../lib/payments/logText.js'
import { applyPaymentStatus } from '../../lib/payments/orderStatus.js'

export const cloudPaymentsWebhookRouter: Router = Router()

// Уведомления CloudPayments. В кабинете (настройки сайта → уведомления, метод POST):
//   Check — https://ximi4ka.ru/api/webhooks/cloudpayments/check
//   Pay   — https://ximi4ka.ru/api/webhooks/cloudpayments/pay
//   Fail  — https://ximi4ka.ru/api/webhooks/cloudpayments/fail
// На подписанное уведомление ответ — {"code":N} с HTTP 200 (неверная подпись — 401).
// Check с ненулевым кодом отклоняет платёж до списания; Pay и Fail CloudPayments
// повторяет до 100 раз, пока не получит code 0, поэтому на них всегда отвечаем 0
// после обработки, а несоответствия только логируем.
const CODE = { OK: 0, BAD_ORDER: 10, BAD_AMOUNT: 12, REJECT: 13 } as const

// Подпись проверяем первой и по ключу из env — без чтения настроек: неподписанный
// запрос не должен доходить до базы.
function readNotification(req: Request, res: Response): CloudPaymentsNotification | null {
  const secret = (process.env.CLOUDPAYMENTS_API_SECRET ?? '').trim()
  const raw = Buffer.isBuffer(req.body) ? req.body : null
  if (!hasCloudPaymentsKeys() || !raw || !verifyCloudPaymentsSignature(raw, req.headers, secret)) {
    res.status(401).json({ code: CODE.REJECT })
    return null
  }
  const n = parseCloudPaymentsBody(raw, req.headers['content-type'])
  if (!n) {
    res.status(400).json({ code: CODE.REJECT })
    return null
  }
  return n
}

type Match = { ok: true; order: Order } | { ok: false; code: number; reason: string }

// Заказ CloudPayments с той же суммой в рублях; тестовые платежи — только вне production.
async function matchOrder(n: CloudPaymentsNotification): Promise<Match> {
  const invoiceId = n.InvoiceId ?? ''
  const order = invoiceId
    ? await AppDataSource.getRepository(Order).findOneBy({ orderNumber: invoiceId })
    : null
  if (!order || order.paymentProvider !== 'cloudpayments') {
    return {
      ok: false,
      code: CODE.BAD_ORDER,
      reason: `заказ ${clip(invoiceId)} не найден или оплачивается не через CloudPayments`,
    }
  }
  if ((n.Currency ?? '') !== 'RUB' || amountKopecks(n.Amount) !== order.totalRub * 100) {
    return {
      ok: false,
      code: CODE.BAD_AMOUNT,
      reason: `сумма ${clip(n.Amount)} ${clip(n.Currency)} не совпала с заказом ${order.orderNumber} (${order.totalRub} RUB)`,
    }
  }
  if (isTestModeNotification(n) && !acceptsTestPayments()) {
    return {
      ok: false,
      code: CODE.REJECT,
      reason: `тестовый платёж по ${order.orderNumber} на production`,
    }
  }
  return { ok: true, order }
}

cloudPaymentsWebhookRouter.post('/check', async (req, res, next) => {
  try {
    const n = readNotification(req, res)
    if (!n) return
    const match = await matchOrder(n)
    if (!match.ok) {
      console.error(`cloudpayments check: отклонено (${match.code}): ${match.reason}`)
      res.status(200).json({ code: match.code })
      return
    }
    // Оплатить можно только ожидающий заказ: отменённый менеджером, оплаченный или
    // отгруженный по старой ссылке — отказ до списания.
    if (match.order.status !== 'pending') {
      console.error(
        `cloudpayments check: заказ ${match.order.orderNumber} в статусе ${match.order.status} — отклонено`,
      )
      res.status(200).json({ code: CODE.REJECT })
      return
    }
    res.status(200).json({ code: CODE.OK })
  } catch (err) {
    next(err)
  }
})

// TransactionId CloudPayments — число; у заказа после чекаута в paymentIntentId лежит
// Id ссылки (буквы), после оплаты вебхуком — TransactionId.
const TRANSACTION_ID = /^\d+$/

// Pay по уже оплаченному или отгруженному заказу. Повтор приходит с тем же
// TransactionId — ничего не делаем. Если заказ оплатила сверка или менеджер, в нём ещё
// Id ссылки (или пусто) — это тот же платёж: молча сохраняем TransactionId для
// возврата, без события статуса. Другой TransactionId при сохранённом прежнем —
// покупатель заплатил второй раз (например, по старой ссылке в другой вкладке).
async function onPayForPaidOrder(order: Order, n: CloudPaymentsNotification): Promise<void> {
  const transactionId = n.TransactionId ?? ''
  if (!transactionId) {
    console.error(
      `cloudpayments pay: заказ ${order.orderNumber} уже оплачен, уведомление без TransactionId — проверьте в кабинете`,
    )
    return
  }
  if (transactionId === order.paymentIntentId) return
  if (order.paymentIntentId && TRANSACTION_ID.test(order.paymentIntentId)) {
    console.error(
      `cloudpayments pay: ПОВТОРНОЕ списание по ${order.orderNumber}: TransactionId=${clip(transactionId)} (в заказе ${clip(order.paymentIntentId)}) — нужен возврат`,
    )
    return
  }
  await AppDataSource.getRepository(Order).update(order.id, { paymentIntentId: transactionId })
}

cloudPaymentsWebhookRouter.post('/pay', async (req, res, next) => {
  try {
    const n = readNotification(req, res)
    if (!n) return
    const match = await matchOrder(n)
    if (!match.ok) {
      console.error(`cloudpayments pay: НЕ засчитано, проверьте вручную: ${match.reason}`)
      res.status(200).json({ code: CODE.OK })
      return
    }
    // Засчитываем только списание: возвраты и прочие операции заказ не оплачивают.
    if (n.OperationType !== 'Payment') {
      console.error(
        `cloudpayments pay: заказ ${match.order.orderNumber}, OperationType=${clip(n.OperationType)} — не засчитано`,
      )
      res.status(200).json({ code: CODE.OK })
      return
    }
    // Оплата в одну стадию (RequireConfirmation=false): деньги списаны при Completed.
    if (n.Status !== 'Completed') {
      console.error(
        `cloudpayments pay: заказ ${match.order.orderNumber}, статус ${clip(n.Status)} — не засчитано`,
      )
      res.status(200).json({ code: CODE.OK })
      return
    }
    const order = match.order
    const previousStatus = order.status
    // Повтор того же статуса — no-op внутри applyPaymentStatus (до 100 повторов Pay).
    if (applyPaymentStatus(order, 'paid', 'cloudpayments')) {
      // TransactionId нужен для возврата в кабинете CloudPayments.
      if (n.TransactionId) order.paymentIntentId = n.TransactionId
      await saveOrderWithStatusEvent(order, previousStatus)
      // Правило «деньги пришли — оплачен» общее с Т-Кассой, но отменённый заказ мог
      // уже уйти из работы — менеджеру нужно разобраться.
      if (previousStatus === 'cancelled' || previousStatus === 'failed') {
        console.error(
          `cloudpayments pay: оплата пришла по заказу ${order.orderNumber} в статусе ${previousStatus} — заказ переведён в «оплачен», проверьте вручную`,
        )
      }
    } else if (order.status === 'paid' || order.status === 'shipped') {
      await onPayForPaidOrder(order, n)
    }
    res.status(200).json({ code: CODE.OK })
  } catch (err) {
    next(err)
  }
})

// Отказ одной попытки: ссылка остаётся рабочей, покупатель может заплатить другой
// картой, поэтому заказ не трогаем. ReasonCode 5113 — шлюз не принял карту банка не из
// России (иностранные карты не подключены у CloudPayments).
cloudPaymentsWebhookRouter.post('/fail', async (req, res, next) => {
  try {
    const n = readNotification(req, res)
    if (!n) return
    console.error(
      `cloudpayments fail: заказ ${clip(n.InvoiceId)}, ReasonCode=${clip(n.ReasonCode)} Reason=${clip(n.Reason)} IssuerBankCountry=${clip(n.IssuerBankCountry)}`,
    )
    res.status(200).json({ code: CODE.OK })
  } catch (err) {
    next(err)
  }
})

// express.raw отклоняет тело больше лимита (entity.too.large) — отвечаем в формате
// CloudPayments, а не общим 500.
export const cloudPaymentsWebhookErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if ((err as { type?: unknown } | null)?.type === 'entity.too.large') {
    res.status(413).json({ code: CODE.REJECT })
    return
  }
  next(err)
}
