import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyFactsListLJ } from './KeyFactsListLJ'

describe('<KeyFactsListLJ>', () => {
  it('renders mono rows with index/label/value', () => {
    const facts = [
      { label: 'Возраст', value: '10+' },
      { label: 'Кол-во гнезд', value: '12' },
    ]
    render(<KeyFactsListLJ facts={facts} />)
    expect(screen.getByText(/01\s*\/\s*Возраст/)).toBeInTheDocument()
    expect(screen.getByText(/02\s*\/\s*Кол-во гнезд/)).toBeInTheDocument()
    expect(screen.getByText('10+')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders nothing when facts array is empty', () => {
    const { container } = render(<KeyFactsListLJ facts={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
