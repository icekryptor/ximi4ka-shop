import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { OrderNotificationDto } from '@ximi4ka-shop/shared'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const retry = vi.fn(async (..._args: unknown[]) => [] as OrderNotificationDto[])
vi.mock('@/lib/adminApi', () => ({
  adminRetryOrderNotifications: (...args: unknown[]) => retry(...args),
  ApiError: class ApiError extends Error {},
}))

import { OrderNotifications } from './OrderNotifications'

const base: OrderNotificationDto = {
  channel: 'sheets',
  eventKey: 'created',
  attempts: 1,
  nextAttemptAt: '2026-09-25T11:10:00.000Z',
  sentAt: '2026-09-25T11:10:05.000Z',
  failedAt: null,
  lastError: null,
}

describe('<OrderNotifications>', () => {
  beforeEach(() => {
    retry.mockClear()
    refresh.mockClear()
  })

  it('показывает канал, событие и состояние', () => {
    render(
      <OrderNotifications
        orderId="o1"
        notifications={[
          base,
          {
            ...base,
            channel: 'telegram',
            sentAt: null,
            failedAt: '2026-09-25T11:11:00.000Z',
            lastError: 'bot was kicked',
          },
          { ...base, eventKey: 'status:paid', sentAt: null, attempts: 2 },
        ]}
      />,
    )
    expect(screen.getByText('Google Таблица · новый заказ')).toBeInTheDocument()
    expect(screen.getByText(/^доставлено/)).toBeInTheDocument()
    expect(screen.getByText(/не доставлено: bot was kicked/)).toBeInTheDocument()
    expect(screen.getByText(/повтор .*, попыток: 2/)).toBeInTheDocument()
  })

  it('кнопка повтора — только если есть несданные', async () => {
    const { rerender } = render(<OrderNotifications orderId="o1" notifications={[base]} />)
    expect(screen.queryByRole('button', { name: /ещё раз/i })).toBeNull()

    rerender(
      <OrderNotifications
        orderId="o1"
        notifications={[{ ...base, sentAt: null, failedAt: '2026-09-25T11:11:00.000Z' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /отправить ещё раз/i }))
    await vi.waitFor(() => expect(retry).toHaveBeenCalledWith('o1'))
    expect(refresh).toHaveBeenCalled()
  })

  it('пусто — объясняет, что уведомлений ещё не было', () => {
    render(<OrderNotifications orderId="o1" notifications={[]} />)
    expect(screen.getByText(/уведомлений по заказу ещё не было/i)).toBeInTheDocument()
  })
})
