import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlassCard } from './GlassCard'

describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard><p>отзыв</p></GlassCard>)
    expect(screen.getByText('отзыв')).toBeInTheDocument()
  })

  it('applies glassmorphic background and blur', () => {
    const { container } = render(<GlassCard>x</GlassCard>)
    expect(container.firstChild).toHaveClass('bg-[var(--color-surface-glass)]')
    expect(container.firstChild).toHaveClass('backdrop-blur-md')
  })

  it('applies large rounded corners', () => {
    const { container } = render(<GlassCard>x</GlassCard>)
    expect(container.firstChild).toHaveClass('rounded-[var(--radius-lg)]')
  })
})
