import { CdekError } from '../cdek/client.js'
import { calculateTariff } from '../shipping/quote.js'
import type { PickupPointEntry } from './pickupPoints.js'

// Возит ли тариф ПВЗ (CDEK_TARIFF_PVZ, 136) в город пункта выдачи. Около
// половины пунктов в /deliverypoints — партнёрские точки Почты России в сёлах,
// куда СДЭК везёт только экспрессом (480–483): PIT4 в Питерке — заказ
// XM-2026-00153 оплатили, а создать его в СДЭК было нельзя. Признака тарифа у
// пункта нет; owner_code «Почта России» почти совпадает, но не всегда (замер
// 19.11.2026: 2 из 80 таких городов тариф 136 обслуживает). Поэтому спрашиваем
// калькулятор — ровно так же, как POST /delivery/options считает цену, — по
// одному запросу на город, и кешируем ответ на неделю.

type CdekCalculator = { post: (path: string, body: unknown) => Promise<unknown> }

export type CityTariffStatus = 'served' | 'unavailable' | 'unknown'

export interface CityCheck {
  served: boolean
  checkedAt: Date
}

// Тариф и размеры на доступность не влияют; посылка — как у типичного заказа.
const PROBE_PARCEL = { weight: 1000, length: 20, width: 20, height: 10 }
const TARIFF_UNAVAILABLE_CODES = new Set(['err_result_service_empty'])

export const CITY_CHECK_CONCURRENCY = 4
// Столько сбоев подряд — СДЭК лежит или душит запросы: остальные города не
// проверяем, их пункты остаются в списке до следующего обновления.
export const CITY_CHECK_MAX_CONSECUTIVE_FAILURES = 20

const DAY_MS = 24 * 60 * 60_000
// 6–8 суток, своё у каждого города: после первой сборки все ~6 тыс. проверок
// иначе устарели бы разом и ушли одной пачкой.
export function cityCheckTtlMs(cityCode: number): number {
  return 6 * DAY_MS + (Math.abs(cityCode) % 49) * 60 * 60_000
}

// CdekError.code — код только первой ошибки; остальные лежат в details.
function isTariffUnavailable(err: unknown): boolean {
  if (!(err instanceof CdekError)) return false
  const details: unknown[] = Array.isArray(err.details) ? err.details : []
  const codes = [err.code, ...details.map((d) => (d as { code?: unknown } | null)?.code)]
  return codes.some((c) => typeof c === 'string' && TARIFF_UNAVAILABLE_CODES.has(c.toLowerCase()))
}

export async function checkCityTariff(
  cdek: CdekCalculator,
  cityCode: number,
  opts: { tariffCode: number; fromCityCode: number; now: Date },
): Promise<CityTariffStatus> {
  try {
    const result = await calculateTariff(cdek, {
      tariffCode: opts.tariffCode,
      fromCityCode: opts.fromCityCode,
      to: { code: cityCode },
      packages: [PROBE_PARCEL],
      now: opts.now,
    })
    return typeof result?.delivery_sum === 'number' ? 'served' : 'unknown'
  } catch (err) {
    return isTariffUnavailable(err) ? 'unavailable' : 'unknown'
  }
}

export interface FilterResult {
  entries: PickupPointEntry[]
  removedPoints: number
  unknownCities: number
  // Проверено в этот раз — сохранить в базу.
  fresh: Map<number, CityCheck>
}

// Неизвестно (сбой СДЭК, проверка не дошла) ⇒ пункт остаётся: лучше лишний
// пункт, на котором /delivery/options ответит 400, чем пустой список у Яндекса.
export async function filterServedPickupPoints(
  entries: PickupPointEntry[],
  deps: {
    cdek: CdekCalculator
    tariffCode: number
    fromCityCode: number
    now: Date
    cache: Map<number, CityCheck>
    concurrency?: number
  },
): Promise<FilterResult> {
  const { cache, now } = deps
  const isFresh = (code: number): boolean => {
    const hit = cache.get(code)
    return !!hit && now.getTime() - hit.checkedAt.getTime() < cityCheckTtlMs(code)
  }
  const toCheck = [...new Set(entries.map((e) => e.cityCode))].filter((c) => !isFresh(c))

  const fresh = new Map<number, CityCheck>()
  let consecutiveFailures = 0
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < toCheck.length) {
      if (consecutiveFailures >= CITY_CHECK_MAX_CONSECUTIVE_FAILURES) return
      const code = toCheck[next++]
      const status = await checkCityTariff(deps.cdek, code, deps)
      if (status === 'unknown') {
        consecutiveFailures++
        continue
      }
      consecutiveFailures = 0
      const check = { served: status === 'served', checkedAt: now }
      fresh.set(code, check)
      cache.set(code, check)
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, deps.concurrency ?? CITY_CHECK_CONCURRENCY) }, worker),
  )
  const unknownCities = toCheck.filter((c) => !fresh.has(c)).length

  // Устаревший отказ без свежей проверки тоже не держим — неизвестно ⇒ оставляем.
  const unavailable = (code: number): boolean => isFresh(code) && cache.get(code)?.served === false
  const kept = entries.filter((e) => !unavailable(e.cityCode))
  return { entries: kept, removedPoints: entries.length - kept.length, unknownCities, fresh }
}
