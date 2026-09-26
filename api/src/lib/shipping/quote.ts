import type {
  DeliveryDestination,
  DeliveryQuote,
  QuoteDestination,
  ShippingPackage,
} from '@ximi4ka-shop/shared'
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

interface CalculatorResult {
  total_sum?: number
  delivery_sum?: number
  period_min?: number
  period_max?: number
}

export interface QuoteDeps {
  cdek: { post: (path: string, body: unknown) => Promise<unknown> }
  config: DeliveryConfig
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
  { cdek, config }: QuoteDeps,
): Promise<DeliveryQuote> {
  const { destination, subtotalRub, packages } = input
  const rule = SHIPPING_RULES[destination.method]
  const tariffCode = tariffFor(destination.method, config)
  const free = subtotalRub >= rule.freeFromRub

  try {
    const result = (await cdek.post('/calculator/tariff', {
      tariff_code: tariffCode,
      from_location: { code: config.fromCityCode },
      to_location: toLocation(destination),
      packages: packages.map((p) => ({
        weight: p.weightG,
        length: p.lengthCm,
        width: p.widthCm,
        height: p.heightCm,
      })),
    })) as CalculatorResult
    const sum = result.total_sum ?? result.delivery_sum
    if (typeof sum !== 'number') throw new Error('калькулятор СДЭК не вернул стоимость')
    const cdekPriceRub = Math.ceil(sum)
    return {
      method: destination.method,
      tariffCode,
      customerPriceRub: free ? 0 : cdekPriceRub,
      cdekPriceRub,
      periodMin: result.period_min ?? null,
      periodMax: result.period_max ?? null,
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
