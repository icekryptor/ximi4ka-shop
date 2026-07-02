import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import OrderStatusPage, { generateMetadata } from './page'

vi.mock('./_components/OrderStatusView', () => ({
  OrderStatusView: ({ orderNumber, celebrate }: { orderNumber: string; celebrate: boolean }) => (
    <div data-testid="order-status-view" data-celebrate={String(celebrate)}>
      {orderNumber}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

describe('/order/[number] page', () => {
  it('is an async Server Component', () => {
    expect(OrderStatusPage.constructor.name).toBe('AsyncFunction')
  })

  describe('generateMetadata', () => {
    it('sets a Russian title with the order number and noindex robots', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ locale: 'ru', number: 'XM-2026-00042' }),
      })
      expect(meta.title).toBe('Заказ XM-2026-00042 — Ximi4ka')
      expect(meta.robots).toEqual({ index: false, follow: false })
    })

    it('decodes a percent-encoded order number', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ locale: 'ru', number: 'XM%2D2026%2D00042' }),
      })
      expect(meta.title).toBe('Заказ XM-2026-00042 — Ximi4ka')
    })
  })

  it('passes the order number and celebrate=true for ?new=1', async () => {
    render(
      await OrderStatusPage({
        params: Promise.resolve({ locale: 'ru', number: 'XM-2026-00042' }),
        searchParams: Promise.resolve({ new: '1' }),
      }),
    )
    const view = screen.getByTestId('order-status-view')
    expect(view).toHaveTextContent('XM-2026-00042')
    expect(view).toHaveAttribute('data-celebrate', 'true')
  })

  it('celebrate=false without the query flag', async () => {
    render(
      await OrderStatusPage({
        params: Promise.resolve({ locale: 'ru', number: 'XM-2026-00042' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(screen.getByTestId('order-status-view')).toHaveAttribute(
      'data-celebrate',
      'false',
    )
  })
})
