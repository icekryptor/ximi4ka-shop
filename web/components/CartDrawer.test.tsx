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
    expect(
      screen.getByRole('link', { name: /открыть страницу корзины/i }),
    ).toHaveAttribute('href', '/cart')
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

  it('renders a thumbnail img when the item has an image', () => {
    act(() => {
      saveCart([
        { ...seed[0]!, image: '/uploads/kit-a-01.webp' },
      ])
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const item = screen.getByTestId('cart-item-a')
    const img = within(item).getByRole('presentation')
    expect(img).toHaveAttribute('src', '/uploads/kit-a-01.webp')
  })

  it('renders a flask placeholder when the item has no image (legacy format)', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const item = screen.getByTestId('cart-item-a')
    expect(within(item).getByTestId('cart-thumb-placeholder')).toBeInTheDocument()
    expect(within(item).queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('shows remaining amount to free shipping below the 3000 ₽ threshold', () => {
    act(() => {
      saveCart([{ productId: 'a', slug: 'kit-a', name: 'Набор A', priceRub: 1000, quantity: 1 }])
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const progress = screen.getByTestId('free-shipping-progress')
    expect(progress).toHaveTextContent(/до бесплатной доставки осталось/i)
    expect(progress.textContent).toMatch(/2[\s ]?000\s?₽/)
    expect(screen.getByTestId('free-shipping-bar').style.width).toBe('33%')
  })

  it('shows free-shipping reached state at/above the threshold', () => {
    act(() => {
      saveCart(seed) // 2×1000 + 2500 = 4500 ≥ 3000
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const progress = screen.getByTestId('free-shipping-progress')
    expect(progress).toHaveTextContent(/бесплатная доставка/i)
    expect(progress).not.toHaveTextContent(/осталось/i)
    expect(screen.getByTestId('free-shipping-bar').style.width).toBe('100%')
  })

  it('does not render the free-shipping progress when the cart is empty', () => {
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    expect(screen.queryByTestId('free-shipping-progress')).not.toBeInTheDocument()
  })

  it('checkout CTA is a bright gradient pill', () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartDrawer />)
    act(() => {
      openDrawer()
    })
    const cta = screen.getByRole('link', { name: /оформить заказ/i })
    expect(cta.className).toContain('linear-gradient')
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
