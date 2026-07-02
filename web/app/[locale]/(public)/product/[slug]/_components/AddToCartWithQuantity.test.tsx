import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AddToCartWithQuantity } from './AddToCartWithQuantity'
import { loadCart } from '@/lib/cart'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

const product = {
  id: 'p1',
  slug: 'ximichka-3',
  name: 'Химичка 3.0',
  priceRub: 3399,
  stockStatus: 'in_stock' as const,
  images: [
    {
      id: 'img1',
      productId: 'p1',
      url: '/uploads/x30-main.webp',
      alt: 'Химичка 3.0',
      sortOrder: 0,
    },
  ],
}

describe('AddToCartWithQuantity', () => {
  it('adds selected quantity with the first product image', () => {
    render(<AddToCartWithQuantity product={product} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'increase quantity' }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'В корзину →' }))
    })
    expect(loadCart()).toEqual([
      {
        productId: 'p1',
        slug: 'ximichka-3',
        name: 'Химичка 3.0',
        priceRub: 3399,
        quantity: 2,
        image: '/uploads/x30-main.webp',
      },
    ])
  })

  it('stores no image when the product has none (drawer falls back to placeholder)', () => {
    render(<AddToCartWithQuantity product={{ ...product, images: [] }} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'В корзину →' }))
    })
    expect(loadCart()[0]).not.toHaveProperty('image')
  })

  it('announces «Товар добавлен» through a persistent polite live region', () => {
    render(<AddToCartWithQuantity product={product} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'В корзину →' }))
    })
    expect(status).toHaveTextContent('Товар добавлен')
  })

  it('renders the CSS reaction burst (flash + bubbles) after adding', () => {
    render(<AddToCartWithQuantity product={product} />)
    expect(screen.queryByTestId('add-to-cart-burst')).not.toBeInTheDocument()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'В корзину →' }))
    })
    const burst = screen.getByTestId('add-to-cart-burst')
    expect(burst).toHaveAttribute('aria-hidden', 'true')
    expect(burst.querySelectorAll('.lj-bubble').length).toBeGreaterThan(2)
    expect(burst.querySelector('.lj-add-flash')).not.toBeNull()
  })

  it('does not add anything when out of stock', () => {
    render(
      <AddToCartWithQuantity
        product={{ ...product, stockStatus: 'out_of_stock' }}
      />,
    )
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Нет в наличии' }))
    })
    expect(loadCart()).toEqual([])
    expect(screen.queryByTestId('add-to-cart-burst')).not.toBeInTheDocument()
  })
})
