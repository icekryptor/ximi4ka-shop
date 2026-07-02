import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Footer } from './Footer'

afterEach(() => {
  cleanup()
})

describe('<Footer> v3 colophon', () => {
  it('renders three colophon rows: ОТ, СВЯЗЬ, СТРАНИЦЫ', () => {
    render(<Footer />)
    expect(screen.getByText('ОТ')).toBeInTheDocument()
    expect(screen.getByText('СВЯЗЬ')).toBeInTheDocument()
    expect(screen.getByText('СТРАНИЦЫ')).toBeInTheDocument()
  })

  it('renders the HeaderLogo wordmark large', () => {
    const { container } = render(<Footer />)
    expect(container.querySelector('svg[role="img"][aria-label*="ХИМИЧКА"]')).not.toBeNull()
  })

  it('renders the edition tag with year', () => {
    render(<Footer />)
    expect(screen.getByText(/ред\..*2026/i)).toBeInTheDocument()
  })

  it('renders copyright', () => {
    render(<Footer />)
    expect(screen.getByText(/©\s*2023.*2026/)).toBeInTheDocument()
  })

  it('links «отследить заказ» to /orders/track in the СТРАНИЦЫ row', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: /отследить заказ/i })).toHaveAttribute(
      'href',
      '/orders/track',
    )
  })

  it('renders the methane molecule accent (preserved from Stage 5)', () => {
    const { container } = render(<Footer />)
    const svgs = container.querySelectorAll('svg')
    const methane = Array.from(svgs).find((s) => s.querySelectorAll('line').length === 4)
    expect(methane).toBeDefined()
  })
})
