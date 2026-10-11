import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import AdminDashboardPage from './page'

const { fetchCurrentAdmin } = vi.hoisted(() => ({ fetchCurrentAdmin: vi.fn() }))
vi.mock('@/lib/adminSession', () => ({ fetchCurrentAdmin }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'session=abc' }),
}))

const stats: StatsResponse = {
  from: '2026-10-05',
  to: '2026-10-07',
  totals: { clicks: 42, carts: 7, orders: 5, revenueRub: 12500, logins: 9, newUsers: 3 },
  days: [{ date: '2026-10-05', orders: 1, revenueRub: 1000 }],
}

const admin = (role: string) => ({ id: 'u1', email: 'a@b.c', role })

// Суммы заказов видит только admin. Роль проверяется внутри самой страницы до любого
// запроса статистики: layout и page рендерятся параллельно (см. AdminOnly).
describe('AdminDashboardPage', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchCurrentAdmin.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('async server component', () => {
    expect(AdminDashboardPage.constructor.name).toBe('AsyncFunction')
  })

  it('редактор: приветствие, статистика не запрашивается и не показывается', async () => {
    fetchCurrentAdmin.mockResolvedValue(admin('editor'))
    render(await AdminDashboardPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Добро пожаловать')).toBeInTheDocument()
    expect(
      screen.getByText('Используйте меню слева, чтобы перейти к нужному разделу.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Сумма заказов')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('нет сессии: тоже приветствие, без запроса статистики', async () => {
    fetchCurrentAdmin.mockResolvedValue(null)
    render(await AdminDashboardPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Добро пожаловать')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('admin: запрашивает статистику и показывает дашборд', async () => {
    fetchCurrentAdmin.mockResolvedValue(admin('admin'))
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: stats }) })
    render(await AdminDashboardPage({ searchParams: Promise.resolve({}) }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/admin/stats?')
    expect(screen.getByText('Сумма заказов')).toBeInTheDocument()
    expect(screen.getByText(/12\s?500\s?₽/)).toBeInTheDocument()
    expect(screen.queryByText('Добро пожаловать')).not.toBeInTheDocument()
  })

  it('admin, сбой API: карточка ошибки', async () => {
    fetchCurrentAdmin.mockResolvedValue(admin('admin'))
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(await AdminDashboardPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText(/не удалось загрузить статистику/i)).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith('Admin stats failed', expect.any(Error))
    spy.mockRestore()
  })
})
