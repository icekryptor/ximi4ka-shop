import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timeline } from './Timeline'

describe('<Timeline>', () => {
  it('renders one circle per point and marks active with brand fill', () => {
    const { container } = render(<Timeline points={['23', '24', '25', '26']} active={0} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(4)
    expect(circles[0].getAttribute('fill')).toBe('#836efe')
  })

  it('renders point labels', () => {
    render(<Timeline points={['23', '24']} active={0} />)
    expect(screen.getByText("'23")).toBeInTheDocument()
    expect(screen.getByText("'24")).toBeInTheDocument()
  })

  it('marks SVG aria-hidden (decorative)', () => {
    const { container } = render(<Timeline points={['23']} active={0} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
