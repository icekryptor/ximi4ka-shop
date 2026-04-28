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

  it('renders Магазин column with catalog link', () => {
    render(<Footer />)
    expect(screen.getByRole('heading', { name: 'Магазин' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute(
      'href',
      '/categories',
    )
  })

  it('renders Компания column links', () => {
    render(<Footer />)
    expect(screen.getByRole('heading', { name: 'Компания' })).toBeInTheDocument()
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

  it('renders Правовое column links (placeholder href)', () => {
    render(<Footer />)
    expect(screen.getByRole('heading', { name: 'Правовое' })).toBeInTheDocument()
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

  it('renders RU language placeholder', () => {
    render(<Footer />)
    expect(screen.getByLabelText('Язык: русский')).toHaveTextContent('RU')
  })

  it('renders a decorative methane MoleculeMotif accent (v3)', () => {
    const { container } = render(<Footer />)
    // methane variant has exactly 4 lines from a central point
    const svgs = container.querySelectorAll('svg')
    const methane = Array.from(svgs).find((s) => s.querySelectorAll('line').length === 4)
    expect(methane).toBeDefined()
  })
})
