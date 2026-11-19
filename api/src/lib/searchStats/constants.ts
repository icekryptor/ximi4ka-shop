// Настройки синхронизации статистики Метрики и Вебмастера (spec
// docs/superpowers/specs/2026-10-28-traffic-growth-admin-design.md).

// Модель «последний значимый переход», как в интерфейсе Метрики. Если пробный
// скрипт (api/src/scripts/search-stats-probe.ts) покажет, что имена lastsign*
// не принимаются, имена меняются на 'ym:s:<attribution>TrafficSource' и т. д.,
// а METRIKA_ATTRIBUTION — на 'cross_device_last_significant'.
export const METRIKA_DIM = {
  date: 'ym:s:date',
  source: 'ym:s:lastsignTrafficSource',
  searchEngine: 'ym:s:lastsignSearchEngineRoot',
  landingPath: 'ym:s:startURLPath',
} as const
export const METRIKA_ATTRIBUTION: string | undefined = undefined
export const METRIKA_METRICS = [
  'ym:s:visits',
  'ym:s:users',
  'ym:s:bounceRate',
  'ym:s:pageDepth',
] as const

// Счётчик 113445304 стоит на сайте с октября 2026: раньше данных нет.
export const METRIKA_HISTORY_START = '2026-10-01'
export const SYNC_WINDOW_DAYS = 7
export const SYNC_MIN_GAP_MS = 20 * 60 * 60 * 1000
export const SYNC_CHECK_INTERVAL_MS = 60 * 60 * 1000
export const MAX_RETRY_AFTER_MS = 5 * 60 * 1000
export const MAX_PATH_LENGTH = 300
