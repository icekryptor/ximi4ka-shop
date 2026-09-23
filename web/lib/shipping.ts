import type { DeliveryDestination, ShippingPackage } from '@ximi4ka-shop/shared'

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
