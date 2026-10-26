import { describe, it, expect } from 'vitest'
import type { Order } from '../../../entities/Order.js'
import { ITEM_TAXES } from '../receipt.js'
import { buildYandexCart, YANDEX_TAX_CODES } from './cart.js'

type Line = {
  productId: string
  name: string
  quantity: number
  unitPriceRub: number
  lineTotalRub?: number | null
  isGift?: boolean
}

// totalRub — как в чекауте: товары − промокод + доставка; extra может его переопределить.
function order(lines: Line[], extra: Record<string, unknown> = {}): Order {
  const items = lines.map((l) => ({
    productId: l.productId,
    productSnapshot: { name: l.name, sku: null, priceRub: l.unitPriceRub },
    quantity: l.quantity,
    unitPriceRub: l.unitPriceRub,
    lineTotalRub: l.lineTotalRub ?? null,
    isGift: l.isGift ?? false,
  }))
  const goods = lines
    .filter((l) => !l.isGift)
    .reduce((sum, l) => sum + (l.lineTotalRub ?? l.unitPriceRub * l.quantity), 0)
  const promo = typeof extra.promoDiscountRub === 'number' ? extra.promoDiscountRub : 0
  const shipping = typeof extra.shippingRub === 'number' ? extra.shippingRub : 350
  return {
    orderNumber: 'XM-2026-00001',
    items,
    promoDiscountRub: 0,
    shippingRub: 350,
    totalRub: goods - promo + shipping,
    customerEmail: 'buyer@example.com',
    customerPhone: '+79001234567',
    ...extra,
  } as unknown as Order
}

const kop = (rub: string) => Math.round(Number(rub) * 100)

