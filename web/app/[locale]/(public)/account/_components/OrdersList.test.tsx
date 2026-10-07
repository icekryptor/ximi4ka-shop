import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AccountOrderSummary } from '@ximi4ka-shop/shared'
import { OrdersList } from './OrdersList'

const getOrders = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ getOrders }))
afterEach(() => {
  cleanup()
  getOrders.mockReset()
})

const order = (n: number, extra: Partial<AccountOrderSummary> = {}): AccountOrderSummary => ({
  orderNumber: `XM-2026-0000${n}`,
  publicToken: `tok${n}`,
  createdAt: '2026-09-20T10:00:00.000Z',
  status: 'paid',
  paymentProvider: 'tbank',
  totalRub: 2990,
  itemCount: 2,
  items: [
    {
      name: 'Набор юного химика',
      quantity: 2,
      unitPriceRub: 1495,
      lineTotalRub: 2990,
      imageUrl: null,
    },
  ],
  subtotalRub: 2990,
  discountRub: 0,
  shippingRub: 0,
  deliveryMethod: 'cdek_pvz',
  deliveryAddress: 'Москва, ул. Ленина, 1',
  shipment: null,
  ...extra,
})

describe('OrdersList', () => {
  it('пусто — приглашение в каталог', async () => {
    getOrders.mockResolvedValue({ orders: [], nextCursor: null })
    render(<OrdersList />)
    expect(await screen.findByText('Здесь появятся ваши заказы')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /каталог/i })).toHaveAttribute('href', '/catalog')
  })

  it('строка заказа: номер, дата, статус, сумма; подробности свёрнуты', async () => {
    getOrders.mockResolvedValue({ orders: [order(1)], nextCursor: null })
    render(<OrdersList />)
    const row = await screen.findByRole('button', { name: /XM-2026-00001/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Оплачен')).toBeInTheDocument()
    expect(screen.getByText(/20 сентября 2026/)).toBeInTheDocument()
    expect(within(row).getByText(/2\s?990/)).toBeInTheDocument()
    expect(screen.queryByText('Набор юного химика × 2')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Страница заказа' })).toBeNull()
  })

  it('клик по строке раскрывает подробности, повторный — сворачивает', async () => {
    getOrders.mockResolvedValue({
      orders: [
        order(1, {
          shipment: { state: 'created', trackingNumber: '123', trackingUrl: 'https://cdek/123' },
        }),
      ],
      nextCursor: null,
    })
    render(<OrdersList />)
    const row = await screen.findByRole('button', { name: /XM-2026-00001/ })
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Набор юного химика × 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Отследить посылку/ })).toHaveAttribute(
      'href',
      'https://cdek/123',
    )
    expect(screen.getByRole('link', { name: 'Страница заказа' })).toHaveAttribute(
      'href',
      '/order/XM-2026-00001#t=tok1',
    )
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Набор юного химика × 2')).toBeNull()
  })

  it('можно раскрыть несколько заказов сразу', async () => {
    getOrders.mockResolvedValue({ orders: [order(1), order(2)], nextCursor: null })
    render(<OrdersList />)
    fireEvent.click(await screen.findByRole('button', { name: /XM-2026-00001/ }))
    fireEvent.click(screen.getByRole('button', { name: /XM-2026-00002/ }))
    expect(screen.getAllByRole('link', { name: 'Страница заказа' })).toHaveLength(2)
  })

  it('«Показать ещё» догружает по курсору', async () => {
    getOrders
      .mockResolvedValueOnce({ orders: [order(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ orders: [order(2)], nextCursor: null })
    render(<OrdersList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }))
    expect(await screen.findByRole('button', { name: /XM-2026-00002/ })).toBeInTheDocument()
    expect(getOrders).toHaveBeenLastCalledWith('c1')
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })
})
