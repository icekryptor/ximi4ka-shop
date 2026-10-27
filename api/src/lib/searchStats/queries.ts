import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { addDays, daysInclusive } from './dates.js'
import { latestRuns } from './runs.js'
import { searchStatsConfigured } from './worker.js'

// Колонки date всегда через to_char: pg превращает date в JS Date в поясе
// процесса, и день может съехать.

export async function getTrafficStatus(env: NodeJS.ProcessEnv): Promise<TrafficStatus> {
  const [range] = (await AppDataSource.query(
    `SELECT to_char(MIN(day), 'YYYY-MM-DD') AS since, to_char(MAX(day), 'YYYY-MM-DD') AS until
       FROM traffic_sources_daily`,
  )) as Array<{ since: string | null; until: string | null }>
  return {
    configured: searchStatsConfigured(env),
    runs: await latestRuns(),
    dataSince: range?.since ?? null,
    dataUntil: range?.until ?? null,
  }
}

type TotalRow = { key: string; visits: string; prev: string }

// $1..$2 — период, $3..$4 — прошлый период той же длины.
const TOTALS_SQL = (keyCol: string, where: string) => `
  SELECT ${keyCol} AS key,
         COALESCE(SUM(visits) FILTER (WHERE day BETWEEN $1::date AND $2::date), 0) AS visits,
         COALESCE(SUM(visits) FILTER (WHERE day BETWEEN $3::date AND $4::date), 0) AS prev
    FROM traffic_sources_daily
   WHERE ${where} AND day BETWEEN $3::date AND $2::date
   GROUP BY ${keyCol}
  HAVING SUM(visits) > 0
   ORDER BY visits DESC, prev DESC, key`

// Синхронизированные данные не доходят до «сегодня» (а при сбое и до вчера):
// если период упирается в них, сжимаем его до последнего дня с данными, иначе
// прошлый период той же длины выглядел бы заведомо «больше» текущего.
async function lastDataDay(): Promise<string | null> {
  const [row] = (await AppDataSource.query(
    `SELECT to_char(MAX(day), 'YYYY-MM-DD') AS until FROM traffic_sources_daily`,
  )) as Array<{ until: string | null }>
  return row?.until ?? null
}

export async function getTrafficSources(
  from: string,
  requestedTo: string,
): Promise<TrafficSourcesResponse> {
  const maxDay = await lastDataDay()
  const to = maxDay !== null && requestedTo > maxDay && from <= maxDay ? maxDay : requestedTo
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(from, -daysInclusive(from, to))
  const params = [from, to, prevFrom, prevTo]

  const [sourceRows, engineRows, weekRows] = await Promise.all([
    AppDataSource.query(TOTALS_SQL('source', `search_engine = ''`), params) as Promise<TotalRow[]>,
    AppDataSource.query(
      TOTALS_SQL('search_engine', `source = 'organic' AND search_engine <> ''`),
      params,
    ) as Promise<TotalRow[]>,
    AppDataSource.query(
      `SELECT to_char(date_trunc('week', day), 'YYYY-MM-DD') AS week, source, SUM(visits) AS visits
         FROM traffic_sources_daily
        WHERE search_engine = '' AND day BETWEEN $1::date AND $2::date
        GROUP BY 1, 2
        ORDER BY 1, visits DESC`,
      [from, to],
    ) as Promise<Array<{ week: string; source: string; visits: string }>>,
  ])

  const sources = sourceRows
    .map((r) => ({ source: r.key, visits: Number(r.visits), prevVisits: Number(r.prev) }))
    .filter((r) => r.visits > 0 || r.prevVisits > 0)
  const engines = engineRows.map((r) => ({
    engine: r.key,
    visits: Number(r.visits),
    prevVisits: Number(r.prev),
  }))
  const weeks: TrafficSourcesResponse['weeks'] = []
  for (const r of weekRows) {
    let w = weeks.at(-1)
    if (!w || w.weekStart !== r.week) {
      w = { weekStart: r.week, visitsBySource: {} }
      weeks.push(w)
    }
    w.visitsBySource[r.source] = Number(r.visits)
  }

  return {
    from,
    to,
    prevFrom,
    prevTo,
    totalVisits: sources.reduce((s, r) => s + r.visits, 0),
    prevTotalVisits: sources.reduce((s, r) => s + r.prevVisits, 0),
    sources,
    engines,
    weeks,
  }
}
