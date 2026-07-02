import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Header } from './Header'
import { saveCart, type CartItem } from '@/lib/cart'

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

describe('Header v3', () => {
  it('renders the ХИМИЧКА wordmark linking to home', () => {
    render(<Header />)
    const logo = screen.getByRole('link', { name: /химичка/i })
    expect(logo).toHaveAttribute('href', '/')
  })

  it('renders the wordmark as an inline SVG with the brand aria-label', () => {
    const { container } = render(<Header />)
    const svg = container.querySelector('svg[role="img"][aria-label*="ХИМИЧКА"]')
    expect(svg).not.toBeNull()
  })

  it('renders all 5 primary nav links with correct hrefs', () => {
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/categories',
    )
    expect(within(mainNav).getByRole('link', { name: 'Блог' })).toHaveAttribute(
      'href',
      '/blog',
    )
    expect(within(mainNav).getByRole('link', { name: 'О нас' })).toHaveAttribute('href', '/o-nas')
    expect(within(mainNav).getByRole('link', { name: 'Доставка' })).toHaveAttribute(
      'href',
      '/dostavka',
    )
    expect(within(mainNav).getByRole('link', { name: 'Контакты' })).toHaveAttribute(
      'href',
      '/kontakty',
    )
  })

  it('marks Блог active on nested article routes', () => {
    mockPathname.mockReturnValue('/blog/pochemu-plamya-sinee')
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Блог' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows cart label КОРЗИНА (0) when cart empty', () => {
    render(<Header />)
    const cartLink = screen.getByRole('link', { name: /корзина.*0/i })
    expect(cartLink).toHaveAttribute('href', '/cart')
  })

  it('shows cart count format КОРЗИНА · N when items > 0', () => {
    act(() => {
      saveCart(seed)
    })
    render(<Header />)
    const cartLink = screen.getByRole('link', { name: /корзина.*3/i })
    expect(cartLink).toHaveAttribute('href', '/cart')
  })

  it('highlights the active route with aria-current=page', () => {
    mockPathname.mockReturnValue('/categories')
    render(<Header />)
    const mainNav = screen.getByRole('navigation', { name: 'Основная навигация' })
    expect(within(mainNav).getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(mainNav).getByRole('link', { name: 'О нас' })).not.toHaveAttribute(
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

  it('mobile МЕНЮ button opens MobileMenuOverlay dialog', () => {
    render(<Header />)
    const menuButton = screen.getByRole('button', { name: 'Открыть меню' })
    expect(screen.queryByRole('dialog', { name: 'Меню' })).not.toBeInTheDocument()

    fireEvent.click(menuButton)

    expect(screen.getByRole('dialog', { name: 'Меню' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Закрыть меню' })).toBeInTheDocument()
  })

  it('does not render promo bar when headerPromoText is empty', () => {
    render(<Header headerPromoText={null} />)
    expect(screen.queryByRole('region', { name: 'Промо' })).not.toBeInTheDocument()
  })

  it('renders promo bar as a ticker with provided text', () => {
    const { container } = render(<Header headerPromoText="Бесплатная доставка от 3000 ₽" />)
    const promo = screen.getByRole('region', { name: 'Промо' })
    expect(promo).toHaveTextContent('Бесплатная доставка от 3000 ₽')
    expect(container.querySelector('.animate-ticker-scroll')).not.toBeNull()
  })

  it('splits comma-separated promo text into multiple ticker items', () => {
    render(<Header headerPromoText="Доставка по России, Безопасно для детей" />)
    const promo = screen.getByRole('region', { name: 'Промо' })
    expect(promo).toHaveTextContent('Доставка по России')
    expect(promo).toHaveTextContent('Безопасно для детей')
  })

  it('uses brand-purple for active route (v3)', () => {
    mockPathname.mockReturnValue('/categories')
    const { container } = render(<Header />)
    expect(
      container.querySelector('.bg-\\[var\\(--color-lj-brand\\)\\]'),
    ).not.toBeNull()
  })
})
