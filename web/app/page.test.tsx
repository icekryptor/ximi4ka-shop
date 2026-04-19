import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Page from './page'

describe('Home page', () => {
  it('renders "Магазин Ximi4ka" heading', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: 'Магазин Ximi4ka' })).toBeInTheDocument()
  })
})
