import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Chip } from './Chip'

describe('<Chip>', () => {
  it('renders label as lowercase mono', () => {
    render(<Chip>безопасно</Chip>)
    const el = screen.getByText('безопасно')
    expect(el.className).toContain('font-lj-mono')
    expect(el.className).toContain('lowercase')
  })

  it('has rounded-full pill shape and ink border', () => {
    render(<Chip>x</Chip>)
    const el = screen.getByText('x')
    expect(el.className).toContain('rounded-full')
    expect(el.className).toContain('border-[var(--color-lj-ink)]')
  })
})
