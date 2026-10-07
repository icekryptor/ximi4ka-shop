import { describe, it, expect } from 'vitest'
import {
  SHEET_HEADER,
  TELEGRAM_TEXT_LIMIT,
  sheetRow,
  telegramCard,
  type NotifiableOrder,
} from './format.js'

const order: NotifiableOrder = {
  orderNumber: 'XM-2026-00042',
  status: 'pending',
  // 14:10 по Москве
  createdAt: new Date('2026-09-25T11:10:00Z'),
  customerName: 'Мария Иванова',
  customerPhone: '+79123456789',
  customerEmail: 'maria@example.com',
  customerTelegram: '@maria',
  deliveryMethod: 'cdek_pvz',
  deliveryAddress: {
    address: 'Новосибирск, ул. Кривощековская, 15',
    comment: 'после 18:00',
    cityCode: 270,
    deliveryPointCode: 'NSK1',
  },
  subtotalRub: 587,
  discountRub: 0,
  shippingRub: 504,
  totalRub: 1091,
  items: [
    {
      productSnapshot: { name: 'Серная кислота 7%', sku: 'H2SO4', priceRub: 119 },
      quantity: 2,
      unitPriceRub: 119,
    },
    {
      productSnapshot: { name: 'Нитрат серебра 1%', sku: 'AGNO3', priceRub: 349 },
      quantity: 1,
      unitPriceRub: 349,
    },
  ],
}

describe('sheetRow', () => {
  it('строка заказа по колонкам листа', () => {
    expect(sheetRow(order)).toEqual([
      'XM-2026-00042',
      '25.09.2026 14:10',
      'Мария Иванова',
      '+79123456789',
      'maria@example.com',
      '@maria',
      'ПВЗ NSK1 · Новосибирск, ул. Кривощековская, 15',
      'Серная кислота 7% · H2SO4 · 2 × 119 ₽\nНитрат серебра 1% · AGNO3 · 1 × 349 ₽',
      587,
      504,
      1091,
      'создан',
    ])
    expect(SHEET_HEADER).toHaveLength(12)
    expect(sheetRow(order)).toHaveLength(SHEET_HEADER.length)
  })

  it('курьер, пустые почта и Telegram, товар без артикула', () => {
    const row = sheetRow({
      ...order,
      status: 'shipped',
      customerEmail: '',
      customerTelegram: null,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: { address: 'Москва, Тверская улица, 1, кв. 12', comment: null },
      items: [
        {
          productSnapshot: { name: 'Химичка 3.0', sku: null, priceRub: 3299 },
          quantity: 1,
          unitPriceRub: 3299,
        },
      ],
    })
    expect(row[4]).toBe('')
    expect(row[5]).toBe('')
    expect(row[6]).toBe('Курьер · Москва, Тверская улица, 1, кв. 12')
    expect(row[7]).toBe('Химичка 3.0 · 1 × 3 299 ₽')
    expect(row[11]).toBe('отправлен')
  })

  it('пользовательский текст идёт как есть — формулу не выполнит режим RAW', () => {
    const row = sheetRow({ ...order, customerName: '=IMPORTXML("http://x","//a")' })
    expect(row[2]).toBe('=IMPORTXML("http://x","//a")')
  })
})

