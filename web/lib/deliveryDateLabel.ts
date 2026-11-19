import type { DeliveryDates } from '@ximi4ka-shop/shared/types/deliveryDates'

// Подписи дат доставки: чип с грузовиком и способы доставки на чекауте.
// Без запросов и хуков — годится и серверным, и клиентским компонентам.

const DAY_MS = 86_400_000
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

// Даты приходят как ГГГГ-ММ-ДД по Москве — считаем их в UTC, без часового
// пояса покупателя.
function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year: year!, month: month!, day: day! }
}

function daysBetween(from: string, to: string): number {
  const a = parts(from)
  const b = parts(to)
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS,
  )
}

function dayAndMonth(date: string): string {
  const { month, day } = parts(date)
  return `${day} ${MONTHS[month - 1]}`
}

/** «завтра», «послезавтра» или «14 ноября» — относительно сегодня по Москве. */
export function etaDayLabel(date: string, today: string): string {
  const days = daysBetween(today, date)
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  if (days === 2) return 'послезавтра'
  return dayAndMonth(date)
}

/** Вилка дат для чекаута: «14–16 ноября», «29 ноября – 2 декабря»; одна дата — как в чипе. */
export function etaRangeLabel(eta: DeliveryDates): string {
  if (eta.dateMin === eta.dateMax) return etaDayLabel(eta.dateMin, eta.today)
  const from = parts(eta.dateMin)
  const to = parts(eta.dateMax)
  if (from.year === to.year && from.month === to.month) {
    return `${from.day}–${dayAndMonth(eta.dateMax)}`
  }
  return `${dayAndMonth(eta.dateMin)} – ${dayAndMonth(eta.dateMax)}`
}
