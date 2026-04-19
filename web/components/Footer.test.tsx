import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Footer } from './Footer'

afterEach(() => {
  cleanup()
})

describe('Footer', () => {
  it('renders wordmark and tagline', () => {
    render(<Footer />)
    expect(screen.getByText('Ximi4ka')).toBeInTheDocument()
    expect(
      screen.getByText('Наборы для химических экспериментов'),
    ).toBeInTheDocument()
    expect(screen.getByText('Москва, Россия')).toBeInTheDocument()
  })

  it('renders Магазин links', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/categories',
    )
    expect(screen.getByRole('link', { name: 'Все товары' })).toHaveAttribute('href', '/')
  })

  it('renders Компания links', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'О нас' })).toHaveAttribute('href', '/o-nas')
    expect(screen.getByRole('link', { name: 'Доставка и оплата' })).toHaveAttribute(
      'href',
      '/dostavka',
    )
    expect(screen.getByRole('link', { name: 'Контакты' })).toHaveAttribute(
      'href',
      '/kontakty',
    )
  })

  it('renders Правовая links (placeholder href)', () => {
    render(<Footer />)
    expect(
      screen.getByRole('link', { name: 'Политика конфиденциальности' }),
    ).toHaveAttribute('href', '#')
    expect(
      screen.getByRole('link', { name: 'Согласие на обработку данных' }),
    ).toHaveAttribute('href', '#')
  })

  it('renders copyright', () => {
    render(<Footer />)
    expect(
      screen.getByText('© 2026 Ximi4ka. Все права защищены.'),
    ).toBeInTheDocument()
  })

  it('renders social placeholder links', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', '#')
    expect(screen.getByRole('link', { name: 'ВКонтакте' })).toHaveAttribute('href', '#')
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', '#')
  })
})
