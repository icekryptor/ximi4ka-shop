import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { PublicOrderStatus } from '@ximi4ka-shop/shared'
import { OrderStatusView } from './OrderStatusView'
import { rememberPendingPurchase, setMetrikaCounterId } from '@/lib/metrika'

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

    expect(await screen.findByRole('heading', { name: /заказ принят!/i })).toBeInTheDocument()
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

    expect(await screen.findByTestId('order-status-label')).toHaveTextContent('Ошибка оплаты')
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

  it('sends the order secret with the status request', async () => {
    const fetchMock = fetchReturning(statusPayload())
    vi.stubGlobal('fetch', fetchMock)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="sec ret" />)
    await screen.findByTestId('order-status-label')
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(
      '/api/public/orders/XM-2026-00042/status?t=sec%20ret',
    )
  })

  it('shows the CDEK track number with a tracking link once it is assigned', async () => {
    vi.stubGlobal(
      'fetch',
      fetchReturning(
        statusPayload({
          status: 'paid',
          paidAt: '2026-07-02T08:30:00.000Z',
          shipment: {
            state: 'created',
            trackingNumber: '1234567890',
            trackingUrl: 'https://www.cdek.ru/ru/tracking?order_id=1234567890',
          },
        }),
      ),
    )
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate token="t" />)
    expect(await screen.findByTestId('order-track-number')).toHaveTextContent('1234567890')
    const link = screen.getByRole('link', { name: /Отследить на cdek\.ru/ })
    expect(link).toHaveAttribute('href', 'https://www.cdek.ru/ru/tracking?order_id=1234567890')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('keeps polling a paid order until CDEK assigns the track number', async () => {
    vi.useFakeTimers()
    const paid = { status: 'paid' as const, paidAt: '2026-07-02T08:30:00.000Z' }
    const fetchMock = fetchReturning(
      statusPayload({
        ...paid,
        shipment: { state: 'pending', trackingNumber: null, trackingUrl: null },
      }),
      statusPayload({
        ...paid,
        shipment: {
          state: 'created',
          trackingNumber: '1234567890',
          trackingUrl: 'https://www.cdek.ru/ru/tracking?order_id=1234567890',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="t" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByTestId('order-track-pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByTestId('order-track-number')).toHaveTextContent('1234567890')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('tells the buyer the payment did not go through after a failed return from the bank', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload({ paymentProvider: 'tbank' })))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} paymentFailed />)
    expect(await screen.findByTestId('order-payment-failed')).toHaveTextContent(/оплата не прошла/i)
  })

  it('does not promise emails or SMS in the not-found copy', async () => {
    vi.stubGlobal('fetch', fetchReturning({ notFound: true }))
    render(<OrderStatusView orderNumber="XM-2026-00404" celebrate={false} />)
    await screen.findByText('Заказ не найден')
    expect(screen.queryByText(/письме|SMS/)).toBeNull()
  })

  it('reads the order secret from the URL fragment', async () => {
    window.history.replaceState(null, '', '/order/XM-2026-00042?new=1#t=frag123')
    const fetchMock = fetchReturning(statusPayload())
    vi.stubGlobal('fetch', fetchMock)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
    await screen.findByTestId('order-status-label')
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('status?t=frag123')
    window.history.replaceState(null, '', '/')
  })
})

describe('<OrderStatusView>: покупка для Метрики', () => {
  type W = Window & { ym?: unknown; dataLayer?: unknown[] }
  const w = window as W
  const products = [{ id: 'p1', name: 'Набор А', price: 1000, quantity: 3 }]

  beforeEach(() => {
    window.localStorage.clear()
    w.ym = vi.fn()
    w.dataLayer = []
    setMetrikaCounterId('777')
    rememberPendingPurchase('XM-2026-00042', products)
  })
  afterEach(() => {
    setMetrikaCounterId(null)
    delete w.ym
    delete w.dataLayer
  })

  it('шлёт purchase с номером, суммой заказа и товарами; при перезагрузке не повторяет', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload({ totalRub: 3399 })))
    const first = render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
    await screen.findByTestId('order-status-label')

    expect(w.dataLayer).toEqual([
      {
        ecommerce: {
          currencyCode: 'RUB',
          purchase: { actionField: { id: 'XM-2026-00042', revenue: 3399 }, products },
        },
      },
    ])
    expect(w.ym).toHaveBeenCalledWith('777', 'reachGoal', 'purchase', {
      order_price: 3399,
      currency: 'RUB',
    })

    // «Перезагрузка» страницы: компонент монтируется заново, снимок снова на месте.
    first.unmount()
    rememberPendingPurchase('XM-2026-00042', products)
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
    await screen.findByTestId('order-status-label')
    expect(w.dataLayer).toHaveLength(1)
    expect(w.ym).toHaveBeenCalledTimes(1)
  })

  it('не шлёт покупку без ?new=1 (обычный просмотр статуса)', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload()))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} />)
    await screen.findByTestId('order-status-label')
    expect(w.dataLayer).toEqual([])
  })

  it('не шлёт покупку по проваленному заказу', async () => {
    vi.stubGlobal('fetch', fetchReturning(statusPayload({ status: 'failed' })))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
    await screen.findByTestId('order-status-label')
    expect(w.dataLayer).toEqual([])
    expect(w.ym).not.toHaveBeenCalled()
  })

  it('без счётчика Метрики страница работает, событий нет', async () => {
    setMetrikaCounterId(null)
    vi.stubGlobal('fetch', fetchReturning(statusPayload()))
    render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
    await screen.findByTestId('order-status-label')
    expect(w.dataLayer).toEqual([])
  })
})
