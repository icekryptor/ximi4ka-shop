import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { CatalogPromoBanner } from './CatalogPromoBanner'

afterEach(() => cleanup())

describe('CatalogPromoBanner', () => {
  it('renders the headline, eyebrow and sub text', () => {
    const { container } = render(
      <CatalogPromoBanner
        eyebrow="Доставка"
        headline="Бесплатная доставка СДЭК от 3000 ₽"
        sub="Собираем и отправляем в день заказа."
      />,
    )
    expect(within(container).getByText('Доставка')).toBeInTheDocument()
    expect(
      within(container).getByText('Бесплатная доставка СДЭК от 3000 ₽'),
    ).toBeInTheDocument()
    expect(
      within(container).getByText('Собираем и отправляем в день заказа.'),
    ).toBeInTheDocument()
  })

  it('uses the bright gradient surface (v3.5)', () => {
    const { container } = render(
      <CatalogPromoBanner headline="Оффер" />,
    )
    const banner = container.firstElementChild as HTMLElement
    expect(banner.className).toContain('bg-[image:var(--gradient-lj-bright)]')
    expect(banner.className).toContain('rounded-[var(--radius-lj-bright)]')
  })
})
