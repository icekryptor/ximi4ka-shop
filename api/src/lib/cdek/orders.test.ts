import { describe, it, expect } from 'vitest'
import type { ShippingPackage } from '@ximi4ka-shop/shared'
import {
  buildCdekOrder,
  cdekOrderConfigFromEnv,
  cdekOrdersEnabled,
  CdekConfigError,
  CdekDataError,
  normalizeRuPhone,
  type CdekOrderConfig,
  type CdekOrderLine,
  type CdekOrderSource,
} from './orders.js'

const config: CdekOrderConfig = {
  shipmentPoint: 'MSK310',
  sender: {
    company: 'ИП Тестова',
    name: 'Тестова Анна',
    phone: '+79990000000',
    email: 'shop@example.com',
  },
  sellerName: 'ИП Тестова',
  tariffPvz: 136,
  tariffCourier: 137,
}

const pvzOrder: CdekOrderSource = {
  orderNumber: 'XM-2026-00042',
  customerName: 'Иван Петров',
  customerPhone: '8 (912) 345-67-89',
  customerEmail: 'ivan@example.com',
  deliveryMethod: 'cdek_pvz',
  deliveryAddress: {
    address: 'Нальчик, ул. Ленина, 1',
    comment: null,
    cityCode: 1081,
    deliveryPointCode: 'NLCH7',
    quote: { tariffCode: 136, cdekPriceRub: 345, periodMin: 2, periodMax: 4, source: 'cdek' },
  },
}

const lines: CdekOrderLine[] = [
  {
    productId: 'p-fecl3',
    name: 'Хлорид железа III',
    sku: 'FECL3',
    unitPriceRub: 99,
    unitWeightG: 50,
  },
  {
    productId: 'p-naoh',
    name: 'Гидроксид натрия',
    sku: 'NAOH',
    unitPriceRub: 119,
    unitWeightG: 100,
  },
]

const loose: ShippingPackage = {
  box: 'small',
  weightG: 400,
  lengthCm: 10,
  widthCm: 10,
  heightCm: 4,
  estimated: false,
  items: [
    { productId: 'p-fecl3', quantity: 2 },
    { productId: 'p-naoh', quantity: 1 },
  ],
}

