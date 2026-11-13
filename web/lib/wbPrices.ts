/**
 * Цены наших товаров на Wildberries — для виджета «на WB дороже» в карточке и
 * на странице товара (решение владельца 14.11.2026, к «Чёрной пятнице»).
 *
 * Цена — та, что реально платит покупатель на WB (после СПП), а не цена
 * продавца: иначе сравнение завышает выгоду и спорно по закону о рекламе.
 * Пока цены вносятся вручную; позже их будет отдавать ERP (таблица
 * spp_order, маршрут по X-API-Key) — тогда этот файл заменит запрос к api.
 *
 * Нет цены у товара — виджета у него нет. Цены старше WB_PRICE_MAX_AGE_DAYS
 * не показываются: устаревшее сравнение хуже, чем никакого.
 */
export interface WbPrice {
  /** цена покупателя на WB, ₽ */
  priceRub: number
  /** дата, на которую цена сверена, YYYY-MM-DD (по Москве) */
  asOf: string
  /** комбо: на WB его нет, цена — сумма входящих наборов, купленных по отдельности */
  sumOfParts?: boolean
}

/** Дата сверки цен WB_KIT_PRICES с владельцем. */
const KITS_AS_OF = '2026-11-14'

/** Цены покупателя на WB для наборов (владелец, 14.11.2026). */
const WB_KIT_PRICES: Readonly<Record<string, number>> = {
  'himichka-30': 3617,
  elektrohimichka: 3617,
  'mini-himichka': 1858,
  'bolshoi-nabor-dlya-oge': 4114,
}

/**
 * Комбо → наборы внутри. Комбо на WB не продаются: сравниваем с покупкой тех же
 * наборов по отдельности. Состав «Все три набора!» — по фото товара (Химичка 3.0,
 * Электрохимичка, Мини-Химичка). Комбо из реактивов здесь нет: цен WB на
 * реактивы владелец не давал.
 */
const COMBO_PARTS: Readonly<Record<string, readonly string[]>> = {
  'all-4-kits': ['himichka-30', 'elektrohimichka', 'mini-himichka', 'bolshoi-nabor-dlya-oge'],
  'vse-tri-nabora': ['himichka-30', 'elektrohimichka', 'mini-himichka'],
  'himichka-i-elektrohimichka': ['himichka-30', 'elektrohimichka'],
}

export function buildWbPrices(
  kits: Readonly<Record<string, number>>,
  combos: Readonly<Record<string, readonly string[]>>,
  asOf: string,
): Record<string, WbPrice> {
  const out: Record<string, WbPrice> = {}
  for (const [slug, priceRub] of Object.entries(kits)) out[slug] = { priceRub, asOf }
  for (const [slug, parts] of Object.entries(combos)) {
    // Нет цены хоть одного набора — суммы нет, иначе комбо выглядело бы дешевле, чем есть.
    if (!parts.every((p) => kits[p] > 0)) continue
    const priceRub = parts.reduce((sum, p) => sum + kits[p], 0)
    out[slug] = { priceRub, asOf, sumOfParts: true }
  }
  return out
}

/** слаг товара на сайте → цена на WB */
export const WB_PRICES: Readonly<Record<string, WbPrice>> = buildWbPrices(
  WB_KIT_PRICES,
  COMBO_PARTS,
  KITS_AS_OF,
)

export const WB_PRICE_MAX_AGE_DAYS = 14

export interface WbComparison {
  wbPriceRub: number
  savingRub: number
  /** выгода в процентах от цены WB, округлённая вниз — не обещаем больше, чем есть */
  savingPct: number
  asOf: string
  sumOfParts: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

export function wbComparison(
  slug: string,
  ourPriceRub: number,
  now: Date = new Date(),
  prices: Readonly<Record<string, WbPrice>> = WB_PRICES,
): WbComparison | null {
  const wb = prices[slug]
  if (!wb || !(wb.priceRub > 0) || !(ourPriceRub > 0)) return null
  const asOfMs = Date.parse(`${wb.asOf}T00:00:00+03:00`)
  // Действует в день сверки и ещё WB_PRICE_MAX_AGE_DAYS полных дней после него.
  if (Number.isNaN(asOfMs) || now.getTime() - asOfMs >= (WB_PRICE_MAX_AGE_DAYS + 1) * DAY_MS) {
    return null
  }
  const savingRub = wb.priceRub - ourPriceRub
  const savingPct = Math.floor((savingRub / wb.priceRub) * 100)
  if (savingPct < 1) return null
  return {
    wbPriceRub: wb.priceRub,
    savingRub,
    savingPct,
    asOf: wb.asOf,
    sumOfParts: wb.sumOfParts === true,
  }
}

/** «14.11.2026» из «2026-11-14» */
export function formatAsOf(asOf: string): string {
  const [y, m, d] = asOf.split('-')
  return `${d}.${m}.${y}`
}
