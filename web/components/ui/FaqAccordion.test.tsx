import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FaqAccordion } from './FaqAccordion'

describe('<FaqAccordion>', () => {
  it('renders one item per question', () => {
    const items = [
      { q: 'Как заказать?', a: 'На сайте.' },
      { q: 'Срок доставки?', a: 'От 2 дней.' },
    ]
    const { container } = render(<FaqAccordion items={items} />)
    expect(container.querySelectorAll('details').length).toBe(2)
  })

  it('renders question label in mono uppercase', () => {
    render(<FaqAccordion items={[{ q: 'Test?', a: 'Yes.' }]} />)
    const summary = screen.getByText('Test?')
    expect(summary.className).toContain('font-[var(--font-lj-mono)]')
    // The summary itself doesn't necessarily have uppercase — could be on a parent.
    // Check the closest summary element.
    const summaryEl = summary.closest('summary')
    expect(summaryEl?.className || '').toMatch(/uppercase/)
  })

  it('renders answer in italic', () => {
    render(<FaqAccordion items={[{ q: 'Q', a: 'Italic answer.' }]} />)
    const answer = screen.getByText('Italic answer.')
    expect(answer.className).toContain('italic')
  })

  it('expands when summary is clicked (native details)', () => {
    render(<FaqAccordion items={[{ q: 'Q', a: 'A' }]} />)
    const details = document.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    fireEvent.click(details.querySelector('summary')!)
    expect(details.open).toBe(true)
  })
})
