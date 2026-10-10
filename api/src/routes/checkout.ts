import { Router } from 'express'
import type { CheckoutResponse } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { Customer } from '../entities/Customer.js'
import type { Product } from '../entities/Product.js'
import { getCdekClient } from '../lib/cdek/index.js'
import { isKnownDeliveryPoint } from '../lib/cdek/locations.js'
import { enqueueOrderEvent } from '../lib/notifications/outbox.js'
import { getPaymentProvider } from '../lib/payments/index.js'
import { loadGift } from '../lib/gift.js'
import { loadCart } from '../lib/shipping/cart.js'
import { packCart, type PackLine } from '../lib/shipping/pack.js'
import { deliveryConfigFromEnv, quoteDelivery } from '../lib/shipping/quote.js'
import { nextOrderNumber } from '../lib/orderNumber.js'
import { findCustomerSession } from '../lib/account/session.js'
import { normalizeEmail } from '../lib/account/emailCodes.js'
import { badRequest } from './errors.js'
import { CheckoutSchema } from './checkout.schemas.js'

export const checkoutRouter: Router = Router()

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// Вес подарка в упаковку: тот же товар уже в корзине — прибавляем штуку к его
// позиции, чтобы productId в местах не двоился.
function withGiftUnit(packLines: PackLine[], gift: Product): PackLine[] {
  const same = packLines.find((l) => l.productId === gift.id)
  if (same) {
    return packLines.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l))
  }
  return [
    ...packLines,
    {
      productId: gift.id,
      quantity: 1,
      weightG: gift.weightG,
      shipBoxes: gift.shipBoxes ?? [],
      looseUnits: gift.looseUnits ?? 1,
      minBox: gift.minBox,
    },
  ]
}

function checkoutResponse(order: Order): { data: CheckoutResponse } {
  return {
    data: {
      orderNumber: order.orderNumber,
      paymentUrl: order.paymentUrl ?? null,
      publicToken: order.publicToken,
    },
  }
}

