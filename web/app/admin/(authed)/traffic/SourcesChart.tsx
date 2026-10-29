import type { TrafficWeek } from '@ximi4ka-shop/shared'
import { shortDate } from '../RevenueChart'
import { SERIES, stackLayout } from './sourcesChartLayout'
import { formatCount } from './trafficFormat'

// Сложенные столбцы по неделям на inline-SVG, как RevenueChart: без библиотеки и клиентского JS.
const WIDTH = 640
const CHART_HEIGHT = 140
const HEIGHT = 164

export function SourcesChart({ weeks }: { weeks: TrafficWeek[] }) {
  const bars = stackLayout(weeks, WIDTH, CHART_HEIGHT)
  const label = (key: string) => SERIES.find((s) => s.key === key)?.label ?? key
  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Визиты по неделям и источникам"
        className="w-full h-auto"
      >
        <line
          x1="0"
          y1={CHART_HEIGHT}
          x2={WIDTH}
          y2={CHART_HEIGHT}
          className="stroke-brand-border"
          strokeWidth="1"
        />
        {bars.map((b) => (
          <g key={b.weekStart}>
            {b.segments.map((s) => (
              <rect
                key={s.key}
                x={b.x}
                y={s.y}
                width={b.width}
                height={s.height}
                fill={SERIES.find((x) => x.key === s.key)?.color}
              >
                <title>{`Неделя с ${shortDate(b.weekStart)}: ${label(s.key)} — ${formatCount(s.visits)} из ${formatCount(b.total)}`}</title>
              </rect>
            ))}
            <text
              x={b.x + b.width / 2}
              y={HEIGHT - 4}
              textAnchor="middle"
              className="fill-brand-text-secondary"
              fontSize="11"
            >
              {shortDate(b.weekStart)}
            </text>
          </g>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-text-secondary">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
