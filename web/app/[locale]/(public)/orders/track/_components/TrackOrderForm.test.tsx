import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TrackOrderForm } from './TrackOrderForm'

const mockPush = vi.fn<(path: string) => void>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => {
  mockPush.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('<TrackOrderForm>', () => {
  it('renders the heading and the order-number field', () => {
    render(<TrackOrderForm />)
    expect(screen.getByRole('heading', { name: 'Отследить заказ' })).toBeInTheDocument()
    expect(screen.getByLabelText(/номер заказа/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /найти заказ/i })).toBeInTheDocument()
  })

  it('redirects to /order/[number] on submit', () => {
    render(<TrackOrderForm />)
    fireEvent.change(screen.getByLabelText(/номер заказа/i), {
      target: { value: 'XM-2026-00042' },
    })
    fireEvent.click(screen.getByRole('button', { name: /найти заказ/i }))
    expect(mockPush).toHaveBeenCalledWith('/order/XM-2026-00042')
  })

  it('trims whitespace and uppercases the number', () => {
    render(<TrackOrderForm />)
    fireEvent.change(screen.getByLabelText(/номер заказа/i), {
      target: { value: '  xm-2026-00042  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /найти заказ/i }))
    expect(mockPush).toHaveBeenCalledWith('/order/XM-2026-00042')
  })

  it('shows a Russian error and does not navigate when the field is empty', () => {
    render(<TrackOrderForm />)
    fireEvent.click(screen.getByRole('button', { name: /найти заказ/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите номер заказа')
    expect(mockPush).not.toHaveBeenCalled()
  })
})
