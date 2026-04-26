import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Product } from '@ximi4ka-shop/shared'
import { HeroProductStack } from './HeroProductStack'

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

describe('HeroProductStack', () => {
  it('renders a fallback decorative card when products are empty', () => {
    const { container } = render(<HeroProductStack products={[]} />)
    // Outer wrapper div + the inner decorative card div, no product names
    const inner = container.querySelectorAll('div > div')
    expect(inner.length).toBeGreaterThan(0)
    expect(container.textContent).toBe('')
  })

  it('renders one card per product, up to 3', () => {
    const products = [
      makeProduct('a', 'Alpha Kit'),
      makeProduct('b', 'Beta Kit'),
      makeProduct('c', 'Gamma Kit'),
      makeProduct('d', 'Delta Kit'),
    ]
    render(<HeroProductStack products={products} />)
    expect(screen.getByText('Alpha Kit')).toBeInTheDocument()
    expect(screen.getByText('Beta Kit')).toBeInTheDocument()
    expect(screen.getByText('Gamma Kit')).toBeInTheDocument()
    expect(screen.queryByText('Delta Kit')).not.toBeInTheDocument()
  })

  it('positions product cards absolutely', () => {
    const products = [makeProduct('a', 'Alpha Kit')]
    const { container } = render(<HeroProductStack products={products} />)
    const card = container.querySelector('[style*="position: absolute"]')
    expect(card).not.toBeNull()
  })
})
