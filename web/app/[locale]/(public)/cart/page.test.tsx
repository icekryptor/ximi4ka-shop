import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import CartPage from './page'
import { loadCart, saveCart, type CartItem } from '@/lib/cart'

const GIFT_PRODUCTS: Record<string, string> = {
  'azotnaya-kislota-10': 'Азотная кислота',
  'solyanaya-kislota': 'Соляная кислота',
  'iodat-kaliya': 'Йодат калия',
}

// Реактивы-подарки отдаём, остальное — как при недоступном api (дозагрузка
// категорий корзины молча пропускается).
vi.mock('@/lib/api', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api')>()),
  getPublishedProduct: async (slug: string) => {
    const name = GIFT_PRODUCTS[slug]
    if (!name) throw new Error('not found')
    return { id: `id-${slug}`, slug, name, isPublished: true, stockStatus: 'in_stock' }
  },
}))

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
    // Товары = 2*1000 + 1*2500 = 4500; доставку считает чекаут — в итог не входит.
    expect(screen.getByTestId('summary-goods')).toHaveTextContent(/4[\s ]?500 ₽/)
    expect(screen.getByText(/доставка/i)).toBeInTheDocument()
    expect(screen.getByText(/при оформлении/i)).toBeInTheDocument()
    expect(screen.getByTestId('cart-total')).toHaveTextContent(/4[\s ]?500 ₽/)
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

  it('показывает плашку подарка с тремя реактивами, когда на товары от 3000 ₽', async () => {
    act(() => {
      saveCart(seed)
    })
    render(<CartPage />)
    expect(screen.getByText('Вам подарок!')).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: /Азотная кислота/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Соляная кислота/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Йодат калия/ })).toBeInTheDocument()
  })

  it('ниже 3000 ₽ подсказывает, сколько добавить до подарка', () => {
    act(() => {
      saveCart([seed[0]!])
    })
    render(<CartPage />)
    expect(screen.queryByText('Вам подарок!')).not.toBeInTheDocument()
    expect(screen.getByTestId('gift-banner')).toHaveTextContent(/1\s000\s*₽/)
  })
})
