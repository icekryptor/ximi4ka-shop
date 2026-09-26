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
      />,
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
      </NumberCell>,
    )
    expect(screen.getByTestId('viz-slot')).toBeInTheDocument()
  })

  it('sets the big value in Mazzard ExtraLight 40 (Figma lj-display/stat)', () => {
    render(<NumberCell index="03" topLabel="рейтинг" big="4,9" />)
    const big = screen.getByText('4,9')
    expect(big).toHaveClass('font-lj-mazzard', 'font-extralight', 'text-[2.5rem]')
  })

  it('sets the meta labels in Mazzard Bold 14, as typed (no uppercase)', () => {
    render(<NumberCell index="01" topLabel="год" big="2023" bottomLeft="основано" />)
    const top = screen.getByText('год').parentElement!
    expect(top).toHaveClass('font-lj-mazzard', 'font-bold', 'text-sm')
    expect(top).not.toHaveClass('uppercase')
    expect(screen.getByText('основано').parentElement).not.toHaveClass('uppercase')
  })

  it('keeps the big value and the graphic together, 40px apart', () => {
    render(
      <NumberCell index="01" topLabel="год" big="2023">
        <div data-testid="viz-slot" />
      </NumberCell>,
    )
    const group = screen.getByText('2023').parentElement!
    expect(group).toHaveClass('gap-10')
    expect(group).toContainElement(screen.getByTestId('viz-slot'))
  })

  it('omits bottom row when both bottom labels missing', () => {
    const { container } = render(<NumberCell index="01" topLabel="x" big="0" />)
    expect(container.querySelector('.lj-num-cell-bottom')).toBeNull()
  })

  it('renders just the index when topLabel is omitted', () => {
    render(<NumberCell index="1" big="ВЫБРАТЬ" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('ВЫБРАТЬ')).toBeInTheDocument()
  })
})
