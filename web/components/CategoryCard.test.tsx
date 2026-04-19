import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { CategoryCard } from './CategoryCard'
import type { ProductCategory } from '@ximi4ka-shop/shared'

afterEach(() => {
  cleanup()
})

const fixture: ProductCategory = {
  id: 'c1',
  slug: 'himicheskie-nabory',
  name: 'Химические наборы',
  parentId: null,
  metaTitle: null,
  metaDescription: null,
  sortOrder: 0,
  translations: {},
}

describe('CategoryCard', () => {
  it('renders the category name', () => {
    const { container } = render(<CategoryCard category={fixture} />)
    expect(within(container).getByText('Химические наборы')).toBeInTheDocument()
  })

  it('links to /categories/:slug', () => {
    const { container } = render(<CategoryCard category={fixture} />)
    const link = within(container).getByRole('link')
    expect(link).toHaveAttribute('href', '/categories/himicheskie-nabory')
  })
})
