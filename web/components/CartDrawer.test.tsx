import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CartDrawer } from './CartDrawer'
import { OPEN_CART_EVENT, loadCart, saveCart, type CartItem } from '@/lib/cart'

const mockPrefetch = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: mockPrefetch }),
}))

beforeEach(() => {
  window.localStorage.clear()
  mockPrefetch.mockClear()
})

afterEach(() => {
  cleanup()
})

const seed: CartItem[] = [
  { productId: 'a', slug: 'kit-a', name: 'Набор A', priceRub: 1000, quantity: 2 },
  { productId: 'b', slug: 'kit-b', name: 'Набор B', priceRub: 2500, quantity: 1 },
]

function openDrawer() {
  window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT))
}

describe('CartDrawer', () => {
  it('does not render a trigger button (extracted to CartButton)', () => {
    render(<CartDrawer />)
    expect(screen.queryByRole('button', { name: 'Открыть корзину' })).not.toBeInTheDocument()
  })

  it('is closed by default', () => {
    render(<CartDrawer />)
    expect(screen.queryByRole('dialog', { name: 'Корзина' })).not.toBeInTheDocument()
  })

  it('prefetches /cart and /checkout on mount so CTA navigation is instant', () => {
    render(<CartDrawer />)
    expect(mockPrefetch).toHaveBeenCalledWith('/cart')
    expect(mockPrefetch).toHaveBeenCalledWith('/checkout')
  })

  it('opens drawer on open-cart custom event', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const dialog = screen.getByRole('dialog', { name: 'Корзина' })
    expect(within(dialog).getByText('Набор A')).toBeInTheDocument()
    expect(within(dialog).getByText('Набор B')).toBeInTheDocument()
  })

  it('shows empty message when drawer opens with no items', () => {
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    expect(screen.getByText('Корзина пуста')).toBeInTheDocument()
  })

  it('remove button removes the item', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Удалить Набор A' }))
    })
    expect(loadCart().map((i) => i.productId)).toEqual(['b'])
  })

  it('plus button increments quantity', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество Набор A' }))
    })
    expect(loadCart().find((i) => i.productId === 'a')?.quantity).toBe(3)
  })

  it('minus button decrements quantity', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Уменьшить количество Набор A' }))
    })
    expect(loadCart().find((i) => i.productId === 'a')?.quantity).toBe(1)
  })

  it('minus button removes item when quantity reaches 0', () => {
    act(() => {
      saveCart([{ productId: 'a', slug: 'kit-a', name: 'Набор A', priceRub: 1000, quantity: 1 }])
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Уменьшить количество Набор A' }))
    })
    expect(loadCart()).toEqual([])
  })

  it('checkout CTA points to /checkout and the cart link to /cart', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    expect(screen.getByRole('link', { name: /оформить заказ/i })).toHaveAttribute(
      'href',
      '/checkout',
    )
    expect(screen.getByRole('link', { name: /открыть корзину/i })).toHaveAttribute(
      'href',
      '/cart',
    )
  })

  it('shows subtotal', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const dialog = screen.getByRole('dialog', { name: 'Корзина' })
    // 2*1000 + 1*2500 = 4500
    expect(within(dialog).getByText(/4[\s ]?500 ₽/)).toBeInTheDocument()
  })

  it('Escape closes the drawer', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    expect(screen.queryByRole('dialog', { name: 'Корзина' })).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog', { name: 'Корзина' })).not.toBeInTheDocument()
  })

  it('clicking backdrop closes the drawer', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть корзину' }))
    })
    expect(screen.queryByRole('dialog', { name: 'Корзина' })).not.toBeInTheDocument()
  })
})
