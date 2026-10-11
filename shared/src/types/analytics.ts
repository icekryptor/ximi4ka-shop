// События собственной аналитики витрины (таблица analytics_events) и ответ
// админской статистики. События — те же цели, что уходят в Метрику
// (web/lib/metrika.ts); purchase не пишем: заказ и так есть в orders.
export const ANALYTICS_EVENT_TYPES = [
  'add_to_cart',
  'open_cart',
  'begin_checkout',
  'material_lead',
] as const

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number]

// Потолок периода статистики, дней (включая обе границы).
export const MAX_STATS_DAYS = 366

export interface StatsTotals {
  /** Все события из белого списка за период. */
  clicks: number
  /** Уникальные посетители с add_to_cart. */
  carts: number
  /** Заказы, созданные в периоде (без удалённых), все статусы. */
  orders: number
  /** Сумма заказов в статусах paid и shipped по дате оплаты. */
  revenueRub: number
  /** Новые сессии кабинета; вход по уже живой сессии не считается. */
  logins: number
  /** Новые аккаунты кабинета. */
  newUsers: number
}

export interface StatsDay {
  /** День по Москве, YYYY-MM-DD. */
  date: string
  /** Заказы, созданные в этот день. */
  orders: number
  /** Выручка по заказам, оплаченным в этот день. */
  revenueRub: number
}

export interface StatsResponse {
  from: string
  to: string
  totals: StatsTotals
  days: StatsDay[]
}
