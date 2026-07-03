import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ElementOfDayCell } from './ElementOfDayCell'
import { getElementOfDay } from '@/lib/elementOfDay'

describe('<ElementOfDayCell>', () => {
  const date = new Date(2026, 6, 3)
  const el = getElementOfDay(date)

  it('renders the Mendeleev cell with symbol, number and name', () => {
    render(<ElementOfDayCell date={date} />)
    const cell = screen.getByTestId('element-of-day')
    expect(cell.textContent).toContain(el.symbol)
    expect(cell.textContent).toContain(String(el.number))
    expect(cell.textContent).toContain(el.name)
  })

  it('reveals «элемент дня» note with the fact (CSS hover/focus classes)', () => {
    render(<ElementOfDayCell date={date} />)
    const note = screen.getByRole('note')
    expect(note.textContent).toContain('элемент дня')
    expect(note.textContent).toContain(el.fact)
    // reveal wiring: hidden by default, shown on group hover or focus-within
    expect(note.className).toContain('opacity-0')
    expect(note.className).toContain('group-hover/eod:opacity-100')
    expect(note.className).toContain('group-focus-within/eod:opacity-100')
  })

  it('is keyboard-reachable (tabIndex=0)', () => {
    render(<ElementOfDayCell date={date} />)
    expect(screen.getByTestId('element-of-day')).toHaveAttribute('tabindex', '0')
  })
})
