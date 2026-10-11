import { MAX_STATS_DAYS } from '@ximi4ka-shop/shared/types/analytics'

// Период дашборда из searchParams. Неделя и месяц — скользящие окна из 7 и
// 30 дней, включая сегодня по Москве (как и границы дней в api). Любой
// некорректный ввод откатывается на неделю, а не на ошибку страницы.
export type PeriodPreset = 'week' | 'month' | 'custom'

export interface StatsPeriod {
  preset: PeriodPreset
  from: string
  to: string
}

const PRESET_DAYS = { week: 7, month: 30 } as const
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function todayMsk(now: Date): string {
  // en-CA даёт ровно YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * MS_PER_DAY).toISOString().slice(0, 10)
}

function parseDay(value: string | undefined): number | null {
  if (!value || !DAY_RE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

export function resolvePeriod(
  params: { preset?: string; from?: string; to?: string },
  now: Date,
): StatsPeriod {
  if (params.preset === 'custom') {
    const from = parseDay(params.from)
    const to = parseDay(params.to)
    if (
      from !== null &&
      to !== null &&
      from <= to &&
      (to - from) / MS_PER_DAY + 1 <= MAX_STATS_DAYS
    ) {
      return { preset: 'custom', from: params.from as string, to: params.to as string }
    }
  }
  const preset = params.preset === 'month' ? 'month' : 'week'
  const today = todayMsk(now)
  return { preset, from: addDays(today, -(PRESET_DAYS[preset] - 1)), to: today }
}
