import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Product } from '@ximi4ka-shop/shared'
import { Hero } from './Hero'

function makeProduct(id: string, name: string): Product {
  return {
    id,
    slug: id,
    sku: null,
    name,
    shortDescription: null,
    longDescriptionBlocks: [],
    priceRub: 1000,
    compareAtPriceRub: null,
    stockStatus: 'in_stock',
    isPublished: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('Hero', () => {
  it('renders the title as an h1', () => {
    render(
      <Hero
        eyebrow="Химия дома"
        title="Настоящая химия. Безопасно для детей."
        lead="Lead copy"
        primaryCta={{ label: 'Смотреть наборы', href: '/categories' }}
      />,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Настоящая химия. Безопасно для детей.',
      }),
    ).toBeInTheDocument()
  })

  it('renders the eyebrow and lead', () => {
    render(
      <Hero
        eyebrow="Химия дома"
        title="t"
        lead="Lead copy"
        primaryCta={{ label: 'Смотреть наборы', href: '/categories' }}
      />,
    )
    expect(screen.getByText('Химия дома')).toBeInTheDocument()
    expect(screen.getByText('Lead copy')).toBeInTheDocument()
  })

  it('renders both CTAs with correct hrefs', () => {
    render(
      <Hero
        eyebrow="e"
        title="t"
        lead="l"
        primaryCta={{ label: 'Смотреть наборы', href: '/categories' }}
        secondaryCta={{ label: 'Как это работает', href: '#how-it-works' }}
      />,
    )
    expect(
      screen.getByRole('link', { name: 'Смотреть наборы' }),
    ).toHaveAttribute('href', '/categories')
    expect(
      screen.getByRole('link', { name: 'Как это работает' }),
    ).toHaveAttribute('href', '#how-it-works')
  })

  it('omits the secondary CTA when not provided', () => {
    render(
      <Hero
        eyebrow="e"
        title="t"
        lead="l"
        primaryCta={{ label: 'Смотреть наборы', href: '/categories' }}
      />,
    )
    expect(
      screen.queryByRole('link', { name: 'Как это работает' }),
    ).not.toBeInTheDocument()
  })

  it('renders product names from the product stack when products are provided', () => {
    render(
      <Hero
        eyebrow="e"
        title="t"
        lead="l"
        primaryCta={{ label: 'go', href: '/x' }}
        products={[makeProduct('a', 'Alpha Kit')]}
      />,
    )
    expect(screen.getByText('Alpha Kit')).toBeInTheDocument()
  })

  it('wraps content in a dark section surface', () => {
    const { container } = render(
      <Hero
        eyebrow="e"
        title="t"
        lead="l"
        primaryCta={{ label: 'go', href: '/x' }}
      />,
    )
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section!.className).toContain('bg-[var(--color-dark-base)]')
  })

  it('includes a Ticker strip at the bottom', () => {
    const { container } = render(
      <Hero
        eyebrow="e"
        title="t"
        lead="l"
        primaryCta={{ label: 'go', href: '/x' }}
      />,
    )
    const tickerTrack = container.querySelector('.animate-ticker-scroll')
    expect(tickerTrack).not.toBeNull()
  })

  it('highlights an emphasis word with gradient text fill when present', () => {
    const { container } = render(
      <Hero
        eyebrow="e"
        title="Настоящая химия здесь"
        emphasisWord="химия"
        lead="l"
        primaryCta={{ label: 'go', href: '/x' }}
      />,
    )
    const h1 = container.querySelector('h1')
    expect(h1).not.toBeNull()
    // The whole title should still be present
    expect(h1!.textContent).toBe('Настоящая химия здесь')
    const accent = h1!.querySelector('.bg-clip-text')
    expect(accent).not.toBeNull()
    expect(accent!.textContent).toBe('химия')
  })

  it('renders the title verbatim when emphasisWord is not in the title', () => {
    const { container } = render(
      <Hero
        eyebrow="e"
        title="Hello world"
        emphasisWord="missing"
        lead="l"
        primaryCta={{ label: 'go', href: '/x' }}
      />,
    )
    const h1 = container.querySelector('h1')
    expect(h1!.textContent).toBe('Hello world')
    expect(h1!.querySelector('.bg-clip-text')).toBeNull()
  })
})
