import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Scientific } from './Scientific'

describe('<Scientific>', () => {
  it('renders mantissa, base, exponent, and units', () => {
    render(<Scientific mantissa="2" base="10" exponent="4" units="людей" />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/людей/i)).toBeInTheDocument()
  })

  it('renders multiplier symbol', () => {
    render(<Scientific mantissa="2" base="10" exponent="4" units="x" />)
    expect(screen.getByText('×')).toBeInTheDocument()
  })
})