// POST /api/checkout — creates an Order + OrderItems from the cart.
//
// Prices, availability and shipping are recomputed from the database; the
// client only sends product ids and quantities. An optional Idempotency-Key
// header makes retries safe: the same key always returns the order created
// by the first successful attempt.
checkoutRouter.post('/', async (req, res, next) => {
  try {
    // Ловушка для ботов: поле скрыто от людей, а формы-спамеры заполняют всё
    // подряд. Живой покупатель его не увидит и не заполнит. Непустым считаем
    // любое значение, не только строку: бот может прислать и число, и массив.
    // Лимит частоты на этот маршрут стоит в app.ts (guard).
    const trap = (req.body as { hp_check?: unknown } | undefined)?.hp_check
    const trapFilled =
      trap !== undefined && trap !== null && !(typeof trap === 'string' && trap.trim() === '')
    if (trapFilled) {
      // В лог — чтобы видеть и атаки, и ложные срабатывания автозаполнения.
      console.warn('checkout: ловушка для ботов заполнена', {
        ip: req.ip,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
      })
      throw badRequest(
        'bot_suspected',
        'Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз',
      )
    }

    const parsed = CheckoutSchema.parse(req.body)
    const idempotencyKey = req.header('Idempotency-Key')?.trim() || null

    const orderRepo = AppDataSource.getRepository(Order)

    if (idempotencyKey) {
      const existing = await orderRepo.findOneBy({ idempotencyKey })
      if (existing) {
        res.status(200).json(checkoutResponse(existing))
        return
      }
    }

    // Пункт сверяем со списком города из того же кеша, что видел покупатель
    // (спека §4.3). СДЭК не ответил — заказ принимаем: оформление важнее, а
    // закрытый пункт всплывёт ошибкой при создании заказа в СДЭК.
    if (parsed.delivery.method === 'cdek_pvz') {
      const known = await isKnownDeliveryPoint(
        getCdekClient(),
        parsed.delivery.cityCode,
        parsed.delivery.deliveryPointCode,
      )
      if (known === false) {
        throw badRequest('delivery_point_unknown', 'Пункт выдачи не найден — выберите другой')
      }
    }

    const cart = await loadCart(parsed.items)
    const { lines, subtotalRub, discountRub } = cart
    const { delivery } = parsed

    // Подарок едет в посылке, поэтому в местах для СДЭК он есть; на сумму заказа
    // и порог бесплатной доставки он не влияет (строка за 0 ₽). Цену доставки
    // покупателю считаем по местам без подарка: ту же цену он видел в чекауте
    // до выбора «Оформить» (превью не знает про подарок).
    const gift = await loadGift(parsed.giftProductId, subtotalRub - discountRub)
    const quotePackages = packCart(cart.packLines)
    const packages = gift ? packCart(withGiftUnit(cart.packLines, gift)) : quotePackages

    // Цену доставки считает только сервер: сумма, которую показал виджет, —
    // подсказка для интерфейса, клиенту не доверяем.
    // Порог бесплатной доставки — по сумме, которую платят за товары.
    const quote = await quoteDelivery(
      { destination: delivery, subtotalRub: subtotalRub - discountRub, packages: quotePackages },
      { cdek: getCdekClient(), config: deliveryConfigFromEnv() },
    )
    const shippingRub = quote.customerPriceRub
    const totalRub = subtotalRub - discountRub + shippingRub

    // Личный кабинет (спека кабинета §6): заказ идёт в аккаунт вошедшего
    // покупателя или владельца подтверждённого email из заказа. Аккаунтов
    // чекаут не создаёт. CSRF не нужен — SameSite=lax не отправит cookie
    // сессии в кросс-сайтовом POST.
    const session = await findCustomerSession(req)
    let customerId = session?.customer.id ?? null
    // placedSignedIn — только для живой сессии: заказ, привязанный ниже по
    // введённому email, мог достаться чужому аккаунту, если гость просто
    // угадал чужой подтверждённый адрес (без входа это не доказывает владение).
    const placedSignedIn = customerId !== null
    if (!customerId && parsed.customer.email) {
      const owner = await AppDataSource.getRepository(Customer).findOneBy({
        email: normalizeEmail(parsed.customer.email),
      })
      customerId = owner?.id ?? null
    }

    const provider = getPaymentProvider()

    let order: Order
    try {
      order = await AppDataSource.transaction(async (em) => {
        const orderNumber = await nextOrderNumber(em)
        const created = await em.getRepository(Order).save(
          em.getRepository(Order).create({
            orderNumber,
            status: 'pending',
            customerId,
            placedSignedIn,
            customerName: parsed.customer.name,
            customerPhone: parsed.customer.phone,
            customerEmail: parsed.customer.email ?? '',
            customerTelegram: parsed.customer.telegram ?? null,
            deliveryAddress: {
              address: delivery.address,
              comment: delivery.comment ?? null,
              cityCode: delivery.cityCode ?? null,
              deliveryPointCode: delivery.method === 'cdek_pvz' ? delivery.deliveryPointCode : null,
              postalCode: delivery.method === 'cdek_courier' ? (delivery.postalCode ?? null) : null,
              quote: {
                tariffCode: quote.tariffCode,
                cdekPriceRub: quote.cdekPriceRub,
                periodMin: quote.periodMin,
                periodMax: quote.periodMax,
                source: quote.source,
              },
              packages,
            },
            deliveryMethod: delivery.method,
            subtotalRub,
            discountRub,
            shippingRub,
            totalRub,
            paymentProvider: provider.name,
            idempotencyKey,
            statusHistory: [],
          }),
        )
        const itemRepo = em.getRepository(OrderItem)
        // items нужны провайдеру оплаты: из них собирается чек.
        created.items = await itemRepo.save(
          lines.map(({ product: p, quantity, unitPriceRub, lineTotalRub }) =>
            itemRepo.create({
              orderId: created.id,
              productId: p.id,
              productSnapshot: { name: p.name, sku: p.sku, priceRub: p.priceRub },
              quantity,
              // Со скидкой: по ней СДЭК объявляет ценность, её видят бот и таблица.
              // Обычная цена остаётся в productSnapshot.priceRub.
              unitPriceRub,
              // Точная сумма строки: цена партии не делится на целые рубли за штуку.
              lineTotalRub,
            }),
          ),
        )
        if (gift) {
          created.items.push(
            await itemRepo.save(
              itemRepo.create({
                orderId: created.id,
                productId: gift.id,
                productSnapshot: { name: gift.name, sku: gift.sku, priceRub: gift.priceRub },
                quantity: 1,
                unitPriceRub: 0,
                lineTotalRub: 0,
                isGift: true,
              }),
            ),
          )
        }
        await enqueueOrderEvent(em, created.id, 'created')
        if (session) {
          const c = session.customer
          const fill: Partial<Customer> = {}
          if (!c.name) fill.name = parsed.customer.name
          if (!c.phone) fill.phone = parsed.customer.phone
          if (Object.keys(fill).length > 0)
            await em.getRepository(Customer).update({ id: c.id }, fill)
        }
        return created
      })
    } catch (err) {
      // Two concurrent requests with the same Idempotency-Key: the loser of
      // the unique-index race returns the winner's order.
      if (isUniqueViolation(err) && idempotencyKey) {
        const existing = await orderRepo.findOneBy({ idempotencyKey })
        if (existing) {
          res.status(200).json(checkoutResponse(existing))
          return
        }
      }
      throw err
    }

    // Payment creation happens OUTSIDE the transaction: a slow or failing
    // provider must never roll back an already-taken order. createPayment
    // returning null (manual mode / Init failure) leaves the order pending
    // for manager follow-up.
    const payment = await provider.createPayment(order)
    if (payment) {
      order.paymentIntentId = payment.externalId
      order.paymentUrl = payment.paymentUrl
      await orderRepo.update(order.id, {
        paymentIntentId: payment.externalId,
        paymentUrl: payment.paymentUrl,
      })
    }

    res.status(201).json(checkoutResponse(order))
  } catch (err) {
    next(err)
  }
})
