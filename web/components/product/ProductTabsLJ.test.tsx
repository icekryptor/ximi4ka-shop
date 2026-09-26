import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductTabsLJ } from './ProductTabsLJ'

const TABS = [
  { id: 'description', label: 'Описание', content: <p>Текст описания</p> },
  { id: 'contents', label: 'Состав', content: <p>Колбы и реактивы</p> },
  { id: 'specs', label: 'Характеристики', content: <p>Возраст: 10+</p> },
]

describe('ProductTabsLJ', () => {
  it('renders nothing when there are no tabs', () => {
    const { container } = render(<ProductTabsLJ tabs={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the first tab as selected by default', () => {
    render(<ProductTabsLJ tabs={TABS} />)
    expect(screen.getByRole('tab', { name: 'Описание' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Текст описания')
  })

  it('switches the panel on click', () => {
    render(<ProductTabsLJ tabs={TABS} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Состав' }))
    expect(screen.getByRole('tab', { name: 'Состав' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Описание' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Колбы и реактивы')
  })

  it('moves between tabs with arrow keys, wrapping around', () => {
    render(<ProductTabsLJ tabs={TABS} />)
    const first = screen.getByRole('tab', { name: 'Описание' })
    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    const last = screen.getByRole('tab', { name: 'Характеристики' })
    expect(last).toHaveAttribute('aria-selected', 'true')
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'ArrowRight' })
    expect(first).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps inactive panels in the DOM (hidden) so their text stays indexable', () => {
    const { container } = render(<ProductTabsLJ tabs={TABS} />)
    const panels = container.querySelectorAll('[role="tabpanel"]')
    expect(panels.length).toBe(3)
    expect(panels[1]).toHaveAttribute('hidden')
  })
})
