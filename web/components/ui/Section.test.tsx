import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Section } from './Section'

describe('Section', () => {
  it('renders children', () => {
    render(<Section><span>x</span></Section>)
    expect(screen.getByText('x')).toBeInTheDocument()
  })

  it('applies medium vertical padding by default', () => {
    const { container } = render(<Section>x</Section>)
    expect(container.firstChild).toHaveClass('py-16')
  })

  it('applies large vertical padding when size=lg', () => {
    const { container } = render(<Section size="lg">x</Section>)
    expect(container.firstChild).toHaveClass('py-24')
  })

  it('applies surface-soft background when surface=soft', () => {
    const { container } = render(<Section surface="soft">x</Section>)
    expect(container.firstChild).toHaveClass('bg-[var(--color-surface-soft)]')
  })
})
