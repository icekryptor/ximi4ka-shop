import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DarkSection } from './DarkSection'

describe('DarkSection', () => {
  it('renders children', () => {
    render(<DarkSection><span>x</span></DarkSection>)
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('applies dark base background', () => {
    const { container } = render(<DarkSection>x</DarkSection>)
    expect(container.firstChild).toHaveClass('bg-[var(--color-dark-base)]')
  })

  it('applies on-dark text color', () => {
    const { container } = render(<DarkSection>x</DarkSection>)
    expect(container.firstChild).toHaveClass('text-[var(--color-text-on-dark)]')
  })

  it('renders glow overlay when glow prop set', () => {
    const { container } = render(<DarkSection glow>x</DarkSection>)
    const glow = container.querySelector('[data-dark-glow]')
    expect(glow).not.toBeNull()
  })

  it('omits glow overlay by default', () => {
    const { container } = render(<DarkSection>x</DarkSection>)
    expect(container.querySelector('[data-dark-glow]')).toBeNull()
  })

  it('applies cinematic vertical padding by default', () => {
    const { container } = render(<DarkSection>x</DarkSection>)
    expect(container.firstChild).toHaveClass('py-24')
  })

  it('respects size=lg with larger cinematic padding', () => {
    const { container } = render(<DarkSection size="lg">x</DarkSection>)
    expect(container.firstChild).toHaveClass('py-32')
  })
})
