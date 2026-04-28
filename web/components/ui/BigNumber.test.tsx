import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BigNumber } from './BigNumber'

describe('BigNumber', () => {
  it('renders value and label', () => {
    render(<BigNumber value={48} label="наборов" />)
    expect(screen.getByText('48')).toBeInTheDocument()
    expect(screen.getByText('наборов')).toBeInTheDocument()
  })

  it('accepts string value', () => {
    render(<BigNumber value="15000+" label="семей" />)
    expect(screen.getByText('15000+')).toBeInTheDocument()
  })

  it('renders prefix when provided', () => {
    render(<BigNumber prefix=">" value={1000} label="x" />)
    expect(screen.getByText('>1000')).toBeInTheDocument()
  })

  it('renders suffix when provided', () => {
    render(<BigNumber value={15000} suffix="+" label="x" />)
    expect(screen.getByText('15000+')).toBeInTheDocument()
  })

  it('renders mega-display value class', () => {
    const { container } = render(<BigNumber value={1} label="x" />)
    const v = container.querySelector('[data-bignumber-value]')
    expect(v?.className).toContain('text-[length:var(--text-mega)]')
  })

  it('renders accent underline beneath value', () => {
    const { container } = render(<BigNumber value={1} label="x" />)
    const u = container.querySelector('[data-bignumber-underline]')
    expect(u).not.toBeNull()
    expect(u).toHaveClass('bg-[var(--color-accent)]')
  })

  it('underline is decorative (aria-hidden)', () => {
    const { container } = render(<BigNumber value={1} label="x" />)
    const u = container.querySelector('[data-bignumber-underline]')
    expect(u?.getAttribute('aria-hidden')).toBe('true')
  })

  it('forwards className for layout overrides', () => {
    const { container } = render(<BigNumber value={1} label="x" className="items-center" />)
    expect(container.firstChild).toHaveClass('items-center')
  })
})
