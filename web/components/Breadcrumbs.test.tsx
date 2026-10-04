import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { Breadcrumbs } from './Breadcrumbs'
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'

afterEach(() => {
  cleanup()
})

const items: BreadcrumbItem[] = [
  { name: 'Главная', href: '/' },
  { name: 'Каталог', href: '/catalog' },
  { name: 'Набор «Химичка»', href: '/product/himichka' },
]

describe('Breadcrumbs', () => {
  it('renders a labelled nav with an ordered list', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    const nav = within(container).getByRole('navigation', { name: 'breadcrumbs' })
    const list = nav.querySelector('ol')
    expect(list).not.toBeNull()
    expect(list!.querySelectorAll(':scope > li')).toHaveLength(3)
  })

  it('links every item except the last one', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    const links = within(container).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/catalog'])
  })

  it('renders the last item as plain text with aria-current="page"', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    const last = within(container).getByText('Набор «Химичка»')
    expect(last.closest('a')).toBeNull()
    expect(last).toHaveAttribute('aria-current', 'page')
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('does not link the last item even when it carries an href', () => {
    // href последнего нужен только для JSON-LD; видимой ссылки на себя не делаем.
    const { container } = render(<Breadcrumbs items={items} />)
    expect(within(container).queryByRole('link', { name: 'Набор «Химичка»' })).toBeNull()
  })

  it('hides separators from assistive technology', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    const separators = container.querySelectorAll('li > span[aria-hidden="true"]')
    expect(separators).toHaveLength(2)
    separators.forEach((s) => expect(s.textContent).toBe('/'))
  })

  it('renders a middle item without href as text, not a link', () => {
    const { container } = render(
      <Breadcrumbs
        items={[{ name: 'Главная', href: '/' }, { name: 'Раздел' }, { name: 'Страница' }]}
      />,
    )
    expect(within(container).getAllByRole('link')).toHaveLength(1)
    expect(within(container).getByText('Раздел').closest('a')).toBeNull()
  })

  it('renders a single item as the current page only', () => {
    const { container } = render(<Breadcrumbs items={[{ name: 'Главная' }]} />)
    expect(within(container).queryAllByRole('link')).toHaveLength(0)
    expect(within(container).getByText('Главная')).toHaveAttribute('aria-current', 'page')
  })

  it('shares one source of truth with the BreadcrumbList JSON-LD', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    const visible = Array.from(container.querySelectorAll('ol > li')).map((li) =>
      (li.textContent ?? '').replace(/\/$/, '').trim(),
    )
    const ld = breadcrumbJsonLd(items)
    expect(ld.itemListElement.map((e) => e.name)).toEqual(visible)
    expect(ld.itemListElement.map((e) => e.position)).toEqual([1, 2, 3])
  })
})