describe('buildCdekOrder', () => {
  it('ПВЗ — в формате эталона 10325990882', () => {
    expect(buildCdekOrder(pvzOrder, [loose], lines, config)).toEqual({
      type: 1,
      number: 'XM-2026-00042',
      tariff_code: 136,
      shipment_point: 'MSK310',
      delivery_point: 'NLCH7',
      delivery_recipient_cost: { value: 0 },
      sender: {
        company: 'ИП Тестова',
        name: 'Тестова Анна',
        email: 'shop@example.com',
        phones: [{ number: '+79990000000' }],
      },
      seller: { name: 'ИП Тестова' },
      recipient: {
        name: 'Иван Петров',
        email: 'ivan@example.com',
        phones: [{ number: '+79123456789' }],
      },
      packages: [
        {
          number: 'XM-2026-00042#1',
          weight: 400,
          length: 10,
          width: 10,
          height: 4,
          comment: 'приложена опись',
          items: [
            {
              name: 'Хлорид железа III',
              ware_key: 'FECL3',
              payment: { value: 0 },
              cost: 99,
              weight: 50,
              amount: 2,
            },
            {
              name: 'Гидроксид натрия',
              ware_key: 'NAOH',
              payment: { value: 0 },
              cost: 119,
              weight: 100,
              amount: 1,
            },
          ],
        },
      ],
    })
  })

  it('курьер — to_location с кодом города, индексом и адресом', () => {
    const body = buildCdekOrder(
      {
        ...pvzOrder,
        deliveryMethod: 'cdek_courier',
        deliveryAddress: {
          address: 'Казань, ул. Баумана, 5, кв. 3',
          comment: null,
          cityCode: 424,
          postalCode: '420111',
          quote: { tariffCode: 137, cdekPriceRub: 500, periodMin: 2, periodMax: 3, source: 'cdek' },
        },
      },
      [loose],
      lines,
      config,
    )
    expect(body.delivery_point).toBeUndefined()
    expect(body.to_location).toEqual({
      code: 424,
      postal_code: '420111',
      address: 'Казань, ул. Баумана, 5, кв. 3',
    })
    expect(body.tariff_code).toBe(137)
  })

  it('без сохранённого тарифа — тариф из настроек по способу доставки', () => {
    const address = { ...pvzOrder.deliveryAddress, quote: undefined }
    expect(
      buildCdekOrder({ ...pvzOrder, deliveryAddress: address }, [loose], lines, config).tariff_code,
    ).toBe(136)
  })

  it('без email покупателя и отправителя — поля email нет', () => {
    const body = buildCdekOrder({ ...pvzOrder, customerEmail: '' }, [loose], lines, {
      ...config,
      sender: { ...config.sender, email: null },
    })
    expect(body.recipient).not.toHaveProperty('email')
    expect(body.sender).not.toHaveProperty('email')
  })

  it('набор в двух коробках — у каждого места своя позиция, цена делится', () => {
    const kit: CdekOrderLine = {
      productId: 'p-kit',
      name: 'Химичка 3.0',
      sku: '7V25',
      unitPriceRub: 3299,
      unitWeightG: 2000,
    }
    const box = (items: ShippingPackage['items']): ShippingPackage => ({
      box: 'large',
      weightG: 1000,
      lengthCm: 40,
      widthCm: 32,
      heightCm: 8,
      estimated: false,
      items,
    })
    const body = buildCdekOrder(
      pvzOrder,
      [box([{ productId: 'p-kit', quantity: 1 }]), box([])],
      [kit],
      config,
    )
    expect(body.packages.map((p) => p.items)).toEqual([
      [
        {
          name: 'Химичка 3.0 (место 1 из 2)',
          ware_key: '7V25',
          payment: { value: 0 },
          cost: 1650,
          weight: 1000,
          amount: 1,
        },
      ],
      [
        {
          name: 'Химичка 3.0 (место 2 из 2)',
          ware_key: '7V25-2',
          payment: { value: 0 },
          cost: 1649,
          weight: 1000,
          amount: 1,
        },
      ],
    ])
    expect(body.packages.map((p) => p.number)).toEqual(['XM-2026-00042#1', 'XM-2026-00042#2'])
  })

  it('два одинаковых набора в одной коробке каждый — два места по одной позиции', () => {
    const kit: CdekOrderLine = {
      productId: 'p-kit',
      name: 'Мини-Химичка',
      sku: 'MINI',
      unitPriceRub: 1990,
      unitWeightG: 900,
    }
    const box: ShippingPackage = {
      box: 'medium',
      weightG: 900,
      lengthCm: 17,
      widthCm: 15,
      heightCm: 12,
      estimated: false,
      items: [{ productId: 'p-kit', quantity: 1 }],
    }
    const body = buildCdekOrder(pvzOrder, [box, box], [kit], config)
    expect(body.packages).toHaveLength(2)
    expect(body.packages[1].items).toEqual([
      {
        name: 'Мини-Химичка',
        ware_key: 'MINI',
        payment: { value: 0 },
        cost: 1990,
        weight: 900,
        amount: 1,
      },
    ])
  })

  it('вес места не меньше суммы весов позиций', () => {
    const light = { ...loose, weightG: 100 }
    // 2 × 50 + 1 × 100 = 200 г
    expect(buildCdekOrder(pvzOrder, [light], lines, config).packages[0].weight).toBe(200)
  })

  it('товар без артикула — ware_key = id товара', () => {
    const noSku = lines.map((l) => ({ ...l, sku: null }))
    const keys = buildCdekOrder(pvzOrder, [loose], noSku, config).packages[0].items.map(
      (i) => i.ware_key,
    )
    expect(keys).toEqual(['p-fecl3', 'p-naoh'])
  })

  it('ПВЗ без кода пункта — ошибка данных', () => {
    const address = { ...pvzOrder.deliveryAddress, deliveryPointCode: null }
    expect(() =>
      buildCdekOrder({ ...pvzOrder, deliveryAddress: address }, [loose], lines, config),
    ).toThrow(CdekDataError)
  })

  it('доставка не СДЭК — ошибка данных', () => {
    expect(() =>
      buildCdekOrder({ ...pvzOrder, deliveryMethod: 'pickup' }, [loose], lines, config),
    ).toThrow(CdekDataError)
  })

  it('нет мест — ошибка данных', () => {
    expect(() => buildCdekOrder(pvzOrder, [], lines, config)).toThrow(CdekDataError)
  })

  it('место ссылается на товар, которого нет в заказе, — ошибка данных', () => {
    expect(() => buildCdekOrder(pvzOrder, [loose], lines.slice(0, 1), config)).toThrow(
      CdekDataError,
    )
  })
})

describe('normalizeRuPhone', () => {
  it.each([
    ['8 (999) 111-22-33', '+79991112233'],
    ['+7 999 111 22 33', '+79991112233'],
    ['79991112233', '+79991112233'],
    ['9991112233', '+79991112233'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeRuPhone(raw)).toBe(expected)
  })

  it('не российский номер — как есть', () => {
    expect(normalizeRuPhone(' +33 6 12 34 56 78 ')).toBe('+33 6 12 34 56 78')
  })
})

describe('настройки', () => {
  const env = {
    CDEK_SHIPMENT_POINT: 'MSK310',
    CDEK_SENDER_COMPANY: 'ИП Тестова',
    CDEK_SENDER_NAME: 'Тестова Анна',
    CDEK_SENDER_PHONE: '8 999 000-00-00',
  }

  it('флаг включён только значением true', () => {
    expect(cdekOrdersEnabled({ CDEK_ORDERS_ENABLED: 'true' })).toBe(true)
    expect(cdekOrdersEnabled({ CDEK_ORDERS_ENABLED: '1' })).toBe(false)
    expect(cdekOrdersEnabled({})).toBe(false)
  })

  it('продавец по умолчанию — компания отправителя, телефон нормализуется', () => {
    expect(cdekOrderConfigFromEnv(env)).toEqual({
      shipmentPoint: 'MSK310',
      sender: { company: 'ИП Тестова', name: 'Тестова Анна', phone: '+79990000000', email: null },
      sellerName: 'ИП Тестова',
      tariffPvz: 136,
      tariffCourier: 137,
    })
  })

  it('без обязательных переменных — ошибка со списком того, чего нет', () => {
    const partial = { ...env, CDEK_SENDER_NAME: '', CDEK_SHIPMENT_POINT: ' ' }
    expect(() => cdekOrderConfigFromEnv(partial)).toThrow(CdekConfigError)
    expect(() => cdekOrderConfigFromEnv(partial)).toThrow(/CDEK_SHIPMENT_POINT, CDEK_SENDER_NAME/)
  })
})
