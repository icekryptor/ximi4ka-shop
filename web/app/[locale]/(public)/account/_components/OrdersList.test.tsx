import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  items: [{ name: 'Набор юного химика', quantity: 2, imageUrl: null }],
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

  it('карточка ведёт на страницу заказа с секретом, есть статус, сумма, трек', async () => {
    getOrders.mockResolvedValue({
      orders: [
        order(1, {
          shipment: { state: 'created', trackingNumber: '123', trackingUrl: 'https://cdek/123' },
        }),
      ],
      nextCursor: null,
    })
    render(<OrdersList />)
    const link = await screen.findByRole('link', { name: /XM-2026-00001/ })
    expect(link).toHaveAttribute('href', '/order/XM-2026-00001#t=tok1')
    expect(screen.getByText('Оплачен')).toBeInTheDocument()
    expect(screen.getByText(/2\s?990/)).toBeInTheDocument()
    expect(screen.getByText(/Трек СДЭК: 123/)).toBeInTheDocument()
  })

  it('«Показать ещё» догружает по курсору', async () => {
    getOrders
      .mockResolvedValueOnce({ orders: [order(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ orders: [order(2)], nextCursor: null })
    render(<OrdersList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }))
    expect(await screen.findByRole('link', { name: /XM-2026-00002/ })).toBeInTheDocument()
    expect(getOrders).toHaveBeenLastCalledWith('c1')
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })
})
