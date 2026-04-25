import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MoleculeMotif } from './MoleculeMotif'

describe('MoleculeMotif', () => {
  it('renders an svg', () => {
    const { container } = render(<MoleculeMotif />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 400 400')
  })

  it('uses brand color when variant=vivid', () => {
    const { container } = render(<MoleculeMotif variant="vivid" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('data-variant')).toBe('vivid')
  })

  it('uses subtle by default', () => {
    const { container } = render(<MoleculeMotif />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('data-variant')).toBe('subtle')
  })

  it('accepts className for sizing', () => {
    const { container } = render(<MoleculeMotif className="absolute inset-0" />)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('absolute')).toBe(true)
    expect(svg?.classList.contains('inset-0')).toBe(true)
  })

  it('is decorative (aria-hidden)', () => {
    const { container } = render(<MoleculeMotif />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})
