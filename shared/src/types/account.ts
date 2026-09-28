import type { DeliveryMethod, OrderStatus, PaymentProvider, PublicOrderShipment } from './order.js'

/** Какие способы входа включены на сервере (GET /api/account/auth/config). */
export interface AuthConfig {
  email: boolean
  telegram: boolean
  telegramBot: string | null
}

/** Доставка из последнего заказа — для автозаполнения чекаута. */
export interface LastDelivery {
  method: DeliveryMethod
  cityCode: number | null
  /** Первая часть адреса заказа («Москва»). */
  cityName: string | null
  deliveryPointCode: string | null
  postalCode: string | null
  /** Для курьера — адрес без города («ул. Ленина, 1, кв. 5»). */
  courierStreet: string | null
}

export interface CustomerProfile {
  id: string
  email: string | null
  telegramUsername: string | null
  hasTelegram: boolean
  name: string | null
  phone: string | null
  lastDelivery: LastDelivery | null
}

export interface AccountOrderSummary {
  orderNumber: string
  /** Секрет заказа: ссылка на страницу заказа `/order/<номер>#t=<токен>`. */
  publicToken: string
  createdAt: string
  status: OrderStatus
  paymentProvider: PaymentProvider
  totalRub: number
  /** Сколько штук всего в заказе. */
  itemCount: number
  /** Первые три позиции. */
  items: Array<{ name: string; quantity: number; imageUrl: string | null }>
  shipment: PublicOrderShipment | null
}

export interface AccountOrdersPage {
  orders: AccountOrderSummary[]
  nextCursor: string | null
}

export interface TelegramLoginStart {
  deepLink: string
}

export interface TelegramLoginPoll {
  // conflict: Telegram уже привязан к другому аккаунту.
  status: 'pending' | 'ok' | 'expired' | 'conflict'
}
