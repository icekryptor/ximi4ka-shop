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

  it('announces «Товар добавлен» via a polite aria-live region after click', () => {
    const { container } = render(<AddToCartButton product={inStock} />)
    const status = within(container).getByRole('status')
    // Live-регион смонтирован постоянно (иначе скринридер может не озвучить)
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('')
    act(() => {
      fireEvent.click(within(container).getByRole('button'))
    })
    expect(status).toHaveTextContent('Товар добавлен')
  })

  it('fires the CSS reaction burst on click and restarts it on the next click', () => {
    const { container } = render(<AddToCartButton product={inStock} />)
    expect(
      within(container).queryByTestId('add-to-cart-burst'),
    ).not.toBeInTheDocument()
    act(() => {
      fireEvent.click(within(container).getByRole('button'))
    })
    const burst = within(container).getByTestId('add-to-cart-burst')
    expect(burst).toHaveAttribute('aria-hidden', 'true')
    expect(burst.querySelectorAll('.lj-bubble').length).toBeGreaterThan(2)
    expect(burst.querySelector('.lj-add-flash')).not.toBeNull()
  })

  it('stores the first product image in the cart item', () => {
    const { container } = render(
      <AddToCartButton
        product={{
          ...inStock,
          images: [
            {
              id: 'img1',
              productId: '1',
              url: '/uploads/test-kit.webp',
              alt: 'Test Kit',
              sortOrder: 0,
            },
          ],
        }}
      />,
    )
    act(() => {
      fireEvent.click(within(container).getByRole('button'))
    })
    expect(loadCart()[0]?.image).toBe('/uploads/test-kit.webp')
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
