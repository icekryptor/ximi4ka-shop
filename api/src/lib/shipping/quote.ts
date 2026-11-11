import type {
  DeliveryDestination,
  DeliveryQuote,
  QuoteDestination,
  ShippingPackage,
} from '@ximi4ka-shop/shared'
import { handoverDateTime } from '@ximi4ka-shop/shared/types/deliveryDates'
import { SHIPPING_RULES } from './rates.js'

// Отгрузка всегда одна: магазин относит посылку в ПВЗ СДЭК в Москве.
// Дальше — ПВЗ получателя («склад-склад», 136) или курьер до двери
// («склад-дверь», 137). Коды тарифов и город отправки — в окружении, чтобы
// сменить их без релиза (например, на «Экономичную посылку» 234/233).
export interface DeliveryConfig {
  fromCityCode: number
  tariffPvz: number
  tariffCourier: number
}

export function deliveryConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeliveryConfig {
  return {
    fromCityCode: Number(env.CDEK_FROM_CITY_CODE ?? 44),
    tariffPvz: Number(env.CDEK_TARIFF_PVZ ?? 136),
    tariffCourier: Number(env.CDEK_TARIFF_COURIER ?? 137),
  }
}

export interface CalculatorResult {
  total_sum?: number
  delivery_sum?: number
  // Срок в рабочих днях и он же в календарных — от дня передачи посылки.
  period_min?: number
  period_max?: number
  calendar_min?: number
  calendar_max?: number
}

export interface CalculatorParcel {
  weight: number
  length: number
  width: number
  height: number
}

type CdekCalculator = { post: (path: string, body: unknown) => Promise<unknown> }

export interface QuoteDeps {
  cdek: CdekCalculator
  config: DeliveryConfig
  now?: () => Date
}

// Один запрос к калькулятору СДЭК — для цены на чекауте и для срока в чипе.
// date — день, когда посылка попадёт в СДЭК (сутки на сборку): от него СДЭК
// считает календарный срок с учётом выходных.
export async function calculateTariff(
  cdek: CdekCalculator,
  params: {
    tariffCode: number
    fromCityCode: number
    to: Record<string, unknown>
    packages: CalculatorParcel[]
    now: Date
  },
): Promise<CalculatorResult> {
  return (await cdek.post('/calculator/tariff', {
    tariff_code: params.tariffCode,
    date: handoverDateTime(params.now),
    from_location: { code: params.fromCityCode },
    to_location: params.to,
    packages: params.packages,
  })) as CalculatorResult
}

// Покупателю называем календарные дни; рабочие — если СДЭК отдал только их.
// Пару берём целиком: календарный минимум с рабочим максимумом не смешиваем.
export function tariffPeriod(result: CalculatorResult): {
  periodMin: number | null
  periodMax: number | null
} {
  if (result.calendar_min != null || result.calendar_max != null) {
    return { periodMin: result.calendar_min ?? null, periodMax: result.calendar_max ?? null }
  }
  return { periodMin: result.period_min ?? null, periodMax: result.period_max ?? null }
}

export function tariffFor(method: DeliveryDestination['method'], config: DeliveryConfig): number {
  return method === 'cdek_pvz' ? config.tariffPvz : config.tariffCourier
}

function toLocation(destination: QuoteDestination): Record<string, unknown> {
  if (destination.method === 'cdek_pvz') return { code: destination.cityCode }
  const loc: Record<string, unknown> = {}
  if (destination.cityCode) loc.code = destination.cityCode
  if (destination.postalCode) loc.postal_code = destination.postalCode
  loc.address = destination.address
  return loc
}

// Единственное место, где считается цена доставки для покупателя — его
// вызывают и расчёт в корзине, и чекаут. Бесплатный порог: ПВЗ — от 3000 ₽,
// курьер — от 5000 ₽ (SHIPPING_RULES). Ниже порога — цена СДЭК. Если СДЭК не
// ответил, заказ не теряем: берём прежнюю фиксированную ставку.
export async function quoteDelivery(
  input: { destination: QuoteDestination; subtotalRub: number; packages: ShippingPackage[] },
  { cdek, config, now = () => new Date() }: QuoteDeps,
): Promise<DeliveryQuote> {
  const { destination, subtotalRub, packages } = input
  const rule = SHIPPING_RULES[destination.method]
  const tariffCode = tariffFor(destination.method, config)
  const free = subtotalRub >= rule.freeFromRub

  try {
    const result = await calculateTariff(cdek, {
      tariffCode,
      fromCityCode: config.fromCityCode,
      to: toLocation(destination),
      packages: packages.map((p) => ({
        weight: p.weightG,
        length: p.lengthCm,
        width: p.widthCm,
        height: p.heightCm,
      })),
      now: now(),
    })
    const sum = result.total_sum ?? result.delivery_sum
    if (typeof sum !== 'number') throw new Error('калькулятор СДЭК не вернул стоимость')
    const cdekPriceRub = Math.ceil(sum)
    return {
      method: destination.method,
      tariffCode,
      customerPriceRub: free ? 0 : cdekPriceRub,
      cdekPriceRub,
      ...tariffPeriod(result),
      free,
      source: 'cdek',
    }
  } catch {
    return {
      method: destination.method,
      tariffCode,
      customerPriceRub: free ? 0 : rule.priceRub,
      cdekPriceRub: null,
      periodMin: null,
      periodMax: null,
      free,
      source: 'fallback',
    }
  }
}
