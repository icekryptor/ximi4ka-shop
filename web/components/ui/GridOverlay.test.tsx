import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GridOverlay } from './GridOverlay'

describe('<GridOverlay>', () => {
  it('renders cream-line grid by default', () => {
    const { container } = render(<GridOverlay />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('absolute')
    expect(el.className).toContain('inset-0')
    expect(el.style.backgroundImage).toContain('var(--color-lj-cream-line)')
  })

  it('renders ink-line grid when surface=ink', () => {
    const { container } = render(<GridOverlay surface="ink" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.backgroundImage).toContain('var(--color-lj-ink-line)')
  })

  it('respects custom size prop for grid spacing', () => {
    const { container } = render(<GridOverlay size={48} />)
    const el = container.firstChild as HTMLElement
    expect(el.style.backgroundSize).toBe('48px 48px')
  })

  it('marks itself as decorative via aria-hidden', () => {
    const { container } = render(<GridOverlay />)
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
  })
})
