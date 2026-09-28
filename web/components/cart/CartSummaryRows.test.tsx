import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CartSummaryRows } from './CartSummaryRows'

const base = {
  goodsRub: 3500,
  subtotalRub: 3099,
  wholesaleRub: 0,
  discountRub: 401,
  totalRub: 3099,
}

describe('CartSummaryRows', () => {
  it('shows goods at the «before» prices and the discount as a negative amount', () => {
    render(<CartSummaryRows totals={base} itemCount={1} />)
    expect(screen.getByTestId('summary-goods')).toHaveTextContent('3 500 ₽')
    expect(screen.getByTestId('summary-discount')).toHaveTextContent('−401 ₽')
    expect(screen.getByText(/Товары · 1 шт/i)).toBeInTheDocument()
  })

  it('mentions the wholesale part of the discount', () => {
    render(
      <CartSummaryRows
        totals={{
          ...base,
          goodsRub: 15495,
          subtotalRub: 15495,
          wholesaleRub: 1495,
          discountRub: 1495,
          totalRub: 14000,
        }}
        itemCount={5}
      />,
    )
    expect(screen.getByTestId('summary-discount')).toHaveTextContent('−1 495 ₽')
    expect(screen.getByText(/оптовая/i)).toBeInTheDocument()
  })

  it('hides the discount row when there is no discount', () => {
    render(
      <CartSummaryRows
        totals={{ goodsRub: 38, subtotalRub: 38, wholesaleRub: 0, discountRub: 0, totalRub: 38 }}
        itemCount={2}
      />,
    )
    expect(screen.queryByTestId('summary-discount')).toBeNull()
  })
})
