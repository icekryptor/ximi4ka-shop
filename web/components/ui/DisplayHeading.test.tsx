import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayHeading } from './DisplayHeading'

describe('DisplayHeading', () => {
  it('defaults to h1', () => {
    render(<DisplayHeading>Заголовок</DisplayHeading>)
    expect(screen.getByRole('heading', { level: 1, name: 'Заголовок' })).toBeInTheDocument()
  })

  it('respects as prop', () => {
    render(<DisplayHeading as="h2">x</DisplayHeading>)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('uses Mazzard display font family', () => {
    const { container } = render(<DisplayHeading>x</DisplayHeading>)
    expect(container.firstChild).toHaveClass('font-display')
  })
})
