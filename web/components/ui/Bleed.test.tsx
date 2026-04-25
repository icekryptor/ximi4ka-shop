import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Bleed } from './Bleed'

describe('Bleed', () => {
  it('renders children', () => {
    render(<Bleed><span>full</span></Bleed>)
    expect(screen.getByText('full')).toBeInTheDocument()
  })

  it('uses negative horizontal margins to break out', () => {
    const { container } = render(<Bleed>x</Bleed>)
    expect(container.firstChild).toHaveClass('-mx-4')
  })
})
