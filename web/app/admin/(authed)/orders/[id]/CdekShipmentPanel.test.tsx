import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CdekShipmentDto } from '@ximi4ka-shop/shared'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const retry = vi.fn(async (..._args: unknown[]) => ({}) as CdekShipmentDto)
vi.mock('@/lib/adminApi', () => ({
  adminRetryCdekShipment: (...args: unknown[]) => retry(...args),
  ApiError: class ApiError extends Error {},
}))

import { CdekShipmentPanel } from './CdekShipmentPanel'

const base: CdekShipmentDto = {
  state: 'created',
  cdekNumber: '10325990882',
  attempts: 0,
  nextAttemptAt: '2026-09-25T11:10:00.000Z',
  lastError: null,
  updatedAt: '2026-09-25T11:10:05.000Z',
}

describe('<CdekShipmentPanel>', () => {
  beforeEach(() => {
    retry.mockClear()
    refresh.mockClear()
  })

  it('создан — номер со ссылкой на трекинг, кнопки нет', () => {
    render(<CdekShipmentPanel orderId="o1" orderStatus="paid" shipment={base} enabled />)
    expect(screen.getByText('создан')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '10325990882' })).toHaveAttribute(
      'href',
      'https://www.cdek.ru/ru/tracking?order_id=10325990882',
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ошибка — текст и «Создать в СДЭК ещё раз»; клик ставит в очередь и обновляет страницу', async () => {
    render(
      <CdekShipmentPanel
        orderId="o1"
        orderStatus="paid"
        shipment={{
          ...base,
          state: 'failed',
          cdekNumber: null,
          attempts: 8,
          lastError: 'Неверный телефон',
        }}
        enabled
      />,
    )
    expect(screen.getByText('ошибка')).toBeInTheDocument()
    expect(screen.getByText('Неверный телефон')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Создать в СДЭК ещё раз' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(retry).toHaveBeenCalledWith('o1')
  })

  it('оплаченный заказ без записи — «не создавался» и «Создать в СДЭК»', () => {
    render(<CdekShipmentPanel orderId="o1" orderStatus="paid" shipment={null} enabled />)
    expect(screen.getByText('не создавался')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать в СДЭК' })).toBeInTheDocument()
  })

  it('в очереди после неудач — попытки и время следующей, можно повторить сейчас', () => {
    render(
      <CdekShipmentPanel
        orderId="o1"
        orderStatus="paid"
        shipment={{
          ...base,
          state: 'queued',
          cdekNumber: null,
          attempts: 2,
          lastError: 'СДЭК недоступен',
        }}
        enabled
      />,
    )
    expect(screen.getByText(/попыток: 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать в СДЭК ещё раз' })).toBeInTheDocument()
  })

  it.each([
    [
      'выключено',
      { orderStatus: 'paid' as const, shipment: null, enabled: false },
      'автосоздание выключено',
    ],
    [
      'не оплачен',
      { orderStatus: 'pending' as const, shipment: null, enabled: true },
      'не создавался',
    ],
    [
      'регистрируется',
      {
        orderStatus: 'paid' as const,
        shipment: { ...base, state: 'registering' as const, cdekNumber: null },
        enabled: true,
      },
      'регистрируется',
    ],
  ])('%s — без кнопки', (_name, props, label) => {
    render(<CdekShipmentPanel orderId="o1" {...props} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
