import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorksStepLJ } from './HowItWorksStepLJ'

describe('<HowItWorksStepLJ>', () => {
  it('renders index as a single digit, big verb, title, and body', () => {
    render(
      <HowItWorksStepLJ
        index={1}
        verb="ВЫБРАТЬ"
        title="Выберите набор"
        body="Подберите эксперимент по возрасту."
      />,
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('01')).not.toBeInTheDocument()
    expect(screen.getByText('ВЫБРАТЬ')).toBeInTheDocument()
    expect(screen.getByText('Выберите набор')).toBeInTheDocument()
    expect(screen.getByText(/Подберите эксперимент/)).toBeInTheDocument()
  })

  it('does not render the decorative "шаг" / "N.0" / "процесс" labels', () => {
    render(<HowItWorksStepLJ index={1} verb="ВЫБРАТЬ" title="T" body="B" />)
    expect(screen.queryByText('шаг')).not.toBeInTheDocument()
    expect(screen.queryByText('1.0')).not.toBeInTheDocument()
    expect(screen.queryByText('процесс')).not.toBeInTheDocument()
  })

  it('renders inside a NumberCell', () => {
    const { container } = render(<HowItWorksStepLJ index={2} verb="X" title="T" body="B" />)
    expect(container.querySelector('.lj-num-cell')).not.toBeNull()
  })
})
