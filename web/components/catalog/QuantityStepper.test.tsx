import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { QuantityStepper } from './QuantityStepper'

afterEach(() => cleanup())

describe('QuantityStepper', () => {
  it('renders the current value', () => {
    const { container } = render(
      <QuantityStepper value={2} onChange={() => {}} />,
    )
    expect(within(container).getByText('2')).toBeInTheDocument()
  })

  it('increments via the + button', () => {
    const onChange = vi.fn()
    const { container } = render(
      <QuantityStepper value={2} onChange={onChange} />,
    )
    fireEvent.click(
      within(container).getByRole('button', { name: 'Увеличить количество' }),
    )
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('decrements via the − button', () => {
    const onChange = vi.fn()
    const { container } = render(
      <QuantityStepper value={2} onChange={onChange} />,
    )
    fireEvent.click(
      within(container).getByRole('button', { name: 'Уменьшить количество' }),
    )
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('does not go below min and disables the − button at min', () => {
    const onChange = vi.fn()
    const { container } = render(
      <QuantityStepper value={1} onChange={onChange} min={1} />,
    )
    const minus = within(container).getByRole('button', {
      name: 'Уменьшить количество',
    })
    expect(minus).toBeDisabled()
    fireEvent.click(minus)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not exceed max and disables the + button at max', () => {
    const onChange = vi.fn()
    const { container } = render(
      <QuantityStepper value={99} onChange={onChange} max={99} />,
    )
    const plus = within(container).getByRole('button', {
      name: 'Увеличить количество',
    })
    expect(plus).toBeDisabled()
    fireEvent.click(plus)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('exposes an accessible group label', () => {
    const { container } = render(
      <QuantityStepper value={1} onChange={() => {}} ariaLabel="Штук" />,
    )
    expect(
      within(container).getByRole('group', { name: 'Штук' }),
    ).toBeInTheDocument()
  })
})
