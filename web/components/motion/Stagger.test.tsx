import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stagger } from './Stagger'

describe('Stagger', () => {
  it('renders all children', () => {
    render(
      <Stagger>
        <span>one</span>
        <span>two</span>
        <span>three</span>
      </Stagger>
    )
    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.getByText('two')).toBeInTheDocument()
    expect(screen.getByText('three')).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<Stagger className="grid">x</Stagger>)
    expect(container.firstChild).toHaveClass('grid')
  })

  it('renders nothing notable for single child', () => {
    render(<Stagger><span>solo</span></Stagger>)
    expect(screen.getByText('solo')).toBeInTheDocument()
  })
})
