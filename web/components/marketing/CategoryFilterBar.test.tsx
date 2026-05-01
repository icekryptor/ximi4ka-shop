import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryFilterBar } from './CategoryFilterBar'

describe('<CategoryFilterBar>', () => {
  it('renders all sort options as buttons', () => {
    render(<CategoryFilterBar sort="newest" onSortChange={() => {}} onReset={() => {}} />)
    // 4 sort buttons: newest, price-asc, price-desc, name-asc
    expect(screen.getByRole('button', { name: /Новинки/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Цена ↑/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Цена ↓/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /А–Я/i })).toBeInTheDocument()
  })

  it('marks current sort with ink-filled state', () => {
    render(<CategoryFilterBar sort="price-asc" onSortChange={() => {}} onReset={() => {}} />)
    const btn = screen.getByRole('button', { name: /Цена ↑/i })
    expect(btn.className).toContain('bg-[var(--color-lj-ink)]')
  })

  it('calls onSortChange with new key when a sort button is clicked', () => {
    const onSortChange = vi.fn()
    render(<CategoryFilterBar sort="newest" onSortChange={onSortChange} onReset={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Цена ↓/i }))
    expect(onSortChange).toHaveBeenCalledWith('price-desc')
  })

  it('calls onReset when reset button is clicked', () => {
    const onReset = vi.fn()
    render(<CategoryFilterBar sort="newest" onSortChange={() => {}} onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /Сбросить/i }))
    expect(onReset).toHaveBeenCalled()
  })
})
