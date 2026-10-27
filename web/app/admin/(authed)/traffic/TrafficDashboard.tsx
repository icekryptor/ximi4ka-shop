import Link from 'next/link'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { CHIP_ACTIVE, CHIP_IDLE } from '../StatsDashboard'
import type { PeriodPreset, StatsPeriod } from '../statsPeriod'
import { SourcesChart } from './SourcesChart'
import { SyncStatusBanner } from './SyncStatusBanner'
import { engineLabel, formatCount, formatDelta, sourceLabel } from './trafficFormat'

const PRESETS: Array<{ value: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: '90 дней' },
]

const CARD = 'bg-white rounded-2xl border border-brand-border p-5'

export function TrafficDashboard({
  status,
  sources,
  period,
  now,
}: {
  status: TrafficStatus
  sources: TrafficSourcesResponse
  period: StatsPeriod
  now: Date
}) {
  const organic = sources.sources.find((s) => s.source === 'organic') ?? {
    visits: 0,
    prevVisits: 0,
  }
  const empty = sources.sources.length === 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-text">Трафик и рост</h1>
      <SyncStatusBanner status={status} now={now} />

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => {
          const active = period.preset === p.value
          return (
            <Link
              key={p.value}
              href={`/admin/traffic?preset=${p.value}`}
              aria-current={active ? 'page' : undefined}
              className={active ? CHIP_ACTIVE : CHIP_IDLE}
            >
              {p.label}
            </Link>
          )
        })}
        <form
          key={`${period.from}_${period.to}`}
          method="get"
          action="/admin/traffic"
          className="flex flex-wrap items-end gap-2 ml-2"
        >
          <input type="hidden" name="preset" value="custom" />
          <label className="text-sm text-brand-text-secondary">
            <span className="mr-1">С</span>
            <input
              type="date"
              name="from"
              defaultValue={period.from}
              required
              className="px-2 py-1 rounded-lg border border-brand-border bg-white text-brand-text"
            />
          </label>
          <label className="text-sm text-brand-text-secondary">
            <span className="mr-1">По</span>
            <input
              type="date"
              name="to"
              defaultValue={period.to}
              required
              className="px-2 py-1 rounded-lg border border-brand-border bg-white text-brand-text"
            />
          </label>
          <button type="submit" className={period.preset === 'custom' ? CHIP_ACTIVE : CHIP_IDLE}>
            Показать
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={CARD}>
          <div className="text-sm text-brand-text-secondary">Визиты</div>
          <div className="mt-1 text-3xl font-bold text-brand-text">
            {formatCount(sources.totalVisits)}
          </div>
          <div className="mt-1 text-xs text-brand-text-secondary">
            {formatDelta(sources.totalVisits, sources.prevTotalVisits)} к прошлому периоду
          </div>
        </div>
        <div className={CARD}>
          <div className="text-sm text-brand-text-secondary">Из поиска</div>
          <div className="mt-1 text-3xl font-bold text-brand-text">
            {formatCount(organic.visits)}
          </div>
          <div className="mt-1 text-xs text-brand-text-secondary">
            {formatDelta(organic.visits, organic.prevVisits)} к прошлому периоду
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-3 text-sm font-medium text-brand-text">Визиты по неделям</div>
        <SourcesChart weeks={sources.weeks} />
      </div>

      <div className={CARD}>
        <div className="mb-3 text-sm font-medium text-brand-text">Источники</div>
        {empty ? (
          <p className="text-sm text-brand-text-secondary">За этот период данных нет.</p>
        ) : (
          <table aria-label="Визиты по источникам" className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-text-secondary">
                <th className="py-1 font-normal">Источник</th>
                <th className="py-1 font-normal text-right">Визиты</th>
                <th className="py-1 font-normal text-right">К прошлому периоду</th>
              </tr>
            </thead>
            <tbody>
              {sources.sources.map((s) => (
                <tr key={s.source} className="border-t border-brand-border">
                  <td className="py-1.5 text-brand-text">{sourceLabel(s.source)}</td>
                  <td className="py-1.5 text-right text-brand-text">{formatCount(s.visits)}</td>
                  <td className="py-1.5 text-right text-brand-text-secondary">
                    {formatDelta(s.visits, s.prevVisits)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sources.engines.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-sm font-medium text-brand-text">Поиск по системам</div>
            <ul className="space-y-1 text-sm">
              {sources.engines.map((e) => (
                <li key={e.engine} className="flex justify-between">
                  <span className="text-brand-text">{engineLabel(e.engine)}</span>
                  <span className="text-brand-text-secondary">
                    {formatCount(e.visits)} · {formatDelta(e.visits, e.prevVisits)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
