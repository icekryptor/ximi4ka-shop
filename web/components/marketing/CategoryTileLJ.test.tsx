import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryTileLJ } from './CategoryTileLJ'
import type { ProductCategory } from '@ximi4ka-shop/shared'

const cat = {
  id: 'c1',
  slug: 'reaktivy',
  name: 'Реактивы',
  metaDescription: 'Описание категории',
  parentId: null,
  sortOrder: 0,
} as unknown as ProductCategory

describe('<CategoryTileLJ>', () => {
  it('renders corner mark with index', () => {
    render(<CategoryTileLJ category={cat} index={0} productCount={42} />)
    expect(screen.getByText(/arr.*C-01/i)).toBeInTheDocument()
  })

  it('renders Unbounded display name', () => {
    render(<CategoryTileLJ category={cat} index={0} productCount={42} />)
    const name = screen.getByText('Реактивы')
    expect(name.className).toContain('font-[var(--font-lj-display)]')
  })

  it('renders mono product count with correct Russian pluralization', () => {
    // 1 → "1 товар" (1st form: nominative singular)
    const { rerender } = render(<CategoryTileLJ category={cat} index={0} productCount={1} />)
    expect(screen.getByText(/1 товар →/)).toBeInTheDocument()

    // 3 → "3 товара" (2nd form: 2-4)
    rerender(<CategoryTileLJ category={cat} index={0} productCount={3} />)
    expect(screen.getByText(/3 товара →/)).toBeInTheDocument()

    // 42 → "42 товара" (last digit 2 → 2nd form). The previous "42 товаров"
    // assertion was grammatically wrong by Russian plural rules.
    rerender(<CategoryTileLJ category={cat} index={0} productCount={42} />)
    expect(screen.getByText(/42 товара →/)).toBeInTheDocument()

    // 5 → "5 товаров" (3rd form: 5-20)
    rerender(<CategoryTileLJ category={cat} index={0} productCount={5} />)
    expect(screen.getByText(/5 товаров →/)).toBeInTheDocument()
  })

  it('renders an SVG molecule decoration', () => {
    const { container } = render(<CategoryTileLJ category={cat} index={0} productCount={42} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('links to the category page', () => {
    const { container } = render(<CategoryTileLJ category={cat} index={0} productCount={42} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/categories/reaktivy')
  })
})
