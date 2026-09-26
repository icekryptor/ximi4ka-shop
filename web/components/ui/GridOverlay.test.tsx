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

  it('renders a dashed light grid tile when surface=bright', () => {
    const { container } = render(<GridOverlay surface="bright" />)
    const el = container.firstChild as HTMLElement
    // Пунктир #F4F1FF с прозрачностью 10% (Decor/LabGrid на фиолетовом hero).
    expect(el.style.backgroundImage).toContain('data:image/svg+xml')
    expect(decodeURIComponent(el.style.backgroundImage)).toContain('stroke-dasharray')
    expect(decodeURIComponent(el.style.backgroundImage)).toContain('#F4F1FF')
    expect(el.style.backgroundSize).toBe('64px 64px')
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
