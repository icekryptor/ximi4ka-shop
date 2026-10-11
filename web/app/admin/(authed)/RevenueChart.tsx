import type { StatsDay } from '@ximi4ka-shop/shared'
import { barLayout } from './chartScale'
import { formatRub } from './orders/orderUi'

// Столбцы выручки по дням на inline-SVG: без библиотеки и без клиентского JS.
// Подсказка — нативный <title> внутри столбца.
const WIDTH = 640
const CHART_HEIGHT = 140
const HEIGHT = 164

export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}.${month}`
}

export function RevenueChart({ days }: { days: StatsDay[] }) {
  const bars = barLayout(days, WIDTH, CHART_HEIGHT)
  const first = days[0]
  const last = days[days.length - 1]
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Выручка по дням"
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
        <rect
          key={b.date}
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
          rx={Math.min(3, b.width / 2)}
          className="fill-brand"
        >
          <title>{`${shortDate(b.date)}: ${formatRub(b.revenueRub)}, заказов: ${b.orders}`}</title>
        </rect>
      ))}
      {first && (
        <text x="0" y={HEIGHT - 4} className="fill-brand-text-secondary" fontSize="11">
          {shortDate(first.date)}
        </text>
      )}
      {last && last !== first && (
        <text
          x={WIDTH}
          y={HEIGHT - 4}
          textAnchor="end"
          className="fill-brand-text-secondary"
          fontSize="11"
        >
          {shortDate(last.date)}
        </text>
      )}
    </svg>
  )
}
