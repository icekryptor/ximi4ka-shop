import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaError, retryAfterMs } from '../metrika/client.js'
import { MAX_PATH_LENGTH, METRIKA_ATTRIBUTION, METRIKA_DIM, METRIKA_METRICS } from './constants.js'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const STAT_URL = 'https://api-metrika.yandex.net/stat/v1/data'
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export interface StatQuery {
  dimensions: string[]
  metrics: readonly string[]
  date1: string
  date2: string
  filters?: string
  attribution?: string
}

export interface StatDimension {
  id: string | null
  name: string | null
}

export interface StatRow {
  dimensions: StatDimension[]
  metrics: number[]
}

interface RawBody {
  data?: unknown
  total_rows?: unknown
  sampled?: unknown
}

type RawRow = { dimensions?: Array<{ id?: unknown; name?: unknown } | null>; metrics?: unknown[] }

// Клиент Reporting API Метрики, только чтение. Отдельный токен от загрузки
// конверсий (METRIKA_OAUTH_TOKEN): у этого лишь metrika:read и права Вебмастера.
export class MetrikaReportsClient {
  private readonly token: string
  private readonly fetchImpl: Fetch
  private readonly timeoutMs: number
  private readonly pageSize: number

  constructor(opts: { token: string; fetch?: Fetch; timeoutMs?: number; pageSize?: number }) {
    this.token = opts.token
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.pageSize = opts.pageSize ?? 100_000
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): MetrikaReportsClient | null {
    const token = env.YANDEX_STATS_OAUTH_TOKEN?.trim()
    return token ? new MetrikaReportsClient({ token }) : null
  }

  async data(counterId: string, q: StatQuery): Promise<StatRow[]> {
    const rows: StatRow[] = []
    for (let offset = 1; ; offset += this.pageSize) {
      const params = new URLSearchParams({
        ids: counterId,
        dimensions: q.dimensions.join(','),
        metrics: q.metrics.join(','),
        date1: q.date1,
        date2: q.date2,
        accuracy: 'full',
        timezone: '+03:00',
        limit: String(this.pageSize),
        offset: String(offset),
      })
      if (q.filters) params.set('filters', q.filters)
      if (q.attribution) params.set('attribution', q.attribution)

      const res = await this.fetchImpl(`${STAT_URL}?${params.toString()}`, {
        headers: { Authorization: `OAuth ${this.token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      // В разных версиях документации превышение квоты — 429 или 420.
      if (res.status === 429 || res.status === 420) {
        await res.body?.cancel()
        throw new RateLimitError(
          `Metrika ${res.status}`,
          retryAfterMs(res.headers.get('retry-after')),
        )
      }
      const text = await res.text()
      if (!res.ok) {
        throw new MetrikaError(res.status, `Metrika ${res.status}: ${text.slice(0, 300)}`)
      }
      let body: RawBody
      try {
        body = JSON.parse(text) as RawBody
      } catch {
        throw new MetrikaError(res.status, 'Metrika: ответ не JSON')
      }
      if (body.sampled === true) {
        throw new MetrikaError(
          res.status,
          'Metrika: ответ сэмплирован, хотя запрошена полная точность',
        )
      }
      if (!Array.isArray(body.data)) {
        throw new MetrikaError(res.status, 'Metrika: в ответе нет data')
      }
      for (const raw of body.data as RawRow[]) {
        rows.push({
          dimensions: (raw.dimensions ?? []).map((d) => ({
            id: typeof d?.id === 'string' ? d.id : null,
            name: typeof d?.name === 'string' ? d.name : null,
          })),
          metrics: (raw.metrics ?? []).map((m) => Number(m) || 0),
        })
      }
      const total = Number(body.total_rows ?? 0)
      if (body.data.length < this.pageSize || rows.length >= total) return rows
    }
  }
}

export type DataClient = Pick<MetrikaReportsClient, 'data'>

interface Metrics {
  visits: number
  users: number
  bounceRate: number
  pageDepth: number
}

export interface SourceDayRow extends Metrics {
  day: string
  source: string
  /** '' — итог источника; у organic отдельные строки по поисковикам. */
  searchEngine: string
}

export interface LandingDayRow extends Metrics {
  day: string
  path: string
  source: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

function metricsOf(r: StatRow): Metrics {
  const [visits = 0, users = 0, bounceRate = 0, pageDepth = 0] = r.metrics
  return {
    visits: Math.round(visits),
    users: Math.round(users),
    bounceRate: round2(bounceRate),
    pageDepth: round2(pageDepth),
  }
}

function dayOf(d: StatDimension | undefined): string | null {
  const v = d?.name ?? d?.id ?? null
  return v && DAY_RE.test(v) ? v : null
}

// Код источника — varchar(32), поисковика — varchar(64): длинное имя без id режем,
// иначе вставка падает и весь синхрон остаётся без данных.
const SOURCE_CODE_MAX = 32
const ENGINE_CODE_MAX = 64
const codeOf = (d: StatDimension | undefined, max: number) =>
  (d?.id ?? d?.name ?? 'undefined').slice(0, max)

export function normalizePath(name: string | null): string {
  const p = (name ?? '').trim()
  if (!p) return '/'
  return (p.startsWith('/') ? p : `/${p}`).slice(0, MAX_PATH_LENGTH)
}

// Два запроса: итоги по источникам и поисковики внутри органики. Третье
// измерение в одном запросе не годится: строки с пустым поисковиком у
// непоисковых источников Метрика может отбросить.
export async function fetchSourceDays(
  client: DataClient,
  counterId: string,
  from: string,
  to: string,
): Promise<SourceDayRow[]> {
  const base = {
    metrics: METRIKA_METRICS,
    date1: from,
    date2: to,
    attribution: METRIKA_ATTRIBUTION,
  }
  const totals = await client.data(counterId, {
    ...base,
    dimensions: [METRIKA_DIM.date, METRIKA_DIM.source],
  })
  const engines = await client.data(counterId, {
    ...base,
    dimensions: [METRIKA_DIM.date, METRIKA_DIM.searchEngine],
    filters: `${METRIKA_DIM.source}=='organic'`,
  })
  const out: SourceDayRow[] = []
  for (const r of totals) {
    const day = dayOf(r.dimensions[0])
    if (day)
      out.push({
        day,
        source: codeOf(r.dimensions[1], SOURCE_CODE_MAX),
        searchEngine: '',
        ...metricsOf(r),
      })
  }
  for (const r of engines) {
    const day = dayOf(r.dimensions[0])
    if (day)
      out.push({
        day,
        source: 'organic',
        searchEngine: codeOf(r.dimensions[1], ENGINE_CODE_MAX),
        ...metricsOf(r),
      })
  }
  return out
}

export async function fetchLandingDays(
  client: DataClient,
  counterId: string,
  from: string,
  to: string,
): Promise<LandingDayRow[]> {
  const rows = await client.data(counterId, {
    metrics: METRIKA_METRICS,
    date1: from,
    date2: to,
    attribution: METRIKA_ATTRIBUTION,
    dimensions: [METRIKA_DIM.date, METRIKA_DIM.landingPath, METRIKA_DIM.source],
  })
  const out: LandingDayRow[] = []
  for (const r of rows) {
    const day = dayOf(r.dimensions[0])
    if (!day) continue
    out.push({
      day,
      path: normalizePath(r.dimensions[1]?.name ?? null),
      source: codeOf(r.dimensions[2], SOURCE_CODE_MAX),
      ...metricsOf(r),
    })
  }
  return out
}
