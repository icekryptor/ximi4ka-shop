import { z } from 'zod'
import { MAX_STATS_DAYS } from '@ximi4ka-shop/shared/types/analytics'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

// Время в UTC-полночь для корректной даты YYYY-MM-DD, иначе null. Проверка
// «туда-обратно» отсекает 2026-02-31, который Date иначе мог бы перекатить в март.
function parseDay(value: string): number | null {
  if (!DAY_RE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

export const StatsQuerySchema = z
  .object({ from: z.string(), to: z.string() })
  .superRefine((q, ctx) => {
    const from = parseDay(q.from)
    const to = parseDay(q.to)
    if (from === null) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from: ожидается дата YYYY-MM-DD' })
    }
    if (to === null) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to: ожидается дата YYYY-MM-DD' })
    }
    if (from === null || to === null) return
    if (from > to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to раньше from' })
    } else if ((to - from) / MS_PER_DAY + 1 > MAX_STATS_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Период не больше ${MAX_STATS_DAYS} дней`,
      })
    }
  })
