import type { DeliveryAddress, ShippingPackage } from '@ximi4ka-shop/shared'
import { deliveryConfigFromEnv } from '../shipping/quote.js'

// Заказ в СДЭК после оплаты (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md).
// Формат снят с заказа Тильды 10325990882: ИМ, предоплата, сдача в пункт
// отгрузки, отправитель — ИП, у мест комментарий «приложена опись».

export interface CdekOrderConfig {
  shipmentPoint: string
  sender: { company: string; name: string; phone: string; email: string | null }
  sellerName: string
  tariffPvz: number
  tariffCourier: number
}

// Не хватает настройки — обработчик не запускается, записи ждут.
export class CdekConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CdekConfigError'
  }
}

// Данные заказа, которые СДЭК не примет, — повтор тех же данных не поможет.
export class CdekDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CdekDataError'
  }
}

export function cdekOrdersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CDEK_ORDERS_ENABLED === 'true'
}

const REQUIRED_ENV = [
  'CDEK_SHIPMENT_POINT',
  'CDEK_SENDER_COMPANY',
  'CDEK_SENDER_NAME',
  'CDEK_SENDER_PHONE',
] as const

export function cdekOrderConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CdekOrderConfig {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim())
  if (missing.length > 0) throw new CdekConfigError(`Не заданы ${missing.join(', ')}`)
  const { tariffPvz, tariffCourier } = deliveryConfigFromEnv(env)
  const company = env.CDEK_SENDER_COMPANY!.trim()
  return {
    shipmentPoint: env.CDEK_SHIPMENT_POINT!.trim(),
    sender: {
      company,
      name: env.CDEK_SENDER_NAME!.trim(),
      phone: normalizeRuPhone(env.CDEK_SENDER_PHONE!),
      email: env.CDEK_SENDER_EMAIL?.trim() || null,
    },
    sellerName: env.CDEK_SELLER_NAME?.trim() || company,
    tariffPvz,
    tariffCourier,
  }
}

// СДЭК ждёт +7XXXXXXXXXX, а чекаут хранит телефон как ввёл покупатель:
// «8 (999) 111-22-33», «+7 999 111 22 33», «9991112233». Не похожее на
// российский номер отдаём как есть — СДЭК вернёт ошибку, её видно в админке.
export function normalizeRuPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return `+7${digits.slice(1)}`
  }
  if (digits.length === 10 && digits[0] === '9') return `+7${digits}`
  return raw.trim()
}

// Позиция, как её видит СДЭК: название, артикул и цена — из снимка заказа
// (что купили), вес за штуку — из карточки товара.
export interface CdekOrderLine {
  productId: string
  name: string
  sku: string | null
  unitPriceRub: number
  unitWeightG: number
}

export interface CdekOrderSource {
  orderNumber: string
  customerName: string
  customerPhone: string
  customerEmail: string
  deliveryMethod: string
  deliveryAddress: DeliveryAddress
}

export interface CdekOrderItem {
  name: string
  ware_key: string
  payment: { value: number }
  cost: number
  weight: number
  amount: number
}

export interface CdekOrderPackage {
  number: string
  weight: number
  length: number
  width: number
  height: number
  comment: string
  items: CdekOrderItem[]
}

interface CdekContact {
  name: string
  email?: string
  phones: { number: string }[]
}

export interface CdekOrderRequest {
  type: 1
  number: string
  tariff_code: number
  shipment_point: string
  delivery_point?: string
  to_location?: { code?: number; postal_code?: string; address: string }
  delivery_recipient_cost: { value: 0 }
  sender: CdekContact & { company: string }
  seller: { name: string }
  recipient: CdekContact
  packages: CdekOrderPackage[]
}

const PACKAGE_COMMENT = 'приложена опись'
const WARE_KEY_MAX = 40

function wareKey(line: CdekOrderLine): string {
  return (line.sku?.trim() || line.productId).slice(0, WARE_KEY_MAX)
}

function item(
  name: string,
  key: string,
  cost: number,
  weightG: number,
  amount: number,
): CdekOrderItem {
  return {
    name,
    ware_key: key,
    payment: { value: 0 },
    cost,
    weight: Math.max(1, Math.round(weightG)),
    amount,
  }
}

