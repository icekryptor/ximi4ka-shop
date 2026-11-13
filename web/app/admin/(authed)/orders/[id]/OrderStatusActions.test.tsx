import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const setStatus = vi.fn(async (..._args: unknown[]) => ({}))
vi.mock('@/lib/adminApi', () => ({
  adminSetOrderStatus: (...args: unknown[]) => setStatus(...args),
  ApiError: class ApiError extends Error {},
}))

import { OrderStatusActions } from './OrderStatusActions'

describe('<OrderStatusActions>', () => {
  beforeEach(() => {
    setStatus.mockClear()
    refresh.mockClear()
  })

  it('у оплаченного заказа — только «Отметить отправленным»', async () => {
    render(<OrderStatusActions orderId="o1" status="paid" />)
    expect(screen.queryByRole('button', { name: /оплаченным/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /отменить/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /отметить отправленным/i }))
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('o1', { status: 'shipped' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('у ожидающего — «оплачен» и «отменить», без «отправлен»', () => {
    render(<OrderStatusActions orderId="o1" status="pending" />)
    expect(screen.getByRole('button', { name: /оплаченным/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /отменить/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /отправленным/i })).toBeNull()
  })

  it('у отправленного — только «Отметить полученным»', async () => {
    render(<OrderStatusActions orderId="o1" status="shipped" />)
    expect(screen.queryByRole('button', { name: /оплаченным/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /отменить/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /отметить полученным/i }))
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('o1', { status: 'delivered' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('у полученного — только «Отменить заказ»', async () => {
    render(<OrderStatusActions orderId="o1" status="delivered" />)
    expect(screen.queryByRole('button', { name: /оплаченным/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /полученным/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /отменить заказ/i }))
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('o1', { status: 'cancelled' }))
  })
})
