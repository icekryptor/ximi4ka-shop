import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { TrafficDashboard } from './TrafficDashboard'
import AdminTrafficPage from './page'

const { fetchCurrentAdmin } = vi.hoisted(() => ({ fetchCurrentAdmin: vi.fn() }))
vi.mock('@/lib/adminSession', () => ({ fetchCurrentAdmin }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'session=abc' }),
}))

const period = { preset: 'week' as const, from: '2026-10-20', to: '2026-10-26' }
const NOW = new Date('2026-10-28T12:00:00Z')

const status: TrafficStatus = {
  configured: true,
  dataSince: '2026-10-10',
  dataUntil: '2026-10-27',
  runs: [
    {
      source: 'metrika',
      lastStartedAt: '2026-10-28T01:00:00.000Z',
      lastStatus: 'ok',
      lastError: null,
      lastSuccessAt: '2026-10-28T01:10:00.000Z',
    },
    {
      source: 'webmaster',
      lastStartedAt: null,
      lastStatus: null,
      lastError: null,
      lastSuccessAt: null,
    },
  ],
}

const sources: TrafficSourcesResponse = {
  from: '2026-10-20',
  to: '2026-10-26',
  prevFrom: '2026-10-13',
  prevTo: '2026-10-19',
  totalVisits: 45,
  prevTotalVisits: 30,
  sources: [
    { source: 'organic', visits: 30, prevVisits: 20 },
    { source: 'direct', visits: 15, prevVisits: 10 },
  ],
  engines: [{ engine: 'yandex', visits: 20, prevVisits: 15 }],
  weeks: [{ weekStart: '2026-10-19', visitsBySource: { organic: 30, direct: 15 } }],
}

describe('TrafficDashboard', () => {
  it('итоги, таблица источников с разницей и поисковики', () => {
    render(<TrafficDashboard status={status} sources={sources} period={period} now={NOW} />)
    expect(screen.getByRole('heading', { name: 'Трафик и рост' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Визиты по источникам' })
    const organic = within(table).getByText('Поиск').closest('tr') as HTMLElement
    expect(within(organic).getByText('30')).toBeInTheDocument()
    expect(within(organic).getByText('+50%')).toBeInTheDocument()
    expect(screen.getByText('Яндекс')).toBeInTheDocument()
    expect(screen.getByText(/обновлено/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Визиты по неделям и источникам' })).toBeInTheDocument()
  })

  it('синхронизация не настроена — плашка и пустое состояние вместо таблицы', () => {
    render(
      <TrafficDashboard
        status={{ ...status, configured: false, dataSince: null, dataUntil: null }}
        sources={{
          ...sources,
          totalVisits: 0,
          prevTotalVisits: 0,
          sources: [],
          engines: [],
          weeks: [],
        }}
        period={period}
        now={NOW}
      />,
    )
    expect(screen.getByText(/Синхронизация не настроена/)).toBeInTheDocument()
    expect(screen.getByText('За этот период данных нет.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('ошибка синхронизации — текст ошибки', () => {
    render(
      <TrafficDashboard
        status={{
          ...status,
          runs: [
            { ...status.runs[0], lastStatus: 'error', lastError: 'Токен отозван или истёк' },
            status.runs[1],
          ],
        }}
        sources={sources}
        period={period}
        now={NOW}
      />,
    )
    expect(screen.getByText(/Токен отозван или истёк/)).toBeInTheDocument()
  })

  it('плашки периода ведут в /admin/traffic, есть «90 дней»', () => {
    render(<TrafficDashboard status={status} sources={sources} period={period} now={NOW} />)
    expect(screen.getByRole('link', { name: '90 дней' })).toHaveAttribute(
      'href',
      '/admin/traffic?preset=quarter',
    )
  })
})

// Роль проверяется внутри страницы до любого запроса: layout и page рендерятся
// параллельно, защита в layout страницу не останавливает.
describe('страница /admin/traffic', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchCurrentAdmin.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('редактор видит отказ, запросов к api нет', async () => {
    fetchCurrentAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'editor' })
    render(await AdminTrafficPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Раздел доступен только администратору.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('нет сессии — тоже отказ без запросов', async () => {
    fetchCurrentAdmin.mockResolvedValue(null)
    render(await AdminTrafficPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Раздел доступен только администратору.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('admin: запрашивает статус и источники за период, показывает дашборд', async () => {
    fetchCurrentAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'admin' })
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ data: url.includes('/status') ? status : sources }),
    }))
    render(
      await AdminTrafficPage({
        searchParams: Promise.resolve({ preset: 'custom', from: '2026-10-20', to: '2026-10-26' }),
      }),
    )
    expect(screen.getByRole('table', { name: 'Визиты по источникам' })).toBeInTheDocument()
    const urls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.endsWith('/api/admin/traffic/status'))).toBe(true)
    expect(
      urls.some((u) => u.includes('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')),
    ).toBe(true)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { cookie: 'session=abc' } })
  })

  it('сбой api — сообщение вместо падения', async () => {
    fetchCurrentAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'admin' })
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(await AdminTrafficPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Не удалось загрузить данные/)).toBeInTheDocument()
    spy.mockRestore()
  })
})
