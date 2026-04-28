import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { ProductCard } from './ProductCard'
import type { Product, ProductImage } from '@ximi4ka-shop/shared'

afterEach(() => {
  cleanup()
})

const fixture: Product = {
  id: '1',
  slug: 'test',
  sku: null,
  name: 'Test Kit',
  shortDescription: null,
  longDescriptionBlocks: [],
  priceRub: 2490,
  compareAtPriceRub: 2990,
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

const sampleImage: ProductImage = {
  id: 'img-1',
  productId: '1',
  url: 'https://cdn.example.com/test.jpg',
  alt: 'Тестовое фото',
  sortOrder: 0,
}

describe('ProductCard', () => {
  it('renders product name, price, and stock label', () => {
    const { container } = render(<ProductCard product={fixture} />)
    const scope = within(container)
    // Name appears in <h3>; with no image, the placeholder also shows the name decoratively.
    // Use getAllByText to tolerate either case and assert at least one occurrence.
    expect(scope.getAllByText('Test Kit').length).toBeGreaterThan(0)
    expect(scope.getByText('В наличии')).toBeInTheDocument()
    // Russian currency format: "2 490 ₽" (with narrow no-break space). Match digits and ₽.
    expect(scope.getByText(/2\D490\D*₽/u)).toBeInTheDocument()
    // compareAtPriceRub shown as strikethrough
    expect(scope.getByText(/2\D990\D*₽/u)).toBeInTheDocument()
  })

  it('renders out-of-stock label', () => {
    const { container } = render(<ProductCard product={{ ...fixture, stockStatus: 'out_of_stock' }} />)
    expect(within(container).getByText('Нет в наличии')).toBeInTheDocument()
  })

  it('renders preorder label', () => {
    const { container } = render(<ProductCard product={{ ...fixture, stockStatus: 'preorder' }} />)
    expect(within(container).getByText('Предзаказ')).toBeInTheDocument()
  })

  it('links to /product/:slug', () => {
    const { container } = render(<ProductCard product={fixture} />)
    const link = within(container).getByRole('link')
    expect(link).toHaveAttribute('href', '/product/test')
  })

  it('omits compareAtPriceRub when null', () => {
    const { container } = render(<ProductCard product={{ ...fixture, compareAtPriceRub: null }} />)
    expect(within(container).queryByText(/2\D990\D*₽/u)).not.toBeInTheDocument()
  })

  it('renders <img> when product.images[0] exists', () => {
    const { container } = render(
      <ProductCard product={{ ...fixture, images: [sampleImage] }} />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', sampleImage.url)
    expect(img).toHaveAttribute('alt', sampleImage.alt)
  })

  it('does not render <img> when images is empty', () => {
    const { container } = render(<ProductCard product={{ ...fixture, images: [] }} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders discount sticker when compareAtPriceRub > priceRub', () => {
    // 1500 → 1000 = 33% off
    const { container } = render(
      <ProductCard
        product={{ ...fixture, priceRub: 1000, compareAtPriceRub: 1500 }}
      />
    )
    const sticker = within(container).getByText('−33%')
    expect(sticker).toBeInTheDocument()
    // New Sticker primitive uses -rotate-3 class for the tilted look
    expect(sticker.className).toMatch(/-rotate-3/)
  })

  it('does not render discount sticker when compareAtPriceRub <= priceRub', () => {
    const { container } = render(
      <ProductCard
        product={{ ...fixture, priceRub: 1500, compareAtPriceRub: 1000 }}
      />
    )
    expect(within(container).queryByText(/^−\d+%$/u)).not.toBeInTheDocument()
  })

  it('renders «Хит» sticker when sortOrder is in top 3', () => {
    const { container } = render(
      <ProductCard product={{ ...fixture, sortOrder: 1 }} />
    )
    const sticker = within(container).getByText('Хит')
    expect(sticker).toBeInTheDocument()
    expect(sticker.className).toMatch(/-rotate-3/)
  })

  it('does not render «Хит» sticker when sortOrder > 3', () => {
    const { container } = render(
      <ProductCard product={{ ...fixture, sortOrder: 4 }} />
    )
    expect(within(container).queryByText('Хит')).not.toBeInTheDocument()
  })

  it('does not render «Хит» sticker when sortOrder is 0 (default)', () => {
    const { container } = render(
      <ProductCard product={{ ...fixture, sortOrder: 0 }} />
    )
    expect(within(container).queryByText('Хит')).not.toBeInTheDocument()
  })

  it('uses success pill variant for in_stock', () => {
    const { container } = render(<ProductCard product={{ ...fixture, stockStatus: 'in_stock' }} />)
    const pill = within(container).getByText('В наличии')
    expect(pill.className).toMatch(/stock-success/)
  })

  it('uses warning pill variant for preorder', () => {
    const { container } = render(<ProductCard product={{ ...fixture, stockStatus: 'preorder' }} />)
    const pill = within(container).getByText('Предзаказ')
    expect(pill.className).toMatch(/stock-warning/)
  })

  it('uses danger pill variant for out_of_stock', () => {
    const { container } = render(<ProductCard product={{ ...fixture, stockStatus: 'out_of_stock' }} />)
    const pill = within(container).getByText('Нет в наличии')
    expect(pill.className).toMatch(/stock-danger/)
  })

  it('applies opacity-70 to image area when out_of_stock', () => {
    const { container } = render(
      <ProductCard
        product={{ ...fixture, stockStatus: 'out_of_stock', images: [sampleImage] }}
      />
    )
    expect(container.querySelector('.opacity-70')).not.toBeNull()
  })

  it('does not apply opacity-70 when in_stock', () => {
    const { container } = render(
      <ProductCard product={{ ...fixture, stockStatus: 'in_stock', images: [sampleImage] }} />
    )
    expect(container.querySelector('.opacity-70')).toBeNull()
  })
})
