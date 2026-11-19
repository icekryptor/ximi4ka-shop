import type { CoinTransactionKind } from './coins.js'
import type {
  DeliveryMethod,
  OrderDeliveryMethod,
  OrderStatus,
  PaymentProvider,
  PublicOrderShipment,
} from './order.js'

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
  /** Баланс химикоинов (1 химикоин = 1 ₽). */
  coinBalance: number
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
  /** Все позиции заказа. */
  items: Array<{
    name: string
    quantity: number
    unitPriceRub: number
    /** Сумма строки (с учётом оптовой скидки). */
    lineTotalRub: number
    /** Подарок к заказу: строка за 0 ₽. */
    isGift?: boolean
    imageUrl: string | null
  }>
  subtotalRub: number
  discountRub: number
  /** Промокод заказа и его скидка (0 — без промокода). */
  promoCode: string | null
  promoDiscountRub: number
  shippingRub: number
  /** Надбавка за оплату картой банка ЕАЭС (CloudPayments), уже в totalRub; 0 — без неё. */
  paymentSurchargeRub: number
  deliveryMethod: OrderDeliveryMethod
  /** Адрес доставки одной строкой: «<город>, <ПВЗ или улица>». */
  deliveryAddress: string
  shipment: PublicOrderShipment | null
  /** Сколько химикоинов обещано за заказ и начислены ли они уже. */
  cashbackPromisedCoins: number
  cashbackAccrued: boolean
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

/** Операция по балансу в кабинете: комментарий админа покупателю не показывается. */
export interface AccountCoinTransaction {
  id: string
  amount: number
  kind: CoinTransactionKind
  orderNumber: string | null
  comment: string | null
  createdAt: string
}

export interface AccountCoins {
  balance: number
  /** Кэшбек по оплаченным, но ещё не врученным заказам (paid/shipped). */
  pending: number
  /** Последние 50, новые сверху. */
  transactions: AccountCoinTransaction[]
}

// --- админка: покупатели ---

export interface AdminCustomerListItem {
  id: string
  email: string | null
  telegramUsername: string | null
  name: string | null
  coinBalance: number
  ordersCount: number
}

export interface AdminCustomersPage {
  items: AdminCustomerListItem[]
  total: number
}

export interface AdminCoinTransaction {
  id: string
  amount: number
  kind: CoinTransactionKind
  orderId: string | null
  orderNumber: string | null
  comment: string | null
  adminUserId: string | null
  createdAt: string
}

export interface AdminCustomerDetail {
  customer: {
    id: string
    email: string | null
    telegramUsername: string | null
    name: string | null
    phone: string | null
    createdAt: string
  }
  coinBalance: number
  transactions: AdminCoinTransaction[]
  orders: Array<{
    id: string
    orderNumber: string
    status: OrderStatus
    totalRub: number
    createdAt: string
    cashbackPromisedCoins: number
  }>
}
