import { resolveCounterId } from '../metrika/worker.js'
import {
  METRIKA_HISTORY_START,
  SYNC_CHECK_INTERVAL_MS,
  SYNC_MIN_GAP_MS,
  SYNC_WINDOW_DAYS,
} from './constants.js'
import { addDays, todayMsk } from './dates.js'
import { MetrikaReportsClient, type DataClient } from './metrikaReports.js'
import { lastSuccessAt, recordRun } from './runs.js'
import { syncMetrika, type DateRange } from './sync.js'

export function searchStatsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.SEARCH_STATS_SYNC_ENABLED === 'true'
}

export function searchStatsConfigured(env: NodeJS.ProcessEnv): boolean {
  return searchStatsEnabled(env) && Boolean(env.YANDEX_STATS_OAUTH_TOKEN?.trim())
}

export function syncDue(lastOk: Date | null, now: Date): boolean {
  return !lastOk || now.getTime() - lastOk.getTime() >= SYNC_MIN_GAP_MS
}

// Вчера и шесть дней до него; первый запуск (успехов ещё не было) — вся история
// счётчика. После простоя дольше недели окно тянется от последнего успешного
// дня, иначе в данных остаётся дыра. Успех «вчера» или «сегодня» — не простой.
export function syncWindow(today: string, lastSuccessDay: string | null): DateRange {
  const yesterday = addDays(today, -1)
  if (lastSuccessDay === null) return { from: METRIKA_HISTORY_START, to: yesterday }
  const anchor = lastSuccessDay >= yesterday ? today : lastSuccessDay
  const from = addDays(anchor, -SYNC_WINDOW_DAYS)
  return { from: from < METRIKA_HISTORY_START ? METRIKA_HISTORY_START : from, to: yesterday }
}

export async function runMetrikaSyncIfDue({
  client,
  counterId,
  now,
  sleep,
}: {
  client: DataClient
  counterId: string
  now: Date
  sleep?: (ms: number) => Promise<void>
}): Promise<'skipped' | 'ok' | 'error'> {
  const last = await lastSuccessAt('metrika')
  if (!syncDue(last, now)) return 'skipped'
  const range = syncWindow(todayMsk(now), last ? todayMsk(last) : null)
  const run = await recordRun('metrika', () => syncMetrika(client, counterId, range, sleep))
  if (!run.ok) console.warn(`search-stats: синхронизация Метрики не удалась: ${run.error}`)
  return run.ok ? 'ok' : 'error'
}

// Проверка раз в час, синхронизация — не чаще раза в 20 часов (по журналу),
// поэтому перезапуск api не плодит запросов. Без флага, токена и вне
// production не стартует (null).
export function startSearchStatsWorker({
  env = process.env,
  intervalMs = SYNC_CHECK_INTERVAL_MS,
  client,
}: {
  env?: NodeJS.ProcessEnv
  intervalMs?: number
  client?: DataClient
} = {}): NodeJS.Timeout | null {
  if (!searchStatsEnabled(env)) return null
  if (env.NODE_ENV !== 'production') {
    console.warn('search-stats: синхронизация включена, но NODE_ENV не production: не запускаем')
    return null
  }
  const metrika = client ?? MetrikaReportsClient.fromEnv(env)
  if (!metrika || !env.YANDEX_STATS_OAUTH_TOKEN?.trim()) {
    console.warn(
      'search-stats: SEARCH_STATS_SYNC_ENABLED=true, но YANDEX_STATS_OAUTH_TOKEN не задан',
    )
    return null
  }

  let running = false
  let warnedNoCounter = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const counterId = await resolveCounterId(env)
      if (!counterId) {
        if (!warnedNoCounter) {
          console.warn(
            'search-stats: не задан номер счётчика (настройки сайта или METRIKA_COUNTER_ID)',
          )
          warnedNoCounter = true
        }
        return
      }
      warnedNoCounter = false
      await runMetrikaSyncIfDue({ client: metrika, counterId, now: new Date() })
    } catch (err) {
      console.error('search-stats: сбой цикла синхронизации', err)
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref()
  return timer
}
