import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Eyebrow } from './Eyebrow'

describe('Eyebrow', () => {
  it('renders children with small-caps styling', () => {
    render(<Eyebrow>химия дома</Eyebrow>)
    const el = screen.getByText('химия дома')
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass('uppercase', 'tracking-wider')
  })
})
