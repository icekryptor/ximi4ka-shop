import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'

vi.mock('@/lib/api', () => ({
  listCategories: vi.fn(),
}))

import CategoriesListPage, { revalidate } from './page'
import { listCategories } from '@/lib/api'

describe('CategoriesListPage', () => {
  beforeEach(() => {
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
      pagination: { limit: 100, offset: 0, total: 0 },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('is an async Server Component', () => {
    expect(CategoriesListPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('renders Главная → Каталог → Категории breadcrumbs matching the JSON-LD', async () => {
    const { container } = render(
      await CategoriesListPage({ params: Promise.resolve({ locale: 'ru' }) }),
    )
    const nav = within(container).getByRole('navigation', { name: 'breadcrumbs' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Главная', '/'],
      ['Каталог', '/catalog'],
    ])
    expect(within(nav).getByText('Категории')).toHaveAttribute('aria-current', 'page')

    const ld = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => JSON.parse(s.textContent ?? '{}'))
      .find((d) => d['@type'] === 'BreadcrumbList')
    expect(ld.itemListElement.map((e: { name: string; item: string }) => [e.name, e.item])).toEqual(
      [
        ['Главная', 'https://new.ximi4ka.ru/'],
        ['Каталог', 'https://new.ximi4ka.ru/catalog'],
        ['Категории', 'https://new.ximi4ka.ru/categories'],
      ],
    )
  })

  it('keeps breadcrumb links inside the /en locale', async () => {
    const { container } = render(
      await CategoriesListPage({ params: Promise.resolve({ locale: 'en' }) }),
    )
    const nav = within(container).getByRole('navigation', { name: 'breadcrumbs' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/en', '/en/catalog'])
  })
})
