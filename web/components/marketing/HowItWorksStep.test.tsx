import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorksStep } from './HowItWorksStep'

describe('HowItWorksStep', () => {
  it('renders the step number, title, and body', () => {
    render(
      <HowItWorksStep
        number="01"
        title="Выберите набор"
        body="Подберите эксперимент по возрасту."
      />,
    )
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('Выберите набор')).toBeInTheDocument()
    expect(screen.getByText('Подберите эксперимент по возрасту.')).toBeInTheDocument()
  })

  it('uses the display font for the step number', () => {
    render(<HowItWorksStep number="02" title="t" body="b" />)
    const number = screen.getByText('02')
    expect(number.className).toContain('font-[var(--font-display)]')
  })

  it('renders the title as a heading', () => {
    render(<HowItWorksStep number="03" title="Заголовок" body="b" />)
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeInTheDocument()
  })

  it('renders a brand-color numeral by default (light theme)', () => {
    render(<HowItWorksStep number="04" title="t" body="b" />)
    const number = screen.getByText('04')
    expect(number.className).toContain('text-[var(--color-brand)]')
    expect(number.className).toContain('text-[length:var(--text-display)]')
  })

  it('renders an accent-color numeral when theme="dark"', () => {
    render(<HowItWorksStep number="05" title="t" body="b" theme="dark" />)
    const number = screen.getByText('05')
    expect(number.className).toContain('text-[var(--color-accent)]')
  })

  it('renders a mega-text-size numeral when theme="dark"', () => {
    render(<HowItWorksStep number="06" title="t" body="b" theme="dark" />)
    const number = screen.getByText('06')
    expect(number.className).toContain('text-[length:var(--text-mega)]')
  })

  it('flips title and body colors for the dark theme', () => {
    render(
      <HowItWorksStep
        number="07"
        title="Тема"
        body="Тело"
        theme="dark"
      />,
    )
    const heading = screen.getByRole('heading', { name: 'Тема' })
    expect(heading.className).toContain('text-[var(--color-text-on-dark)]')
    const body = screen.getByText('Тело')
    expect(body.className).toContain('text-[var(--color-text-muted-on-dark)]')
  })
})
