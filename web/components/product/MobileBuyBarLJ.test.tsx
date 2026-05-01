import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileBuyBarLJ } from './MobileBuyBarLJ'

describe('<MobileBuyBarLJ>', () => {
  it('renders price + В корзину CTA', () => {
    render(<MobileBuyBarLJ priceRub={3399} onAddToCart={() => {}} disabled={false} />)
    expect(screen.getByText(/3.{0,3}399/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /в корзину/i })).toBeInTheDocument()
  })

  it('disables CTA when disabled prop is true', () => {
    render(<MobileBuyBarLJ priceRub={3399} onAddToCart={() => {}} disabled={true} />)
    expect(screen.getByRole('button', { name: /в корзину/i })).toBeDisabled()
  })

  it('calls onAddToCart when CTA clicked', () => {
    const onAdd = vi.fn()
    render(<MobileBuyBarLJ priceRub={3399} onAddToCart={onAdd} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /в корзину/i }))
    expect(onAdd).toHaveBeenCalled()
  })
})
