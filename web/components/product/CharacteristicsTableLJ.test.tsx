import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharacteristicsTableLJ } from './CharacteristicsTableLJ'

describe('<CharacteristicsTableLJ>', () => {
  it('renders one row per characteristic', () => {
    const chars = { 'Возраст': '10+', 'Кол-во гнезд': '12', 'Объем': '50 мл' }
    const { container } = render(<CharacteristicsTableLJ characteristics={chars} />)
    expect(container.querySelectorAll('[data-char-row]').length).toBe(3)
  })

  it('renders label left + value right', () => {
    render(<CharacteristicsTableLJ characteristics={{ 'Возраст': '10+' }} />)
    expect(screen.getByText('Возраст')).toBeInTheDocument()
    expect(screen.getByText('10+')).toBeInTheDocument()
  })

  it('renders nothing when characteristics object is empty', () => {
    const { container } = render(<CharacteristicsTableLJ characteristics={{}} />)
    expect(container.firstChild).toBeNull()
  })
})