describe('telegramCard', () => {
  it('карточка нового заказа', () => {
    expect(telegramCard(order)).toBe(
      [
        '🧪 <b>Новый заказ XM-2026-00042</b> · 25.09 14:10',
        'Мария Иванова · +7 912 345-67-89 · @maria',
        'ПВЗ NSK1: Новосибирск, ул. Кривощековская, 15',
        '— Серная кислота 7% · H2SO4 · 2 × 119 ₽',
        '— Нитрат серебра 1% · AGNO3 · 1 × 349 ₽',
        'Товары 587 ₽ · доставка 504 ₽ · итого 1 091 ₽',
        'Комментарий: после 18:00',
        'Статус: создан',
      ].join('\n'),
    )
  })

  it('оптовая скидка — отдельной частью итоговой строки', () => {
    const card = telegramCard({
      ...order,
      subtotalRub: 15495,
      discountRub: 1495,
      shippingRub: 0,
      totalRub: 14000,
    })
    expect(card).toContain(
      'Товары 15 495 ₽ · оптовая скидка −1 495 ₽ · доставка бесплатно · итого 14 000 ₽',
    )
  })

  it('позиция с ценой партии: «5 шт — 99 ₽», если сумма не делится на количество без остатка', () => {
    const card = telegramCard({
      ...order,
      items: [
        {
          productSnapshot: { name: 'Пробирка', sku: 'T-1', priceRub: 29 },
          quantity: 5,
          unitPriceRub: 20,
          lineTotalRub: 99,
        },
      ],
    })
    expect(card).toContain('— Пробирка · T-1 · 5 шт — 99 ₽')
  })

  it('позиция без остатка в цене остаётся «N × цена»', () => {
    const card = telegramCard({
      ...order,
      items: [
        {
          productSnapshot: { name: 'Реактив', sku: null, priceRub: 100 },
          quantity: 10,
          unitPriceRub: 80,
          lineTotalRub: 800,
        },
      ],
    })
    expect(card).toContain('— Реактив · 10 × 80 ₽')
  })

  it('бесплатная доставка, курьер, без почты и Telegram, без комментария', () => {
    const card = telegramCard({
      ...order,
      customerTelegram: null,
      shippingRub: 0,
      totalRub: 587,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: { address: 'Москва, Тверская улица, 1', comment: null },
    })
    expect(card).toContain('Мария Иванова · +7 912 345-67-89\n')
    expect(card).toContain('Курьер: Москва, Тверская улица, 1')
    expect(card).toContain('доставка бесплатно')
    expect(card).not.toContain('Комментарий')
  })

  it('экранирует пользовательский ввод для HTML', () => {
    const card = telegramCard({
      ...order,
      customerName: '<b>Хак</b> & Co',
      deliveryAddress: { ...order.deliveryAddress, comment: '<script>' },
    })
    expect(card).toContain('&lt;b&gt;Хак&lt;/b&gt; &amp; Co')
    expect(card).toContain('Комментарий: &lt;script&gt;')
    expect(card).not.toContain('<script>')
  })

  it('длинный заказ укладывается в лимит Telegram и говорит, сколько позиций скрыто', () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      productSnapshot: {
        name: `Реактив с очень длинным названием номер ${i}`,
        sku: `SKU${i}`,
        priceRub: 99,
      },
      quantity: 1,
      unitPriceRub: 99,
    }))
    const card = telegramCard({ ...order, items })
    expect(card.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT)
    expect(card).toMatch(/— …и ещё \d+ позици(я|и|й)/)
    expect(card).toContain('Статус: создан')
  })

  it('очень длинные адрес и комментарий из «&» — карточка всё равно в лимите', () => {
    const card = telegramCard({
      ...order,
      customerName: '&'.repeat(255),
      deliveryAddress: {
        ...order.deliveryAddress,
        address: '&'.repeat(1000),
        comment: '&'.repeat(1000),
      },
    })
    expect(card.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT)
    expect(card).toContain(`Новый заказ ${order.orderNumber}`)
    expect(card).toContain(`${'&amp;'.repeat(300)}…`)
    expect(card).not.toContain('&amp;'.repeat(301))
    expect(card).toContain('Статус: создан')
  })

  it('обрезка не рвёт эмодзи пополам', () => {
    const card = telegramCard({
      ...order,
      deliveryAddress: { ...order.deliveryAddress, address: '🧪'.repeat(400), comment: null },
    })
    expect(card).toContain(`${'🧪'.repeat(300)}…`)
    // Нет «висящих» половинок суррогатной пары.
    expect(card).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
    )
  })
})
