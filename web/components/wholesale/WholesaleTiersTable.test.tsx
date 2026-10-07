import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WholesaleTiersTable } from './WholesaleTiersTable'

describe('WholesaleTiersTable', () => {
  it('показывает ступени наборов из движка', () => {
    render(<WholesaleTiersTable />)
    const kits = screen.getByRole('table', { name: 'Наборы' })
    expect(kits).toHaveTextContent('−299 ₽')
    expect(kits).toHaveTextContent('−599 ₽')
    expect(kits).toHaveTextContent('−199 ₽')
    expect(kits).toHaveTextContent('−499 ₽')
    expect(kits).toHaveTextContent('Набор для ОГЭ')
  })

  it('показывает проценты для реагентов и оборудования', () => {
    render(<WholesaleTiersTable />)
    const reagents = screen.getByRole('table', { name: 'Реагенты и оборудование' })
    for (const percent of ['15%', '20%', '25%', '30%']) {
      expect(reagents).toHaveTextContent(percent)
    }
  })

  it('показывает цены партий и цену за штуку сверх 20', () => {
    render(<WholesaleTiersTable />)
    const batches = screen.getByRole('table', { name: 'Пробирки и пипетки' })
    expect(batches).toHaveTextContent('39 ₽')
    expect(batches).toHaveTextContent('299 ₽')
    expect(batches).toHaveTextContent('29 ₽')
    expect(batches).toHaveTextContent('199 ₽')
    expect(screen.getByText(/сверх 20 шт\./)).toHaveTextContent('14 ₽')
    expect(screen.getByText(/сверх 20 шт\./)).toHaveTextContent('9 ₽')
  })
})
