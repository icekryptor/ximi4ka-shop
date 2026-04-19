import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { AddToCartButton } from './AddToCartButton'
import { loadCart } from '@/lib/cart'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
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

  it('adds product to cart when clicked', () => {
    const { container } = render(<AddToCartButton product={inStock} />)
    act(() => {
      fireEvent.click(within(container).getByRole('button'))
    })
    expect(loadCart()).toEqual([
      {
        productId: '1',
        slug: 'test',
        name: 'Test Kit',
        priceRub: 2490,
        quantity: 1,
      },
    ])
  })

  it('shows a confirmation message after click', () => {
    const { container } = render(<AddToCartButton product={inStock} />)
    act(() => {
      fireEvent.click(within(container).getByRole('button'))
    })
    expect(within(container).getByRole('status')).toHaveTextContent('Добавлено в корзину ✓')
  })

  it('does nothing when disabled (out_of_stock)', () => {
    const { container } = render(
      <AddToCartButton product={{ ...inStock, stockStatus: 'out_of_stock' }} />,
    )
    act(() => {
      fireEvent.click(within(container).getByRole('button'))
    })
    expect(loadCart()).toEqual([])
  })
})
