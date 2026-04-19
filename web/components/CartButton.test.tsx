import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CartButton, OPEN_CART_EVENT } from './CartButton'
import { saveCart, type CartItem } from '@/lib/cart'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

const seed: CartItem[] = [
  { productId: 'a', slug: 'kit-a', name: 'Набор A', priceRub: 1000, quantity: 2 },
  { productId: 'b', slug: 'kit-b', name: 'Набор B', priceRub: 2500, quantity: 1 },
]

describe('CartButton', () => {
  it('renders trigger with accessible label', () => {
    render(<CartButton />)
    expect(screen.getByRole('button', { name: 'Открыть корзину' })).toBeInTheDocument()
  })

  it('renders no badge when cart is empty', () => {
    render(<CartButton />)
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })

  it('renders count badge summing quantities', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartButton />)
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('3')
  })

  it('dispatches open-cart event on click', () => {
    render(<CartButton />)
    const handler = vi.fn()
    window.addEventListener(OPEN_CART_EVENT, handler)
    fireEvent.click(screen.getByRole('button', { name: 'Открыть корзину' }))
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_CART_EVENT, handler)
  })
})
