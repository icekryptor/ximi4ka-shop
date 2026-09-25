import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { HeroDetailMolecule } from './HeroDetailMolecule'

describe('Hero detail components', () => {
  it('HeroDetailMolecule renders a water molecule SVG by default', () => {
    const { container } = render(<HeroDetailMolecule />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
