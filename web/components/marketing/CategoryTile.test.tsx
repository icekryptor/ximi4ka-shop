import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { CategoryTile } from './CategoryTile'

const baseCategory: ProductCategory = {
  id: 'cat-1',
  slug: 'himicheskie-nabory',
  name: 'Химические наборы',
  metaTitle: null,
  metaDescription: 'Подборка наборов для домашних опытов',
  parentId: null,
  sortOrder: 0,
  translations: {},
}

describe('CategoryTile', () => {
  it('renders the category name', () => {
    render(<CategoryTile category={baseCategory} tintIndex={0} />)
    expect(screen.getByText('Химические наборы')).toBeInTheDocument()
  })

  it('renders metaDescription when present', () => {
    render(<CategoryTile category={baseCategory} tintIndex={0} />)
    expect(
      screen.getByText('Подборка наборов для домашних опытов'),
    ).toBeInTheDocument()
  })

  it('omits the description when metaDescription is missing', () => {
    render(
      <CategoryTile
        category={{ ...baseCategory, metaDescription: null }}
        tintIndex={0}
      />,
    )
    expect(
      screen.queryByText('Подборка наборов для домашних опытов'),
    ).not.toBeInTheDocument()
  })

  it('links to /categories/:slug', () => {
    render(<CategoryTile category={baseCategory} tintIndex={0} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/categories/himicheskie-nabory')
  })

  it('applies a tint variant based on tintIndex', () => {
    const { container: a } = render(
      <CategoryTile category={baseCategory} tintIndex={0} />,
    )
    const linkA = a.querySelector('a')!
    const { container: b } = render(
      <CategoryTile category={baseCategory} tintIndex={1} />,
    )
    const linkB = b.querySelector('a')!
    expect(linkA.className).not.toBe(linkB.className)
  })

  it('applies md:col-span-2 when span={2}', () => {
    const { container } = render(
      <CategoryTile category={baseCategory} tintIndex={0} span={2} />,
    )
    const link = container.querySelector('a')!
    expect(link.className).toContain('md:col-span-2')
  })

  it('does not apply md:col-span-2 by default', () => {
    const { container } = render(
      <CategoryTile category={baseCategory} tintIndex={0} />,
    )
    const link = container.querySelector('a')!
    expect(link.className).not.toContain('md:col-span-2')
  })

  it('renders a sticker with productCount when provided', () => {
    render(
      <CategoryTile
        category={baseCategory}
        tintIndex={0}
        productCount={29}
      />,
    )
    expect(screen.getByText('29 товаров')).toBeInTheDocument()
  })

  it('omits the sticker when productCount is not provided', () => {
    render(<CategoryTile category={baseCategory} tintIndex={0} />)
    expect(screen.queryByText(/товаров/)).not.toBeInTheDocument()
  })
})
