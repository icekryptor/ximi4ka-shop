import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Callout } from './Callout'

describe('<Callout>', () => {
  it('renders callout text', () => {
    render(<Callout text="48 опытов" position="right" />)
    expect(screen.getByText('48 опытов')).toBeInTheDocument()
  })

  it('positions to top-right by default with position="right"', () => {
    const { container } = render(<Callout text="x" position="right" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('right-')
  })

  it('positions to left when position="left"', () => {
    const { container } = render(<Callout text="x" position="left" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('left-')
  })

  it('mirrors arrow path when position=left', () => {
    const { container } = render(<Callout text="x" position="left" />)
    const svg = container.querySelector('svg')
    expect(svg?.style.transform).toContain('scaleX(-1)')
  })

  it('marks itself as decorative via aria-hidden', () => {
    const { container } = render(<Callout text="x" position="right" />)
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
  })

  it('respects custom topPercent', () => {
    const { container } = render(<Callout text="x" position="right" topPercent={55} />)
    const el = container.firstChild as HTMLElement
    expect(el.style.top).toBe('55%')
  })
})
