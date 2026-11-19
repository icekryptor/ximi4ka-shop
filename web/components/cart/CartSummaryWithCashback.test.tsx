import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ getPublicSettings: vi.fn() }))
vi.mock('@/lib/api', () => api)

import { resetCoinsProgramCache } from '@/lib/useCoinsProgram'
import { CartSummaryWithCashback } from './CartSummaryWithCashback'

const totals = {
  goodsRub: 3800,
  subtotalRub: 3800,
  wholesaleRub: 0,
  discountRub: 0,
  totalRub: 3800,
}

beforeEach(() => {
  resetCoinsProgramCache()
  api.getPublicSettings.mockReset()
  document.cookie = 'ximi4ka_customer_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('CartSummaryWithCashback', () => {
  it('shows floor(total × percent) for a guest', async () => {
    api.getPublicSettings.mockResolvedValue({ coins: { cashbackPercent: 5 } })
    render(<CartSummaryWithCashback totals={totals} itemCount={1} />)
    expect(screen.queryByTestId('summary-cashback')).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('summary-cashback')).toHaveTextContent(
        'Войдите, чтобы получить 190 химикоинов',
      ),
    )
  })

  it('uses the explicit base (total minus promo) on checkout', async () => {
    api.getPublicSettings.mockResolvedValue({ coins: { cashbackPercent: 5 } })
    render(
      <CartSummaryWithCashback totals={totals} itemCount={1} cashbackBaseRub={3610} signedIn />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('summary-cashback')).toHaveTextContent('Вернём 180 химикоинов'),
    )
  })

  it('holds the row while the page still resolves the session', async () => {
    const settled = Promise.resolve({ coins: { cashbackPercent: 5 } })
    api.getPublicSettings.mockReturnValue(settled)
    render(<CartSummaryWithCashback totals={totals} itemCount={1} signedIn={null} />)
    await act(async () => {
      await settled
    })
    expect(screen.queryByTestId('summary-cashback')).toBeNull()
  })

  it('no row when the program is off', async () => {
    const settled = Promise.resolve({ coins: null })
    api.getPublicSettings.mockReturnValue(settled)
    render(<CartSummaryWithCashback totals={totals} itemCount={1} />)
    await act(async () => {
      await settled
    })
    expect(screen.queryByTestId('summary-cashback')).toBeNull()
  })

  it('no row when the cashback rounds down to zero coins', async () => {
    const settled = Promise.resolve({ coins: { cashbackPercent: 5 } })
    api.getPublicSettings.mockReturnValue(settled)
    render(<CartSummaryWithCashback totals={{ ...totals, totalRub: 0 }} itemCount={1} />)
    await act(async () => {
      await settled
    })
    expect(screen.queryByTestId('summary-cashback')).toBeNull()
  })

  it('shows the row after the extra rows (promo) and not before', async () => {
    api.getPublicSettings.mockResolvedValue({ coins: { cashbackPercent: 5 } })
    render(
      <CartSummaryWithCashback totals={totals} itemCount={1}>
        <div data-testid="promo" />
      </CartSummaryWithCashback>,
    )
    const row = await screen.findByTestId('summary-cashback')
    expect(
      screen.getByTestId('promo').compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
