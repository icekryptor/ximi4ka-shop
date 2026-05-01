import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HeaderLogo } from './HeaderLogo'

describe('<HeaderLogo>', () => {
  it('renders an inline SVG with the brand aria-label', () => {
    const { container } = render(<HeaderLogo />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toMatch(/химичка/i)
  })

  it('uses currentColor fill so it inherits parent text color', () => {
    const { container } = render(<HeaderLogo />)
    const path = container.querySelector('svg path')
    expect(path?.getAttribute('fill')).toBe('currentColor')
  })

  it('respects size prop (height in rem)', () => {
    const { container } = render(<HeaderLogo size={2} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.style.height).toBe('2rem')
  })

  it('default size renders at 1.75rem (28px)', () => {
    const { container } = render(<HeaderLogo />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.style.height).toBe('1.75rem')
  })
})
