import type { AdminCoinTransaction, OrderStatus } from '@ximi4ka-shop/shared'
import { formatCoins } from '@/lib/coins'

export const CUSTOMERS_PAGE_SIZE = 50
export const DETAIL_LIST_LIMIT = 100

/**
 * Кэшбек заказа в таблице карточки покупателя. Факт начисления и отзыва берём из
 * операций на странице (по orderId): order_cashback — начислено, order_cashback_revoke — отозвано.
 * API отдаёт не больше DETAIL_LIST_LIMIT операций: если вернулось ровно столько и строк заказа нет,
 * об отсутствии начисления не заявляем.
 */
export function customerOrderCashback(
  o: { id: string; status: OrderStatus; cashbackPromisedCoins: number },
  transactions: Array<Pick<AdminCoinTransaction, 'orderId' | 'kind' | 'amount'>>,
): string {
  const n = o.cashbackPromisedCoins
  if (n <= 0) return '—'
  const accrual = transactions.find((t) => t.orderId === o.id && t.kind === 'order_cashback')
  const revoke = transactions.find((t) => t.orderId === o.id && t.kind === 'order_cashback_revoke')
  const truncated = transactions.length >= DETAIL_LIST_LIMIT

  if (accrual) {
    if (o.status === 'cancelled') {
      const revoked = revoke ? Math.abs(revoke.amount) : 0
      return `Отозвано: ${formatCoins(revoked)} из ${formatCoins(accrual.amount)}`
    }
    return `Начислено: ${formatCoins(accrual.amount)}`
  }
  switch (o.status) {
    case 'paid':
    case 'shipped':
      return `Ожидает получения: ${formatCoins(n)}`
    case 'delivered':
      return truncated ? `Обещано: ${formatCoins(n)} (см. историю)` : 'Получен, не начислено'
    case 'cancelled':
      return truncated ? `Обещано: ${formatCoins(n)} (см. историю)` : 'Отменён'
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

/** ?q=a&q=b приходит в searchParams массивом — берём первое значение. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}
