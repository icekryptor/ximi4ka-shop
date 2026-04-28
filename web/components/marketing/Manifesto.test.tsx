import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Manifesto } from './Manifesto'

describe('Manifesto', () => {
  it('renders the default title as a heading', () => {
    render(<Manifesto />)
    expect(
      screen.getByRole('heading', { name: 'Что такое Химичка' }),
    ).toBeInTheDocument()
  })

  it('renders the default eyebrow', () => {
    render(<Manifesto />)
    expect(screen.getByText('О нас')).toBeInTheDocument()
  })

  it('renders the default lead paragraph', () => {
    render(<Manifesto />)
    expect(
      screen.getByText(/Безопасно\. Образовательно\. Сертифицировано\./),
    ).toBeInTheDocument()
  })

  it('renders 4 BigNumber stats by default', () => {
    const { container } = render(<Manifesto />)
    const values = container.querySelectorAll('[data-bignumber-value]')
    expect(values.length).toBe(4)
  })

  it('renders custom stats when provided', () => {
    const { container } = render(
      <Manifesto
        stats={[
          { value: 1, label: 'один' },
          { value: 2, label: 'два' },
        ]}
      />,
    )
    const values = container.querySelectorAll('[data-bignumber-value]')
    expect(values.length).toBe(2)
    expect(screen.getByText('один')).toBeInTheDocument()
    expect(screen.getByText('два')).toBeInTheDocument()
  })

  it('renders no grid when stats is empty', () => {
    const { container } = render(<Manifesto stats={[]} />)
    const values = container.querySelectorAll('[data-bignumber-value]')
    expect(values.length).toBe(0)
  })

  it('wraps content in a dark section surface', () => {
    const { container } = render(<Manifesto />)
    const section = container.querySelector('section')
    expect(section).not.toBeNull()
    expect(section!.className).toContain('bg-[var(--color-dark-base)]')
  })
})
