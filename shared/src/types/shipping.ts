// Коробки, в которых магазин отправляет заказы (размеры — от владельца,
// 23.09.2026). Наборы едут в своих коробках, мелочь раскладывается по
// количеству предметов: малая — до 5, средняя — до 15, большая — больше.
export type ShippingBox = 'small' | 'medium' | 'elektro' | 'large'

// Одно место отправления СДЭК. Вес — в граммах, габариты — в сантиметрах,
// как их ждёт API и виджет.
export interface ShippingPackage {
  box: ShippingBox
  weightG: number
  lengthCm: number
  widthCm: number
  heightCm: number
  // Вес хотя бы одного товара неизвестен и взят по умолчанию.
  estimated: boolean
  items: { productId: string; quantity: number }[]
}

// Куда везём: ПВЗ — код пункта и код города СДЭК (их отдаёт виджет),
// курьер — адрес, геокодированный виджетом.
export type DeliveryDestination =
  | { method: 'cdek_pvz'; cityCode: number; deliveryPointCode: string; address: string }
  | { method: 'cdek_courier'; cityCode?: number; postalCode?: string; address: string }

// Куда считать доставку (POST /api/public/shipping/quote). Для ПВЗ код пункта
// не обязателен: цену СДЭК считает по городу, и чекаут показывает её сразу
// после выбора города, до выбора пункта.
export type QuoteDestination =
  | (Omit<Extract<DeliveryDestination, { method: 'cdek_pvz' }>, 'deliveryPointCode'> & {
      deliveryPointCode?: string
    })
  | Extract<DeliveryDestination, { method: 'cdek_courier' }>

// Расчёт доставки для покупателя. customerPriceRub — то, что увидит и
// заплатит покупатель (0 от порога бесплатной доставки); cdekPriceRub — что
// магазин заплатит СДЭК (null, если калькулятор не ответил).
export interface DeliveryQuote {
  method: 'cdek_pvz' | 'cdek_courier'
  tariffCode: number
  customerPriceRub: number
  cdekPriceRub: number | null
  periodMin: number | null
  periodMax: number | null
  free: boolean
  // cdek — цена от калькулятора; fallback — СДЭК не ответил, взята
  // фиксированная ставка.
  source: 'cdek' | 'fallback'
}

// Город из подсказок СДЭК (GET /api/public/cdek/cities). name — первая часть
// full_name («Москва»), fullName — вся строка («Нальчик, городской округ
// Нальчик, Кабардино-Балкария, Россия»).
export interface CdekCity {
  code: number
  name: string
  fullName: string
}

// Пункт выдачи для списка и карты на чекауте (GET /api/public/cdek/points):
// только то, что показываем. location — [долгота, широта], как у виджета.
export interface CdekPoint {
  code: string
  name: string
  address: string
  location: [number, number]
  workTime: string
}

export interface CdekCityPoints {
  // location — центр города для карты; null, если СДЭК его не знает.
  city: { code: number; name: string; location: [number, number] | null }
  points: CdekPoint[]
}
