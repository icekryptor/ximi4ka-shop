import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyFactsList } from './KeyFactsList'

describe('KeyFactsList', () => {
  it('renders nothing when characteristics is empty', () => {
    const { container } = render(<KeyFactsList characteristics={{}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no priority keys match', () => {
    const { container } = render(
      <KeyFactsList characteristics={{ Странное: 'значение' }} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders 4 dt/dd pairs when at least 4 priority keys are present', () => {
    const { container } = render(
      <KeyFactsList
        characteristics={{
          Возраст: '10+',
          Концентрация: '5%',
          Объем: '35 мл',
          'Химическая формула': 'CuSO4',
          ГОСТ: '4165-78',
        }}
      />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(4)
    expect(container.querySelectorAll('dd')).toHaveLength(4)
  })

  it('renders fewer rows when not enough priority keys are present', () => {
    const { container } = render(
      <KeyFactsList characteristics={{ Объем: '35 мл', ГОСТ: '4165-78' }} />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(2)
  })

  it('renders correct labels and values', () => {
    render(
      <KeyFactsList
        characteristics={{ Возраст: '10+', Концентрация: '5%' }}
      />,
    )
    expect(screen.getByText('Возраст')).toBeInTheDocument()
    expect(screen.getByText('10+')).toBeInTheDocument()
    expect(screen.getByText('Концентрация')).toBeInTheDocument()
    expect(screen.getByText('5%')).toBeInTheDocument()
  })

  it('forwards className onto the root <dl>', () => {
    const { container } = render(
      <KeyFactsList
        characteristics={{ Возраст: '10+' }}
        className="my-custom-class"
      />,
    )
    const dl = container.querySelector('dl')
    expect(dl).not.toBeNull()
    expect(dl?.className).toContain('my-custom-class')
  })
})
