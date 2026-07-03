import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Ticker } from './Ticker'

describe('Ticker', () => {
  const items = ['Доставка по России', 'Безопасные реактивы', '17+ опытов']

  it('renders all items at least once', () => {
    render(<Ticker items={items} />)
    items.forEach((item) => {
      expect(screen.getAllByText(item).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('duplicates items in the DOM for seamless loop', () => {
    render(<Ticker items={items} />)
    expect(screen.getAllByText('Доставка по России').length).toBe(2)
    expect(screen.getAllByText('Безопасные реактивы').length).toBe(2)
    expect(screen.getAllByText('17+ опытов').length).toBe(2)
  })

  it('renders nothing when items empty', () => {
    const { container } = render(<Ticker items={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('applies bright gradient surface by default (v3.5)', () => {
    const { container } = render(<Ticker items={items} />)
    expect(container.firstChild).toHaveClass(
      'bg-[image:var(--gradient-lj-bright)]',
    )
  })

  it('applies ink surface when surface=dark', () => {
    const { container } = render(<Ticker items={items} surface="dark" />)
    expect(container.firstChild).toHaveClass('bg-[var(--color-lj-ink)]')
  })

  it('applies soft cream surface when surface=soft', () => {
    const { container } = render(<Ticker items={items} surface="soft" />)
    expect(container.firstChild).toHaveClass('bg-[var(--color-lj-cream-shade)]')
  })

  it('applies infinite-scroll animation class to inner track', () => {
    const { container } = render(<Ticker items={items} />)
    const track = container.querySelector('.animate-ticker-scroll')
    expect(track).not.toBeNull()
  })

  it('forwards className for parent layout control', () => {
    const { container } = render(<Ticker items={items} className="border-t" />)
    expect(container.firstChild).toHaveClass('border-t')
  })
})
