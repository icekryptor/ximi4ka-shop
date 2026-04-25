import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pill } from './Pill'

describe('Pill', () => {
  it('renders a span with rounded-full', () => {
    render(<Pill>В наличии</Pill>)
    const el = screen.getByText('В наличии')
    expect(el.tagName).toBe('SPAN')
    expect(el).toHaveClass('rounded-full')
  })

  it('applies success variant', () => {
    render(<Pill variant="success">ok</Pill>)
    expect(screen.getByText('ok')).toHaveClass('bg-[var(--color-stock-success-soft)]')
  })

  it('applies danger variant', () => {
    render(<Pill variant="danger">x</Pill>)
    expect(screen.getByText('x')).toHaveClass('bg-[var(--color-stock-danger-soft)]')
  })

  it('applies solid-brand variant', () => {
    render(<Pill variant="solid-brand">−18%</Pill>)
    const el = screen.getByText('−18%')
    expect(el).toHaveClass('bg-[var(--color-brand)]')
    expect(el).toHaveClass('text-[var(--color-text-on-brand)]')
  })
})
