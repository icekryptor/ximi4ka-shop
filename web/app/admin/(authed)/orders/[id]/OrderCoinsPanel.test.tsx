import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderCoinsPanel } from './OrderCoinsPanel'

const base = {
  status: 'paid' as const,
  customerId: 'c1',
  cashbackPromisedCoins: 190,
  cashbackAccruedCoins: 0,
  cashbackShortfallCoins: 0,
  deliveryProblem: null,
}

describe('<OrderCoinsPanel>', () => {
  it('показывает недостачу заметным предупреждением', () => {
    render(
      <OrderCoinsPanel
        order={{
          ...base,
          status: 'cancelled',
          cashbackAccruedCoins: 190,
          cashbackShortfallCoins: 90,
        }}
      />,
    )
    expect(screen.getByText('Начисление отозвано: 100 из 190')).toBeInTheDocument()
    const warn = screen.getByRole('alert')
    expect(warn).toHaveTextContent('Недостача: 90 — химикоины уже были потрачены')
  })

  it('без недостачи предупреждения нет', () => {
    render(<OrderCoinsPanel order={base} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Ожидает получения: 190')).toBeInTheDocument()
  })

  it('показывает пометку проблемы СДЭК', () => {
    render(<OrderCoinsPanel order={{ ...base, deliveryProblem: 'cdek_tracking_timeout' }} />)
    expect(screen.getByText('СДЭК: 60 дней без вручения')).toBeInTheDocument()
  })

  it('гостевой заказ — пометка, без ссылки на покупателя', () => {
    render(<OrderCoinsPanel order={{ ...base, customerId: null }} />)
    expect(
      screen.getByText('Заказ гостевой: начислится, когда покупатель войдёт с этой почтой'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('с покупателем — ссылка на его карточку', () => {
    render(<OrderCoinsPanel order={base} />)
    expect(screen.getByRole('link', { name: /покупател/i })).toHaveAttribute(
      'href',
      '/admin/customers/c1',
    )
  })
})
