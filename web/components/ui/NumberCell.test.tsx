import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NumberCell } from './NumberCell'

describe('<NumberCell>', () => {
  it('renders index, top label, big static value, bottom labels', () => {
    render(
      <NumberCell
        index="01"
        topLabel="год"
        big="2023"
        bottomLeft="основано"
        bottomRight="3 года"
      />
    )
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('год')).toBeInTheDocument()
    expect(screen.getByText('2023')).toBeInTheDocument()
    expect(screen.getByText('основано')).toBeInTheDocument()
    expect(screen.getByText('3 года')).toBeInTheDocument()
  })

  it('accepts viz children in slot', () => {
    render(
      <NumberCell index="04" topLabel="реакций" big="161">
        <div data-testid="viz-slot">viz here</div>
      </NumberCell>
    )
    expect(screen.getByTestId('viz-slot')).toBeInTheDocument()
  })

  it('applies decimal letter-spacing variant', () => {
    const { container } = render(
      <NumberCell index="03" topLabel="рейтинг" big="4,9" bigVariant="decimal" />
    )
    const big = container.querySelector('.lj-num-cell-big')
    expect(big?.className).toContain('tracking-[-0.06em]')
  })

  it('omits bottom row when both bottom labels missing', () => {
    const { container } = render(
      <NumberCell index="01" topLabel="x" big="0" />
    )
    expect(container.querySelector('.lj-num-cell-bottom')).toBeNull()
  })
})
