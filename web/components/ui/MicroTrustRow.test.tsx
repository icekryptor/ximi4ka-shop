import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MicroTrustRow } from './MicroTrustRow'

describe('MicroTrustRow', () => {
  const items = [
    { icon: <span data-testid="icon-shield">🛡️</span>, label: 'Безопасные реактивы' },
    { icon: <span data-testid="icon-truck">🚚</span>, label: 'Доставка от 3 дней' },
    { icon: <span data-testid="icon-return">↩️</span>, label: 'Возврат 14 дней' },
  ]

  it('renders all items with icon and label', () => {
    render(<MicroTrustRow items={items} />)
    expect(screen.getByText('Безопасные реактивы')).toBeInTheDocument()
    expect(screen.getByText('Доставка от 3 дней')).toBeInTheDocument()
    expect(screen.getByText('Возврат 14 дней')).toBeInTheDocument()
    expect(screen.getByTestId('icon-shield')).toBeInTheDocument()
    expect(screen.getByTestId('icon-truck')).toBeInTheDocument()
    expect(screen.getByTestId('icon-return')).toBeInTheDocument()
  })

  it('uses flex-wrap layout', () => {
    const { container } = render(<MicroTrustRow items={items} />)
    expect(container.firstChild).toHaveClass('flex', 'flex-wrap')
  })

  it('renders nothing when items is empty', () => {
    const { container } = render(<MicroTrustRow items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
