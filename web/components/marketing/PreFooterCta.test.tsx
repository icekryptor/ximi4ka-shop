import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreFooterCta } from './PreFooterCta'

describe('PreFooterCta', () => {
  it('renders the title as a heading', () => {
    render(
      <PreFooterCta
        title="Готовы начать эксперимент?"
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Готовы начать эксперимент?' }),
    ).toBeInTheDocument()
  })

  it('renders the lead paragraph when provided', () => {
    render(
      <PreFooterCta
        title="t"
        lead="Начните с любого набора."
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />,
    )
    expect(screen.getByText('Начните с любого набора.')).toBeInTheDocument()
  })

  it('omits the lead when not provided', () => {
    const { container } = render(
      <PreFooterCta
        title="t"
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />,
    )
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders the CTA as a link with the provided href and label', () => {
    render(
      <PreFooterCta
        title="t"
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />,
    )
    const link = screen.getByRole('link', { name: 'Открыть каталог' })
    expect(link).toHaveAttribute('href', '/categories')
  })

  it('wraps content in a dark section surface', () => {
    const { container } = render(
      <PreFooterCta
        title="t"
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />,
    )
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section!.className).toContain('bg-[var(--color-dark-base)]')
  })

  it('renders the CTA with an orange accent gradient pill', () => {
    render(
      <PreFooterCta
        title="t"
        cta={{ label: 'Открыть каталог', href: '/categories' }}
      />,
    )
    const link = screen.getByRole('link', { name: 'Открыть каталог' })
    expect(link.className).toContain('bg-[var(--gradient-accent)]')
    expect(link.className).toContain('shadow-[var(--shadow-glow-brand)]')
  })
})
