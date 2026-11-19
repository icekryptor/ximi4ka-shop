import type { Order } from '../../../entities/Order.js'
import { MAX_EMAIL_LENGTH, cut, normalizePhone, spreadDiscount, type ItemTax } from '../receipt.js'

// Корзина для POST /api/merchant/v1/orders. Правила те же, что у чека Т-Кассы
// (receipt.ts, оттуда раскидка промокода, обрезка названия и нормализация телефона):
// подарок и обнулённая промокодом позиция пропускаются, цена партии, не делящаяся на
// целые копейки, режется на две позиции, доставка — отдельная позиция-услуга, сумма
// позиций обязана равняться итогу заказа. Суммы — строки в рублях с двумя знаками:
// цена длиннее даёт ORDER_CART_DATA_ERROR. Коды полей чека — pay.yandex.ru/docs/ru/custom/fns.

// Ставка из TBANK_RECEIPT_TAX → код Яндекса (тег 1199). С 2026 года код 1 (20%)
// не используется: 22% — код 11, 22/122 — код 12.
export const YANDEX_TAX_CODES: Record<ItemTax, number> = {
  none: 6,
  vat0: 5,
  vat5: 8,
  vat7: 7,
  vat10: 2,
  vat22: 11,
  vat105: 10,
  vat107: 9,
  vat110: 4,
  vat122: 12,
}

// 4 — «полная оплата в момент передачи», как full_payment у Т-Кассы (тег 1214).
const PAYMENT_METHOD_FULL_PAYMENT = 4
// 1 — товар, 4 — услуга (тег 1212); 0 — штуки или единицы (тег 2108).
const SUBJECT_COMMODITY = 1
const SUBJECT_SERVICE = 4
const MEASURE_PIECES = 0

export interface YandexCartItem {
  productId: string
  title: string
  quantity: { count: string }
  unitPrice: string
  total: string
  receipt: { tax: number; measure: number; paymentMethodType: number; paymentSubjectType: number }
}

export interface YandexCart {
  items: YandexCartItem[]
  total: { amount: string }
}

interface Line {
  id: string
  title: string
  priceKop: number
  quantity: number
  amountKop: number
  subject: number
}

// Целочисленно, без плавающей точки: 1490 → "14.90".
function rub(kop: number): string {
  const whole = Math.floor(kop / 100)
  return `${whole}.${String(kop - whole * 100).padStart(2, '0')}`
}

function fiscalContactOf(order: Order): string {
  const email = order.customerEmail?.trim()
  if (email && email.length <= MAX_EMAIL_LENGTH) return email
  const phone = normalizePhone(order.customerPhone ?? '')
  if (!phone)
    throw new Error(`yandex cart: no usable contact (email/phone) for ${order.orderNumber}`)
  return phone
}

export function buildYandexCart(
  order: Order,
  tax: ItemTax,
): { cart: YandexCart; fiscalContact: string } {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error(`yandex cart: у заказа ${order.orderNumber} нет загруженных items`)
  }

  const paid = order.items.filter((line) => !line.isGift)
  const lineRub = paid.map((line) => line.lineTotalRub ?? line.unitPriceRub * line.quantity)
  const afterPromoRub = spreadDiscount(lineRub, order.promoDiscountRub ?? 0)

  // productId у Яндекса обязан быть уникальным: вторая позиция того же товара — -2, -3…
  const used = new Set<string>()
  const uniqueId = (base: string): string => {
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
    used.add(id)
    return id
  }

  const lines: Line[] = paid.flatMap((line, index): Line[] => {
    const totalKop = afterPromoRub[index] * 100
    if (totalKop <= 0) return []
    const title = cut(line.productSnapshot.name)
    const base = String(line.productId)
    const price = Math.floor(totalKop / line.quantity)
    if (price * line.quantity === totalKop) {
      return [
        {
          id: uniqueId(base),
          title,
          priceKop: price,
          quantity: line.quantity,
          amountKop: totalKop,
          subject: SUBJECT_COMMODITY,
        },
      ]
    }
    // Как в receipt.ts: N−1 штук по округлённой цене и одна штука на остаток.
    const head = price * (line.quantity - 1)
    return [
      {
        id: uniqueId(base),
        title,
        priceKop: price,
        quantity: line.quantity - 1,
        amountKop: head,
        subject: SUBJECT_COMMODITY,
      },
      {
        id: uniqueId(base),
        title,
        priceKop: totalKop - head,
        quantity: 1,
        amountKop: totalKop - head,
        subject: SUBJECT_COMMODITY,
      },
    ]
  })

  if (order.shippingRub > 0) {
    const shippingKop = order.shippingRub * 100
    lines.push({
      id: uniqueId('delivery'),
      title: 'Доставка',
      priceKop: shippingKop,
      quantity: 1,
      amountKop: shippingKop,
      subject: SUBJECT_SERVICE,
    })
  }

  const sum = lines.reduce((total, l) => total + l.amountKop, 0)
  if (sum !== order.totalRub * 100) {
    throw new Error(
      `yandex cart: sum of lines ${sum} != order total ${order.totalRub * 100} (${order.orderNumber})`,
    )
  }

  const items: YandexCartItem[] = lines.map((l) => ({
    productId: l.id,
    title: l.title,
    quantity: { count: String(l.quantity) },
    unitPrice: rub(l.priceKop),
    total: rub(l.amountKop),
    receipt: {
      tax: YANDEX_TAX_CODES[tax],
      measure: MEASURE_PIECES,
      paymentMethodType: PAYMENT_METHOD_FULL_PAYMENT,
      paymentSubjectType: l.subject,
    },
  }))
  return {
    cart: { items, total: { amount: rub(order.totalRub * 100) } },
    fiscalContact: fiscalContactOf(order),
  }
}
