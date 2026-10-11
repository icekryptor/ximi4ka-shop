import type { StatsDay, StatsResponse, StatsTotals } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'

const TZ = 'Europe/Moscow'

// Границы периода по Москве: [00:00 from, 00:00 дня после to). Москва без
// перехода на летнее время, но AT TIME ZONE оставляет решение базе.
// orders.created_at — timestamp БЕЗ пояса (TypeORM @CreateDateColumn, DEFAULT now()),
// значение записано во времени сессии БД. Сравнение с timestamptz-границами s/e
// Postgres делает, приводя наивное значение по TimeZone сессии, то есть ровно так,
// как оно было записано, поэтому результат не зависит от настройки TimeZone базы.
const PERIOD_CTE = `
  WITH b AS (
    SELECT ($1::date)::timestamp AT TIME ZONE '${TZ}' AS s,
           (($2::date) + 1)::timestamp AT TIME ZONE '${TZ}' AS e
  )`

type TotalsRow = Record<'clicks' | 'carts' | 'orders' | 'revenue' | 'logins' | 'new_users', string>
type DayRow = { date: string; orders: string; revenue: string }

// from/to — валидные YYYY-MM-DD (проверяет StatsQuerySchema), оба включительно.
export async function getStats(from: string, to: string): Promise<StatsResponse> {
  const [totalsRows, dayRows] = await Promise.all([
    AppDataSource.query(
      `${PERIOD_CTE}
       SELECT
         (SELECT COUNT(*) FROM analytics_events x, b
           WHERE x.occurred_at >= b.s AND x.occurred_at < b.e) AS clicks,
         (SELECT COUNT(DISTINCT x.visitor_id) FROM analytics_events x, b
           WHERE x.type = 'add_to_cart' AND x.occurred_at >= b.s AND x.occurred_at < b.e) AS carts,
         (SELECT COUNT(*) FROM orders o, b
           WHERE o.deleted_at IS NULL AND o.created_at >= b.s AND o.created_at < b.e) AS orders,
         (SELECT COALESCE(SUM(o.total_rub), 0) FROM orders o, b
           WHERE o.deleted_at IS NULL AND o.status IN ('paid', 'shipped')
             AND o.paid_at >= b.s AND o.paid_at < b.e) AS revenue,
         (SELECT COUNT(*) FROM customer_sessions c, b
           WHERE c.created_at >= b.s AND c.created_at < b.e) AS logins,
         (SELECT COUNT(*) FROM customers c, b
           WHERE c.created_at >= b.s AND c.created_at < b.e) AS new_users`,
      [from, to],
    ) as Promise<TotalsRow[]>,
    AppDataSource.query(
      `${PERIOD_CTE}
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              COALESCE(o.orders, 0) AS orders,
              COALESCE(r.revenue, 0) AS revenue
         FROM generate_series($1::date::timestamp, $2::date::timestamp, interval '1 day') AS d(day)
         LEFT JOIN (
           SELECT ((o.created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE '${TZ}')::date AS day, COUNT(*) AS orders
             FROM orders o, b
            WHERE o.deleted_at IS NULL AND o.created_at >= b.s AND o.created_at < b.e
            GROUP BY 1
         ) o ON o.day = d.day::date
         LEFT JOIN (
           SELECT (o.paid_at AT TIME ZONE '${TZ}')::date AS day, SUM(o.total_rub) AS revenue
             FROM orders o, b
            WHERE o.deleted_at IS NULL AND o.status IN ('paid', 'shipped')
              AND o.paid_at >= b.s AND o.paid_at < b.e
            GROUP BY 1
         ) r ON r.day = d.day::date
        ORDER BY d.day`,
      [from, to],
    ) as Promise<DayRow[]>,
  ])

  // COUNT и SUM приходят из pg строками (bigint) — приводим явно.
  const t = totalsRows[0]
  const totals: StatsTotals = {
    clicks: Number(t.clicks),
    carts: Number(t.carts),
    orders: Number(t.orders),
    revenueRub: Number(t.revenue),
    logins: Number(t.logins),
    newUsers: Number(t.new_users),
  }
  const days: StatsDay[] = dayRows.map((r) => ({
    date: r.date,
    orders: Number(r.orders),
    revenueRub: Number(r.revenue),
  }))

  return { from, to, totals, days }
}
