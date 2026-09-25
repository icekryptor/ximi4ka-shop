import { describe, it, expect } from 'vitest'
import { destinationFromWidget, widgetGoods, formatPeriod } from './shipping'

describe('destinationFromWidget', () => {
  it('ПВЗ: код пункта, код города и читаемый адрес', () => {
    const dest = destinationFromWidget('office', {
      city_code: 270,
      city: 'Новосибирск',
      code: 'NSK1',
      name: 'На Кривощековской',
      address: 'ул. Кривощековская, 15, корп.1',
    })
    expect(dest).toEqual({
      method: 'cdek_pvz',
      cityCode: 270,
      deliveryPointCode: 'NSK1',
      address: 'Новосибирск, ул. Кривощековская, 15, корп.1',
    })
  })

  it('курьер: геокодированный адрес и индекс, квартира дописывается', () => {
    const dest = destinationFromWidget(
      'door',
      { formatted: 'Россия, Москва, Тверская улица, 1', postal_code: '125009', city: 'Москва' },
      'кв. 12, подъезд 2',
    )
    expect(dest).toEqual({
      method: 'cdek_courier',
      postalCode: '125009',
      address: 'Россия, Москва, Тверская улица, 1, кв. 12, подъезд 2',
    })
  })

  it('курьер без квартиры — адрес как есть, без хвостовой запятой', () => {
    const dest = destinationFromWidget('door', { formatted: 'Москва, Тверская, 1' }, '  ')
    expect(dest.address).toBe('Москва, Тверская, 1')
  })
})

describe('widgetGoods', () => {
  it('превращает места в формат iParcel виджета: граммы и сантиметры', () => {
    expect(
      widgetGoods([
        {
          box: 'small',
          weightG: 180,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 4,
          estimated: false,
          items: [],
        },
      ]),
    ).toEqual([{ weight: 180, length: 10, width: 10, height: 4 }])
  })
})

describe('formatPeriod', () => {
  it('диапазон и один день', () => {
    expect(formatPeriod(3, 5)).toBe('3–5 дн.')
    expect(formatPeriod(2, 2)).toBe('2 дн.')
    expect(formatPeriod(null, null)).toBeNull()
  })
})
