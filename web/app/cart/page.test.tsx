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

describe('/cart page', () => {
  it('renders empty state when cart is empty', () => {
    render(<CartPage />)
    expect(screen.getByRole('heading', { name: 'Корзина' })).toBeInTheDocument()
    expect(screen.getByText('Корзина пуста')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Вернуться на главную' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('renders items and subtotal when cart has items', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(screen.getByText('Набор A')).toBeInTheDocument()
    expect(screen.getByText('Набор B')).toBeInTheDocument()
    // 2*1000 + 1*2500 = 4500
    expect(screen.getByText(/4[\s ]?500 ₽/)).toBeInTheDocument()
  })

  it('shows delivery placeholder message', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(
      screen.getByText('Расчёт доставки — на следующем шаге'),
    ).toBeInTheDocument()
  })

  it('checkout link points to /checkout', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(screen.getByRole('link', { name: 'Оформить заказ' })).toHaveAttribute(
      'href',
      '/checkout',
    )
  })

  it('removes an item', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Удалить Набор A' }))
    })
    expect(loadCart().map((i) => i.productId)).toEqual(['b'])
  })

  it('clears the cart', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Очистить корзину' }))
    })
    expect(loadCart()).toEqual([])
  })

  it('updates quantity', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество Набор A' }))
    })
    expect(loadCart().find((i) => i.productId === 'a')?.quantity).toBe(3)
  })
})
