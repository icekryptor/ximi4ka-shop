import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorksStepLJ } from './HowItWorksStepLJ'

describe('<HowItWorksStepLJ>', () => {
  it('renders index, big verb, title, body, and decimal', () => {
    render(
      <HowItWorksStepLJ
        index={1}
        verb="ВЫБРАТЬ"
        title="Выберите набор"
        body="Подберите эксперимент по возрасту."
      />
    )
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('ВЫБРАТЬ')).toBeInTheDocument()
    expect(screen.getByText('Выберите набор')).toBeInTheDocument()
    expect(screen.getByText(/Подберите эксперимент/)).toBeInTheDocument()
    expect(screen.getByText('1.0')).toBeInTheDocument()
  })

  it('renders inside a NumberCell', () => {
    const { container } = render(
      <HowItWorksStepLJ index={2} verb="X" title="T" body="B" />
    )
    expect(container.querySelector('.lj-num-cell')).not.toBeNull()
  })
})
