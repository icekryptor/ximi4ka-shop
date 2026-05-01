import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MicroTrustRow } from './MicroTrustRow'

describe('MicroTrustRow', () => {
  const items = [
    { icon: <span data-testid="icon-shield">🛡️</span>, label: 'Безопасные реактивы' },
    { icon: <span data-testid="icon-truck">🚚</span>, label: 'Доставка от 3 дней' },
    { icon: <span data-testid="icon-return">↩️</span>, label: 'Возврат 14 дней' },
  ]

  it('renders all item labels', () => {
    render(<MicroTrustRow items={items} />)
    expect(screen.getByText('Безопасные реактивы')).toBeInTheDocument()
    expect(screen.getByText('Доставка от 3 дней')).toBeInTheDocument()
    expect(screen.getByText('Возврат 14 дней')).toBeInTheDocument()
  })

  it('uses flex-wrap layout on a ul', () => {
    const { container } = render(<MicroTrustRow items={items} />)
    expect(container.firstChild).toHaveClass('flex', 'flex-wrap')
    expect((container.firstChild as HTMLElement).tagName).toBe('UL')
  })

  it('renders brand-purple bullets via :before pseudo-element class', () => {
    const { container } = render(<MicroTrustRow items={items} />)
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(items.length)
    lis.forEach((li) => {
      expect(li.className).toContain("before:content-['•']")
      expect(li.className).toContain('before:text-[var(--color-lj-brand)]')
    })
  })

  it('renders nothing when items is empty', () => {
    const { container } = render(<MicroTrustRow items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
