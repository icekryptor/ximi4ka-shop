import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Header } from './Header'

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

  it('renders cart button', () => {
    render(<Header />)
    expect(screen.getByRole('button', { name: 'Открыть корзину' })).toBeInTheDocument()
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

  it('treats nested category slug as active caталог', () => {
    mockPathname.mockReturnValue('/categories/slizi')
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

    const reopen = screen.getByRole('button', { name: 'Закрыть меню' })
    expect(reopen).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('navigation', { name: 'Мобильная навигация' }),
    ).toBeInTheDocument()
  })
})
