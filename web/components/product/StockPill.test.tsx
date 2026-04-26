import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StockPill } from './StockPill'

describe('StockPill', () => {
  it('renders «В наличии» for in_stock', () => {
    render(<StockPill status="in_stock" />)
    expect(screen.getByText('В наличии')).toBeInTheDocument()
  })

  it('renders «Предзаказ» for preorder', () => {
    render(<StockPill status="preorder" />)
    expect(screen.getByText('Предзаказ')).toBeInTheDocument()
  })

  it('renders «Нет в наличии» for out_of_stock', () => {
    render(<StockPill status="out_of_stock" />)
    expect(screen.getByText('Нет в наличии')).toBeInTheDocument()
  })

  it('uses success variant for in_stock', () => {
    render(<StockPill status="in_stock" />)
    expect(screen.getByText('В наличии')).toHaveClass('bg-[var(--color-stock-success-soft)]')
  })

  it('uses warning variant for preorder', () => {
    render(<StockPill status="preorder" />)
    expect(screen.getByText('Предзаказ')).toHaveClass('bg-[var(--color-stock-warning-soft)]')
  })

  it('uses danger variant for out_of_stock', () => {
    render(<StockPill status="out_of_stock" />)
    expect(screen.getByText('Нет в наличии')).toHaveClass('bg-[var(--color-stock-danger-soft)]')
  })
})
