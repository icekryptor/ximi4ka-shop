import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AccountOrderSummary } from '@ximi4ka-shop/shared'
import { OrderDetails } from './OrderDetails'

afterEach(cleanup)

// Точное совпадение цены; неразрывные пробелы Intl приводим к обычным.
const price = (text: string) => (content: string) => content.replace(/\s/g, ' ') === text

const order = (extra: Partial<AccountOrderSummary> = {}): AccountOrderSummary => ({
  orderNumber: 'XM-2026-00001',
  publicToken: 'tok1',
  createdAt: '2026-09-20T10:00:00.000Z',
  status: 'paid',
  paymentProvider: 'tbank',
  totalRub: 3400,
  itemCount: 3,
  items: [
    { name: 'Набор юного химика', quantity: 2, unitPriceRub: 1500, imageUrl: null },
    { name: 'Колба', quantity: 1, unitPriceRub: 400, imageUrl: null },
  ],
  subtotalRub: 3400,
  discountRub: 0,
  shippingRub: 0,
  deliveryMethod: 'cdek_pvz',
  deliveryAddress: 'Москва, ул. Ленина, 1',
  shipment: null,
  ...extra,
})

describe('OrderDetails', () => {
  it('все позиции: название × количество и цена строки', () => {
    render(<OrderDetails order={order()} />)
    expect(screen.getByText('Набор юного химика × 2')).toBeInTheDocument()
    expect(screen.getByText(price('3 000 ₽'))).toBeInTheDocument()
    expect(screen.getByText('Колба × 1')).toBeInTheDocument()
    expect(screen.getByText(price('400 ₽'))).toBeInTheDocument()
  })

  it('итоги: скидка только когда есть, доставка 0 — «бесплатно»', () => {
    const { rerender } = render(<OrderDetails order={order()} />)
    expect(screen.queryByText('Скидка')).toBeNull()
    expect(screen.getByText('бесплатно')).toBeInTheDocument()
    rerender(<OrderDetails order={order({ discountRub: 100, shippingRub: 350, totalRub: 3650 })} />)
    expect(screen.getByText('Скидка')).toBeInTheDocument()
    expect(screen.getByText(price('−100 ₽'))).toBeInTheDocument()
    expect(screen.queryByText('бесплатно')).toBeNull()
    expect(screen.getByText(price('350 ₽'))).toBeInTheDocument()
    expect(screen.getByText('Итого')).toBeInTheDocument()
  })

  it('доставка: способ и адрес', () => {
    const { rerender } = render(<OrderDetails order={order()} />)
    expect(screen.getByText(/ПВЗ СДЭК/)).toBeInTheDocument()
    expect(screen.getByText(/Москва, ул\. Ленина, 1/)).toBeInTheDocument()
    rerender(<OrderDetails order={order({ deliveryMethod: 'cdek_courier' })} />)
    expect(screen.getByText(/Курьер СДЭК/)).toBeInTheDocument()
  })

  it('«Отследить посылку» — ссылка в новой вкладке, когда трек создан', () => {
    render(
      <OrderDetails
        order={order({
          shipment: {
            state: 'created',
            trackingNumber: '123',
            trackingUrl: 'https://cdek.ru/track?order_id=123',
          },
        })}
      />,
    )
    const link = screen.getByRole('link', { name: /Отследить посылку/ })
    expect(link).toHaveAttribute('href', 'https://cdek.ru/track?order_id=123')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByText(/Трек-номер появится/)).toBeNull()
  })

  it.each([
    ['без отправления', null],
    ['ожидает СДЭК', { state: 'pending', trackingNumber: null, trackingUrl: null }],
  ] as const)('%s — подсказка вместо кнопки', (_n, shipment) => {
    render(<OrderDetails order={order({ shipment })} />)
    expect(screen.getByText('Трек-номер появится после передачи заказа в СДЭК')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Отследить посылку/ })).toBeNull()
  })

  it.each(['cancelled', 'failed'] as const)('%s — строки про трек нет вовсе', (status) => {
    render(<OrderDetails order={order({ status })} />)
    expect(screen.queryByText(/Трек-номер появится/)).toBeNull()
    expect(screen.queryByRole('link', { name: /Отследить посылку/ })).toBeNull()
  })

  it.each(['cancelled', 'failed'] as const)(
    '%s с созданным отправлением — ссылки на трек нет',
    (status) => {
      render(
        <OrderDetails
          order={order({
            status,
            shipment: {
              state: 'created',
              trackingNumber: '123',
              trackingUrl: 'https://cdek.ru/track?order_id=123',
            },
          })}
        />,
      )
      expect(screen.queryByRole('link', { name: /Отследить посылку/ })).toBeNull()
      expect(screen.queryByText(/Трек-номер появится/)).toBeNull()
    },
  )

  it('«Страница заказа» ведёт на /order/<номер>#t=<токен>', () => {
    render(<OrderDetails order={order()} />)
    expect(screen.getByRole('link', { name: 'Страница заказа' })).toHaveAttribute(
      'href',
      '/order/XM-2026-00001#t=tok1',
    )
  })
})
