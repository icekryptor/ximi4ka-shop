import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { PublicOrderStatus } from '@ximi4ka-shop/shared'
import { OrderStatusView } from './OrderStatusView'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function statusPayload(overrides: Partial<PublicOrderStatus> = {}): PublicOrderStatus {
  return {
    orderNumber: 'XM-2026-00042',
    status: 'pending',
    totalRub: 3399,
    paymentProvider: 'manual',
    createdAt: '2026-07-01T10:00:00.000Z',
    paidAt: null,
    ...overrides,
  }
}

// Fresh Response per call — a Response body can only be consumed once, and
// the polling flow re-fetches the same endpoint many times.
function fetchReturning(...payloads: Array<PublicOrderStatus | { notFound: true }>) {
  let call = 0
  return vi.fn(async () => {
    const payload = payloads[Math.min(call, payloads.length - 1)]
    call += 1
    if (payload && 'notFound' in payload) {
      return new Response(
        JSON.stringify({ error: { code: 'order_not_found', message: 'Заказ не найден' } }),
        { status: 404 },
      )
    }
    return new Response(JSON.stringify({ data: payload }), { status: 200 })
  })
}

describe('<OrderStatusView>', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('shows the order number large and the meta rows after loading', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload()))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    expect(await screen.findByTestId('order-number')).toHaveTextContent('XM-2026-00042')
    expect(screen.getByTestId('order-status-label')).toHaveTextContent('Принят')
    expect(screen.getByTestId('order-total')).toHaveTextContent('3 399')
    expect(screen.getByTestId('order-date')).toHaveTextContent('01.07.2026')
  })

  it('renders the three timeline steps with the active one marked', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload({ paymentProvider: 'tbank' })))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    const timeline = await screen.findByTestId('order-timeline')
    const steps = timeline.querySelectorAll('li')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent('Создан')
    expect(steps[1]).toHaveTextContent('Ожидает оплаты')
    expect(steps[2]).toHaveTextContent('Оплачен')
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
  })

  it('celebrate=true shows «Заказ принят!» with the what-happens-next block', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload()))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)

    expect(
      await screen.findByRole('heading', { name: /заказ принят!/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/что дальше/i)).toBeInTheDocument()
  })

  it('manual + pending explains that a manager will call', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload()))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    expect(await screen.findByText(/менеджер свяжется/i)).toBeInTheDocument()
  })

  it('failed order shows the payment-error note', async () => {
    vi.stubGlobal(
      'fetch',
      fetchReturning(statusPayload({ status: 'failed', paymentProvider: 'tbank' })),
    )
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    expect(await screen.findByTestId('order-status-label')).toHaveTextContent(
      'Ошибка оплаты',
    )
    expect(screen.getByText(/оплата не прошла/i)).toBeInTheDocument()
  })

  it('paid order shows the paid date', async () => {
    vi.stubGlobal(
      'fetch',
      fetchReturning(
        statusPayload({
          status: 'paid',
          paymentProvider: 'tbank',
          paidAt: '2026-07-02T08:30:00.000Z',
        }),
      ),
    )
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    expect(await screen.findByTestId('order-status-label')).toHaveTextContent('Оплачен')
    expect(screen.getByTestId('order-paid-at')).toHaveTextContent('02.07.2026')
  })

  it('unknown order number shows «Заказ не найден» with a track link', async () => {
    vi.stubGlobal('fetch', fetchReturning({ notFound: true }))
    render(<OrderStatusView orderNumber="XM-0000-00000" celebrate={false} />)

    expect(await screen.findByText(/заказ не найден/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /отследить заказ/i })).toHaveAttribute(
      'href',
      '/orders/track',
    )
  })

  it('polls a pending tbank order every 5s and stops once it is paid', async () => {
    vi.useFakeTimers()
    const fetchMock = fetchReturning(
      statusPayload({ paymentProvider: 'tbank' }),
      statusPayload({
        paymentProvider: 'tbank',
        status: 'paid',
        paidAt: '2026-07-02T08:30:00.000Z',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('order-status-label')).toHaveTextContent('Ожидает оплаты')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('order-status-label')).toHaveTextContent('Оплачен')

    // Paid is terminal — the interval is torn down.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not poll manual pending orders', async () => {
    vi.useFakeTimers()
    const fetchMock = fetchReturning(statusPayload())
    vi.stubGlobal('fetch', fetchMock)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up polling after 5 minutes', async () => {
    vi.useFakeTimers()
    const fetchMock = fetchReturning(statusPayload({ paymentProvider: 'tbank' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 5 минут поллинга — 60 запросов сверх первоначальной загрузки…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(61)

    // …а дальше тишина.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(61)
  })
})
