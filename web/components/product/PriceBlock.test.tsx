import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriceBlock } from './PriceBlock'

describe('PriceBlock', () => {
  it('renders the formatted main price', () => {
    render(<PriceBlock priceRub={2490} />)
    expect(screen.getByText(/2.490.*₽/)).toBeInTheDocument()
  })

  it('renders compare-at price with strikethrough when higher', () => {
    render(<PriceBlock priceRub={2490} compareAtPriceRub={2990} />)
    const compareEl = screen.getByText(/2.990.*₽/)
    expect(compareEl).toBeInTheDocument()
    expect(compareEl).toHaveClass('line-through')
  })

  it('omits compare-at when null', () => {
    const { container } = render(<PriceBlock priceRub={2490} compareAtPriceRub={null} />)
    expect(container.querySelectorAll('.line-through').length).toBe(0)
  })

  it('omits compare-at when not higher than main price', () => {
    render(<PriceBlock priceRub={2490} compareAtPriceRub={2490} />)
    expect(screen.queryByText('2 490 ₽', { selector: '.line-through' })).not.toBeInTheDocument()
  })

  it('renders discount pill when compare-at is higher', () => {
    render(<PriceBlock priceRub={2000} compareAtPriceRub={2500} />)
    expect(screen.getByText('−20%')).toBeInTheDocument()
  })

  it('respects size=lg with display-sized main price', () => {
    const { container } = render(<PriceBlock priceRub={2490} size="lg" />)
    const main = container.querySelector('[data-price="main"]')
    expect(main?.className).toContain('var(--text-h1)')
  })

  it('respects default size=md', () => {
    const { container } = render(<PriceBlock priceRub={2490} />)
    const main = container.querySelector('[data-price="main"]')
    expect(main?.className).toContain('var(--text-h3)')
  })
})
