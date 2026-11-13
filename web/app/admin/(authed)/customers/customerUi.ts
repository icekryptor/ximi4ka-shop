import type { OrderStatus } from '@ximi4ka-shop/shared'
import { formatCoins } from '@/lib/coins'

export const CUSTOMERS_PAGE_SIZE = 50
export const DETAIL_LIST_LIMIT = 100

/** Кэшбек заказа в таблице карточки покупателя (по статусу и обещанию; факт начисления — в истории). */
export function customerOrderCashback(o: {
  status: OrderStatus
  cashbackPromisedCoins: number
}): string {
  const n = o.cashbackPromisedCoins
  if (n <= 0) return '—'
  switch (o.status) {
    case 'paid':
    case 'shipped':
      return `Ожидает получения: ${formatCoins(n)}`
    case 'delivered':
      return `Начислено: ${formatCoins(n)}`
    case 'cancelled':
      return 'Отменён'
    default:
      return `Обещано: ${formatCoins(n)}`
  }
}

/** Ссылка на страницу списка; q — то, что админ ввёл в поиске, page — номер с единицы. */
export function customersHref(q: string, page: number): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/admin/customers${qs ? `?${qs}` : ''}`
}
