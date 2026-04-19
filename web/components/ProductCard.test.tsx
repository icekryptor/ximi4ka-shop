import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { ProductCard } from './ProductCard'
import type { Product } from '@ximi4ka-shop/shared'

afterEach(() => {
  cleanup()
})

const fixture: Product = {
  id: '1',
  slug: 'test',
  sku: null,
  name: 'Test Kit',
  shortDescription: null,
  priceRub: 2490,
  compareAtPriceRub: 2990,
  stockStatus: 'in_stock',
  isPublished: true,
  sortOrder: 0,
  images: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('ProductCard', () => {
  it('renders product name, price, and stock label', () => {
    const { container } = render(<ProductCard product={fixture} />)
    const scope = within(container)
    expect(scope.getByText('Test Kit')).toBeInTheDocument()
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
})
