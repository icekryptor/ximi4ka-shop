import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuantityStepperLJ } from './QuantityStepperLJ'

describe('<QuantityStepperLJ>', () => {
  it('renders current quantity', () => {
    render(<QuantityStepperLJ value={3} onChange={() => {}} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('+ button calls onChange with value + 1', () => {
    const onChange = vi.fn()
    render(<QuantityStepperLJ value={2} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('− button calls onChange with value − 1, clamped at min=1', () => {
    const onChange = vi.fn()
    render(<QuantityStepperLJ value={1} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /decrease/i }))
    expect(onChange).toHaveBeenCalledWith(1)  // clamped, not 0
  })

  it('+ button respects custom max', () => {
    const onChange = vi.fn()
    render(<QuantityStepperLJ value={10} onChange={onChange} max={10} />)
    fireEvent.click(screen.getByRole('button', { name: /increase/i }))
    expect(onChange).toHaveBeenCalledWith(10)  // clamped at max
  })
})
