import type {
  CdekCity,
  CdekPoint,
  DeliveryDestination,
  DeliveryMethod,
  QuoteDestination,
  ShippingPackage,
} from '@ximi4ka-shop/shared'

// Типы ответа виджета СДЭК 4.x для onChoose (github.com/cdek-it/widget/wiki,
// «Настройка 4.0»). Берём только то, что используем.
export interface WidgetOfficeAddress {
  city_code: number
  city: string
  code: string
  name?: string
  address: string
}

export interface WidgetDoorAddress {
  formatted: string
  postal_code?: string
  city?: string
}

export interface WidgetTariff {
  tariff_code: number
  tariff_name?: string
  period_min?: number
  period_max?: number
  delivery_sum?: number
}

// Пункт, который виджет отдаёт в onChoose('office', …) — iOffice из
// dist/cdek-widget.es.d.ts 4.0.0. Берём только то, что используем.
export interface WidgetOffice {
  code: string
  city_code: number
  city: string
  address: string
  location: [number, number]
}

export function destinationFromWidget(
  mode: 'office',
  address: WidgetOfficeAddress,
): Extract<DeliveryDestination, { method: 'cdek_pvz' }>
export function destinationFromWidget(
  mode: 'door',
  address: WidgetDoorAddress,
  apartment?: string,
): Extract<DeliveryDestination, { method: 'cdek_courier' }>
export function destinationFromWidget(
  mode: 'office' | 'door',
  address: WidgetOfficeAddress | WidgetDoorAddress,
  apartment = '',
): DeliveryDestination {
  if (mode === 'office') {
    const office = address as WidgetOfficeAddress
    return {
      method: 'cdek_pvz',
      cityCode: office.city_code,
      deliveryPointCode: office.code,
      address: `${office.city}, ${office.address}`,
    }
  }
  const door = address as WidgetDoorAddress
  const extra = apartment.trim()
  return {
    method: 'cdek_courier',
    ...(door.postal_code ? { postalCode: door.postal_code } : {}),
    // Квартиру и подъезд виджет не спрашивает — покупатель дописывает их сам.
    address: extra ? `${door.formatted}, ${extra}` : door.formatted,
  }
}

// Места отправления → формат iParcel виджета (граммы и сантиметры).
export function widgetGoods(packages: ShippingPackage[]) {
  return packages.map((p) => ({
    weight: p.weightG,
    length: p.lengthCm,
    width: p.widthCm,
    height: p.heightCm,
  }))
}

export function formatPeriod(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min == null || max == null || min === max) return `${min ?? max} дн.`
  return `${min}–${max} дн.`
}

// Адрес курьера — свои поля под выбранным городом (спека §4.4, §5.1).
export interface CourierAddress {
  street: string
  apartment: string
  postalCode: string
}

export const EMPTY_COURIER_ADDRESS: CourierAddress = { street: '', apartment: '', postalCode: '' }

// «кв. 12», «офис 5»: покупатель уже написал, что это, второй «кв.» не нужен.
// \b с кириллицей не работает, поэтому граница — точка, пробел или конец.
const APARTMENT_PREFIX = /^(кв|квартира|оф|офис)(\.|\s|$)/i

// «<город>, <улица, дом>[, кв. <квартира>]» — так адрес попадает в заказ и в СДЭК.
export function courierAddressLine(cityName: string, a: CourierAddress): string {
  const street = a.street.trim()
  const apartment = a.apartment.trim()
  const flat = apartment === '' || APARTMENT_PREFIX.test(apartment) ? apartment : `кв. ${apartment}`
  return [cityName, street, flat].filter((part) => part !== '').join(', ')
}

export function isPostalCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

export function courierDestination(
  city: Pick<CdekCity, 'code' | 'name'>,
  a: CourierAddress,
): Extract<DeliveryDestination, { method: 'cdek_courier' }> {
  const postalCode = a.postalCode.trim()
  return {
    method: 'cdek_courier',
    cityCode: city.code,
    ...(postalCode !== '' ? { postalCode } : {}),
    address: courierAddressLine(city.name, a),
  }
}

// Адрес ПВЗ в заказе — «<город>, <адрес пункта>», как раньше из виджета.
export function pvzDestination(
  city: Pick<CdekCity, 'code' | 'name'>,
  point: Pick<CdekPoint, 'code' | 'address'>,
): Extract<DeliveryDestination, { method: 'cdek_pvz' }> {
  return {
    method: 'cdek_pvz',
    cityCode: city.code,
    deliveryPointCode: point.code,
    address: `${city.name}, ${point.address}`,
  }
}

// Расчёт до выбора пункта и улицы: цену ПВЗ СДЭК считает по городу, курьера —
// по коду города (api/src/routes/public/shipping.ts).
export function quoteDestination(
  method: DeliveryMethod,
  city: Pick<CdekCity, 'code' | 'name'>,
): QuoteDestination {
  return { method, cityCode: city.code, address: city.name }
}
