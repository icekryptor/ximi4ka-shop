import { cookies } from 'next/headers'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { fetchCurrentAdmin } from '@/lib/adminSession'
import { resolvePeriod } from '../statsPeriod'
import { TrafficDashboard } from './TrafficDashboard'

// Тот же паттерн, что у главной админки: cookie пробрасываем вручную (api на
// другом origin), cache: 'no-store'. Во внешние API страница не ходит.
async function fetchAdmin<T>(path: string): Promise<T> {
  const store = await cookies()
  const res = await fetch(`${ADMIN_API_URL_SERVER}${path}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Admin traffic failed: ${res.status} ${path}`)
  return ((await res.json()) as { data: T }).data
}

interface SearchParams {
  preset?: string
  from?: string
  to?: string
}

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  // Роль сверяем до запросов: layout не остановит параллельный рендер страницы.
  const admin = await fetchCurrentAdmin()
  if (admin?.role !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-brand-border p-6 max-w-xl">
        <h1 className="text-xl font-bold text-brand-text mb-2">Трафик и рост</h1>
        <p className="text-brand-text-secondary">Раздел доступен только администратору.</p>
      </div>
    )
  }

  const period = resolvePeriod((await searchParams) ?? {}, new Date())
  const params = new URLSearchParams({ from: period.from, to: period.to })

  let status: TrafficStatus
  let sources: TrafficSourcesResponse
  try {
    ;[status, sources] = await Promise.all([
      fetchAdmin<TrafficStatus>('/api/admin/traffic/status'),
      fetchAdmin<TrafficSourcesResponse>(`/api/admin/traffic/sources?${params.toString()}`),
    ])
  } catch (err) {
    console.error('Admin traffic failed', err)
    return (
      <div className="bg-white rounded-2xl border border-brand-border p-6 max-w-xl">
        <h1 className="text-xl font-bold text-brand-text mb-2">Трафик и рост</h1>
        <p className="text-brand-text-secondary">
          Не удалось загрузить данные. Обновите страницу или попробуйте позже.
        </p>
      </div>
    )
  }

  return <TrafficDashboard status={status} sources={sources} period={period} now={new Date()} />
}
