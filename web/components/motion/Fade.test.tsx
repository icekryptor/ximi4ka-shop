import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Fade } from './Fade'

describe('Fade', () => {
  it('renders children', () => {
    render(<Fade><span>shown</span></Fade>)
    expect(screen.getByText('shown')).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<Fade className="x">y</Fade>)
    expect(container.firstChild).toHaveClass('x')
  })
})
