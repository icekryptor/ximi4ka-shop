import { getPublicSettings } from '@/lib/api'

// «4 платежа» Сплита под карточкой: считаем сами и показываем всем, а не только тем, кому
// Яндекс рисует свою персональную плашку. Только для серверных страниц (запрос настроек).

export const SPLIT_PAYMENTS = 4

/** Платёж Сплита в рублях с округлением вверх; ноль, минус и не-число — null. */
export function splitPaymentRub(priceRub: number): number | null {
  return Number.isFinite(priceRub) && priceRub > 0 ? Math.ceil(priceRub / SPLIT_PAYMENTS) : null
}

/** Сплит включён на сайте (Яндекс доступен на чекауте). Api лежит — false, строки нет. */
export async function fetchSplitAvailable(): Promise<boolean> {
  try {
    return Boolean((await getPublicSettings())?.yandexPay?.split)
  } catch {
    return false
  }
}
