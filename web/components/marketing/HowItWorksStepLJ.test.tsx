import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorksStepLJ } from './HowItWorksStepLJ'

describe('<HowItWorksStepLJ>', () => {
  it('renders the zero-padded index («01», as in the Figma StepCard), big verb, title, and body', () => {
    render(
      <HowItWorksStepLJ
        index={1}
        verb="ВЫБРАТЬ"
        title="Выберите набор"
        body="Подберите эксперимент по возрасту."
      />,
    )
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('ВЫБРАТЬ')).toBeInTheDocument()
    expect(screen.getByText('Выберите набор')).toBeInTheDocument()
    expect(screen.getByText(/Подберите эксперимент/)).toBeInTheDocument()
  })

  it('dims the big verb: 50% on mobile, 30% on desktop', () => {
    render(<HowItWorksStepLJ index={1} verb="ВЫБРАТЬ" title="T" body="B" />)
    expect(screen.getByText('ВЫБРАТЬ')).toHaveClass(
      'font-lj-mazzard',
      'opacity-50',
      'md:opacity-30',
    )
  })

  it('hides the decorative verb from screen readers (the title says the same)', () => {
    render(<HowItWorksStepLJ index={1} verb="ВЫБРАТЬ" title="T" body="B" />)
    expect(screen.getByText('ВЫБРАТЬ')).toHaveAttribute('aria-hidden', 'true')
  })

  it('sets the step title in Mazzard Regular 18', () => {
    render(<HowItWorksStepLJ index={1} verb="ВЫБРАТЬ" title="Выберите набор" body="B" />)
    const title = screen.getByRole('heading', { name: 'Выберите набор' })
    expect(title).toHaveClass('font-lj-mazzard', 'text-[1.125rem]')
    expect(title).not.toHaveClass('font-[700]')
  })

  it('does not render the decorative "шаг" / "N.0" / "процесс" labels', () => {
    render(<HowItWorksStepLJ index={1} verb="ВЫБРАТЬ" title="T" body="B" />)
    expect(screen.queryByText('шаг')).not.toBeInTheDocument()
    expect(screen.queryByText('1.0')).not.toBeInTheDocument()
    expect(screen.queryByText('процесс')).not.toBeInTheDocument()
  })

  it('carries the .lj-num-cell hook shared with NumberCell', () => {
    const { container } = render(<HowItWorksStepLJ index={2} verb="X" title="T" body="B" />)
    expect(container.querySelector('.lj-num-cell')).not.toBeNull()
  })
})
