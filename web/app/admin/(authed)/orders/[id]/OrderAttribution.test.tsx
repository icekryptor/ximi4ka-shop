import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderAttribution } from './OrderAttribution'

const LAST = {
  at: '2026-10-05T12:30:00.000Z',
  landing: '/product/kit',
  yclid: '1234567890',
  utm_source: 'yandex',
  utm_medium: 'cpc',
  utm_campaign: 'kits-search',
  utm_term: 'набор химика',
  utm_content: 'ad-1',
}

describe('<OrderAttribution>', () => {
  it('показывает метки последнего касания, referrer первого, IP и браузер', () => {
    render(
      <OrderAttribution
        attribution={{
          first: {
            at: '2026-10-01T10:00:00.000Z',
            landing: '/catalog',
            referrer: 'https://yandex.ru/search/',
          },
          last: LAST,
        }}
        clientIp="203.0.113.7"
        clientUserAgent="Mozilla/5.0 (Test)"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Источник' })).toBeInTheDocument()
    expect(screen.getByText('Первое касание')).toBeInTheDocument()
    expect(screen.getByText('Последнее с метками')).toBeInTheDocument()
    expect(screen.getByText('1234567890')).toBeInTheDocument()
    expect(screen.getByText('kits-search')).toBeInTheDocument()
    expect(screen.getByText('набор химика')).toBeInTheDocument()
    expect(screen.getByText('https://yandex.ru/search/')).toBeInTheDocument()
    expect(screen.getByText('203.0.113.7')).toBeInTheDocument()
    expect(screen.getByText('Mozilla/5.0 (Test)')).toBeInTheDocument()
  })

  it('предупреждает, что метки прислал браузер покупателя и они не проверены', () => {
    render(<OrderAttribution attribution={{ last: LAST }} clientIp={null} clientUserAgent={null} />)

    expect(screen.getByText(/метки прислал браузер покупателя/i)).toBeInTheDocument()
  })

  it('без referrer пишет «прямой заход»', () => {
    render(
      <OrderAttribution
        attribution={{ first: { at: '2026-10-01T10:00:00.000Z', landing: '/' } }}
        clientIp={null}
        clientUserAgent={null}
      />,
    )

    expect(screen.getByText('прямой заход')).toBeInTheDocument()
    expect(screen.queryByText('Последнее с метками')).not.toBeInTheDocument()
  })

  describe('конверсия в Метрику', () => {
    const base = {
      target: 'order_paid',
      priceRub: 1500,
      attempts: 0,
      uploadId: null,
      sentAt: null,
      lastError: null,
    }

    it('отправлена: статус, номер загрузки и цель', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={{
            ...base,
            state: 'sent',
            uploadId: '777',
            sentAt: '2026-10-05T13:00:00.000Z',
          }}
        />,
      )

      expect(screen.getByText('отправлена в Метрику')).toBeInTheDocument()
      expect(screen.getByText(/777/)).toBeInTheDocument()
      expect(screen.getByText(/order_paid/)).toBeInTheDocument()
    })

    it('отправляется прямо сейчас', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={{ ...base, state: 'sending' }}
        />,
      )

      expect(screen.getByText('отправляется')).toBeInTheDocument()
    })

    it('отправлена, но Метрика приняла не все строки: «Внимание», не «Ошибка»', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={{
            ...base,
            state: 'sent',
            uploadId: '5',
            lastError: 'Метрика приняла не все строки (1 из 2)',
          }}
        />,
      )

      expect(screen.getByText(/Внимание: Метрика приняла не все строки/)).toBeInTheDocument()
      expect(screen.queryByText(/Ошибка:/)).not.toBeInTheDocument()
    })

    it('в очереди', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={{ ...base, state: 'pending' }}
        />,
      )

      expect(screen.getByText('в очереди на отправку')).toBeInTheDocument()
    })

    it('с ошибкой: причина и число попыток', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={{
            ...base,
            state: 'pending',
            attempts: 3,
            lastError: 'Metrika 403: Access denied',
          }}
        />,
      )

      expect(screen.getByText(/Metrika 403: Access denied/)).toBeInTheDocument()
      expect(screen.getByText(/попыток: 3/)).toBeInTheDocument()
    })

    it('сдана после суток попыток', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={{ ...base, state: 'failed', attempts: 9, lastError: 'down' }}
        />,
      )

      expect(screen.getByText('не отправлена')).toBeInTheDocument()
    })

    it('нет записи: блока про Метрику нет', () => {
      render(
        <OrderAttribution
          attribution={{ last: LAST }}
          clientIp={null}
          clientUserAgent={null}
          conversion={null}
        />,
      )

      expect(screen.queryByText('Конверсия в Метрику')).not.toBeInTheDocument()
    })
  })

  it('старый заказ без атрибуции: понятная заглушка', () => {
    render(<OrderAttribution attribution={null} clientIp={null} clientUserAgent={null} />)

    expect(screen.getByText('Источник не определён')).toBeInTheDocument()
  })

  it('только IP и браузер, без меток: заглушки нет, адрес показан', () => {
    render(<OrderAttribution attribution={null} clientIp="198.51.100.2" clientUserAgent="UA" />)

    expect(screen.getByText('198.51.100.2')).toBeInTheDocument()
    expect(screen.queryByText('Источник не определён')).not.toBeInTheDocument()
  })
})
