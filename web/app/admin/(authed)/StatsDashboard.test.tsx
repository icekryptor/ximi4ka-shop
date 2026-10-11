import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import { StatsDashboard } from './StatsDashboard'
import AdminDashboardPage from './page'

const period = { preset: 'week' as const, from: '2026-10-05', to: '2026-10-07' }

const stats: StatsResponse = {
  from: '2026-10-05',
  to: '2026-10-07',
  totals: { clicks: 42, carts: 7, orders: 5, revenueRub: 12500, logins: 9, newUsers: 3 },
  days: [
    { date: '2026-10-05', orders: 1, revenueRub: 1000 },
    { date: '2026-10-06', orders: 3, revenueRub: 9000 },
    { date: '2026-10-07', orders: 1, revenueRub: 2500 },
  ],
}

const empty: StatsResponse = {
  from: '2026-10-05',
  to: '2026-10-07',
  totals: { clicks: 0, carts: 0, orders: 0, revenueRub: 0, logins: 0, newUsers: 0 },
  days: stats.days.map((d) => ({ ...d, orders: 0, revenueRub: 0 })),
}

describe('StatsDashboard', () => {
  it('показывает все шесть метрик и сумму в рублях', () => {
    render(<StatsDashboard stats={stats} period={period} />)
    for (const label of [
      'Сумма заказов',
      'Заказы',
      'Корзины',
      'Клики',
      'Входы в ЛК',
      'Новые пользователи',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(/12\s?500\s?₽/)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('переключатель периода: неделя, месяц и свой период; активный помечен', () => {
    render(<StatsDashboard stats={stats} period={period} />)
    const week = screen.getByRole('link', { name: 'Неделя' })
    expect(week).toHaveAttribute('href', '/admin?preset=week')
    expect(week).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Месяц' })).toHaveAttribute(
      'href',
      '/admin?preset=month',
    )
    expect(screen.getByLabelText('С')).toHaveValue('2026-10-05')
    expect(screen.getByLabelText('По')).toHaveValue('2026-10-07')
  })

  it('график: столбец на каждый день с подсказкой', () => {
    const { container } = render(<StatsDashboard stats={stats} period={period} />)
    expect(container.querySelectorAll('svg rect')).toHaveLength(3)
    expect(container.querySelector('svg title')?.textContent).toMatch(/05\.10/)
  })

  it('пустой период: нули, текст про отсутствие данных, график не ломается', () => {
    const { container } = render(<StatsDashboard stats={empty} period={period} />)
    expect(screen.getByText(/данных за этот период нет/i)).toBeInTheDocument()
    expect(container.querySelectorAll('svg rect')).toHaveLength(3)
  })

  it('оговорки про приближённые метрики видны', () => {
    render(<StatsDashboard stats={stats} period={period} />)
    expect(screen.getByText(/без учёта входа по действующей сессии/i)).toBeInTheDocument()
  })
})

describe('AdminDashboardPage', () => {
  it('async server component', () => {
    expect(AdminDashboardPage.constructor.name).toBe('AsyncFunction')
  })
})
