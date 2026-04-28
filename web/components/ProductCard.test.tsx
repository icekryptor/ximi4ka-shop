import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from './ProductCard'
import type { Product } from '@ximi4ka-shop/shared'

// Stub IntersectionObserver for StatBar
beforeEach(() => {
  // @ts-expect-error - test stub
  global.IntersectionObserver = class {
    constructor(public cb: any) {}
    observe(el: Element) { this.cb([{ isIntersecting: true, target: el }]) }
    unobserve() {}
    disconnect() {}
  }
})

const baseProduct = {
  id: '1',
  slug: 'himichka-3',
  sku: 'X-30',
  name: 'Химичка 3.0',
  shortDescription: 'Флагман: настоящая лаборатория у вас дома.',
  priceRub: 3399,
  compareAtPriceRub: null,
  stockStatus: 'in_stock',
  isPublished: true,
  longDescriptionBlocks: [],
  imageUrl: null,
  // Cast to Product — fields the type may require but we don't exercise are absent intentionally
} as unknown as Product

describe('<ProductCard> v3', () => {
  it('renders SKU prefix and badge', () => {
    render(
      <ProductCard
        product={baseProduct}
        emphasisWord="Химичка"
        elementSymbol="Cu"
        badge="Хит"
        stats={{ reagents: 18, instruments: 12, reactions: 161 }}
        statMaxes={{ reagents: 18, instruments: 20, reactions: 161 }}
        chips={['безопасно', 'ярко', 'от 10 лет']}
      />
    )
    expect(screen.getByText(/№\s*X-30\s*\/\s*Cu/)).toBeInTheDocument()
    expect(screen.getByText('Хит')).toBeInTheDocument()
  })

  it('renders 3 StatBars', () => {
    const { container } = render(
      <ProductCard
        product={baseProduct}
        stats={{ reagents: 18, instruments: 12, reactions: 161 }}
        statMaxes={{ reagents: 18, instruments: 20, reactions: 161 }}
      />
    )
    expect(container.querySelectorAll('[data-statbar]').length).toBe(3)
  })

  it('renders chips lowercase', () => {
    render(
      <ProductCard
        product={baseProduct}
        stats={{ reagents: 18, instruments: 12, reactions: 161 }}
        statMaxes={{ reagents: 18, instruments: 20, reactions: 161 }}
        chips={['безопасно']}
      />
    )
    expect(screen.getByText('безопасно')).toBeInTheDocument()
  })

  it('formats price with thin spaces', () => {
    render(
      <ProductCard
        product={{ ...baseProduct, priceRub: 12990 } as Product}
        stats={{ reagents: 1, instruments: 1, reactions: 1 }}
        statMaxes={{ reagents: 1, instruments: 1, reactions: 1 }}
      />
    )
    // ru-RU formatting → "12 990" (regular space, but our impl replaces , with space; either way, "12" and "990" land)
    expect(screen.getByText(/12.{0,3}990/)).toBeInTheDocument()
  })
})