describe('buildYandexCart', () => {
  it('товар и доставка: суммы строками в рублях, «без НДС», предметы расчёта', () => {
    const { cart, fiscalContact } = buildYandexCart(
      order([{ productId: 'p1', name: 'Реагент', quantity: 2, unitPriceRub: 100 }]),
      'none',
    )
    expect(cart).toEqual({
      items: [
        {
          productId: 'p1',
          title: 'Реагент',
          quantity: { count: '2' },
          unitPrice: '100.00',
          total: '200.00',
          receipt: { tax: 6, measure: 0, paymentMethodType: 4, paymentSubjectType: 1 },
        },
        {
          productId: 'delivery',
          title: 'Доставка',
          quantity: { count: '1' },
          unitPrice: '350.00',
          total: '350.00',
          receipt: { tax: 6, measure: 0, paymentMethodType: 4, paymentSubjectType: 4 },
        },
      ],
      total: { amount: '550.00' },
    })
    expect(fiscalContact).toBe('buyer@example.com')
  })

  it('партия 313 ₽ за 21 штуку: цена за единицу — целые копейки, productId уникальны', () => {
    const { cart } = buildYandexCart(
      order([
        { productId: 'p1', name: 'Пробирки', quantity: 21, unitPriceRub: 15, lineTotalRub: 313 },
      ]),
      'none',
    )
    expect(
      cart.items.slice(0, 2).map((i) => [i.productId, i.unitPrice, i.quantity.count, i.total]),
    ).toEqual([
      ['p1', '14.90', '20', '298.00'],
      ['p1-2', '15.00', '1', '15.00'],
    ])
    const ids = cart.items.map((i) => i.productId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(cart.total.amount).toBe('663.00')
  })

  it('промокод раскидывается по товарам (как в чеке Т-Кассы), доставка целая', () => {
    const { cart } = buildYandexCart(
      order(
        [
          { productId: 'p-a', name: 'Набор', quantity: 1, unitPriceRub: 1000 },
          { productId: 'p-r', name: 'Реактив', quantity: 3, unitPriceRub: 111, lineTotalRub: 333 },
        ],
        { promoDiscountRub: 67, shippingRub: 350 },
      ),
      'none',
    )
    expect(cart.items.map((i) => [i.productId, i.unitPrice, i.quantity.count, i.total])).toEqual([
      ['p-a', '949.00', '1', '949.00'],
      ['p-r', '105.66', '2', '211.32'],
      ['p-r-2', '105.68', '1', '105.68'],
      ['delivery', '350.00', '1', '350.00'],
    ])
    expect(cart.total.amount).toBe('1616.00')
  })

  it('промокод + оптовая скидка + доставка СДЭК: сумма позиций равна итогу', () => {
    const o = order(
      [
        { productId: 'p-r', name: 'Реактив', quantity: 10, unitPriceRub: 80, lineTotalRub: 800 },
        { productId: 'p-t', name: 'Пробирка', quantity: 21, unitPriceRub: 15, lineTotalRub: 313 },
      ],
      { promoDiscountRub: 56, shippingRub: 390 },
    )
    const { cart } = buildYandexCart(o, 'none')
    expect(cart.total.amount).toBe('1447.00')
    expect(cart.items.reduce((s, i) => s + kop(i.total), 0)).toBe(o.totalRub * 100)
    for (const i of cart.items) {
      expect(i.unitPrice).toMatch(/^\d+\.\d{2}$/)
      expect(kop(i.unitPrice) * Number(i.quantity.count)).toBe(kop(i.total))
    }
  })

  it('доставка в ЕАЭС — позиция-услуга на её цену', () => {
    const { cart } = buildYandexCart(
      order([{ productId: 'p1', name: 'Набор', quantity: 1, unitPriceRub: 2000 }], {
        shippingRub: 700,
        deliveryMethod: 'cdek_manual_cis',
      }),
      'none',
    )
    expect(cart.items.at(-1)).toMatchObject({
      productId: 'delivery',
      total: '700.00',
      receipt: { paymentSubjectType: 4 },
    })
    expect(cart.total.amount).toBe('2700.00')
  })

  it('подарок и товар, обнулённый промокодом, в корзину не попадают', () => {
    const gift = buildYandexCart(
      order(
        [
          { productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 },
          {
            productId: 'g1',
            name: 'Подарок',
            quantity: 1,
            unitPriceRub: 0,
            lineTotalRub: 0,
            isGift: true,
          },
        ],
        { shippingRub: 0 },
      ),
      'none',
    )
    expect(gift.cart.items.map((i) => i.productId)).toEqual(['p1'])
    const zeroed = buildYandexCart(
      order([{ productId: 'p1', name: 'Набор', quantity: 1, unitPriceRub: 100 }], {
        promoDiscountRub: 100,
      }),
      'none',
    )
    expect(zeroed.cart.items.map((i) => i.productId)).toEqual(['delivery'])
  })

  it('ставка НДС из TBANK_RECEIPT_TAX переводится в код Яндекса; таблица полная', () => {
    const { cart } = buildYandexCart(
      order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }]),
      'vat22',
    )
    expect(cart.items.every((i) => i.receipt.tax === 11)).toBe(true)
    for (const tax of ITEM_TAXES) expect(YANDEX_TAX_CODES[tax]).toEqual(expect.any(Number))
  })

  it('контакт — телефон +7…, когда email не годится; без контакта — ошибка', () => {
    const { fiscalContact } = buildYandexCart(
      order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }], {
        customerEmail: '',
        customerPhone: '8 (900) 123-45-67',
      }),
      'none',
    )
    expect(fiscalContact).toBe('+79001234567')
    expect(() =>
      buildYandexCart(
        order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }], {
          customerEmail: '',
          customerPhone: '12',
        }),
        'none',
      ),
    ).toThrow(/no usable contact/)
  })

  it('сумма не сходится с итогом или нет items — ошибка, а не кривая корзина', () => {
    expect(() =>
      buildYandexCart(
        order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }], {
          totalRub: 1,
        }),
        'none',
      ),
    ).toThrow(/sum of lines/)
    expect(() => buildYandexCart(order([], { items: [] }), 'none')).toThrow(/нет загруженных items/)
  })
})
