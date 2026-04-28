import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MoleculeMotifLJ } from './MoleculeMotif.lj'

describe('<MoleculeMotifLJ>', () => {
  it('renders benzene variant as a single hexagon + circle', () => {
    const { container } = render(<MoleculeMotifLJ variant="benzene" />)
    const polygons = container.querySelectorAll('polygon')
    const circles = container.querySelectorAll('circle')
    expect(polygons.length).toBe(1)
    expect(circles.length).toBe(1)
  })

  it('renders anthracene variant as three fused hexagons', () => {
    const { container } = render(<MoleculeMotifLJ variant="anthracene" />)
    const polygons = container.querySelectorAll('polygon')
    expect(polygons.length).toBe(3)
  })

  it('renders water variant with H–O–H bonds and atom labels', () => {
    const { container } = render(<MoleculeMotifLJ variant="water" />)
    const lines = container.querySelectorAll('line')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const text = container.textContent || ''
    expect(text).toContain('O')
    expect(text).toContain('H')
  })

  it('never renders C/H atom labels for benzene', () => {
    const { container } = render(<MoleculeMotifLJ variant="benzene" />)
    expect(container.textContent).not.toContain('C')
    expect(container.textContent).not.toContain('H')
  })

  it('renders methane variant as four bonds from a central point', () => {
    const { container } = render(<MoleculeMotifLJ variant="methane" />)
    const lines = container.querySelectorAll('line')
    expect(lines.length).toBe(4)
  })

  it('marks SVG as aria-hidden (decorative)', () => {
    const { container } = render(<MoleculeMotifLJ variant="benzene" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
