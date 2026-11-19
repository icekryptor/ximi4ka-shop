import { describe, it, expect } from 'vitest'
import {
  EMPTY_COURIER_ADDRESS,
  courierAddressLine,
  courierDestination,
  formatDeliveryDates,
  isPostalCode,
  pvzDestination,
  quoteDestination,
  widgetGoods,
} from './shipping'

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

describe('formatDeliveryDates', () => {
  // 11 ноября 2026, 15:00 по Москве; к сроку СДЭК прибавляются сутки на сборку.
  const now = new Date('2026-11-11T12:00:00Z')

  it('вилка срока — вилка дат', () => {
    expect(formatDeliveryDates(3, 5, now)).toBe('15–17 ноября')
  })

  it('один день — одна дата, ближайшие дни — словом', () => {
    expect(formatDeliveryDates(2, 2, now)).toBe('14 ноября')
    expect(formatDeliveryDates(1, 1, now)).toBe('послезавтра')
  })

  it('СДЭК не назвал срок — подписи нет', () => {
    expect(formatDeliveryDates(null, null, now)).toBeNull()
  })
})

const MOSCOW = { code: 44, name: 'Москва' }

describe('courierAddressLine', () => {
  it('«город, улица, дом, кв. квартира»', () => {
    expect(
      courierAddressLine('Москва', {
        street: ' Тверская ул., 1 ',
        apartment: '12',
        postalCode: '',
      }),
    ).toBe('Москва, Тверская ул., 1, кв. 12')
  })

  it('без квартиры — без хвостовой запятой', () => {
    expect(
      courierAddressLine('Москва', { ...EMPTY_COURIER_ADDRESS, street: 'Тверская ул., 1' }),
    ).toBe('Москва, Тверская ул., 1')
  })

  it('«кв.», «квартира», «офис», написанные покупателем, не дублируются', () => {
    const line = (apartment: string) =>
      courierAddressLine('Москва', { street: 'Тверская ул., 1', apartment, postalCode: '' })
    expect(line('кв. 12')).toBe('Москва, Тверская ул., 1, кв. 12')
    expect(line('Квартира 7')).toBe('Москва, Тверская ул., 1, Квартира 7')
    expect(line('офис 305')).toBe('Москва, Тверская ул., 1, офис 305')
    expect(line('оф.3')).toBe('Москва, Тверская ул., 1, оф.3')
  })
})

describe('courierDestination', () => {
  it('код города, индекс и собранный адрес', () => {
    expect(
      courierDestination(MOSCOW, {
        street: 'Тверская ул., 1',
        apartment: '12',
        postalCode: '125009',
      }),
    ).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      postalCode: '125009',
      address: 'Москва, Тверская ул., 1, кв. 12',
    })
  })

  it('пустой индекс не отправляется', () => {
    expect(
      courierDestination(MOSCOW, { ...EMPTY_COURIER_ADDRESS, street: 'Тверская ул., 1' }),
    ).not.toHaveProperty('postalCode')
  })
})

describe('pvzDestination', () => {
  it('код пункта, код города и «город, адрес пункта»', () => {
    expect(pvzDestination(MOSCOW, { code: 'MSK310', address: 'пр-т Мира, 108' })).toEqual({
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK310',
      address: 'Москва, пр-т Мира, 108',
    })
  })
})

describe('quoteDestination', () => {
  it('для расчёта хватает города: ПВЗ без пункта, курьер без улицы', () => {
    expect(quoteDestination('cdek_pvz', MOSCOW)).toEqual({
      method: 'cdek_pvz',
      cityCode: 44,
      address: 'Москва',
    })
    expect(quoteDestination('cdek_courier', MOSCOW)).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      address: 'Москва',
    })
  })
})

describe('isPostalCode', () => {
  it('ровно 6 цифр', () => {
    expect(isPostalCode('125009')).toBe(true)
    expect(isPostalCode(' 125009 ')).toBe(true)
    expect(isPostalCode('12500')).toBe(false)
    expect(isPostalCode('12500a')).toBe(false)
  })
})
