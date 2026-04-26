import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicTrustStripItem } from '@/lib/api'
import { TrustStrip } from './TrustStrip'

const items: PublicTrustStripItem[] = [
  { icon: '🚚', label: 'Доставка по России' },
  { icon: '🛡️', label: 'Безопасные реактивы' },
  { icon: '📚', label: 'Методические материалы' },
]

describe('TrustStrip', () => {
  it('renders every item label', () => {
    render(<TrustStrip items={items} />)
    expect(screen.getByText('Доставка по России')).toBeInTheDocument()
    expect(screen.getByText('Безопасные реактивы')).toBeInTheDocument()
    expect(screen.getByText('Методические материалы')).toBeInTheDocument()
  })

  it('renders item icons', () => {
    render(<TrustStrip items={items} />)
    expect(screen.getByText('🚚')).toBeInTheDocument()
    expect(screen.getByText('📚')).toBeInTheDocument()
  })

  it('renders nothing when items array is empty', () => {
    const { container } = render(<TrustStrip items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
