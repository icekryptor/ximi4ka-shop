import { CIS_CITIES } from './cisCities.js'

// Доставка в Беларусь, Казахстан, Армению и Киргизию: город выбирается из списка
// городов с ПВЗ СДЭК, адрес пункта покупатель пишет сам, отправку оформляет
// оператор вручную. Цены и список городов — единый источник для api и web.
export const CIS_COUNTRIES = ['BY', 'KZ', 'AM', 'KG'] as const
export type CisCountry = (typeof CIS_COUNTRIES)[number]

export const CIS_COUNTRY_NAMES: Record<CisCountry, string> = {
  BY: 'Беларусь',
  KZ: 'Казахстан',
  AM: 'Армения',
  KG: 'Киргизия',
}

// Код флага для <Flag> (web/components/marketing/Flag.tsx).
export const CIS_FLAG_CODES = { BY: 'by', KZ: 'kz', AM: 'am', KG: 'kg' } as const satisfies Record<
  CisCountry,
  string
>

// Условия от владельца, 17.10.2026. Порог — по сумме товаров за вычетом скидки.
export const CIS_DELIVERY_RULES: Record<CisCountry, { freeFromRub: number; priceRub: number }> = {
  BY: { freeFromRub: 3000, priceRub: 700 },
  KZ: { freeFromRub: 5000, priceRub: 900 },
  KG: { freeFromRub: 5000, priceRub: 900 },
  AM: { freeFromRub: 5000, priceRub: 1200 },
}

export function cisShippingRub(country: CisCountry, amountRub: number): number {
  const rule = CIS_DELIVERY_RULES[country]
  return amountRub >= rule.freeFromRub ? 0 : rule.priceRub
}

export { CIS_CITIES }

export function isCisCity(country: CisCountry, city: string): boolean {
  return CIS_CITIES[country].includes(city)
}

// Куда везём: способ «cdek_manual_cis» — страна, город из списка и адрес ПВЗ.
export interface CisDeliveryDestination {
  method: 'cdek_manual_cis'
  country: CisCountry
  city: string
  address: string
}
