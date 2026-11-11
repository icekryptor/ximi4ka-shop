import {
  deliveryDates,
  moscowDate,
  type DeliveryDates,
} from '@ximi4ka-shop/shared/types/deliveryDates'
import { TtlCache } from '../cdek/locations.js'
import {
  calculateTariff,
  tariffPeriod,
  type CalculatorParcel,
  type DeliveryConfig,
  type QuoteDeps,
} from './quote.js'

// Срок доставки для чипа на витрине: «когда приедет в мой город». Считаем до
// пункта выдачи — самый частый и самый быстрый способ. От состава посылки срок
// СДЭК не зависит, поэтому хватает условной посылки и одного ответа на город.
const ETA_PARCEL: CalculatorParcel = { weight: 1000, length: 20, width: 15, height: 10 }

export const ETA_TTL_MS = 6 * 60 * 60_000
// Сбой СДЭК и город без срока помним недолго: маршрут публичный, и без этого
// каждый показ чипа (или перебор кодов городов) шёл бы в калькулятор — на той
// же квоте, что и цена на чекауте.
export const ETA_FAILURE_TTL_MS = 2 * 60_000

type Period = ReturnType<typeof tariffPeriod>

// Ключ — город и день по Москве: от дня передачи посылки зависит срок.
// null — СДЭК не ответил или не назвал срок.
const periodCache = new TtlCache<Period | null>(ETA_TTL_MS)
// Запросы, которые сейчас в пути: одновременные показы чипа ждут один ответ.
const pending = new Map<string, Promise<Period | null>>()

export function clearEtaCache(): void {
  periodCache.clear()
  pending.clear()
}

function cacheKey(config: DeliveryConfig, toCityCode: number, now: Date): string {
  return `${config.tariffPvz}:${config.fromCityCode}:${toCityCode}:${moscowDate(now, 0)}`
}

async function requestPeriod(
  { cdek, config }: Pick<QuoteDeps, 'cdek' | 'config'>,
  toCityCode: number,
  now: Date,
): Promise<Period | null> {
  try {
    const period = tariffPeriod(
      await calculateTariff(cdek, {
        tariffCode: config.tariffPvz,
        fromCityCode: config.fromCityCode,
        to: { code: toCityCode },
        packages: [ETA_PARCEL],
        now,
      }),
    )
    return period.periodMin == null && period.periodMax == null ? null : period
  } catch {
    return null
  }
}

// Без города — самый быстрый возможный срок: доставка по городу отправки.
// null — СДЭК не ответил или не назвал срок: чип не показываем.
export async function deliveryEta(
  input: { cityCode?: number },
  { cdek, config, now = () => new Date() }: QuoteDeps,
): Promise<DeliveryDates | null> {
  const at = now()
  const toCityCode = input.cityCode ?? config.fromCityCode
  const key = cacheKey(config, toCityCode, at)
  let period = periodCache.get(key)
  if (period === undefined) {
    let request = pending.get(key)
    if (!request) {
      request = requestPeriod({ cdek, config }, toCityCode, at).finally(() => pending.delete(key))
      pending.set(key, request)
    }
    period = await request
    periodCache.set(key, period, period ? ETA_TTL_MS : ETA_FAILURE_TTL_MS)
  }
  return period ? deliveryDates(period, at) : null
}
