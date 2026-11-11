// Даты доставки для покупателя: чип на витрине, чекаут и выдача Яндексу
// считают их одной формулой. Файл самодостаточный — web берёт его подпутём
// `@ximi4ka-shop/shared/types/deliveryDates`.

// Сутки на сборку: посылку относим в СДЭК на следующий день после заказа.
export const HANDOVER_DAYS = 1

const DAY_MS = 86_400_000

// Календарная дата по Москве (ГГГГ-ММ-ДД) через addDays дней от now.
export function moscowDate(now: Date, addDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now.getTime() + addDays * DAY_MS))
}

// Когда посылка попадёт в СДЭК — поле `date` калькулятора. От него СДЭК
// считает календарный срок: передача в пятницу и в понедельник дают разное.
export function handoverDateTime(now: Date): string {
  return `${moscowDate(now, HANDOVER_DAYS)}T12:00:00+0300`
}

export interface DeliveryDates {
  // Сегодня по Москве — от него считаются «завтра» и «послезавтра».
  today: string
  dateMin: string
  dateMax: string
}

// Сегодня + сутки на сборку + срок СДЭК в календарных днях от передачи.
// null — СДЭК срок не назвал: дату не выдумываем.
export function deliveryDates(
  period: { periodMin: number | null; periodMax: number | null },
  now: Date,
): DeliveryDates | null {
  const min = period.periodMin ?? period.periodMax
  if (min == null) return null
  const max = Math.max(period.periodMax ?? min, min)
  return {
    today: moscowDate(now, 0),
    dateMin: moscowDate(now, HANDOVER_DAYS + min),
    dateMax: moscowDate(now, HANDOVER_DAYS + max),
  }
}