// Вес места — не меньше суммы весов позиций: места сохранены на чекауте, а
// веса товаров с тех пор могли поменяться.
function place(
  orderNumber: string,
  index: number,
  pkg: ShippingPackage,
  items: CdekOrderItem[],
): CdekOrderPackage {
  const itemsWeight = items.reduce((sum, it) => sum + it.weight * it.amount, 0)
  return {
    number: `${orderNumber}#${index}`,
    weight: Math.max(pkg.weightG, itemsWeight),
    length: pkg.lengthCm,
    width: pkg.widthCm,
    height: pkg.heightCm,
    comment: PACKAGE_COMMENT,
    items,
  }
}

function destination(
  order: CdekOrderSource,
): Pick<CdekOrderRequest, 'delivery_point' | 'to_location'> {
  const address = order.deliveryAddress
  if (order.deliveryMethod === 'cdek_pvz') {
    if (!address.deliveryPointCode) throw new CdekDataError('Не указан код ПВЗ')
    return { delivery_point: address.deliveryPointCode }
  }
  if (order.deliveryMethod === 'cdek_courier') {
    return {
      to_location: {
        ...(address.cityCode ? { code: address.cityCode } : {}),
        ...(address.postalCode ? { postal_code: address.postalCode } : {}),
        address: address.address,
      },
    }
  }
  throw new CdekDataError(`Доставка «${order.deliveryMethod}» — не СДЭК`)
}

export function buildCdekOrder(
  order: CdekOrderSource,
  packages: ShippingPackage[],
  lines: CdekOrderLine[],
  config: CdekOrderConfig,
): CdekOrderRequest {
  if (packages.length === 0) throw new CdekDataError('В заказе нет мест для отправки')
  const lineById = new Map(lines.map((l) => [l.productId, l]))
  const lineFor = (productId: string): CdekOrderLine => {
    const found = lineById.get(productId)
    if (!found) throw new CdekDataError(`В заказе нет позиции для товара ${productId}`)
    return found
  }

  // packCart кладёт позицию набора только в первое его место, остальные места
  // набора идут следом пустыми. СДЭК пустое место не принимает (400
  // «packages[1].items is empty»), поэтому собираем места набора в группу и
  // даём каждому свою позицию.
  const groups: ShippingPackage[][] = []
  for (const pkg of packages) {
    if (pkg.items.length > 0) groups.push([pkg])
    else if (groups.length > 0) groups[groups.length - 1].push(pkg)
    else throw new CdekDataError('Первое место заказа без позиций')
  }

  const cdekPackages: CdekOrderPackage[] = []
  for (const group of groups) {
    const [first] = group
    if (group.length === 1) {
      const items = first.items.map(({ productId, quantity }) => {
        const l = lineFor(productId)
        return item(l.name, wareKey(l), l.unitPriceRub, l.unitWeightG, quantity)
      })
      cdekPackages.push(place(order.orderNumber, cdekPackages.length + 1, first, items))
      continue
    }
    if (first.items.length !== 1 || first.items[0].quantity !== 1) {
      throw new CdekDataError('Непонятная разбивка набора по местам')
    }
    // Цена набора делится между местами (остаток — в первое), чтобы страховка
    // по сумме позиций осталась равна цене.
    const l = lineFor(first.items[0].productId)
    const n = group.length
    const share = Math.floor(l.unitPriceRub / n)
    group.forEach((pkg, i) => {
      const cost = i === 0 ? l.unitPriceRub - share * (n - 1) : share
      const key = i === 0 ? wareKey(l) : `${wareKey(l)}-${i + 1}`
      const it = item(`${l.name} (место ${i + 1} из ${n})`, key, cost, pkg.weightG, 1)
      cdekPackages.push(place(order.orderNumber, cdekPackages.length + 1, pkg, [it]))
    })
  }

  const email = order.customerEmail.trim()
  return {
    type: 1,
    number: order.orderNumber,
    tariff_code:
      order.deliveryAddress.quote?.tariffCode ??
      (order.deliveryMethod === 'cdek_pvz' ? config.tariffPvz : config.tariffCourier),
    shipment_point: config.shipmentPoint,
    ...destination(order),
    delivery_recipient_cost: { value: 0 },
    sender: {
      company: config.sender.company,
      name: config.sender.name,
      ...(config.sender.email ? { email: config.sender.email } : {}),
      phones: [{ number: config.sender.phone }],
    },
    seller: { name: config.sellerName },
    recipient: {
      name: order.customerName.trim(),
      ...(email ? { email } : {}),
      phones: [{ number: normalizeRuPhone(order.customerPhone) }],
    },
    packages: cdekPackages,
  }
}
