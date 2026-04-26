import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuantityStepper } from './QuantityStepper'

describe('QuantityStepper', () => {
  it('renders initial value', () => {
    render(<QuantityStepper value={3} onChange={() => {}} />)
    expect(screen.getByLabelText('Количество')).toHaveValue(3)
  })

  it('calls onChange with incremented value when + clicked', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Увеличить количество'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('calls onChange with decremented value when − clicked', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={2} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Уменьшить количество'))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('does not decrement below min (default 1)', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Уменьшить количество'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not increment above max', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={99} max={99} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Увеличить количество'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables decrement button at min', () => {
    render(<QuantityStepper value={1} onChange={() => {}} />)
    expect(screen.getByLabelText('Уменьшить количество')).toBeDisabled()
  })

  it('disables increment button at max', () => {
    render(<QuantityStepper value={5} max={5} onChange={() => {}} />)
    expect(screen.getByLabelText('Увеличить количество')).toBeDisabled()
  })

  it('typing in the input clamps to min', () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={5} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Количество'), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })
})
