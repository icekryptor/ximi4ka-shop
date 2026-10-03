import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { BlogToc } from './BlogToc'
import type { TocItem } from '@/lib/articleToc'

afterEach(() => {
  cleanup()
})

const items: TocItem[] = [
  { id: 'vvedenie', text: 'Введение', level: 2 },
  { id: 'reagenty', text: 'Реагенты', level: 3 },
  { id: 'itogi', text: 'Итоги', level: 2 },
]

describe('BlogToc', () => {
  it('рисует навигацию «Содержание» со ссылками-якорями', () => {
    render(<BlogToc items={items} />)
    const nav = screen.getByRole('navigation', { name: 'Содержание' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#vvedenie', '#reagenty', '#itogi'])
    expect(links.map((a) => a.textContent)).toEqual(['Введение', 'Реагенты', 'Итоги'])
  })

  it('помечает уровень пункта, чтобы h3 отображались вложенными', () => {
    render(<BlogToc items={items} />)
    const entries = screen.getAllByRole('listitem')
    expect(entries.map((li) => li.getAttribute('data-level'))).toEqual(['2', '3', '2'])
  })

  it('меньше трёх заголовков — оглавления нет', () => {
    const { container } = render(<BlogToc items={items.slice(0, 2)} />)
    expect(container).toBeEmptyDOMElement()
  })
})
