import { AppDataSource } from '../../config/dataSource.js'

// Полевые Web Vitals (web_vital) в analytics_events — до пяти строк на каждую
// загрузку страницы витрины. Для разбора INP и LCP хватает последних трёх
// месяцев, поэтому старые замеры удаляем. Цели (add_to_cart и т.д.) не трогаем:
// по ним считается дашборд за любой период.
export const WEB_VITAL_RETENTION_DAYS = 90
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Удаляет web_vital старше WEB_VITAL_RETENTION_DAYS; возвращает число удалённых строк. */
export async function purgeOldWebVitals(now: Date = new Date()): Promise<number> {
  const rows = (await AppDataSource.query(
    `WITH deleted AS (
       DELETE FROM analytics_events
        WHERE type = 'web_vital'
          AND occurred_at < $1::timestamptz - make_interval(days => $2::int)
       RETURNING 1
     )
     SELECT COUNT(*)::int AS count FROM deleted`,
    [now.toISOString(), WEB_VITAL_RETENTION_DAYS],
  )) as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

// Запускается из api/src/index.ts: чистка сразу при старте и затем раз в сутки.
export function startWebVitalsRetentionJob(
  opts: { purge?: () => Promise<number>; intervalMs?: number } = {},
): NodeJS.Timeout {
  const purge = opts.purge ?? (() => purgeOldWebVitals())
  const run = (): void => {
    purge().catch((err) => {
      console.error('analytics: чистка старых web_vital не удалась —', err)
    })
  }
  run()
  const timer = setInterval(run, opts.intervalMs ?? RETENTION_INTERVAL_MS)
  // Процесс не держим ради чистки.
  timer.unref()
  return timer
}
