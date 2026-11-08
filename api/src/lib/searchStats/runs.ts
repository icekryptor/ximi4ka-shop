import { SYNC_SOURCES, type SyncRunInfo, type SyncSource } from '@ximi4ka-shop/shared/types/traffic'
import { AppDataSource } from '../../config/dataSource.js'
import { MetrikaError } from '../metrika/client.js'
import { RateLimitError } from '../notifications/rateLimit.js'

// Текст для владельца: что сломалось и что сделать. Токена здесь быть не
// может: сообщения строятся из кода ответа и обрезанного тела.
export function describeSyncError(err: unknown): string {
  if (err instanceof RateLimitError) {
    return 'Метрика попросила подождать (лимит запросов); следующая попытка через час'
  }
  if (err instanceof MetrikaError && err.status === 401) {
    return 'Токен отозван или истёк: перевыпустите YANDEX_STATS_OAUTH_TOKEN'
  }
  if (err instanceof MetrikaError && err.status === 403) {
    return 'У токена нет права metrika:read или доступа к счётчику'
  }
  if (err instanceof Error) return err.message.slice(0, 300)
  return 'Неизвестная ошибка'
}

export async function recordRun(
  source: SyncSource,
  fn: () => Promise<number>,
): Promise<{ ok: boolean; rows: number; error: string | null }> {
  const [{ id }] = (await AppDataSource.query(
    `INSERT INTO search_stats_sync_runs (source) VALUES ($1) RETURNING id`,
    [source],
  )) as Array<{ id: string }>
  try {
    const rows = await fn()
    await AppDataSource.query(
      `UPDATE search_stats_sync_runs SET status = 'ok', finished_at = now(), rows = $2 WHERE id = $1`,
      [id, rows],
    )
    return { ok: true, rows, error: null }
  } catch (err) {
    const error = describeSyncError(err)
    await AppDataSource.query(
      `UPDATE search_stats_sync_runs SET status = 'error', finished_at = now(), error = $2 WHERE id = $1`,
      [id, error],
    )
    return { ok: false, rows: 0, error }
  }
}

export async function lastSuccessAt(source: SyncSource): Promise<Date | null> {
  const [row] = (await AppDataSource.query(
    `SELECT MAX(finished_at) AS at FROM search_stats_sync_runs WHERE source = $1 AND status = 'ok'`,
    [source],
  )) as Array<{ at: Date | null }>
  return row?.at ?? null
}

export async function latestRuns(): Promise<SyncRunInfo[]> {
  const last = (await AppDataSource.query(
    `SELECT DISTINCT ON (source) source, started_at, status, error
       FROM search_stats_sync_runs ORDER BY source, started_at DESC`,
  )) as Array<{
    source: SyncSource
    started_at: Date
    status: SyncRunInfo['lastStatus']
    error: string | null
  }>
  const ok = (await AppDataSource.query(
    `SELECT source, MAX(finished_at) AS at FROM search_stats_sync_runs WHERE status = 'ok' GROUP BY source`,
  )) as Array<{ source: SyncSource; at: Date }>
  return SYNC_SOURCES.map((source) => {
    const l = last.find((r) => r.source === source)
    const s = ok.find((r) => r.source === source)
    return {
      source,
      lastStartedAt: l ? l.started_at.toISOString() : null,
      lastStatus: l?.status ?? null,
      lastError: l?.error ?? null,
      lastSuccessAt: s ? s.at.toISOString() : null,
    }
  })
}
