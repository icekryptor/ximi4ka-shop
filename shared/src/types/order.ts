import type { DeliveryDestination, ShippingPackage } from './shipping.js'
import type { OrderNotificationDto } from './notifications.js'
import type { CdekShipmentDto } from './cdek.js'

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'failed' | 'cancelled'

// Payment provider actually wired to the order. `manual` — no online payment:
// the order stays pending and a manager contacts the customer. `tbank` —
// Т-Касса (Т-Банк, ex-Tinkoff Kassa) internet acquiring.
export type PaymentProvider = 'manual' | 'tbank'

export type DeliveryMethod = 'cdek_pvz' | 'cdek_courier'

export interface OrderItemSnapshot {
  name: string
  sku: string | null
  priceRub: number
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  productSnapshot: OrderItemSnapshot
  quantity: number
  unitPriceRub: number
  /** Сумма строки с оптовой скидкой; null у старых заказов (тогда unitPriceRub × quantity). */
  lineTotalRub: number | null
  /** Подарок к заказу: строка за 0 ₽, в чек оплаты не входит. */
  isGift?: boolean
}

export interface DeliveryAddress {
  address: string
  comment: string | null
  // Из виджета СДЭК. У заказов до интеграции этих полей нет.
  cityCode?: number | null
  deliveryPointCode?: string | null
  postalCode?: string | null
  // Расчёт доставки на момент заказа. source: 'fallback' — калькулятор СДЭК
  // не ответил, взята фиксированная ставка: такой заказ стоит проверить.
  quote?: {
    tariffCode: number
    cdekPriceRub: number | null
    periodMin: number | null
    periodMax: number | null
    source: 'cdek' | 'fallback'
  } | null
  // Места отправления на момент заказа (packCart) — по ним создаётся заказ в
  // СДЭК. У заказов до этапа 4 поля нет.
  packages?: ShippingPackage[]
}

// One entry per status transition — appended by the checkout flow, the
// payment webhook, the reconciliation job, and manual admin actions.
export interface OrderStatusHistoryEntry {
  from: OrderStatus | null
  to: OrderStatus
  at: string
  by: 'tbank' | 'admin' | 'reconcile'
  comment?: string
}

// --- атрибуция заказа ---

/**
 * Одно касание: откуда посетитель пришёл на сайт. Всё берётся из адресной
 * строки и referrer браузера и приходит от клиента, поэтому это подсказка для
 * анализа рекламы, а не доказательство: подделать может кто угодно.
 */
export interface AttributionTouch {
  /** Когда зафиксировано (ISO). */
  at: string
  /** Страница входа: путь без параметров. */
  landing: string
  /** Откуда пришёл: адрес без параметров; нет — прямой заход. */
  referrer?: string
  /** Метка клика Яндекс Директа. */
  yclid?: string
  /** Метка перехода из органической выдачи Яндекса. */
  ysclid?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

/** Первое касание (канал) и последнее рекламное (метки для конверсий). */
export interface OrderAttribution {
  first?: AttributionTouch
  last?: AttributionTouch
}

export interface OrderDto {
  id: string
  orderNumber: string
  status: OrderStatus
  customerName: string
  customerPhone: string
  customerEmail: string
  customerTelegram: string | null
  deliveryAddress: DeliveryAddress
  deliveryMethod: string
  /** Товары по обычным ценам. */
  subtotalRub: number
  /** Оптовая скидка (наборы, проценты на реагенты, цены партий); totalRub = subtotalRub − discountRub + shippingRub. */
  discountRub: number
  shippingRub: number
  totalRub: number
  paymentProvider: PaymentProvider
  paymentIntentId: string | null
  paymentUrl: string | null
  statusHistory: OrderStatusHistoryEntry[]
  items: OrderItem[]
  /** Откуда пришёл покупатель; null — заказ оформлен до появления атрибуции или без неё. */
  attribution?: OrderAttribution | null
  /** Адрес и браузер покупателя при оформлении (только для админки). */
  clientIp?: string | null
  clientUserAgent?: string | null
  notifications?: OrderNotificationDto[]
  // Заказ в СДЭК (только в деталях админки).
  cdekShipment?: CdekShipmentDto | null
  cdekOrdersEnabled?: boolean
  // Флаг включён, но обработчик очереди не запущен (сломанная настройка) —
  // причина для админки; null — обработчик в порядке или флаг выключен.
  cdekWorkerProblem?: string | null
  createdAt: string
  paidAt: string | null
  erpSyncedAt: string | null
}

// --- checkout API contract ---

export interface CheckoutRequest {
  items: Array<{ productId: string; quantity: number }>
  /** Подарок на выбор (реактив из списка); сервер проверяет порог, наличие и список. */
  giftProductId?: string
  customer: { name: string; phone: string; email?: string; telegram?: string }
  // Куда везём — из виджета СДЭК (см. DeliveryDestination) + комментарий.
  delivery: DeliveryDestination & { comment?: string }
  /** Ловушка для ботов: скрытое поле формы. Люди его не видят, поэтому живой клиент не шлёт его вовсе. */
  hp_check?: string
  /** Откуда пришёл покупатель (метки из URL и referrer); необязательно, кривое значение сервер отбрасывает. */
  attribution?: OrderAttribution
}

export interface CheckoutResponse {
  orderNumber: string
  paymentUrl: string | null
  /** Секрет заказа для ссылки на его страницу: `/order/<номер>?t=<токен>`. */
  publicToken: string
}

/** Трек СДЭК на странице заказа; pending — заказ ещё регистрируется в СДЭК. */
export interface PublicOrderShipment {
  state: 'pending' | 'created' | 'failed'
  trackingNumber: string | null
  trackingUrl: string | null
}

// Public status endpoint payload — deliberately PII-free. `paymentProvider`
// is included so the status page knows whether to poll for a payment result
// (tbank) or show the "менеджер свяжется" manual-order copy.
export interface PublicOrderStatus {
  orderNumber: string
  status: OrderStatus
  totalRub: number
  paymentProvider: PaymentProvider
  createdAt: string
  paidAt: string | null
  /**
   * Только при верном секрете заказа (?t=). null — заказ не уходит в СДЭК
   * (флаг выключен, не оплачен или доставка не СДЭК).
   */
  shipment?: PublicOrderShipment | null
}
