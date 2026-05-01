import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaginationLJ } from './PaginationLJ'

describe('<PaginationLJ>', () => {
  const baseProps = {
    basePath: '/categories/reaktivy',
    totalResults: 100,
    resultsPerPage: 12,
  }

  it('renders nothing when totalPages <= 1', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={1} totalPages={1} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders all page numbers without ellipsis when totalPages <= 7', () => {
    render(<PaginationLJ {...baseProps} currentPage={3} totalPages={5} />)
    for (const n of [1, 2, 4, 5]) {
      expect(screen.getByText(String(n))).toBeInTheDocument()
    }
    // Current page wraps in [ ]
    expect(screen.getByText(/\[\s*3\s*\]/)).toBeInTheDocument()
  })

  it('compresses to first + last + 3-around-current with two ellipses for many pages', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={6} totalPages={12} />
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-pagination-ellipsis]').length).toBe(2)
  })

  it('wraps the current page in [ ] brackets', () => {
    render(<PaginationLJ {...baseProps} currentPage={3} totalPages={5} />)
    expect(screen.getByText(/\[\s*3\s*\]/)).toBeInTheDocument()
  })

  it('renders НАЗАД as a span (disabled) on page 1', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={1} totalPages={5} />
    )
    const back = container.querySelector('[data-pagination-back]')
    expect(back?.tagName.toLowerCase()).toBe('span')
  })

  it('renders ВПЕРЁД as a span (disabled) on last page', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={5} totalPages={5} />
    )
    const next = container.querySelector('[data-pagination-next]')
    expect(next?.tagName.toLowerCase()).toBe('span')
  })

  it('renders НАЗАД as a Link with prev page href when not on page 1', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={3} totalPages={5} />
    )
    const back = container.querySelector('[data-pagination-back]') as HTMLAnchorElement
    expect(back.tagName.toLowerCase()).toBe('a')
    expect(back.getAttribute('href')).toBe('/categories/reaktivy?page=2')
  })

  it('omits ?page= for page 1 hrefs (canonical)', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={3} totalPages={5} />
    )
    const links = container.querySelectorAll('a')
    const page1Link = Array.from(links).find((a) => a.textContent?.trim() === '1')
    expect(page1Link?.getAttribute('href')).toBe('/categories/reaktivy')
  })

  it('preserves named search params on all hrefs', () => {
    const { container } = render(
      <PaginationLJ
        {...baseProps}
        currentPage={3}
        totalPages={5}
        currentParams={{ sort: 'price-asc' }}
        preserveParams={['sort']}
      />
    )
    const links = container.querySelectorAll('a')
    const page2Link = Array.from(links).find((a) => a.textContent?.trim() === '2')
    expect(page2Link?.getAttribute('href')).toBe('/categories/reaktivy?sort=price-asc&page=2')
    const page1Link = Array.from(links).find((a) => a.textContent?.trim() === '1')
    expect(page1Link?.getAttribute('href')).toBe('/categories/reaktivy?sort=price-asc')
  })

  it('renders the mono caption with correct range', () => {
    render(
      <PaginationLJ {...baseProps} currentPage={3} totalPages={9} totalResults={100} resultsPerPage={12} />
    )
    expect(screen.getByText(/стр\.\s*03\s*из\s*09\s*·\s*показано\s*25–36\s*из\s*100/i)).toBeInTheDocument()
  })

  it('caption clamps to totalResults on the last page', () => {
    render(
      <PaginationLJ {...baseProps} currentPage={5} totalPages={5} totalResults={50} resultsPerPage={12} />
    )
    expect(screen.getByText(/стр\.\s*05\s*из\s*05\s*·\s*показано\s*49–50\s*из\s*50/i)).toBeInTheDocument()
  })

  it('marks current page with aria-current="page"', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={3} totalPages={5} />
    )
    const current = container.querySelector('[aria-current="page"]')
    expect(current?.textContent).toContain('3')
  })

  it('has nav landmark with label', () => {
    const { container } = render(
      <PaginationLJ {...baseProps} currentPage={3} totalPages={5} />
    )
    const nav = container.querySelector('nav[aria-label]')
    expect(nav?.getAttribute('aria-label')).toMatch(/пагинация/i)
  })
})
