import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroFigtag } from './HeroFigtag'
import { HeroScale } from './HeroScale'
import { HeroAnnotation } from './HeroAnnotation'
import { HeroDetailMolecule } from './HeroDetailMolecule'

describe('Hero detail components', () => {
  it('HeroFigtag shows figure number and arr label', () => {
    render(<HeroFigtag figNumber="001-A" arr="C₆H₆" />)
    expect(screen.getByText(/fig\. 001-A/i)).toBeInTheDocument()
    expect(screen.getByText(/arr\. C₆H₆/i)).toBeInTheDocument()
  })

  it('HeroScale shows unit caption', () => {
    render(<HeroScale caption="scale 1 : 1 · 200 mm" />)
    expect(screen.getByText('scale 1 : 1 · 200 mm')).toBeInTheDocument()
  })

  it('HeroAnnotation shows two-line annotation', () => {
    render(<HeroAnnotation primary="рабочая область" secondary="1080 × 1920 mm" />)
    expect(screen.getByText('рабочая область')).toBeInTheDocument()
    expect(screen.getByText('1080 × 1920 mm')).toBeInTheDocument()
  })

  it('HeroDetailMolecule renders a water molecule SVG by default', () => {
    const { container } = render(<HeroDetailMolecule />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
