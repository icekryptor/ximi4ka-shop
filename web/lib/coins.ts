// Химикоины в витрине: склонение, формат числа, буква аватарки, подписи операций и заказов.
import type { CoinTransactionKind } from '@ximi4ka-shop/shared/types/coins'
import type { OrderStatus } from '@ximi4ka-shop/shared'

export function coinsWord(n: number): 'химикоин' | 'химикоина' | 'химикоинов' {
  const abs = Math.abs(Math.trunc(n))
  const last2 = abs % 100
  const last = abs % 10
  if (last2 >= 11 && last2 <= 14) return 'химикоинов'
  if (last === 1) return 'химикоин'
  if (last >= 2 && last <= 4) return 'химикоина'
  return 'химикоинов'
}

/** 1900 → «1 900». Без Intl: результат одинаков на сервере и в браузере. */
export function formatCoins(n: number): string {
  const s = String(Math.trunc(Math.abs(n)))
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return n < 0 ? `-${grouped}` : grouped
}

/** Заглавная буква имени, иначе почты; '?' если нечего показать. */
export function avatarInitial(name: string | null, email: string | null): string {
  const src = (name ?? '').trim() || (email ?? '').trim()
  const first = Array.from(src)[0]
  return first ? first.toUpperCase() : '?'
}

/** Подпись операции в истории; без номера заказа часть «№…» опускается. */
export function coinOperationLabel(kind: CoinTransactionKind, orderNumber: string | null): string {
  const no = orderNumber ? ` №${orderNumber}` : ''
  switch (kind) {
    case 'order_cashback':
      return `Кэшбек за заказ${no}`
    case 'order_cashback_revoke':
      return `Отмена заказа${no}`
    case 'admin_adjust':
      return 'Корректировка'
  }
}

/** «+190» / «−1 500» (настоящий минус U+2212); ноль без знака. */
export function formatSignedCoins(n: number): string {
  if (n > 0) return `+${formatCoins(n)}`
  if (n < 0) return `\u2212${formatCoins(-n)}`
  return '0'
}

/**
 * Заметка о кэшбеке у заказа в кабинете. Отменённым, неоплаченным и неудавшимся
 * не показываем ничего: начисление за них отозвано или ещё не обещано.
 */
export function orderCashbackNote(order: {
  status: OrderStatus
  cashbackPromisedCoins: number
  cashbackAccrued: boolean
}): string | null {
  const n = order.cashbackPromisedCoins
  const amount = `${formatCoins(n)} ${coinsWord(n)}`
  if ((order.status === 'paid' || order.status === 'shipped') && n > 0) {
    return `+${amount} после получения`
  }
  if (order.status === 'delivered' && order.cashbackAccrued && n > 0) {
    return `Начислено ${amount}`
  }
  return null
}
