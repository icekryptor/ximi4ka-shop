import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Reveal } from './Reveal'

describe('Reveal', () => {
  it('renders children', () => {
    render(<Reveal><span>visible</span></Reveal>)
    expect(screen.getByText('visible')).toBeInTheDocument()
  })

  it('applies className when provided', () => {
    const { container } = render(<Reveal className="my-class">x</Reveal>)
    expect(container.firstChild).toHaveClass('my-class')
  })

  it('renders children even with delay prop', () => {
    render(<Reveal delay={0.2}><span>delayed</span></Reveal>)
    expect(screen.getByText('delayed')).toBeInTheDocument()
  })
})
