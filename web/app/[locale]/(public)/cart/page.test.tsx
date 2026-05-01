import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import CartPage from './page'
import { loadCart, saveCart, type CartItem } from '@/lib/cart'

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

describe('/cart page v3 calm', () => {
  it('renders display heading "Корзина" on empty state', () => {
    render(<CartPage />)
    expect(screen.getByRole('heading', { name: 'Корзина' })).toBeInTheDocument()
  })

  it('shows "Корзина пуста" copy + catalog CTA on empty state', () => {
    render(<CartPage />)
    expect(screen.getByText(/корзина пуста/i)).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /открыть каталог/i })
    expect(cta).toHaveAttribute('href', '/categories')
  })

  it('renders mono page label with item count and pluralization', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(screen.getByText(/корзина · 2 набора/i)).toBeInTheDocument()
  })

  it('renders display heading "Корзина" when items present', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(screen.getByRole('heading', { name: 'Корзина' })).toBeInTheDocument()
  })

  it('renders item names', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(screen.getByText('Набор A')).toBeInTheDocument()
    expect(screen.getByText('Набор B')).toBeInTheDocument()
  })

  it('renders subtotal, shipping, and total rows', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    // subtotal = 2*1000 + 1*2500 = 4500
    // shipping = 400 (hardcoded)
    // total = 4900
    expect(screen.getByText(/подытог/i)).toBeInTheDocument()
    expect(screen.getByText(/доставка/i)).toBeInTheDocument()
    expect(screen.getByText(/итого/i)).toBeInTheDocument()
  })

  it('checkout CTA points to /checkout', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    const cta = screen.getByRole('link', { name: /оформить заказ/i })
    expect(cta).toHaveAttribute('href', '/checkout')
  })

  it('removes an item via × button', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Удалить Набор A' }))
    })
    expect(loadCart().map((i) => i.productId)).toEqual(['b'])
  })

  it('updates quantity via the stepper', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    const incButtons = screen.getAllByRole('button', { name: 'increase quantity' })
    act(() => {
      fireEvent.click(incButtons[0]!)
    })
    expect(loadCart().find((i) => i.productId === 'a')?.quantity).toBe(3)
  })
})
