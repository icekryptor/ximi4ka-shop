import type { DeliveryMethod, DeliveryQuote } from '@ximi4ka-shop/shared'
import type { CdekClient } from '../cdek/client.js'
import { suggestCities } from '../cdek/locations.js'
import { packCart } from '../shipping/pack.js'
import {
  deliveryConfigFromEnv,
  quoteDelivery,
  tariffFor,
  type DeliveryConfig,
} from '../shipping/quote.js'
import { SHIPPING_RULES } from '../shipping/rates.js'
import { lookupPickupPoint } from './pickupPoints.js'
import { ycpGoodsTotal, ycpPackLines, type YcpLine } from './pricing.js'

type Cdek = Pick<CdekClient, 'get' | 'post'>

export class DeadlineError extends Error {
  constructor() {
    super('СДЭК не ответил вовремя')
    this.name = 'DeadlineError'
  }
}

function race<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  const left = deadlineAt - Date.now()
  if (left <= 0) return Promise.reject(new DeadlineError())
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), left)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Общий срок на все вызовы СДЭК одного запроса: подсказка города и калькулятор
// вместе укладываются в него. Клиент СДЭК сам ждёт до 10 секунд — без обёртки
// калькулятор съел бы весь лимит Яндекса в 5 секунд.
export function withDeadline(cdek: Cdek, ms: number): Cdek {
  const deadlineAt = Date.now() + ms
  return {
    get: <T = unknown>(path: string, query?: Parameters<CdekClient['get']>[1]) =>
      race(cdek.get<T>(path, query), deadlineAt),
    post: <T = unknown>(path: string, body: unknown) => race(cdek.post<T>(path, body), deadlineAt),
  }
}

export type YcpDeliveryTarget =
  | { method: 'pickup_point'; pickupPointId: string }
  | { method: 'courier'; locality: string; address: string }

export interface YcpDeliveryDateInterval {
  start_interval: { date: string }
  end_interval: { date: string }
  time_zone: number
}

export interface YcpDeliveryOption {
  id: string
  cost: number
  delivery_date_interval: YcpDeliveryDateInterval
}

export class UnknownPickupPointError extends Error {
  constructor(code: string) {
    super(`Пункт выдачи ${code} не найден`)
    this.name = 'UnknownPickupPointError'
  }
}

// Ориентировочный срок в пути, если СДЭК не назвал свой.
export const FALLBACK_PERIOD_DAYS = { min: 3, max: 7 } as const
// Посылку относим в СДЭК на следующий день после заказа.
export const HANDOVER_DAYS = 1
export const MOSCOW_UTC_OFFSET = 3

const OPTION_PREFIX: Record<DeliveryMethod, string> = { cdek_pvz: 'pvz', cdek_courier: 'courier' }

// Детерминированный id варианта: способ, тариф и код города (0 — неизвестен).
// Яндекс вернёт его в /checkout как ycp_delivery_option_id — оттуда берём город.
export function ycpOptionId(
  method: DeliveryMethod,
  tariffCode: number,
  cityCode: number | null,
): string {
  return `${OPTION_PREFIX[method]}-${tariffCode}-${cityCode ?? 0}`
}

export function parseYcpOptionId(
  id: string | null | undefined,
): { method: DeliveryMethod; tariffCode: number; cityCode: number | null } | null {
  const m = /^(pvz|courier)-(\d{1,6})-(\d{1,9})$/.exec(id ?? '')
  if (!m) return null
  const cityCode = Number(m[3])
  return {
    method: m[1] === 'pvz' ? 'cdek_pvz' : 'cdek_courier',
    tariffCode: Number(m[2]),
    cityCode: cityCode > 0 ? cityCode : null,
  }
}

export function moscowDate(now: Date, addDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now.getTime() + addDays * 86_400_000))
}

export function deliveryDateInterval(
  quote: Pick<DeliveryQuote, 'periodMin' | 'periodMax'>,
  now: Date,
): YcpDeliveryDateInterval {
  const min = quote.periodMin ?? FALLBACK_PERIOD_DAYS.min
  const max = Math.max(quote.periodMax ?? FALLBACK_PERIOD_DAYS.max, min)
  return {
    start_interval: { date: moscowDate(now, HANDOVER_DAYS + min) },
    end_interval: { date: moscowDate(now, HANDOVER_DAYS + max) },
    time_zone: MOSCOW_UTC_OFFSET,
  }
}

// Та же фиксированная ставка, что берёт quoteDelivery, когда СДЭК молчит, —
// для ПВЗ, чей город неизвестен (кеш пунктов ещё не собран).
export function fallbackQuote(
  method: DeliveryMethod,
  subtotalRub: number,
  config: DeliveryConfig,
): DeliveryQuote {
  const rule = SHIPPING_RULES[method]
  const free = subtotalRub >= rule.freeFromRub
  return {
    method,
    tariffCode: tariffFor(method, config),
    customerPriceRub: free ? 0 : rule.priceRub,
    cdekPriceRub: null,
    periodMin: null,
    periodMax: null,
    free,
    source: 'fallback',
  }
}

async function resolveCityCode(cdek: Cdek, locality: string): Promise<number | null> {
  try {
    return (await suggestCities(cdek, locality))[0]?.code ?? null
  } catch {
    return null
  }
}

// Один вариант на запрос — тот способ, что выбрал покупатель. Цена — та же,
// что на сайте (quoteDelivery, порог бесплатной доставки по сумме за товары).
export async function ycpDeliveryOption(
  input: { target: YcpDeliveryTarget; lines: YcpLine[]; now: Date },
  deps: { cdek: Cdek; timeoutMs: number; config?: DeliveryConfig },
): Promise<YcpDeliveryOption> {
  const config = deps.config ?? deliveryConfigFromEnv()
  const cdek = withDeadline(deps.cdek, deps.timeoutMs)
  const subtotalRub = ycpGoodsTotal(input.lines)
  const packages = packCart(ycpPackLines(input.lines))
  const { target } = input
  let quote: DeliveryQuote
  let cityCode: number | null = null
  if (target.method === 'pickup_point') {
    const found = lookupPickupPoint(target.pickupPointId)
    if (found === 'unknown') throw new UnknownPickupPointError(target.pickupPointId)
    if (found === 'not_ready') {
      quote = fallbackQuote('cdek_pvz', subtotalRub, config)
    } else {
      cityCode = found.cityCode
      quote = await quoteDelivery(
        {
          destination: { method: 'cdek_pvz', cityCode, address: found.point.address },
          subtotalRub,
          packages,
        },
        { cdek, config },
      )
    }
  } else {
    cityCode = await resolveCityCode(cdek, target.locality)
    quote = await quoteDelivery(
      {
        destination: {
          method: 'cdek_courier',
          ...(cityCode ? { cityCode } : {}),
          address: `${target.locality}, ${target.address}`,
        },
        subtotalRub,
        packages,
      },
      { cdek, config },
    )
  }
  return {
    id: ycpOptionId(quote.method, quote.tariffCode, cityCode),
    cost: quote.customerPriceRub,
    delivery_date_interval: deliveryDateInterval(quote, input.now),
  }
}
