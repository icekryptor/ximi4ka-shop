import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MicroTrustRow } from './MicroTrustRow'

describe('MicroTrustRow', () => {
  const itemsWithIcons = [
    { icon: <span data-testid="icon-shield">🛡️</span>, label: 'Безопасные реактивы' },
    { icon: <span data-testid="icon-truck">🚚</span>, label: 'Доставка от 3 дней' },
    { icon: <span data-testid="icon-return">↩️</span>, label: 'Возврат 14 дней' },
  ]

  const itemsBulletOnly = [
    { label: 'Безопасные реактивы' },
    { label: 'Доставка от 3 дней' },
    { label: 'Возврат 14 дней' },
  ]

  it('renders all item labels', () => {
    render(<MicroTrustRow items={itemsWithIcons} />)
    expect(screen.getByText('Безопасные реактивы')).toBeInTheDocument()
    expect(screen.getByText('Доставка от 3 дней')).toBeInTheDocument()
    expect(screen.getByText('Возврат 14 дней')).toBeInTheDocument()
  })

  it('uses flex-wrap layout on a ul', () => {
    const { container } = render(<MicroTrustRow items={itemsWithIcons} />)
    expect(container.firstChild).toHaveClass('flex', 'flex-wrap')
    expect((container.firstChild as HTMLElement).tagName).toBe('UL')
  })

  it('renders provided icons (cart-style emoji trust signals)', () => {
    render(<MicroTrustRow items={itemsWithIcons} />)
    expect(screen.getByTestId('icon-shield')).toBeInTheDocument()
    expect(screen.getByTestId('icon-truck')).toBeInTheDocument()
    expect(screen.getByTestId('icon-return')).toBeInTheDocument()
  })

  it('omits the brand-purple bullet pseudo when an icon is provided', () => {
    const { container } = render(<MicroTrustRow items={itemsWithIcons} />)
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(itemsWithIcons.length)
    lis.forEach((li) => {
      expect(li.className).not.toContain("before:content-['•']")
    })
  })

  it('renders brand-purple bullets via :before when no icon is provided', () => {
    const { container } = render(<MicroTrustRow items={itemsBulletOnly} />)
    const lis = container.querySelectorAll('li')
    expect(lis.length).toBe(itemsBulletOnly.length)
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
