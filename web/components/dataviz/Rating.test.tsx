import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Rating } from './Rating'

describe('<Rating>', () => {
  it('renders N circles for "out of N" rating with fractional value', () => {
    const { container } = render(<Rating value={4.9} max={5} />)
    const circles = container.querySelectorAll('circle')
    // 4 fully filled + 1 outline + 1 partial-fill = 6
    expect(circles.length).toBe(6)
  })

  it('handles integer ratings without partial fill', () => {
    const { container } = render(<Rating value={5} max={5} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(5)
  })

  it('marks SVG aria-hidden', () => {
    const { container } = render(<Rating value={4} max={5} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
