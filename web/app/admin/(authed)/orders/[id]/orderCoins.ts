import type { OrderStatus } from '@ximi4ka-shop/shared'
import { formatCoins } from '@/lib/coins'

// Состояние кэшбека заказа для карточки админа. Чистая функция: вся логика
// «что написать» здесь, компонент только рисует.

export interface OrderCoinsInput {
  status: OrderStatus
  customerId: string | null
  cashbackPromisedCoins: number
  cashbackAccruedCoins: number
  cashbackShortfallCoins: number
  deliveryProblem: string | null
}

export interface OrderCoinsState {
  headline: string
  /** Недостача при отзыве: химикоины уже потрачены. Показывать заметно. */
  shortfallWarning: string | null
  guestNote: string | null
  problem: string | null
}

const DELIVERY_PROBLEM_LABELS: Record<string, string> = {
  cdek_not_delivered: 'СДЭК: посылка не вручена',
  cdek_tracking_timeout: 'СДЭК: 60 дней без вручения',
  cdek_partial_delivery: 'СДЭК: частичное вручение — решите вручную',
}

export function deliveryProblemLabel(problem: string | null | undefined): string | null {
  if (!problem) return null
  return DELIVERY_PROBLEM_LABELS[problem] ?? problem
}

function headlineFor(o: OrderCoinsInput): string {
  const promised = o.cashbackPromisedCoins
  const accrued = o.cashbackAccruedCoins
  if (promised <= 0 && accrued <= 0) {
    return 'Кэшбек не обещан (заказ создан до запуска программы или программа была выключена)'
  }
  if (accrued > 0) {
    if (o.status === 'cancelled') {
      const returned = Math.max(0, accrued - o.cashbackShortfallCoins)
      return `Начисление отозвано: ${formatCoins(returned)} из ${formatCoins(accrued)}`
    }
    return `Начислено: ${formatCoins(accrued)}`
  }
  switch (o.status) {
    case 'paid':
    case 'shipped':
      return `Ожидает получения: ${formatCoins(promised)}`
    case 'delivered':
      return `Не начислено: ${formatCoins(promised)}`
    case 'cancelled':
      return 'Кэшбек не начислялся (заказ отменён)'
    default:
      return `Обещано: ${formatCoins(promised)} (начислится после получения заказа)`
  }
}

export function orderCoinsState(o: OrderCoinsInput): OrderCoinsState {
  const shortfall = o.cashbackShortfallCoins
  return {
    headline: headlineFor(o),
    shortfallWarning:
      shortfall > 0 ? `Недостача: ${formatCoins(shortfall)} — химикоины уже были потрачены` : null,
    guestNote:
      !o.customerId && o.cashbackPromisedCoins > 0
        ? 'Заказ гостевой: начислится, когда покупатель войдёт с этой почтой'
        : null,
    problem: deliveryProblemLabel(o.deliveryProblem),
  }
}
