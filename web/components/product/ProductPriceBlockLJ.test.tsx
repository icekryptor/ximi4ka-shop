import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductPriceBlockLJ } from './ProductPriceBlockLJ'

describe('<ProductPriceBlockLJ>', () => {
  it('renders price formatted ru-RU with mono ₽ postfix', () => {
    render(<ProductPriceBlockLJ priceRub={3399} />)
    // ru-RU formatting puts a non-breaking-space (U+202F) between thousands; allow any whitespace
    expect(screen.getByText(/3.{0,3}399/)).toBeInTheDocument()
    expect(screen.getByText('₽')).toBeInTheDocument()
  })

  it('renders compare-at strikethrough when higher than price', () => {
    render(<ProductPriceBlockLJ priceRub={3399} compareAtPriceRub={5000} />)
    const compare = screen.getByText(/5.{0,3}000/)
    expect(compare.className).toContain('line-through')
  })

  it('renders brand-purple discount chip when discount > 0', () => {
    render(<ProductPriceBlockLJ priceRub={3399} compareAtPriceRub={5000} />)
    // 1 - 3399/5000 = 0.32 → 32%
    const chip = screen.getByText(/−32%/)
    expect(chip).toBeInTheDocument()
    expect(chip.className).toContain('var(--color-lj-brand)')
  })

  it('omits compare-at and chip when no discount', () => {
    const { container } = render(<ProductPriceBlockLJ priceRub={3399} compareAtPriceRub={null} />)
    expect(container.querySelector('.line-through')).toBeNull()
    expect(container.textContent).not.toMatch(/−.*%/)
  })
})
