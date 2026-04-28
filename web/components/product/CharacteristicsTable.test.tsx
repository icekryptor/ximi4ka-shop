import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharacteristicsTable } from './CharacteristicsTable'

describe('CharacteristicsTable', () => {
  it('renders nothing when fewer than 4 keys', () => {
    const { container } = render(
      <CharacteristicsTable
        characteristics={{ A: '1', B: '2', C: '3' }}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a table with all keys when there are 4 or more', () => {
    const { container } = render(
      <CharacteristicsTable
        characteristics={{ A: '1', B: '2', C: '3', D: '4', E: '5' }}
      />,
    )
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('tr')).toHaveLength(5)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders rows in insertion order', () => {
    const { container } = render(
      <CharacteristicsTable
        characteristics={{
          Объем: '35 мл',
          Концентрация: '5%',
          ГОСТ: '4165-78',
          Производитель: 'Россия',
        }}
      />,
    )
    const ths = Array.from(container.querySelectorAll('th')).map(
      (el) => el.textContent,
    )
    expect(ths).toEqual(['Объем', 'Концентрация', 'ГОСТ', 'Производитель'])
  })

  it('forwards className onto the root <table>', () => {
    const { container } = render(
      <CharacteristicsTable
        characteristics={{ A: '1', B: '2', C: '3', D: '4' }}
        className="my-custom"
      />,
    )
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.className).toContain('my-custom')
  })

  it('each row has a th[scope=row] paired with a td', () => {
    const { container } = render(
      <CharacteristicsTable
        characteristics={{ A: '1', B: '2', C: '3', D: '4' }}
      />,
    )
    const rows = container.querySelectorAll('tr')
    rows.forEach((row) => {
      const th = row.querySelector('th')
      const td = row.querySelector('td')
      expect(th).not.toBeNull()
      expect(td).not.toBeNull()
      expect(th?.getAttribute('scope')).toBe('row')
    })
  })
})
