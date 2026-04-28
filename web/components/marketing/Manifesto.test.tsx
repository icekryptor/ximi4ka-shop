import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Manifesto } from './Manifesto'

describe('<Manifesto> v3', () => {
  it('renders eyebrow, statement (with brand-purple emphasis), and body', () => {
    render(
      <Manifesto
        eyebrow="02.0 / Принципы лаборатории"
        statementParts={[{ text: 'Мы делаем ' }, { text: 'химию', emphasis: true }, { text: ', а не урок.' }]}
        body="Каждый набор — запечатанный комплект."
      />
    )
    expect(screen.getByText('02.0 / Принципы лаборатории')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Мы делаем химию, а не урок.')
    expect(screen.getByText(/Каждый набор/)).toBeInTheDocument()
  })

  it('renders 4 NumberCells with their data viz children', () => {
    const { container } = render(
      <Manifesto
        eyebrow="x"
        statementParts={[{ text: 'x' }]}
        body="x"
      />
    )
    expect(container.querySelectorAll('.lj-num-cell').length).toBe(4)
  })
})
