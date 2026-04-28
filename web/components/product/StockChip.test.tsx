import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StockChip } from './StockChip'

describe('<StockChip>', () => {
  it('renders in-stock with success-colored dot + "В наличии" label', () => {
    const { container } = render(<StockChip status="in_stock" />)
    expect(screen.getByText('В наличии')).toBeInTheDocument()
    const dot = container.querySelector('span > span') as HTMLElement
    expect(dot.className).toContain('var(--color-stock-success)')
  })

  it('renders preorder with warning-colored dot + "Под заказ" label', () => {
    render(<StockChip status="preorder" />)
    expect(screen.getByText('Под заказ')).toBeInTheDocument()
  })

  it('renders out-of-stock with danger-colored dot + "Нет в наличии" label', () => {
    render(<StockChip status="out_of_stock" />)
    expect(screen.getByText('Нет в наличии')).toBeInTheDocument()
  })
})
