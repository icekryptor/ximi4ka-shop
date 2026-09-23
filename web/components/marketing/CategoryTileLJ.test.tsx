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
    expect(name.className).toContain('font-lj-display')
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

  it('shows neutral «смотреть →» instead of «0 товаров» when count is unknown', () => {
    render(<CategoryTileLJ category={cat} index={0} productCount={0} />)
    expect(screen.getByText('смотреть →')).toBeInTheDocument()
    expect(screen.queryByText(/0 товаров/)).toBeNull()
  })

  it('renders as a bright gradient container with large radius (v3.5)', () => {
    const { container } = render(
      <CategoryTileLJ category={cat} index={0} productCount={42} />,
    )
    const link = container.querySelector('a')
    expect(link?.className).toContain('bg-[image:var(--gradient-lj-bright)]')
    expect(link?.className).toContain('rounded-[var(--radius-lj-bright)]')
    expect(link?.className).toContain('lj-lift')
  })

  it('falls back to the gradient + SVG molecule for a category without art', () => {
    const plain = { ...cat, slug: 'novaya-kategoriya' } as ProductCategory
    const { container } = render(<CategoryTileLJ category={plain} index={0} productCount={42} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it.each([
    ['kits', '/img/categories/kits.webp'],
    ['combo', '/img/categories/combo.webp'],
    ['reagents', '/img/categories/reagents.webp'],
    ['equipment', '/img/categories/equipment.webp'],
    ['print', '/img/categories/print.webp'],
  ])('shows the photo card for %s', (slug, src) => {
    const withArt = { ...cat, slug } as ProductCategory
    const { container } = render(<CategoryTileLJ category={withArt} index={0} productCount={42} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    // next/image в тестах отдаёт src как есть либо через /_next/image?url=…
    expect(decodeURIComponent(img!.getAttribute('src') ?? '')).toContain(src)
    // Картинка декоративная: название категории уже есть в заголовке.
    expect(img!.getAttribute('alt')).toBe('')
    // Молекула поверх фото спорила бы с ним — у фото-карточки её нет.
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps the name readable over the photo', () => {
    const withArt = { ...cat, slug: 'kits' } as ProductCategory
    render(<CategoryTileLJ category={withArt} index={0} productCount={42} />)
    expect(screen.getByRole('heading', { name: 'Реактивы' })).toBeInTheDocument()
  })

  it('links to the category page', () => {
    const { container } = render(<CategoryTileLJ category={cat} index={0} productCount={42} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/categories/reaktivy')
  })
})
