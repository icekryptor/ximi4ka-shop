import { Router } from 'express'
import { In, IsNull } from 'typeorm'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { Product } from '../entities/Product.js'
import { getPaymentProvider } from '../lib/payments/index.js'
import { calcShippingRub } from '../lib/shipping.js'
import { nextOrderNumber } from '../lib/orderNumber.js'
import { CheckoutSchema } from './checkout.schemas.js'
import { ApiError } from './errors.js'

export const checkoutRouter: Router = Router()

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

function checkoutResponse(order: Order): {
  data: { orderNumber: string; paymentUrl: string | null }
} {
  return {
    data: { orderNumber: order.orderNumber, paymentUrl: order.paymentUrl ?? null },
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

    // Collapse duplicate product ids by summing quantities.
    const qtyByProduct = new Map<string, number>()
    for (const item of parsed.items) {
      qtyByProduct.set(
        item.productId,
        (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
      )
    }
    const productIds = [...qtyByProduct.keys()]

    const products = await AppDataSource.getRepository(Product).find({
      where: { id: In(productIds), deletedAt: IsNull() },
    })
    const productById = new Map(products.map((p) => [p.id, p]))

    // Unknown / soft-deleted / unpublished products cannot be ordered.
    const unavailable = productIds.filter((id) => {
      const p = productById.get(id)
      return !p || !p.isPublished
    })
    if (unavailable.length > 0) {
      throw new ApiError(409, 'products_unavailable', 'Некоторые товары недоступны для заказа', {
        productIds: unavailable,
      })
    }

    const outOfStock = products.filter((p) => p.stockStatus === 'out_of_stock')
    if (outOfStock.length > 0) {
      throw new ApiError(409, 'out_of_stock', 'Некоторые товары закончились', {
        items: outOfStock.map((p) => ({ productId: p.id, name: p.name })),
      })
    }

    const subtotalRub = productIds.reduce(
      (sum, id) => sum + productById.get(id)!.priceRub * qtyByProduct.get(id)!,
      0,
    )
    const shippingRub = calcShippingRub(parsed.delivery.method, subtotalRub)
    const totalRub = subtotalRub + shippingRub

    const provider = getPaymentProvider()

    let order: Order
    try {
      order = await AppDataSource.transaction(async (em) => {
        const orderNumber = await nextOrderNumber(em)
        const created = await em.getRepository(Order).save(
          em.getRepository(Order).create({
            orderNumber,
            status: 'pending',
            customerName: parsed.customer.name,
            customerPhone: parsed.customer.phone,
            customerEmail: parsed.customer.email ?? '',
            deliveryAddress: {
              address: parsed.delivery.address,
              comment: parsed.delivery.comment ?? null,
            },
            deliveryMethod: parsed.delivery.method,
            subtotalRub,
            shippingRub,
            totalRub,
            paymentProvider: provider.name,
            idempotencyKey,
            statusHistory: [],
          }),
        )
        const itemRepo = em.getRepository(OrderItem)
        await itemRepo.save(
          productIds.map((id) => {
            const p = productById.get(id)!
            return itemRepo.create({
              orderId: created.id,
              productId: p.id,
              productSnapshot: { name: p.name, sku: p.sku, priceRub: p.priceRub },
              quantity: qtyByProduct.get(id)!,
              unitPriceRub: p.priceRub,
            })
          }),
        )
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
