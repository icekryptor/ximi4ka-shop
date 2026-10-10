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
