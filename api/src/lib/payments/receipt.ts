import type { Order } from '../../entities/Order.js'

// Чек по 54-ФЗ для Init Т-Кассы (поле Receipt). Терминал с подключённой
// онлайн-кассой отклоняет Init без него: ErrorCode=309, Details
// «request.validate.expected.receipt». Формат — developer.tbank.ru →
// «Инициировать платеж»: суммы в копейках, Amount = Price × Quantity,
// сумма позиций = Amount платежа. Receipt вложенный, в Token не входит.

export const TAXATIONS = ['osn', 'usn_income', 'usn_income_outcome', 'esn', 'patent'] as const
export const ITEM_TAXES = [
  'none',
  'vat0',
  'vat5',
  'vat7',
  'vat10',
  'vat22',
  'vat105',
  'vat107',
  'vat110',
  'vat122',
] as const

export type Taxation = (typeof TAXATIONS)[number]
export type ItemTax = (typeof ITEM_TAXES)[number]

export interface ReceiptConfig {
  taxation: Taxation
  tax: ItemTax
}

export interface ReceiptItem {
  Name: string
  Price: number
  Quantity: number
  Amount: number
  Tax: ItemTax
  PaymentMethod: 'full_payment'
  PaymentObject: 'commodity' | 'service'
}

export interface TBankReceipt {
  Email?: string
  Phone?: string
  Taxation: Taxation
  Items: ReceiptItem[]
}

const MAX_NAME_LENGTH = 128

const DEFAULT_CONFIG: ReceiptConfig = { taxation: 'usn_income', tax: 'none' }

function pick<T extends string>(
  list: readonly T[],
  raw: string | undefined,
  fallback: T,
  envName: string,
): T {
  const value = raw?.trim().toLowerCase()
  if (!value) return fallback
  if ((list as readonly string[]).includes(value)) return value as T
  // Неверная СНО или ставка — это неверный фискальный чек. Лучше не слать Init
  // (заказ уйдёт на ручное оформление), чем молча пробить чек по другой системе.
  throw new Error(`receipt: ${envName}="${value}" не из ${list.join('|')}`)
}

// СНО и НДС — решение владельца (УСН «доходы», без НДС); меняются без выкатки:
// TBANK_TAXATION и TBANK_RECEIPT_TAX в deploy/app.env.
export function parseReceiptConfig(env: NodeJS.ProcessEnv = process.env): ReceiptConfig {
  return {
    taxation: pick(TAXATIONS, env.TBANK_TAXATION, DEFAULT_CONFIG.taxation, 'TBANK_TAXATION'),
    tax: pick(ITEM_TAXES, env.TBANK_RECEIPT_TAX, DEFAULT_CONFIG.tax, 'TBANK_RECEIPT_TAX'),
  }
}

// Телефон покупателя вводится как угодно; для чека нужен вид +7XXXXXXXXXX.
// Принимаем только российский номер ровно из 11 цифр: «доб. 12» или два номера
// в одном поле дали бы в кассу чужой номер, а не отказ.
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  return /^7\d{10}$/.test(digits) ? `+${digits}` : null
}

// Банк принимает Email чека не длиннее 64 символов.
const MAX_EMAIL_LENGTH = 64

// По символам, а не по кодовым единицам UTF-16: эмодзи не режется пополам.
function cut(name: string): string {
  return Array.from(name).slice(0, MAX_NAME_LENGTH).join('')
}

export function buildReceipt(order: Order, config: ReceiptConfig): TBankReceipt {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error(`receipt: у заказа ${order.orderNumber} нет загруженных items`)
  }

  const items: ReceiptItem[] = order.items.flatMap((line) => {
    const name = cut(line.productSnapshot.name)
    const totalKop = (line.lineTotalRub ?? line.unitPriceRub * line.quantity) * 100
    const base = { Name: name, Tax: config.tax, PaymentMethod: 'full_payment' as const }
    const object = 'commodity' as const
    const price = Math.floor(totalKop / line.quantity)
    if (price * line.quantity === totalKop) {
      return [
        { ...base, Price: price, Quantity: line.quantity, Amount: totalKop, PaymentObject: object },
      ]
    }
    // Цена партии не делится на целые копейки за штуку (313 ₽ за 21 пробирку).
    // Две строки: N−1 штук по округлённой цене и одна штука на остаток —
    // количество в чеке верное, а Price × Quantity = Amount в каждой строке.
    const head = price * (line.quantity - 1)
    return [
      { ...base, Price: price, Quantity: line.quantity - 1, Amount: head, PaymentObject: object },
      {
        ...base,
        Price: totalKop - head,
        Quantity: 1,
        Amount: totalKop - head,
        PaymentObject: object,
      },
    ]
  })

  if (order.shippingRub > 0) {
    const shippingKop = order.shippingRub * 100
    items.push({
      Name: 'Доставка',
      Price: shippingKop,
      Quantity: 1,
      Amount: shippingKop,
      Tax: config.tax,
      PaymentMethod: 'full_payment',
      PaymentObject: 'service',
    })
  }

  const sum = items.reduce((total, i) => total + i.Amount, 0)
  if (sum !== order.totalRub * 100) {
    throw new Error(
      `receipt: sum of lines ${sum} != order total ${order.totalRub * 100} (${order.orderNumber})`,
    )
  }

  const email = order.customerEmail?.trim()
  if (email && email.length <= MAX_EMAIL_LENGTH) {
    return { Email: email, Taxation: config.taxation, Items: items }
  }

  const phone = normalizePhone(order.customerPhone ?? '')
  if (!phone) {
    throw new Error(`receipt: no usable contact (email/phone) for ${order.orderNumber}`)
  }
  return { Phone: phone, Taxation: config.taxation, Items: items }
}
