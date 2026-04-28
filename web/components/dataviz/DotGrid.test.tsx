import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DotGrid } from './DotGrid'

describe('<DotGrid>', () => {
  it('renders exactly N circles for total=N', () => {
    const { container } = render(<DotGrid total={161} cols={23} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(161)
  })

  it('marks the last dot with brand color', () => {
    const { container } = render(<DotGrid total={4} cols={2} />)
    const circles = container.querySelectorAll('circle')
    expect(circles[circles.length - 1].getAttribute('fill')).toBe('#836efe')
  })

  it('all non-last dots use bone color', () => {
    const { container } = render(<DotGrid total={4} cols={2} />)
    const circles = container.querySelectorAll('circle')
    expect(circles[0].getAttribute('fill')).toBe('#EFEDE6')
  })

  it('marks SVG aria-hidden', () => {
    const { container } = render(<DotGrid total={4} cols={2} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
