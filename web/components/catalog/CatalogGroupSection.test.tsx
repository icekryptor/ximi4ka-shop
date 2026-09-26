import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CatalogGroupSection } from './CatalogGroupSection'

afterEach(() => cleanup())

function renderSection(props: Partial<Parameters<typeof CatalogGroupSection>[0]> = {}) {
  return render(
    <CatalogGroupSection
      headingId="cat-1"
      title="Реактивы"
      href="/categories/reagents"
      layout="compact"
      {...props}
    >
      <div>карточка 1</div>
      <div>карточка 2</div>
    </CatalogGroupSection>,
  )
}

describe('CatalogGroupSection', () => {
  it('renders the category title in Mazzard light italic (Figma «Каталог — 1440»)', () => {
    renderSection()
    const heading = screen.getByRole('heading', { level: 2, name: 'Реактивы' })
    expect(heading).toHaveAttribute('id', 'cat-1')
    expect(heading).toHaveClass('font-lj-mazzard', 'font-light', 'italic')
    expect(screen.getByRole('region', { name: 'Реактивы' })).toBeInTheDocument()
  })

  it('links to the whole category', () => {
    renderSection()
    expect(screen.getByRole('link', { name: 'Вся категория →' })).toHaveAttribute(
      'href',
      '/categories/reagents',
    )
  })

  it('uses a 4-column grid for kits and a 6-column grid for compact groups', () => {
    renderSection({ layout: 'kit' })
    expect(screen.getByTestId('catalog-grid').className).toContain('xl:grid-cols-4')
    cleanup()
    renderSection({ layout: 'compact' })
    expect(screen.getByTestId('catalog-grid').className).toContain('xl:grid-cols-6')
  })

  it('has no view toggle unless asked for', () => {
    renderSection()
    expect(screen.queryByRole('group', { name: 'Вид карточек' })).not.toBeInTheDocument()
  })

  it('toggles between large and compact cards, starting from the given layout', () => {
    renderSection({ toggleable: true })
    const large = screen.getByRole('button', { name: 'Крупные карточки' })
    const compact = screen.getByRole('button', { name: 'Компактные карточки' })
    expect(compact).toHaveAttribute('aria-pressed', 'true')
    expect(large).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('catalog-grid').className).toContain('xl:grid-cols-6')

    fireEvent.click(large)
    expect(large).toHaveAttribute('aria-pressed', 'true')
    expect(compact).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('catalog-grid').className).toContain('xl:grid-cols-4')
    expect(screen.getByText('карточка 2')).toBeInTheDocument()

    fireEvent.click(compact)
    expect(screen.getByTestId('catalog-grid').className).toContain('xl:grid-cols-6')
  })
})
