import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Header } from './Header'
import { OPEN_CART_EVENT, saveCart, type CartItem } from '@/lib/cart'

const mockPathname = vi.fn<() => string>(() => '/')

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

beforeEach(() => {
  window.localStorage.clear()
  mockPathname.mockReturnValue('/')
})

afterEach(() => {
  cleanup()
})

const seed: CartItem[] = [
  { productId: 'a', slug: 'kit-a', name: 'Набор A', priceRub: 1000, quantity: 2 },
  { productId: 'b', slug: 'kit-b', name: 'Набор B', priceRub: 2500, quantity: 1 },
]

describe('Header', () => {
  it('renders the Ximi4ka wordmark linking to home', () => {
    render(<Header />)
    const logo = screen.getByRole('link', { name: 'Ximi4ka — на главную' })
    expect(logo).toHaveAttribute('href', '/')
  })

  it('renders all 5 primary nav links with correct hrefs', () => {
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/')
    expect(within(mainNav).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/categories',
    )
    expect(within(mainNav).getByRole('link', { name: 'О нас' })).toHaveAttribute(
      'href',
      '/o-nas',
    )
    expect(within(mainNav).getByRole('link', { name: 'Доставка' })).toHaveAttribute(
      'href',
      '/dostavka',
    )
    expect(within(mainNav).getByRole('link', { name: 'Контакты' })).toHaveAttribute(
      'href',
      '/kontakty',
    )
  })

  it('renders cart button with accessible label', () => {
    render(<Header />)
    expect(screen.getByRole('button', { name: 'Открыть корзину' })).toBeInTheDocument()
  })

  it('renders no badge when cart is empty', () => {
    render(<Header />)
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })

  it('renders count badge summing quantities', () => {
    act(() => {
      saveCart(seed)
    })
    render(<Header />)
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('3')
  })

  it('dispatches open-cart event on cart click', () => {
    render(<Header />)
    const handler = vi.fn()
    window.addEventListener(OPEN_CART_EVENT, handler)
    fireEvent.click(screen.getByRole('button', { name: 'Открыть корзину' }))
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_CART_EVENT, handler)
  })

  it('highlights the active route with aria-current=page', () => {
    mockPathname.mockReturnValue('/categories')
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(mainNav).getByRole('link', { name: 'Главная' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('treats nested category slug as active каталог', () => {
    mockPathname.mockReturnValue('/categories/slizi')
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('strips locale prefix when computing active route', () => {
    mockPathname.mockReturnValue('/ru/categories')
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('mobile burger toggles the mobile nav', () => {
    render(<Header />)
    const toggle = screen.getByRole('button', { name: 'Открыть меню' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('navigation', { name: 'Мобильная навигация' }),
    ).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Мобильная навигация' }),
    ).toBeInTheDocument()
  })

  it('does not render promo bar when headerPromoText is empty', () => {
    render(<Header headerPromoText={null} />)
    expect(screen.queryByRole('region', { name: 'Промо' })).not.toBeInTheDocument()
  })

  it('renders promo bar as a ticker with provided text', () => {
    const { container } = render(
      <Header headerPromoText="Бесплатная доставка от 3000 ₽" />,
    )
    const promo = screen.getByRole('region', { name: 'Промо' })
    expect(promo).toHaveTextContent('Бесплатная доставка от 3000 ₽')
    expect(container.querySelector('.animate-ticker-scroll')).not.toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Закрыть промо-полосу' }),
    ).not.toBeInTheDocument()
  })

  it('splits comma-separated promo text into multiple ticker items', () => {
    render(
      <Header headerPromoText="Доставка по России, Безопасно для детей" />,
    )
    const promo = screen.getByRole('region', { name: 'Промо' })
    expect(promo).toHaveTextContent('Доставка по России')
    expect(promo).toHaveTextContent('Безопасно для детей')
  })

  it('uses brand-purple for active route underline (v3)', () => {
    mockPathname.mockReturnValue('/categories')
    const { container } = render(<Header />)
    expect(
      container.querySelector('.bg-\\[var\\(--color-lj-brand\\)\\]'),
    ).not.toBeNull()
  })
})
