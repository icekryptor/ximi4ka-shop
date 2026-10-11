import { cookies } from 'next/headers'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { StatsDashboard } from './StatsDashboard'
import { resolvePeriod } from './statsPeriod'

// Главная админки — статистика. Тот же паттерн, что у списка заказов: cookie
// пробрасываем вручную (api на другом origin), cache: 'no-store' для свежих данных.
async function fetchStats(from: string, to: string): Promise<StatsResponse> {
  const store = await cookies()
  const params = new URLSearchParams({ from, to })
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/stats?${params.toString()}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin stats failed: ${res.status}`)
  }
  return ((await res.json()) as { data: StatsResponse }).data
}

interface SearchParams {
  preset?: string
  from?: string
  to?: string
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const period = resolvePeriod(params, new Date())

  let stats: StatsResponse
  try {
    stats = await fetchStats(period.from, period.to)
  } catch {
    return (
      <div className="bg-white rounded-2xl border border-brand-border p-6 max-w-xl">
        <h1 className="text-xl font-bold text-brand-text mb-2">Статистика</h1>
        <p className="text-brand-text-secondary">
          Не удалось загрузить статистику. Обновите страницу или попробуйте позже.
        </p>
      </div>
    )
  }

  return <StatsDashboard stats={stats} period={period} />
}
