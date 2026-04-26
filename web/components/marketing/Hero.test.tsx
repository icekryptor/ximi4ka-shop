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
})
