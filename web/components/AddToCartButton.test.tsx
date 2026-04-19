import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { AddToCartButton } from './AddToCartButton'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const inStock = {
  id: '1',
  slug: 'test',
  name: 'Test Kit',
  priceRub: 2490,
  stockStatus: 'in_stock' as const,
}

describe('AddToCartButton', () => {
  it('renders "В корзину" label for in_stock product and is enabled', () => {
    const { container } = render(<AddToCartButton product={inStock} />)
    const btn = within(container).getByRole('button')
    expect(btn).toHaveTextContent('В корзину')
    expect(btn).not.toBeDisabled()
  })

  it('renders "Нет в наличии" and is disabled for out_of_stock product', () => {
    const { container } = render(
      <AddToCartButton product={{ ...inStock, stockStatus: 'out_of_stock' }} />,
    )
    const btn = within(container).getByRole('button')
    expect(btn).toHaveTextContent('Нет в наличии')
    expect(btn).toBeDisabled()
  })

  it('logs to console when clicked', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { container } = render(<AddToCartButton product={inStock} />)
    fireEvent.click(within(container).getByRole('button'))
    expect(infoSpy).toHaveBeenCalledWith('Add to cart:', 'test')
  })
})
