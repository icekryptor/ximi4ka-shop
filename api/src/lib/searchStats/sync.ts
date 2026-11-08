import { AppDataSource } from '../../config/dataSource.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MAX_RETRY_AFTER_MS } from './constants.js'
import {
  fetchLandingDays,
  fetchSourceDays,
  type DataClient,
  type LandingDayRow,
  type SourceDayRow,
} from './metrikaReports.js'

export interface DateRange {
  from: string
  to: string
}

interface Metrics {
  visits: number
  users: number
  bounceRate: number
  pageDepth: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Строки с одинаковым ключом (два сырых значения Метрики, сведённые к одному
// коду или пути) сливаются: визиты и посетители складываются, отказы и
// глубина — среднее, взвешенное по визитам. Иначе INSERT упадёт на ключе.
export function mergeRows<T extends Metrics>(rows: T[], keyOf: (r: T) => string): T[] {
  const byKey = new Map<string, T>()
  for (const r of rows) {
    const k = keyOf(r)
    const prev = byKey.get(k)
    if (!prev) {
      byKey.set(k, { ...r })
      continue
    }
    const visits = prev.visits + r.visits
    const weight = (a: number, b: number) =>
      visits ? round2((a * prev.visits + b * r.visits) / visits) : 0
    byKey.set(k, {
      ...prev,
      visits,
      users: prev.users + r.users,
      bounceRate: weight(prev.bounceRate, r.bounceRate),
      pageDepth: weight(prev.pageDepth, r.pageDepth),
    })
  }
  return [...byKey.values()]
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!(err instanceof RateLimitError)) throw err
    await sleep(Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS))
    return fn()
  }
}

const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to

// Окно заменяется целиком: Метрика дописывает дни задним числом, а строка,
// пропавшая из отчёта, не должна остаться в базе.
async function replaceSourceDays(range: DateRange, rows: SourceDayRow[]): Promise<void> {
  const r = rows.filter((x) => inRange(x.day, range))
  await AppDataSource.transaction(async (m) => {
    await m.query(`DELETE FROM traffic_sources_daily WHERE day BETWEEN $1::date AND $2::date`, [
      range.from,
      range.to,
    ])
    if (!r.length) return
    await m.query(
      `INSERT INTO traffic_sources_daily (day, source, search_engine, visits, users, bounce_rate, page_depth)
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::int[], $5::int[], $6::numeric[], $7::numeric[])`,
      [
        r.map((x) => x.day),
        r.map((x) => x.source),
        r.map((x) => x.searchEngine),
        r.map((x) => x.visits),
        r.map((x) => x.users),
        r.map((x) => x.bounceRate),
        r.map((x) => x.pageDepth),
      ],
    )
  })
}

async function replaceLandingDays(range: DateRange, rows: LandingDayRow[]): Promise<void> {
  const r = rows.filter((x) => inRange(x.day, range))
  await AppDataSource.transaction(async (m) => {
    await m.query(`DELETE FROM landing_pages_daily WHERE day BETWEEN $1::date AND $2::date`, [
      range.from,
      range.to,
    ])
    if (!r.length) return
    await m.query(
      `INSERT INTO landing_pages_daily (day, path, source, visits, users, bounce_rate, page_depth)
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::int[], $5::int[], $6::numeric[], $7::numeric[])`,
      [
        r.map((x) => x.day),
        r.map((x) => x.path),
        r.map((x) => x.source),
        r.map((x) => x.visits),
        r.map((x) => x.users),
        r.map((x) => x.bounceRate),
        r.map((x) => x.pageDepth),
      ],
    )
  })
}

// Шаги по очереди, каждый в своей транзакции: ошибка шага пробрасывается,
// следующие шаги не выполняются, уже записанное остаётся.
export async function syncMetrika(
  client: DataClient,
  counterId: string,
  range: DateRange,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<number> {
  const sources = mergeRows(
    await withRateLimitRetry(() => fetchSourceDays(client, counterId, range.from, range.to), sleep),
    (r) => `${r.day}|${r.source}|${r.searchEngine}`,
  )
  await replaceSourceDays(range, sources)
  const landings = mergeRows(
    await withRateLimitRetry(
      () => fetchLandingDays(client, counterId, range.from, range.to),
      sleep,
    ),
    (r) => `${r.day}|${r.path}|${r.source}`,
  )
  await replaceLandingDays(range, landings)
  return sources.length + landings.length
}
