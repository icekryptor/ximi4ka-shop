import { METRIKA_METRICS } from './constants.js'
import { addDays } from './dates.js'
import type { DataClient, StatDimension, StatQuery } from './metrikaReports.js'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ProbeVariant {
  label: string
  query: Omit<StatQuery, 'date1' | 'date2' | 'metrics'>
}

// Варианты имён: в 2026 году Яндекс менял модели атрибуции, документация
// расходится. Сравнить визиты с «Источники, сводка» в интерфейсе Метрики за тот же день.
export const PROBE_VARIANTS: ProbeVariant[] = [
  {
    label: 'lastsign: источник',
    query: { dimensions: ['ym:s:date', 'ym:s:lastsignTrafficSource'] },
  },
  {
    label: 'attribution=cross_device_last_significant: источник',
    query: {
      dimensions: ['ym:s:date', 'ym:s:<attribution>TrafficSource'],
      attribution: 'cross_device_last_significant',
    },
  },
  {
    label: 'attribution=lastsign: источник',
    query: {
      dimensions: ['ym:s:date', 'ym:s:<attribution>TrafficSource'],
      attribution: 'lastsign',
    },
  },
  {
    label: 'lastsign: поисковик органики',
    query: {
      dimensions: ['ym:s:date', 'ym:s:lastsignSearchEngineRoot'],
      filters: "ym:s:lastsignTrafficSource=='organic'",
    },
  },
  {
    label: 'cross_device_last_significant: поисковик органики',
    query: {
      dimensions: ['ym:s:date', 'ym:s:<attribution>SearchEngineRoot'],
      filters: "ym:s:<attribution>TrafficSource=='organic'",
      attribution: 'cross_device_last_significant',
    },
  },
  { label: 'страница входа', query: { dimensions: ['ym:s:date', 'ym:s:startURLPath'] } },
]

export interface ProbeResult {
  label: string
  ok: boolean
  error?: string
  rows?: number
  visits?: number
  sample: StatDimension[][]
}

export async function runMetrikaProbe(
  client: DataClient,
  counterId: string,
  day: string,
): Promise<ProbeResult[]> {
  const out: ProbeResult[] = []
  for (const v of PROBE_VARIANTS) {
    try {
      const rows = await client.data(counterId, {
        ...v.query,
        metrics: METRIKA_METRICS,
        date1: day,
        date2: day,
      })
      out.push({
        label: v.label,
        ok: true,
        rows: rows.length,
        visits: rows.reduce((s, r) => s + (r.metrics[0] ?? 0), 0),
        sample: rows.slice(0, 5).map((r) => r.dimensions),
      })
    } catch (err) {
      out.push({
        label: v.label,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        sample: [],
      })
    }
  }
  return out
}

export interface WebmasterProbeStep {
  label: string
  url: string
  status: number
  body: string
  note?: string
}

const WM = 'https://api.webmaster.yandex.net/v4'

export async function runWebmasterProbe(
  fetchImpl: Fetch,
  token: string,
  today: string,
): Promise<WebmasterProbeStep[]> {
  const steps: WebmasterProbeStep[] = []
  const call = async (label: string, url: string, init: RequestInit = {}) => {
    try {
      const res = await fetchImpl(url, {
        ...init,
        headers: { Authorization: `OAuth ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
      const text = await res.text()
      const step: WebmasterProbeStep = { label, url, status: res.status, body: text.slice(0, 1500) }
      steps.push(step)
      return { step, text, ok: res.ok }
    } catch (err) {
      // Сетевая ошибка или таймаут одного шага не должны терять остальной вывод.
      const message = err instanceof Error ? err.message : String(err)
      const step: WebmasterProbeStep = { label, url, status: 0, body: message.slice(0, 1500) }
      steps.push(step)
      return { step, text: '', ok: false }
    }
  }
  const parse = (text: string): Record<string, unknown> => {
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  const user = await call('user', `${WM}/user`)
  const userId = parse(user.text).user_id
  if (!user.ok || typeof userId !== 'number') {
    user.step.note = 'Не удалось получить user_id: дальше шаги невозможны'
    return steps
  }

  const hosts = await call('hosts', `${WM}/user/${userId}/hosts`)
  if (!hosts.ok) {
    hosts.step.note = 'Не удалось получить список сайтов: дальше шаги невозможны'
    return steps
  }
  const list = (parse(hosts.text).hosts ?? []) as Array<{
    host_id?: string
    ascii_host_url?: string
  }>
  const host = list.find((h) => /^https?:\/\/(www\.)?ximi4ka\.ru\/?$/.test(h.ascii_host_url ?? ''))
  if (!host?.host_id) {
    hosts.step.note = 'Хост ximi4ka.ru не найден среди сайтов этого аккаунта'
    return steps
  }
  const base = `${WM}/user/${userId}/hosts/${encodeURIComponent(host.host_id)}`

  await call(
    'search-queries/all/history за 550 дней',
    `${base}/search-queries/all/history?query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&date_from=${addDays(today, -550)}&date_to=${addDays(today, -1)}`,
  )
  await call('query-analytics/list', `${base}/query-analytics/list`, {
    method: 'POST',
    body: JSON.stringify({
      offset: 0,
      limit: 5,
      device_type_indicator: 'ALL',
      text_indicator: 'QUERY',
    }),
  })
  await call(
    'indexing/history за 400 дней',
    `${base}/indexing/history?date_from=${addDays(today, -400)}&date_to=${addDays(today, -1)}`,
  )
  await call(
    'search-urls/in-search/history за 400 дней',
    `${base}/search-urls/in-search/history?date_from=${addDays(today, -400)}&date_to=${addDays(today, -1)}`,
  )
  await call('sqi-history', `${base}/sqi-history`)
  return steps
}
