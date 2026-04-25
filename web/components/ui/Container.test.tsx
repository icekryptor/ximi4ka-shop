import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Container } from './Container'

describe('Container', () => {
  it('renders children inside a max-width wrapper', () => {
    render(<Container><span>hello</span></Container>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('applies horizontal padding utility classes', () => {
    const { container } = render(<Container>x</Container>)
    expect(container.firstChild).toHaveClass('px-4')
  })

  it('caps at max-w-[1200px]', () => {
    const { container } = render(<Container>x</Container>)
    expect(container.firstChild).toHaveClass('max-w-[1200px]')
  })
})
