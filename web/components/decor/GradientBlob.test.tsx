import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GradientBlob } from './GradientBlob'

describe('GradientBlob', () => {
  it('renders an svg', () => {
    const { container } = render(<GradientBlob />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('contains a path filled with the gradient', () => {
    const { container } = render(<GradientBlob />)
    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('fill')).toMatch(/url\(#/)
  })

  it('defines a linearGradient with brand colors', () => {
    const { container } = render(<GradientBlob />)
    const stops = container.querySelectorAll('stop')
    expect(stops.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts className for positioning', () => {
    const { container } = render(<GradientBlob className="absolute -right-40 top-0" />)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('absolute')).toBe(true)
  })

  it('is decorative (aria-hidden)', () => {
    const { container } = render(<GradientBlob />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
