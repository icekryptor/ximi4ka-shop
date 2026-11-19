// Раздел админки «Трафик и рост»: данные Метрики и Вебмастера, которые
// синхронизируются в нашу базу (api/src/lib/searchStats). Без импортов:
// файл читают и api, и web (Turbopack не резолвит ./x.js внутри shared).
export const SYNC_SOURCES = ['metrika', 'webmaster'] as const
export type SyncSource = (typeof SYNC_SOURCES)[number]
export type SyncRunStatus = 'running' | 'ok' | 'error'

export interface SyncRunInfo {
  source: SyncSource
  /** ISO-время начала последнего запуска. */
  lastStartedAt: string | null
  lastStatus: SyncRunStatus | null
  /** Понятный текст ошибки последнего запуска, без токена. */
  lastError: string | null
  /** ISO-время окончания последнего успешного запуска. */
  lastSuccessAt: string | null
}

export interface TrafficStatus {
  /** Флаг SEARCH_STATS_SYNC_ENABLED включён и токен задан. */
  configured: boolean
  runs: SyncRunInfo[]
  /** Первый и последний день, за которые есть визиты, YYYY-MM-DD. */
  dataSince: string | null
  dataUntil: string | null
}

export interface TrafficSourceTotal {
  /** Код источника Метрики: organic, direct, referral, ad, social… */
  source: string
  visits: number
  prevVisits: number
}

export interface SearchEngineTotal {
  /** Код поисковика Метрики (только для source = organic). */
  engine: string
  visits: number
  prevVisits: number
}

export interface TrafficWeek {
  /** Понедельник недели, YYYY-MM-DD. */
  weekStart: string
  visitsBySource: Record<string, number>
}

export interface TrafficSourcesResponse {
  from: string
  to: string
  /** Прошлый период той же длины, сразу перед from. */
  prevFrom: string
  prevTo: string
  totalVisits: number
  prevTotalVisits: number
  sources: TrafficSourceTotal[]
  engines: SearchEngineTotal[]
  weeks: TrafficWeek[]
}
