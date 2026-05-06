import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SpecimenCard } from './SpecimenCard'

describe('SpecimenCard', () => {
  it('renders eyebrow with sku', () => {
    render(<SpecimenCard sku="X-30" size="card" />)
    expect(screen.getByText('ОБРАЗЕЦ № X-30')).toBeInTheDocument()
  })

  it('renders the "ФОТО ГОТОВИТСЯ" caption', () => {
    render(<SpecimenCard sku="K-12" size="card" />)
    expect(screen.getByText('ФОТО ГОТОВИТСЯ')).toBeInTheDocument()
  })

  it('renders dashed-rect SVG', () => {
    const { container } = render(<SpecimenCard sku="X-30" size="card" />)
    expect(container.querySelector('svg[data-mark="dashed-rect"]')).not.toBeNull()
  })

  it('renders hand-drawn arrow SVG', () => {
    const { container } = render(<SpecimenCard sku="X-30" size="card" />)
    expect(container.querySelector('svg[data-mark="hand-drawn-arrow"]')).not.toBeNull()
  })

  it('uses card aspect ratio classes for size="card"', () => {
    const { container } = render(<SpecimenCard sku="X-30" size="card" />)
    expect(container.firstChild).toHaveClass('aspect-[4/5]')
  })

  it('uses pdp aspect ratio classes for size="pdp"', () => {
    const { container } = render(<SpecimenCard sku="X-30" size="pdp" />)
    expect(container.firstChild).toHaveClass('aspect-square')
  })

  it('uses larger type for pdp size', () => {
    render(<SpecimenCard sku="X-30" size="pdp" />)
    const eyebrow = screen.getByText('ОБРАЗЕЦ № X-30')
    expect(eyebrow.className).toMatch(/text-lj-mono-sm|tracking-\[0\.1em\]/)
  })
})
