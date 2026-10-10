import type { EntityManager, FindOptionsWhere } from 'typeorm'
import type { OrderStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { normalizeEmail } from '../account/emailCodes.js'
import { enqueueOrderEvent, writeOrderStatusEvent } from '../notifications/outbox.js'
import { nextOrderNumber } from '../orderNumber.js'
import { isUniqueViolation } from '../pgErrors.js'
import { packCart } from '../shipping/pack.js'
import { parseYcpOptionId } from './deliveryOptions.js'
import { lookupPickupPoint } from './pickupPoints.js'
import { normalizeYcpId, ycpGoodsTotal, ycpPackLines, type YcpLine } from './pricing.js'

export interface ActualInventoryItem {
  id: string
  regular_price: number
  final_price: number
  warehouses: { id: string; available_quantity: number }[]
}

// Расхождение цены или нехватка остатка — 409 с actual_inventory (спека YCP,
// POST /checkout п. 2). Сверяем целые рубли без допуска: Яндекс присылает ровно
// то, что отдал basket/check, а тот считает тем же loadYcpLines.
export function inventoryConflict(
  items: readonly { id: string; regular_price: number; final_price: number }[],
  lines: ReadonlyMap<string, YcpLine>,
  warehouseId: string,
): { items: ActualInventoryItem[] } | null {
  let changed = false
  const actual = new Map<string, ActualInventoryItem>()
  for (const item of items) {
    const key = normalizeYcpId(item.id)
    const line = lines.get(key)
    if (!line) {
      changed = true
      actual.set(key, {
        id: item.id,
        regular_price: item.regular_price,
        final_price: item.final_price,
        warehouses: [{ id: warehouseId, available_quantity: 0 }],
      })
      continue
    }
    if (
      line.regularPriceRub !== item.regular_price ||
      line.finalPriceRub !== item.final_price ||
      line.quantity > line.availableQuantity
    ) {
      changed = true
    }
    actual.set(key, {
      id: line.product.id,
      regular_price: line.regularPriceRub,
      final_price: line.finalPriceRub,
      warehouses: [{ id: warehouseId, available_quantity: line.availableQuantity }],
    })
  }
  return changed ? { items: [...actual.values()] } : null
}

export interface YcpOrderAddress {
  locality?: string
  address?: string
  apartment?: string
  entrance?: string
  floor?: string
  intercom?: string
  pickup_point_id?: string
}

export interface YcpCheckoutInput {
  session_id: string
  customer: { full_name: string; phone: string; email: string }
  delivery: {
    delivery_method: 'courier' | 'pickup_point'
    price: number
    address: YcpOrderAddress
    ycp_delivery_option_id?: string
    delivery_notes?: string
  }
}

function joinParts(parts: (string | null | undefined)[], separator: string): string | null {
  const joined = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(separator)
  return joined === '' ? null : joined
}

// Заказ из Яндекса: та же структура, что у заказа с сайта, но цены — те, что
// спишет Яндекс (final_price × количество), доставка — delivery.price, подарка
// нет, оплата — у Яндекса (paymentProvider ycp, в Т-Кассу не идёт).
export async function createYcpOrder(
  input: YcpCheckoutInput,
  lines: YcpLine[],
): Promise<{ created: Order } | { existing: Order }> {
  const d = input.delivery
  const a = d.address
  const isPvz = d.delivery_method === 'pickup_point'
  const option = parseYcpOptionId(d.ycp_delivery_option_id)
  const found = isPvz && a.pickup_point_id ? lookupPickupPoint(a.pickup_point_id) : null
  const point = typeof found === 'object' ? found : null
  const subtotalRub = lines.reduce((sum, l) => sum + l.regularPriceRub * l.quantity, 0)
  const goodsRub = ycpGoodsTotal(lines)
  const shippingRub = Math.round(d.price)
  // Тем же правилом, что и публичный чекаут: владелец подтверждённого email.
  // По телефону не связываем — телефон не подтверждён.
  const owner = await AppDataSource.getRepository(Customer).findOneBy({
    email: normalizeEmail(input.customer.email),
  })
  try {
    const created = await AppDataSource.transaction(async (em) => {
      const orderNumber = await nextOrderNumber(em)
      const repo = em.getRepository(Order)
      const order = await repo.save(
        repo.create({
          orderNumber,
          status: 'pending',
          source: 'ycp',
          externalSessionId: input.session_id,
          customerId: owner?.id ?? null,
          placedSignedIn: false,
          customerName: input.customer.full_name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          customerTelegram: null,
          deliveryAddress: {
            address: isPvz
              ? (point?.point.address ??
                joinParts([a.locality, a.address], ', ') ??
                `ПВЗ СДЭК ${a.pickup_point_id}`)
              : (joinParts(
                  [a.locality, a.address, a.apartment ? `кв. ${a.apartment}` : null],
                  ', ',
                ) ?? ''),
            comment: joinParts(
              [
                d.delivery_notes,
                a.entrance ? `подъезд ${a.entrance}` : null,
                a.floor ? `этаж ${a.floor}` : null,
                a.intercom ? `домофон ${a.intercom}` : null,
              ],
              '; ',
            ),
            cityCode: point?.cityCode ?? option?.cityCode ?? null,
            deliveryPointCode: isPvz ? (a.pickup_point_id ?? null) : null,
            postalCode: null,
            // Расчёт делал Яндекс по нашему delivery/options; тариф для СДЭК
            // воркер возьмёт из окружения по способу доставки.
            quote: null,
            packages: packCart(ycpPackLines(lines)),
          },
          deliveryMethod: isPvz ? 'cdek_pvz' : 'cdek_courier',
          subtotalRub,
          discountRub: subtotalRub - goodsRub,
          shippingRub,
          totalRub: goodsRub + shippingRub,
          paymentProvider: 'ycp',
          idempotencyKey: null,
          statusHistory: [],
        }),
      )
      const itemRepo = em.getRepository(OrderItem)
      order.items = await itemRepo.save(
        lines.map((l) =>
          itemRepo.create({
            orderId: order.id,
            productId: l.product.id,
            productSnapshot: {
              name: l.product.name,
              sku: l.product.sku,
              priceRub: l.product.priceRub,
            },
            quantity: l.quantity,
            unitPriceRub: l.finalPriceRub,
            lineTotalRub: l.finalPriceRub * l.quantity,
          }),
        ),
      )
      await enqueueOrderEvent(em, order.id, 'created')
      return order
    })
    return { created }
  } catch (err) {
    // Два одновременных /checkout одной сессии: проигравший гонку за
    // уникальный индекс отвечает 409, как на обычный повтор.
    if (!isUniqueViolation(err)) throw err
    const existing = await AppDataSource.getRepository(Order).findOneBy({
      externalSessionId: input.session_id,
    })
    if (!existing) throw err
    return { existing }
  }
}

// Заказ под блокировкой строки (SELECT … FOR UPDATE): два одновременных вызова
// Яндекса для одного заказа выполняются по очереди, и второй видит уже
// изменённый статус — событие и отправка в СДЭК не двоятся.
export async function withLockedOrder<T>(
  where: FindOptionsWhere<Order>,
  fn: (em: EntityManager, order: Order | null) => Promise<T>,
): Promise<T> {
  return AppDataSource.transaction(async (em) => {
    const order = await em
      .getRepository(Order)
      .findOne({ where, lock: { mode: 'pessimistic_write' } })
    return fn(em, order)
  })
}

export function appendYcpHistory(order: Order, to: OrderStatus, now: Date, comment: string): void {
  order.statusHistory = [
    ...(order.statusHistory ?? []),
    { from: order.status, to, at: now.toISOString(), by: 'ycp', comment },
  ]
  order.status = to
}

export type YcpPlacedOutcome = 'paid' | 'already_paid' | 'on_delivery' | 'cancelled' | 'not_found'

export interface YcpPlacedInput {
  sessionId: string
  orderId: string
  paymentMethod: 'online' | 'on_delivery'
  onlinePaymentMethod: string | null
  acquiringId: string | null
}

// Яндекс сообщил, что заказ оформлен (спека YCP, POST /checkout/placed).
// online — деньги уже у Яндекса: paid тем же путём, что вебхук Т-Кассы
// (событие, карточка в чат, очередь СДЭК). on_delivery не поддерживаем:
// заказ остаётся неоплаченным, менеджеру — сигнал.
export async function markYcpOrderPlaced(
  input: YcpPlacedInput,
  now: Date = new Date(),
): Promise<YcpPlacedOutcome> {
  return withLockedOrder({ externalSessionId: input.sessionId }, async (em, order) => {
    if (!order) return 'not_found'
    if (order.status === 'cancelled') return 'cancelled'
    if (order.status === 'paid' || order.status === 'shipped') return 'already_paid'
    await em.update(Order, order.id, { externalOrderId: input.orderId })
    if (input.paymentMethod === 'on_delivery') {
      await enqueueOrderEvent(em, order.id, 'ycp:on_delivery')
      return 'on_delivery'
    }
    const previous = order.status
    order.paidAt = order.paidAt ?? now
    order.paymentIntentId = input.acquiringId ?? order.paymentIntentId
    appendYcpHistory(
      order,
      'paid',
      now,
      input.onlinePaymentMethod
        ? `Оплата в Яндексе: ${input.onlinePaymentMethod}`
        : 'Оплата в Яндексе',
    )
    await writeOrderStatusEvent(em, order, previous)
    return 'paid'
  })
}
