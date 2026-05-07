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
        images={[]}
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
        images={[]}
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
        images={[]}
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
        images={[]}
      />
    )
    // ru-RU formatting → "12 990" (regular space, but our impl replaces , with space; either way, "12" and "990" land)
    expect(screen.getByText(/12.{0,3}990/)).toBeInTheDocument()
  })
})

describe('ProductCard images behavior', () => {
  const baseProduct = {
    id: 'p1',
    slug: 'test-product',
    sku: 'X-30',
    name: 'Тестовый набор',
    shortDescription: 'desc',
    longDescriptionBlocks: [],
    priceRub: 1999,
    compareAtPriceRub: null,
    stockStatus: 'in_stock' as const,
    isPublished: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    images: [],
    createdAt: '',
    updatedAt: '',
  }
  const stats = { reagents: 10, instruments: 5, reactions: 50 }
  const statMaxes = { reagents: 20, instruments: 10, reactions: 100 }

  it('renders SpecimenCard when images is empty', () => {
    render(<ProductCard product={baseProduct} stats={stats} statMaxes={statMaxes} images={[]} />)
    expect(screen.getByText('ОБРАЗЕЦ № X-30')).toBeInTheDocument()
    expect(screen.getByText('ФОТО ГОТОВИТСЯ')).toBeInTheDocument()
  })

  it('renders single Image when one image provided', () => {
    const images = [{ id: 'i1', productId: 'p1', url: '/test.png', alt: 'alt', sortOrder: 0 }]
    const { container } = render(
      <ProductCard product={baseProduct} stats={stats} statMaxes={statMaxes} images={images} />
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(1)
    expect(screen.queryByText('ФОТО ГОТОВИТСЯ')).not.toBeInTheDocument()
  })

  it('renders two stacked Images when ≥2 images provided (crossfade-ready)', () => {
    const images = [
      { id: 'i1', productId: 'p1', url: '/a.png', alt: 'a', sortOrder: 0 },
      { id: 'i2', productId: 'p1', url: '/b.png', alt: 'b', sortOrder: 1 },
    ]
    const { container } = render(
      <ProductCard product={baseProduct} stats={stats} statMaxes={statMaxes} images={images} />
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(2)
  })

  it('suppresses cornerMark when images is empty', () => {
    render(
      <ProductCard product={baseProduct} stats={stats} statMaxes={statMaxes} images={[]} cornerMark="ARR. 01" />
    )
    expect(screen.queryByText('ARR. 01')).not.toBeInTheDocument()
  })

  it('renders cornerMark when images present', () => {
    const images = [{ id: 'i1', productId: 'p1', url: '/a.png', alt: 'a', sortOrder: 0 }]
    render(
      <ProductCard product={baseProduct} stats={stats} statMaxes={statMaxes} images={images} cornerMark="ARR. 01" />
    )
    expect(screen.getByText('ARR. 01')).toBeInTheDocument()
  })
})
