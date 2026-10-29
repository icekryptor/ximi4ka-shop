import type { TrafficWeek } from '@ximi4ka-shop/shared'

// Пять серий: крупные источники отдельно, остальное вместе — больше цветов не читаются.
export const SERIES = [
  { key: 'organic', label: 'Поиск', color: '#2563eb' },
  { key: 'direct', label: 'Прямые заходы', color: '#64748b' },
  { key: 'referral', label: 'Ссылки на сайтах', color: '#16a34a' },
  { key: 'ad', label: 'Реклама', color: '#d97706' },
  { key: 'other', label: 'Остальное', color: '#a78bfa' },
] as const

export type SeriesKey = (typeof SERIES)[number]['key']

const MAIN = new Set<string>(['organic', 'direct', 'referral', 'ad'])
export const seriesKey = (source: string): SeriesKey =>
  MAIN.has(source) ? (source as SeriesKey) : 'other'

export interface StackSegment {
  key: SeriesKey
  y: number
  height: number
  visits: number
}

export interface StackBar {
  weekStart: string
  x: number
  width: number
  total: number
  segments: StackSegment[]
}

export function stackLayout(weeks: TrafficWeek[], width: number, height: number): StackBar[] {
  if (!weeks.length) return []
  const grouped = weeks.map((w) => {
    const bySeries = new Map<SeriesKey, number>()
    for (const [source, visits] of Object.entries(w.visitsBySource)) {
      const k = seriesKey(source)
      bySeries.set(k, (bySeries.get(k) ?? 0) + visits)
    }
    return {
      weekStart: w.weekStart,
      bySeries,
      total: [...bySeries.values()].reduce((s, v) => s + v, 0),
    }
  })
  const max = Math.max(...grouped.map((g) => g.total), 0)
  const slot = width / weeks.length
  const barWidth = Math.max(1, slot * 0.7)
  return grouped.map((g, i) => {
    let top = height
    const segments: StackSegment[] = []
    for (const s of SERIES) {
      const visits = g.bySeries.get(s.key) ?? 0
      if (!visits || !max) continue
      const h = (visits / max) * height
      top -= h
      segments.push({ key: s.key, y: top, height: h, visits })
    }
    return {
      weekStart: g.weekStart,
      x: i * slot + (slot - barWidth) / 2,
      width: barWidth,
      total: g.total,
      segments,
    }
  })
}
