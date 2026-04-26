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
})
