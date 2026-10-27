# Трафик и рост, PR 1: основа и источники — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** раздел админки «Трафик и рост» с визитами по источникам из Яндекс.Метрики, которые раз в сутки синхронизируются
в нашу базу, плюс журнал синхронизаций, плашка статуса и пробный скрипт для проверки имён измерений Метрики.

**Architecture:** модуль `api/src/lib/searchStats/` с клиентом Reporting API Метрики, синхронизацией (окно в 7 дней
заменяется целиком в транзакции), журналом запусков и воркером на `setInterval` по образцу `metrika/worker.ts`. Админка
читает только нашу базу через `/api/admin/traffic/status` и `/api/admin/traffic/sources`. Страница — серверный компонент
по образцу главной админки, график — свой SVG.

**Tech Stack:** Express 5 + TypeORM (сырой SQL через `AppDataSource.query`), Postgres, vitest 2 + supertest, Next.js
(App Router, серверные компоненты), Tailwind, vitest + @testing-library/react в web.

**Spec:** `docs/superpowers/specs/2026-10-28-traffic-growth-admin-design.md` (этот план — PR 1 из раздела «Разбивка на
PR»; блоки 2–4 и сводка — отдельные планы после PR 1).

## Global Constraints

- Токен — только из env `YANDEX_STATS_OAUTH_TOKEN`; ни в репозитории, ни в ответах API, ни в журнале, ни в логах.
- Синхронизация стартует только при `SEARCH_STATS_SYNC_ENABLED=true`, `NODE_ENV=production` и непустом токене; иначе
  воркер возвращает `null` и мёрж ничего не меняет для покупателей.
- Запросы к Метрике: `accuracy=full`, `timezone=+03:00`, `limit=100000`, строго по одному; ответ с `sampled=true` —
  ошибка.
- Имена измерений и модель атрибуции — только константы в `api/src/lib/searchStats/constants.ts`.
- Окно синхронизации — 7 полных дней до вчера; первый запуск — с `2026-10-01`. Повтор — не раньше чем через 20 часов после
  последнего успеха; проверка раз в час.
- 429/420 — ждём `Retry-After`, не больше 5 минут, повторяем один раз. 401/403 не повторяем.
- Тело ответа внешнего API в ошибке обрезается до 300 символов.
- Эндпоинты и пункт меню — только роль admin (`requireAdminAuth`, `requireCsrfToken`, `requireRole('admin')`).
- Даты — московский день; колонки `date` из Postgres всегда отдаются через `to_char(day, 'YYYY-MM-DD')`.
- Миграции — отметка больше `1790850000000`, сырой SQL, `IF NOT EXISTS`.
- Перед PR: `npm run lint`, `npm run typecheck`, тесты api и web, `npx prettier --check .` в корне. Тесты api — только на
  своей базе: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic`.
- Мёрж в `main` = выкатка в прод: PR открывается, но не мёржится без команды владельца.
- В `shared` нет runtime-импортов `./x.js` (Turbopack их не резолвит): новый файл типов без импортов.

## Review Focus

1. Postgres отдаёт колонку `date` как JS `Date` в локальном поясе процесса — день съезжает. Ожидание: API отдаёт ровно те
   `YYYY-MM-DD`, что записаны. Тест — Task 5, «даты отдаются строками без сдвига».
2. Метрика отдаёт `null` в измерении (поисковик, путь входа) или два разных сырых значения сводятся к одному ключу.
   Ожидание: строка не теряется и транзакция не падает на дубликате ключа. Тесты — Task 1 (`null` → `'undefined'` и
   `'/'`), Task 2 (`mergeRows` и синхронизация с дубликатом).
3. Период без данных (до 1 октября, синхронизация не настроена или ещё не прошла). Ожидание: нули и понятная плашка, не 500. Тесты — Task 5 (пустые таблицы) и Task 6 (дашборд с пустыми данными и баннер «не настроена»).
4. Повторный запуск по пересекающемуся окну. Ожидание: значения заменяются, строки не удваиваются, дни вне окна не
   трогаются. Тест — Task 2.
5. Редактор открывает раздел. Ожидание: API 403, пункта меню нет, страница не делает запросов. Тесты — Task 5 (403) и
   Task 6 (меню и страница).

---

## Карта файлов

| Файл                                                         | Что                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `shared/src/types/traffic.ts` (новый)                        | типы ответа API и константа `SYNC_SOURCES`                    |
| `shared/src/index.ts`, `shared/package.json`                 | реэкспорт типов, subpath `./types/traffic`                    |
| `api/src/lib/metrika/client.ts`                              | экспорт `retryAfterMs`                                        |
| `api/src/lib/metrika/worker.ts`                              | экспорт `resolveCounterId`                                    |
| `api/src/lib/searchStats/constants.ts` (новый)               | имена измерений, окна, интервалы                              |
| `api/src/lib/searchStats/dates.ts` (новый)                   | `todayMsk`, `addDays`, `daysInclusive`                        |
| `api/src/lib/searchStats/metrikaReports.ts` (новый)          | клиент Reporting API, `fetchSourceDays`, `fetchLandingDays`   |
| `api/src/migrations/1790860000000-AddSearchStats.ts` (новый) | журнал, `traffic_sources_daily`, `landing_pages_daily`        |
| `api/src/lib/searchStats/runs.ts` (новый)                    | журнал запусков и текст ошибок                                |
| `api/src/lib/searchStats/sync.ts` (новый)                    | `mergeRows`, замена окна, `syncMetrika`, `withRateLimitRetry` |
| `api/src/lib/searchStats/worker.ts` (новый)                  | расписание и запуск                                           |
| `api/src/index.ts`                                           | старт воркера                                                 |
| `api/src/scripts/search-stats-probe.ts` + `probe.ts` (новые) | пробный скрипт                                                |
| `api/src/lib/searchStats/queries.ts` (новый)                 | SQL для админки                                               |
| `api/src/routes/admin/traffic.ts` (новый), `api/src/app.ts`  | роуты                                                         |
| `deploy/app.env.example`, `deploy/README.md`                 | переменные и порядок включения                                |
| `web/app/admin/(authed)/statsPeriod.ts`                      | пресет «90 дней»                                              |
| `web/app/admin/(authed)/StatsDashboard.tsx`                  | экспорт классов плашек периода                                |
| `web/app/admin/(authed)/traffic/*` (новые)                   | страница, дашборд, график, баннер, подписи                    |
| `web/components/admin/AdminShell.tsx`                        | пункт меню                                                    |

---

### Task 1: Типы, константы и клиент Reporting API Метрики

**Files:**

- Create: `shared/src/types/traffic.ts`
- Modify: `shared/src/index.ts` (рядом со строкой 87), `shared/package.json` (`exports`)
- Modify: `api/src/lib/metrika/client.ts:51` (`function retryAfterMs` → `export function retryAfterMs`)
- Create: `api/src/lib/searchStats/constants.ts`, `api/src/lib/searchStats/dates.ts`,
  `api/src/lib/searchStats/metrikaReports.ts`
- Test: `api/src/lib/searchStats/metrikaReports.test.ts`, `api/src/lib/searchStats/dates.test.ts`

**Interfaces:**

- Produces (shared): `SYNC_SOURCES`, `SyncSource`, `SyncRunStatus`, `SyncRunInfo`, `TrafficStatus`,
  `TrafficSourceTotal`, `SearchEngineTotal`, `TrafficWeek`, `TrafficSourcesResponse` — ниже.
- Produces (api): `MetrikaReportsClient` (`constructor({token, fetch?, timeoutMs?, pageSize?})`,
  `static fromEnv(env): MetrikaReportsClient | null`, `data(counterId, q: StatQuery): Promise<StatRow[]>`);
  `fetchSourceDays(client, counterId, from, to): Promise<SourceDayRow[]>`;
  `fetchLandingDays(client, counterId, from, to): Promise<LandingDayRow[]>`; `normalizePath(name): string`;
  `type DataClient = Pick<MetrikaReportsClient, 'data'>`; `todayMsk(now)`, `addDays(day, delta)`,
  `daysInclusive(from, to)`.

- [ ] **Step 1: Типы в shared**

`shared/src/types/traffic.ts`:

```ts
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
```

В `shared/src/index.ts` рядом с экспортом аналитики:

```ts
export type {
  SyncSource,
  SyncRunStatus,
  SyncRunInfo,
  TrafficStatus,
  TrafficSourceTotal,
  SearchEngineTotal,
  TrafficWeek,
  TrafficSourcesResponse,
} from './types/traffic.js'
```

В `shared/package.json` → `exports` после `"./types/analytics"`:

```json
"./types/traffic": "./src/types/traffic.ts",
```

- [ ] **Step 2: Тесты дат (падают)**

`api/src/lib/searchStats/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { addDays, daysInclusive, todayMsk } from './dates.js'

describe('даты синхронизации', () => {
  it('todayMsk берёт московский день: 22:30 UTC — уже завтра', () => {
    expect(todayMsk(new Date('2026-10-27T22:30:00Z'))).toBe('2026-10-28')
  })
  it('addDays переходит через границу месяца', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04')
  })
  it('daysInclusive считает обе границы', () => {
    expect(daysInclusive('2026-10-01', '2026-10-01')).toBe(1)
    expect(daysInclusive('2026-10-01', '2026-10-30')).toBe(30)
  })
})
```

- [ ] **Step 3: Тесты клиента (падают)**

`api/src/lib/searchStats/metrikaReports.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaError } from '../metrika/client.js'
import {
  MetrikaReportsClient,
  fetchLandingDays,
  fetchSourceDays,
  normalizePath,
  type StatRow,
} from './metrikaReports.js'

const SECRET = 'y0_FAKE_STATS_TOKEN'
const COUNTER = '113445304'

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function apiRow(dims: Array<[string | null, string | null] | null>, metrics: number[]) {
  return { dimensions: dims.map((d) => (d ? { id: d[0], name: d[1] } : null)), metrics }
}

function row(dims: Array<[string | null, string | null]>, metrics: number[]): StatRow {
  return { dimensions: dims.map(([id, name]) => ({ id, name })), metrics }
}

const QUERY = {
  dimensions: ['ym:s:date', 'ym:s:lastsignTrafficSource'],
  metrics: ['ym:s:visits'],
  date1: '2026-10-20',
  date2: '2026-10-26',
}

describe('MetrikaReportsClient.data', () => {
  it('GET /stat/v1/data с полной точностью, московским поясом и заголовком OAuth', async () => {
    const fetchMock = vi.fn(async () => json({ data: [], total_rows: 0, sampled: false }))
    const client = new MetrikaReportsClient({ token: SECRET, fetch: fetchMock })

    await client.data(COUNTER, { ...QUERY, filters: "ym:s:lastsignTrafficSource=='organic'" })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://api-metrika.yandex.net/stat/v1/data')
    expect(u.searchParams.get('ids')).toBe(COUNTER)
    expect(u.searchParams.get('dimensions')).toBe('ym:s:date,ym:s:lastsignTrafficSource')
    expect(u.searchParams.get('accuracy')).toBe('full')
    expect(u.searchParams.get('timezone')).toBe('+03:00')
    expect(u.searchParams.get('limit')).toBe('100000')
    expect(u.searchParams.get('offset')).toBe('1')
    expect(u.searchParams.get('filters')).toBe("ym:s:lastsignTrafficSource=='organic'")
    expect(u.searchParams.has('attribution')).toBe(false)
    expect((init.headers as Record<string, string>).Authorization).toBe(`OAuth ${SECRET}`)
  })

  it('разбирает строки; пустое измерение — id и name null', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        data: [apiRow([[null, '2026-10-20'], null], [12, 10, 25.5, 1.8])],
        total_rows: 1,
        sampled: false,
      }),
    )
    const client = new MetrikaReportsClient({ token: SECRET, fetch: fetchMock })
    const rows = await client.data(COUNTER, QUERY)
    expect(rows).toEqual([
      {
        dimensions: [
          { id: null, name: '2026-10-20' },
          { id: null, name: null },
        ],
        metrics: [12, 10, 25.5, 1.8],
      },
    ])
  })

  it('листает страницы: offset 1-based, пока не набрано total_rows', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: [apiRow([['a', 'a']], [1]), apiRow([['b', 'b']], [2])], total_rows: 3 }),
      )
      .mockResolvedValueOnce(json({ data: [apiRow([['c', 'c']], [3])], total_rows: 3 }))
    const client = new MetrikaReportsClient({ token: SECRET, fetch: fetchMock, pageSize: 2 })

    const rows = await client.data(COUNTER, QUERY)

    expect(rows.map((r) => r.dimensions[0].id)).toEqual(['a', 'b', 'c'])
    const second = new URL((fetchMock.mock.calls[1] as unknown as [string])[0])
    expect(second.searchParams.get('offset')).toBe('3')
  })

  it('сэмплированный ответ — ошибка', async () => {
    const client = new MetrikaReportsClient({
      token: SECRET,
      fetch: async () => json({ data: [], total_rows: 0, sampled: true }),
    })
    await expect(client.data(COUNTER, QUERY)).rejects.toThrow(/сэмплирован/)
  })

  it.each([429, 420])('%i — RateLimitError с Retry-After', async (status) => {
    const client = new MetrikaReportsClient({
      token: SECRET,
      fetch: async () => json({ errors: [] }, status, { 'retry-after': '5' }),
    })
    const err = await client.data(COUNTER, QUERY).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterMs).toBe(5000)
  })

  it('403 — MetrikaError с кодом, тело обрезано, токена в тексте нет', async () => {
    const client = new MetrikaReportsClient({
      token: SECRET,
      fetch: async () => json({ message: 'x'.repeat(1000) }, 403),
    })
    const err = (await client.data(COUNTER, QUERY).catch((e: unknown) => e)) as MetrikaError
    expect(err).toBeInstanceOf(MetrikaError)
    expect(err.status).toBe(403)
    expect(err.message.length).toBeLessThan(330)
    expect(err.message).not.toContain(SECRET)
  })

  it('fromEnv: без токена — null, с токеном — клиент', () => {
    expect(MetrikaReportsClient.fromEnv({})).toBeNull()
    expect(MetrikaReportsClient.fromEnv({ YANDEX_STATS_OAUTH_TOKEN: ' t ' })).toBeInstanceOf(
      MetrikaReportsClient,
    )
  })
})

describe('fetchSourceDays', () => {
  it('итоги по источникам с search_engine "" и поисковики органики отдельным запросом', async () => {
    const data = vi
      .fn()
      .mockResolvedValueOnce([
        row(
          [
            [null, '2026-10-20'],
            ['organic', 'Переходы из поисковых систем'],
          ],
          [30, 25, 20, 2],
        ),
        row(
          [
            [null, '2026-10-20'],
            ['direct', 'Прямые заходы'],
          ],
          [10, 9, 40, 1.5],
        ),
      ])
      .mockResolvedValueOnce([
        row(
          [
            [null, '2026-10-20'],
            ['yandex', 'Яндекс'],
          ],
          [20, 17, 18, 2.1],
        ),
        row(
          [
            [null, '2026-10-20'],
            [null, null],
          ],
          [10, 8, 22, 1.9],
        ),
      ])

    const rows = await fetchSourceDays({ data }, COUNTER, '2026-10-20', '2026-10-20')

    expect(data.mock.calls[1][1].filters).toBe("ym:s:lastsignTrafficSource=='organic'")
    expect(rows).toEqual([
      {
        day: '2026-10-20',
        source: 'organic',
        searchEngine: '',
        visits: 30,
        users: 25,
        bounceRate: 20,
        pageDepth: 2,
      },
      {
        day: '2026-10-20',
        source: 'direct',
        searchEngine: '',
        visits: 10,
        users: 9,
        bounceRate: 40,
        pageDepth: 1.5,
      },
      {
        day: '2026-10-20',
        source: 'organic',
        searchEngine: 'yandex',
        visits: 20,
        users: 17,
        bounceRate: 18,
        pageDepth: 2.1,
      },
      {
        day: '2026-10-20',
        source: 'organic',
        searchEngine: 'undefined',
        visits: 10,
        users: 8,
        bounceRate: 22,
        pageDepth: 1.9,
      },
    ])
  })

  it('строку с некорректным днём пропускает', async () => {
    const data = vi
      .fn()
      .mockResolvedValueOnce([
        row(
          [
            [null, null],
            ['direct', 'Прямые'],
          ],
          [1, 1, 0, 1],
        ),
      ])
      .mockResolvedValueOnce([])
    expect(await fetchSourceDays({ data }, COUNTER, '2026-10-20', '2026-10-20')).toEqual([])
  })
})

describe('fetchLandingDays и normalizePath', () => {
  it('путь из name, источник из id', async () => {
    const data = vi.fn().mockResolvedValueOnce([
      row(
        [
          [null, '2026-10-20'],
          [null, '/catalog'],
          ['organic', 'Поиск'],
        ],
        [5, 5, 0, 3],
      ),
      row(
        [
          [null, '2026-10-20'],
          [null, null],
          ['direct', 'Прямые'],
        ],
        [2, 2, 50, 1],
      ),
    ])
    const rows = await fetchLandingDays({ data }, COUNTER, '2026-10-20', '2026-10-20')
    expect(rows.map((r) => [r.path, r.source, r.visits])).toEqual([
      ['/catalog', 'organic', 5],
      ['/', 'direct', 2],
    ])
  })

  it('normalizePath: пусто → "/", без слэша → со слэшем, длинный режется до 300', () => {
    expect(normalizePath(null)).toBe('/')
    expect(normalizePath('  ')).toBe('/')
    expect(normalizePath('catalog')).toBe('/catalog')
    expect(normalizePath('/' + 'a'.repeat(400))).toHaveLength(300)
  })
})
```

- [ ] **Step 4: Запустить, убедиться, что падают**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats`
Expected: FAIL — `Cannot find module './metrikaReports.js'` и `'./dates.js'`.

- [ ] **Step 5: Реализация**

В `api/src/lib/metrika/client.ts:51` заменить `function retryAfterMs(` на `export function retryAfterMs(`.

`api/src/lib/searchStats/constants.ts`:

```ts
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
```

`api/src/lib/searchStats/dates.ts`:

```ts
const MS_PER_DAY = 86_400_000

// Московский день YYYY-MM-DD (en-CA даёт ровно этот формат).
export function todayMsk(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * MS_PER_DAY).toISOString().slice(0, 10)
}

export function daysInclusive(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY + 1
}
```

`api/src/lib/searchStats/metrikaReports.ts`:

```ts
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

const codeOf = (d: StatDimension | undefined) => d?.id ?? d?.name ?? 'undefined'

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
    if (day) out.push({ day, source: codeOf(r.dimensions[1]), searchEngine: '', ...metricsOf(r) })
  }
  for (const r of engines) {
    const day = dayOf(r.dimensions[0])
    if (day)
      out.push({ day, source: 'organic', searchEngine: codeOf(r.dimensions[1]), ...metricsOf(r) })
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
      source: codeOf(r.dimensions[2]),
      ...metricsOf(r),
    })
  }
  return out
}
```

- [ ] **Step 6: Тесты проходят, типы сходятся**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats src/lib/metrika`
Expected: PASS (включая старые тесты `metrika/client.test.ts`).
Run: `npm run typecheck -w api && npm run typecheck -w shared --if-present`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add shared/src/types/traffic.ts shared/src/index.ts shared/package.json api/src/lib/metrika/client.ts api/src/lib/searchStats
git commit -m "feat(api): клиент отчётов Метрики для раздела «Трафик и рост»" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Таблицы, журнал запусков и синхронизация Метрики

**Files:**

- Create: `api/src/migrations/1790860000000-AddSearchStats.ts`
- Create: `api/src/lib/searchStats/runs.ts`, `api/src/lib/searchStats/sync.ts`
- Test: `api/src/lib/searchStats/sync.test.ts`, `api/src/lib/searchStats/runs.test.ts`

**Interfaces:**

- Consumes: `fetchSourceDays`, `fetchLandingDays`, `DataClient`, `SourceDayRow`, `LandingDayRow` (Task 1);
  `SyncSource`, `SyncRunInfo`, `SYNC_SOURCES` из `@ximi4ka-shop/shared/types/traffic`.
- Produces: `interface DateRange { from: string; to: string }`;
  `mergeRows<T extends Metrics>(rows: T[], keyOf: (r: T) => string): T[]`;
  `syncMetrika(client: DataClient, counterId: string, range: DateRange, sleep?: (ms: number) => Promise<void>): Promise<number>`;
  `withRateLimitRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T>`;
  `recordRun(source: SyncSource, fn: () => Promise<number>): Promise<{ ok: boolean; rows: number; error: string | null }>`;
  `lastSuccessAt(source: SyncSource): Promise<Date | null>`; `latestRuns(): Promise<SyncRunInfo[]>`;
  `describeSyncError(err: unknown): string`.

- [ ] **Step 1: Миграция**

`api/src/migrations/1790860000000-AddSearchStats.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Раздел «Трафик и рост» (spec 2026-10-28-traffic-growth-admin-design):
// журнал синхронизаций и дневные данные Метрики. В traffic_sources_daily
// строки с search_engine = '' — итоги источников; строки source = 'organic'
// с непустым search_engine — разбивка поиска по поисковикам (не суммировать
// с итогами). Пути — без параметров, как orders.attribution.landing.
export class AddSearchStats1790860000000 implements MigrationInterface {
  name = 'AddSearchStats1790860000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "search_stats_sync_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(16) NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "status" varchar(8) NOT NULL DEFAULT 'running',
        "error" text,
        "rows" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_search_stats_sync_runs" PRIMARY KEY ("id")
      )`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_search_stats_sync_runs_source_started" ON "search_stats_sync_runs" ("source", "started_at" DESC)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "traffic_sources_daily" (
        "day" date NOT NULL,
        "source" varchar(32) NOT NULL,
        "search_engine" varchar(64) NOT NULL DEFAULT '',
        "visits" integer NOT NULL,
        "users" integer NOT NULL,
        "bounce_rate" numeric(5,2) NOT NULL,
        "page_depth" numeric(6,2) NOT NULL,
        CONSTRAINT "PK_traffic_sources_daily" PRIMARY KEY ("day", "source", "search_engine")
      )`)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "landing_pages_daily" (
        "day" date NOT NULL,
        "path" varchar(300) NOT NULL,
        "source" varchar(32) NOT NULL,
        "visits" integer NOT NULL,
        "users" integer NOT NULL,
        "bounce_rate" numeric(5,2) NOT NULL,
        "page_depth" numeric(6,2) NOT NULL,
        CONSTRAINT "PK_landing_pages_daily" PRIMARY KEY ("day", "path", "source")
      )`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "landing_pages_daily"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "traffic_sources_daily"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "search_stats_sync_runs"`)
  }
}
```

- [ ] **Step 2: Тесты синхронизации (падают)**

`api/src/lib/searchStats/sync.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import type { StatRow } from './metrikaReports.js'
import { mergeRows, syncMetrika, withRateLimitRetry } from './sync.js'

function row(dims: Array<[string | null, string | null]>, metrics: number[]): StatRow {
  return { dimensions: dims.map(([id, name]) => ({ id, name })), metrics }
}

// Фейковый клиент: по порядку вызовов — итоги источников, поисковики, страницы входа.
function fakeClient(visits: number, day = '2026-10-20') {
  return {
    data: vi
      .fn()
      .mockResolvedValueOnce([
        row(
          [
            [null, day],
            ['organic', 'Поиск'],
          ],
          [visits, visits, 10, 2],
        ),
      ])
      .mockResolvedValueOnce([
        row(
          [
            [null, day],
            ['yandex', 'Яндекс'],
          ],
          [visits, visits, 10, 2],
        ),
      ])
      .mockResolvedValueOnce([
        row(
          [
            [null, day],
            [null, '/'],
            ['organic', 'Поиск'],
          ],
          [visits, visits, 10, 2],
        ),
      ]),
  }
}

const RANGE = { from: '2026-10-20', to: '2026-10-26' }

async function sourceRows() {
  return (await AppDataSource.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, source, search_engine, visits
       FROM traffic_sources_daily ORDER BY day, source, search_engine`,
  )) as Array<{ day: string; source: string; search_engine: string; visits: number }>
}

describe('mergeRows', () => {
  it('складывает визиты и посетителей, отказы и глубину усредняет по визитам', () => {
    const merged = mergeRows(
      [
        {
          day: 'd',
          path: '/',
          source: 'organic',
          visits: 10,
          users: 8,
          bounceRate: 20,
          pageDepth: 2,
        },
        {
          day: 'd',
          path: '/',
          source: 'organic',
          visits: 30,
          users: 25,
          bounceRate: 40,
          pageDepth: 1,
        },
      ],
      (r) => `${r.day}|${r.path}|${r.source}`,
    )
    expect(merged).toEqual([
      {
        day: 'd',
        path: '/',
        source: 'organic',
        visits: 40,
        users: 33,
        bounceRate: 35,
        pageDepth: 1.25,
      },
    ])
  })
})

describe('withRateLimitRetry', () => {
  it('ждёт Retry-After, но не больше 5 минут, и повторяет один раз', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('429', 10 * 60 * 1000))
      .mockResolvedValueOnce('ok')
    await expect(withRateLimitRetry(fn, sleep)).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(5 * 60 * 1000)
  })

  it('второй отказ пробрасывает', async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError('429', 1000))
    await expect(withRateLimitRetry(fn, async () => {})).rejects.toBeInstanceOf(RateLimitError)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('syncMetrika', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE traffic_sources_daily, landing_pages_daily')
  })

  it('пишет итоги, поисковики и страницы входа', async () => {
    const written = await syncMetrika(fakeClient(12), '113445304', RANGE)
    expect(written).toBe(3)
    expect(await sourceRows()).toEqual([
      { day: '2026-10-20', source: 'organic', search_engine: '', visits: 12 },
      { day: '2026-10-20', source: 'organic', search_engine: 'yandex', visits: 12 },
    ])
    const [landing] = (await AppDataSource.query(
      `SELECT path, source, visits FROM landing_pages_daily`,
    )) as Array<{ path: string; source: string; visits: number }>
    expect(landing).toEqual({ path: '/', source: 'organic', visits: 12 })
  })

  it('повторный запуск по тому же окну заменяет значения, а не удваивает; дни вне окна не трогает', async () => {
    await AppDataSource.query(
      `INSERT INTO traffic_sources_daily VALUES ('2026-10-01', 'direct', '', 5, 5, 0, 1)`,
    )
    await syncMetrika(fakeClient(12), '113445304', RANGE)
    await syncMetrika(fakeClient(20), '113445304', RANGE)
    expect(await sourceRows()).toEqual([
      { day: '2026-10-01', source: 'direct', search_engine: '', visits: 5 },
      { day: '2026-10-20', source: 'organic', search_engine: '', visits: 20 },
      { day: '2026-10-20', source: 'organic', search_engine: 'yandex', visits: 20 },
    ])
  })

  it('два сырых значения с одним ключом сливаются, транзакция не падает', async () => {
    const day = '2026-10-21'
    const client = {
      data: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          row(
            [
              [null, day],
              [null, null],
            ],
            [3, 3, 0, 1],
          ),
          row(
            [
              [null, day],
              ['undefined', 'Не определено'],
            ],
            [2, 2, 0, 1],
          ),
        ])
        .mockResolvedValueOnce([]),
    }
    await syncMetrika(client, '113445304', RANGE)
    expect(await sourceRows()).toEqual([
      { day, source: 'organic', search_engine: 'undefined', visits: 5 },
    ])
  })

  it('ошибка на страницах входа оставляет уже записанные источники и пробрасывается', async () => {
    const client = {
      data: vi
        .fn()
        .mockResolvedValueOnce([
          row(
            [
              [null, '2026-10-20'],
              ['direct', 'Прямые'],
            ],
            [4, 4, 0, 1],
          ),
        ])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('boom')),
    }
    await expect(syncMetrika(client, '113445304', RANGE)).rejects.toThrow('boom')
    expect(await sourceRows()).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Тесты журнала (падают)**

`api/src/lib/searchStats/runs.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaError } from '../metrika/client.js'
import { describeSyncError, lastSuccessAt, latestRuns, recordRun } from './runs.js'

describe('журнал синхронизаций', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE search_stats_sync_runs')
  })

  it('успешный запуск: status ok, число строк, lastSuccessAt', async () => {
    const r = await recordRun('metrika', async () => 42)
    expect(r).toEqual({ ok: true, rows: 42, error: null })
    expect(await lastSuccessAt('metrika')).toBeInstanceOf(Date)
    expect(await lastSuccessAt('webmaster')).toBeNull()
  })

  it('ошибка: status error с понятным текстом, исключение не пробрасывается', async () => {
    const r = await recordRun('metrika', async () => {
      throw new MetrikaError(401, 'Metrika 401: unauthorized')
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/перевыпустите YANDEX_STATS_OAUTH_TOKEN/)
    expect(await lastSuccessAt('metrika')).toBeNull()
  })

  it('latestRuns: последний запуск и последний успех по каждому источнику', async () => {
    await recordRun('metrika', async () => 1)
    await recordRun('metrika', async () => {
      throw new Error('сеть')
    })
    const runs = await latestRuns()
    expect(runs.map((r) => r.source)).toEqual(['metrika', 'webmaster'])
    expect(runs[0]).toMatchObject({ lastStatus: 'error', lastError: 'сеть' })
    expect(runs[0].lastSuccessAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(runs[1]).toEqual({
      source: 'webmaster',
      lastStartedAt: null,
      lastStatus: null,
      lastError: null,
      lastSuccessAt: null,
    })
  })
})

describe('describeSyncError', () => {
  it('переводит коды в действия владельца', () => {
    expect(describeSyncError(new RateLimitError('429', 1000))).toMatch(/лимит запросов/)
    expect(describeSyncError(new MetrikaError(403, 'x'))).toMatch(/metrika:read/)
    expect(describeSyncError(new Error('a'.repeat(1000)))).toHaveLength(300)
    expect(describeSyncError('строка')).toBe('Неизвестная ошибка')
  })
})
```

- [ ] **Step 4: Запустить, убедиться, что падают**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats`
Expected: FAIL — нет модулей `./sync.js`, `./runs.js` (миграция при этом применяется в globalSetup без ошибок).

- [ ] **Step 5: Реализация журнала**

`api/src/lib/searchStats/runs.ts`:

```ts
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
```

- [ ] **Step 6: Реализация синхронизации**

`api/src/lib/searchStats/sync.ts`:

```ts
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
```

- [ ] **Step 7: Тесты проходят**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats`
Expected: PASS.
Run: `npm run typecheck -w api` — без ошибок.

- [ ] **Step 8: Commit**

```bash
git add api/src/migrations/1790860000000-AddSearchStats.ts api/src/lib/searchStats
git commit -m "feat(api): таблицы и ежедневная синхронизация источников трафика из Метрики" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Воркер синхронизации и документация включения

**Files:**

- Create: `api/src/lib/searchStats/worker.ts`
- Modify: `api/src/lib/metrika/worker.ts:207` (`async function resolveCounterId` → `export async function resolveCounterId`)
- Modify: `api/src/index.ts` (импорт и старт после блока Метрики, строки 49–53)
- Modify: `deploy/app.env.example` (после строки 75), `deploy/README.md` (новый раздел после «Конверсии оплаты в Яндекс.Метрику»)
- Test: `api/src/lib/searchStats/worker.test.ts`

**Interfaces:**

- Consumes: `syncMetrika`, `DateRange` (Task 2), `recordRun`, `lastSuccessAt` (Task 2), `MetrikaReportsClient`,
  `DataClient` (Task 1), `todayMsk`, `addDays` (Task 1), `resolveCounterId(env): Promise<string | null>`.
- Produces: `searchStatsEnabled(env): boolean`; `searchStatsConfigured(env): boolean`;
  `syncDue(lastOk: Date | null, now: Date): boolean`; `syncWindow(today: string, firstRun: boolean): DateRange`;
  `runMetrikaSyncIfDue(opts: { client: DataClient; counterId: string; now: Date; sleep?: (ms: number) => Promise<void> }): Promise<'skipped' | 'ok' | 'error'>`;
  `startSearchStatsWorker(opts?: { env?; intervalMs?; client?: DataClient }): NodeJS.Timeout | null`.

- [ ] **Step 1: Тесты (падают)**

`api/src/lib/searchStats/worker.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import type { StatQuery, StatRow } from './metrikaReports.js'
import {
  runMetrikaSyncIfDue,
  searchStatsConfigured,
  startSearchStatsWorker,
  syncDue,
  syncWindow,
} from './worker.js'

const HOUR = 60 * 60 * 1000
const PROD = {
  NODE_ENV: 'production',
  SEARCH_STATS_SYNC_ENABLED: 'true',
  YANDEX_STATS_OAUTH_TOKEN: 't',
}

describe('расписание', () => {
  it('syncDue: нет успеха — пора; успех 19 ч назад — рано; 20 ч — пора', () => {
    const now = new Date('2026-10-28T04:00:00Z')
    expect(syncDue(null, now)).toBe(true)
    expect(syncDue(new Date(now.getTime() - 19 * HOUR), now)).toBe(false)
    expect(syncDue(new Date(now.getTime() - 20 * HOUR), now)).toBe(true)
  })

  it('syncWindow: обычный запуск — 7 дней до вчера, первый — с начала истории', () => {
    expect(syncWindow('2026-10-28', false)).toEqual({ from: '2026-10-21', to: '2026-10-27' })
    expect(syncWindow('2026-10-28', true)).toEqual({ from: '2026-10-01', to: '2026-10-27' })
  })

  it('searchStatsConfigured: нужны и флаг, и токен', () => {
    expect(searchStatsConfigured({ SEARCH_STATS_SYNC_ENABLED: 'true' })).toBe(false)
    expect(searchStatsConfigured({ YANDEX_STATS_OAUTH_TOKEN: 't' })).toBe(false)
    expect(searchStatsConfigured(PROD)).toBe(true)
  })

  it.each([
    ['без флага', { NODE_ENV: 'production', YANDEX_STATS_OAUTH_TOKEN: 't' }],
    ['без токена', { NODE_ENV: 'production', SEARCH_STATS_SYNC_ENABLED: 'true' }],
    ['вне production', { ...PROD, NODE_ENV: 'development' }],
  ])('startSearchStatsWorker %s — null', (_label, env) => {
    expect(startSearchStatsWorker({ env, client: { data: vi.fn() } })).toBeNull()
  })
})

describe('runMetrikaSyncIfDue', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE search_stats_sync_runs, traffic_sources_daily, landing_pages_daily',
    )
  })

  it('первый запуск берёт историю с 2026-10-01 и пишет журнал', async () => {
    const client = { data: vi.fn(async (_c: string, _q: StatQuery): Promise<StatRow[]> => []) }
    const res = await runMetrikaSyncIfDue({
      client,
      counterId: '1',
      now: new Date('2026-10-28T04:00:00Z'),
    })
    expect(res).toBe('ok')
    expect(client.data.mock.calls[0][1]).toMatchObject({ date1: '2026-10-01', date2: '2026-10-27' })
  })

  it('недавний успех — пропуск без запросов к Метрике', async () => {
    await AppDataSource.query(
      `INSERT INTO search_stats_sync_runs (source, status, finished_at) VALUES ('metrika', 'ok', now())`,
    )
    const client = { data: vi.fn(async (_c: string, _q: StatQuery): Promise<StatRow[]> => []) }
    expect(await runMetrikaSyncIfDue({ client, counterId: '1', now: new Date() })).toBe('skipped')
    expect(client.data).not.toHaveBeenCalled()
  })

  it('ошибка Метрики — error в журнале, исключение не вылетает', async () => {
    const client = { data: vi.fn(async () => Promise.reject(new Error('сеть'))) }
    expect(await runMetrikaSyncIfDue({ client, counterId: '1', now: new Date() })).toBe('error')
    const [run] = (await AppDataSource.query(
      `SELECT status, error FROM search_stats_sync_runs`,
    )) as Array<{
      status: string
      error: string
    }>
    expect(run).toEqual({ status: 'error', error: 'сеть' })
  })
})
```

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats/worker.test.ts`
Expected: FAIL — нет модуля `./worker.js`.

- [ ] **Step 3: Реализация**

В `api/src/lib/metrika/worker.ts:207` добавить `export` перед `async function resolveCounterId`.

`api/src/lib/searchStats/worker.ts`:

```ts
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

// Вчера и шесть дней до него; первый запуск — вся история счётчика.
export function syncWindow(today: string, firstRun: boolean): DateRange {
  return {
    from: firstRun ? METRIKA_HISTORY_START : addDays(today, -SYNC_WINDOW_DAYS),
    to: addDays(today, -1),
  }
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
  const range = syncWindow(todayMsk(now), last === null)
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
```

В `api/src/index.ts` — импорт рядом со строкой 9:

```ts
import { startSearchStatsWorker } from './lib/searchStats/worker.js'
```

и после блока Метрики (строка 53):

```ts
// Статистика Метрики для раздела «Трафик и рост». No-op, пока
// SEARCH_STATS_SYNC_ENABLED не true и не задан YANDEX_STATS_OAUTH_TOKEN.
if (startSearchStatsWorker()) {
  logger.info('search stats sync worker started')
}
```

В `deploy/app.env.example` после строки 75:

```
# Раздел админки «Трафик и рост»: раз в сутки статистика Метрики (и позже
# Вебмастера) копируется в базу. Выключено, пока SEARCH_STATS_SYNC_ENABLED
# не true. Токен — отдельный, только на чтение (metrika:read,
# webmaster:hostinfo, webmaster:verify); не коммитить. По шагам —
# deploy/README.md, «Статистика трафика в админке».
SEARCH_STATS_SYNC_ENABLED=
YANDEX_STATS_OAUTH_TOKEN=
```

В `deploy/README.md` — раздел после «Конверсии оплаты в Яндекс.Метрику» (оформить так же, как соседние разделы):

```markdown
## Статистика трафика в админке

Раздел «Трафик и рост» читает нашу базу; данные туда раз в сутки копирует воркер api из Метрики.

1. На https://oauth.yandex.ru/client/new создать приложение «Для доступа к API или отладки» с правами «Получение
   статистики, чтение параметров своих и доверенных счётчиков» (`metrika:read`), «Получение информации о сайтах»
   (`webmaster:hostinfo`) и «Добавление сайтов, получение статуса проверки прав» (`webmaster:verify`).
2. От аккаунта, у которого есть доступ к счётчику и к сайту в Вебмастере, открыть
   `https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID приложения>` и скопировать токен.
3. В `deploy/app.env` на сервере: `YANDEX_STATS_OAUTH_TOKEN=…`. Флаг пока не включать.
4. Пробный запрос (печатает, какие имена измерений Метрика принимает, и ответы Вебмастера):
   `docker compose exec ximishop-api node api/dist/scripts/search-stats-probe.js`. Вывод прислать разработчику:
   по нему фиксируются константы в `api/src/lib/searchStats/constants.ts`.
5. После подтверждения констант: `SEARCH_STATS_SYNC_ENABLED=true`, перезапустить api. В логе:
   `search stats sync worker started`; первая синхронизация — сразу, дальше раз в сутки.
6. Токен Вебмастера живёт около 6 месяцев. Когда в разделе появится «Токен отозван или истёк», повторить шаг 2 и 3.

Откат: `SEARCH_STATS_SYNC_ENABLED=` и перезапуск api; данные в базе остаются.
```

- [ ] **Step 4: Тесты проходят**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats src/lib/metrika`
Expected: PASS.
Run: `npm run typecheck -w api` — без ошибок.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/searchStats/worker.ts api/src/lib/searchStats/worker.test.ts api/src/lib/metrika/worker.ts api/src/index.ts deploy/app.env.example deploy/README.md
git commit -m "feat(api): воркер синхронизации статистики трафика и порядок включения" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Пробный скрипт

Скрипт отвечает на пункты «проверить» из спецификации: какие имена измерений Метрики принимаются, есть ли `id` у
измерений, сколько истории отдаёт Вебмастер, как устроен ответ `query-analytics`. Это разовая диагностика: в Вебмастер
идём сырыми запросами, клиент Вебмастера — в PR 3.

**Files:**

- Create: `api/src/lib/searchStats/probe.ts`, `api/src/scripts/search-stats-probe.ts`
- Modify: `api/package.json` (скрипт `search-stats:probe`)
- Test: `api/src/lib/searchStats/probe.test.ts`

**Interfaces:**

- Consumes: `DataClient`, `StatQuery`, `StatRow` (Task 1); `resolveCounterId` (Task 3); `todayMsk`, `addDays` (Task 1).
- Produces: `PROBE_VARIANTS: ProbeVariant[]`; `runMetrikaProbe(client: DataClient, counterId: string, day: string): Promise<ProbeResult[]>`;
  `runWebmasterProbe(fetchImpl: Fetch, token: string, today: string): Promise<WebmasterProbeStep[]>`.

- [ ] **Step 1: Тесты (падают)**

`api/src/lib/searchStats/probe.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { MetrikaError } from '../metrika/client.js'
import { PROBE_VARIANTS, runMetrikaProbe, runWebmasterProbe } from './probe.js'

const SECRET = 'y0_FAKE'

describe('runMetrikaProbe', () => {
  it('по каждому варианту: принят ли, сколько визитов, первые строки; ошибка не прерывает остальные', async () => {
    const data = vi.fn(async (_c: string, q: { dimensions: string[] }) => {
      if (q.dimensions.some((d) => d.includes('lastsign')))
        throw new MetrikaError(400, 'Metrika 400: wrong dimension')
      return [
        {
          dimensions: [
            { id: null, name: '2026-10-27' },
            { id: 'organic', name: 'Поиск' },
          ],
          metrics: [7],
        },
      ]
    })
    const results = await runMetrikaProbe({ data }, '1', '2026-10-27')
    expect(results).toHaveLength(PROBE_VARIANTS.length)
    const failed = results.find((r) => r.label === 'lastsign: источник')
    expect(failed).toMatchObject({ ok: false, error: 'Metrika 400: wrong dimension' })
    const passed = results.find((r) => r.ok)
    expect(passed).toMatchObject({ rows: 1, visits: 7 })
    expect(passed?.sample[0]).toEqual([
      { id: null, name: '2026-10-27' },
      { id: 'organic', name: 'Поиск' },
    ])
  })
})

describe('runWebmasterProbe', () => {
  it('идёт по шагам с найденными user_id и host_id; тело обрезано, токена в выводе нет', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/v4/user')) return new Response(JSON.stringify({ user_id: 5 }))
      if (url.endsWith('/v4/user/5/hosts')) {
        return new Response(
          JSON.stringify({
            hosts: [{ host_id: 'https:ximi4ka.ru:443', ascii_host_url: 'https://ximi4ka.ru/' }],
          }),
        )
      }
      return new Response('x'.repeat(5000), { status: 200 })
    })
    const steps = await runWebmasterProbe(fetchMock, SECRET, '2026-10-28')
    expect(steps.map((s) => s.label)).toEqual([
      'user',
      'hosts',
      'search-queries/all/history за 550 дней',
      'query-analytics/list',
      'indexing/history за 400 дней',
      'search-urls/in-search/history за 400 дней',
      'sqi-history',
    ])
    const urls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(urls[2]).toContain(
      '/v4/user/5/hosts/https%3Aximi4ka.ru%3A443/search-queries/all/history',
    )
    expect(urls[2]).toContain('date_from=2025-04-26')
    for (const s of steps) {
      expect(s.body.length).toBeLessThanOrEqual(1500)
      expect(s.body).not.toContain(SECRET)
    }
  })

  it('нет хоста ximi4ka.ru — останавливается с понятным шагом', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/v4/user')
        ? new Response(JSON.stringify({ user_id: 5 }))
        : new Response(JSON.stringify({ hosts: [] })),
    )
    const steps = await runWebmasterProbe(fetchMock, SECRET, '2026-10-28')
    expect(steps.at(-1)).toMatchObject({ label: 'hosts', status: 200 })
    expect(steps.at(-1)?.note).toMatch(/ximi4ka\.ru не найден/)
  })
})
```

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats/probe.test.ts`
Expected: FAIL — нет модуля `./probe.js`.

- [ ] **Step 3: Реализация**

`api/src/lib/searchStats/probe.ts`:

```ts
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
    const res = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `OAuth ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    const step: WebmasterProbeStep = { label, url, status: res.status, body: text.slice(0, 1500) }
    steps.push(step)
    return { step, text, ok: res.ok }
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
  if (!user.ok || typeof userId !== 'number') return steps

  const hosts = await call('hosts', `${WM}/user/${userId}/hosts`)
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
```

`api/src/scripts/search-stats-probe.ts`:

```ts
// Пробный запрос к Метрике и Вебмастеру с токеном YANDEX_STATS_OAUTH_TOKEN:
// какие имена измерений принимаются и сколько истории отдаёт Вебмастер.
// Ничего не пишет в базу, кроме чтения настроек сайта. Локально:
//   npm run search-stats:probe -w api
// В контейнере:
//   docker compose exec ximishop-api node api/dist/scripts/search-stats-probe.js
import 'dotenv/config'
import 'reflect-metadata'
import { AppDataSource } from '../config/dataSource.js'
import { resolveCounterId } from '../lib/metrika/worker.js'
import { addDays, todayMsk } from '../lib/searchStats/dates.js'
import { MetrikaReportsClient } from '../lib/searchStats/metrikaReports.js'
import { runMetrikaProbe, runWebmasterProbe } from '../lib/searchStats/probe.js'

async function main() {
  const token = process.env.YANDEX_STATS_OAUTH_TOKEN?.trim()
  if (!token) {
    console.error('YANDEX_STATS_OAUTH_TOKEN не задан')
    process.exitCode = 1
    return
  }
  await AppDataSource.initialize()
  try {
    const today = todayMsk(new Date())
    const counterId = await resolveCounterId(process.env)
    const metrika = counterId
      ? await runMetrikaProbe(new MetrikaReportsClient({ token }), counterId, addDays(today, -1))
      : 'номер счётчика не задан (настройки сайта или METRIKA_COUNTER_ID)'
    const webmaster = await runWebmasterProbe((input, init) => fetch(input, init), token, today)
    console.log(JSON.stringify({ day: addDays(today, -1), counterId, metrika, webmaster }, null, 2))
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
```

В `api/package.json` → `scripts`, рядом с `telegram:set-webhook`:

```json
"search-stats:probe": "tsx src/scripts/search-stats-probe.ts",
```

- [ ] **Step 4: Тесты проходят, сборка включает скрипт**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/lib/searchStats/probe.test.ts`
Expected: PASS.
Run: `npm run build -w api && ls api/dist/scripts/search-stats-probe.js`
Expected: файл есть.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/searchStats/probe.ts api/src/lib/searchStats/probe.test.ts api/src/scripts/search-stats-probe.ts api/package.json
git commit -m "feat(api): пробный скрипт имён измерений Метрики и истории Вебмастера" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API админки — статус и источники

**Files:**

- Create: `api/src/lib/searchStats/queries.ts`, `api/src/routes/admin/traffic.ts`
- Modify: `api/src/app.ts:29` (импорт), `api/src/app.ts:160` (монтирование)
- Test: `api/src/routes/admin-traffic.test.ts`

**Interfaces:**

- Consumes: `latestRuns` (Task 2), `searchStatsConfigured` (Task 3), `addDays`, `daysInclusive` (Task 1),
  `StatsQuerySchema` из `./stats.schemas.js`, `TrafficStatus`, `TrafficSourcesResponse` (Task 1).
- Produces: `getTrafficStatus(env: NodeJS.ProcessEnv): Promise<TrafficStatus>`;
  `getTrafficSources(from: string, to: string): Promise<TrafficSourcesResponse>`;
  `GET /api/admin/traffic/status` → `{ data: TrafficStatus }`;
  `GET /api/admin/traffic/sources?from&to` → `{ data: TrafficSourcesResponse }`.

- [ ] **Step 1: Тесты (падают)**

`api/src/routes/admin-traffic.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, loginAsEditor, type AdminAuth } from './testUtils.js'

async function seedSource(day: string, source: string, visits: number, engine = '') {
  await AppDataSource.query(
    `INSERT INTO traffic_sources_daily (day, source, search_engine, visits, users, bounce_rate, page_depth)
     VALUES ($1, $2, $3, $4, $4, 10, 2)`,
    [day, source, engine, visits],
  )
}

describe('GET /api/admin/traffic', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth
  const savedEnv = { ...process.env }

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
    auth = await loginAsAdmin(app)
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE traffic_sources_daily, landing_pages_daily, search_stats_sync_runs',
    )
  })
  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('без сессии — 401, редактору — 403', async () => {
    expect((await request(app).get('/api/admin/traffic/status')).status).toBe(401)
    const editor = await loginAsEditor(app)
    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')
      .set(authHeaders(editor))
    expect(res.status).toBe(403)
    expect(res.body.data).toBeUndefined()
  })

  it('неверный период — 400', async () => {
    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-26&to=2026-10-20')
      .set(authHeaders(auth))
    expect(res.status).toBe(400)
  })

  it('пустые таблицы — нули и пустые списки, не ошибка', async () => {
    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    const data = res.body.data as TrafficSourcesResponse
    expect(data).toMatchObject({
      totalVisits: 0,
      prevTotalVisits: 0,
      sources: [],
      engines: [],
      weeks: [],
    })
    expect(data).toMatchObject({ prevFrom: '2026-10-13', prevTo: '2026-10-19' })
  })

  it('источники за период и прошлый период; разбивка поисковиков не входит в итог', async () => {
    await seedSource('2026-10-20', 'organic', 30)
    await seedSource('2026-10-20', 'organic', 20, 'yandex')
    await seedSource('2026-10-20', 'organic', 10, 'google')
    await seedSource('2026-10-21', 'direct', 15)
    await seedSource('2026-10-14', 'organic', 12)
    await seedSource('2026-10-14', 'organic', 12, 'yandex')
    await seedSource('2026-10-01', 'direct', 99)

    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')
      .set(authHeaders(auth))
    const data = res.body.data as TrafficSourcesResponse

    expect(data.totalVisits).toBe(45)
    expect(data.prevTotalVisits).toBe(12)
    expect(data.sources).toEqual([
      { source: 'organic', visits: 30, prevVisits: 12 },
      { source: 'direct', visits: 15, prevVisits: 0 },
    ])
    expect(data.engines).toEqual([
      { engine: 'yandex', visits: 20, prevVisits: 12 },
      { engine: 'google', visits: 10, prevVisits: 0 },
    ])
    expect(data.weeks).toEqual([
      { weekStart: '2026-10-19', visitsBySource: { organic: 30, direct: 15 } },
    ])
  })

  it('даты отдаются строками без сдвига пояса', async () => {
    await seedSource('2026-10-20', 'direct', 1)
    process.env.SEARCH_STATS_SYNC_ENABLED = 'true'
    process.env.YANDEX_STATS_OAUTH_TOKEN = 't'
    const res = await request(app).get('/api/admin/traffic/status').set(authHeaders(auth))
    const data = res.body.data as TrafficStatus
    expect(data).toMatchObject({
      configured: true,
      dataSince: '2026-10-20',
      dataUntil: '2026-10-20',
    })
    expect(data.runs.map((r) => r.source)).toEqual(['metrika', 'webmaster'])
  })

  it('статус без флага — configured false, ответ не содержит токена', async () => {
    process.env.YANDEX_STATS_OAUTH_TOKEN = 'y0_SECRET_IN_ENV'
    delete process.env.SEARCH_STATS_SYNC_ENABLED
    const res = await request(app).get('/api/admin/traffic/status').set(authHeaders(auth))
    expect(res.body.data).toMatchObject({ configured: false, dataSince: null, dataUntil: null })
    expect(JSON.stringify(res.body)).not.toContain('y0_SECRET_IN_ENV')
  })
})
```

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/routes/admin-traffic.test.ts`
Expected: FAIL — 404 на `/api/admin/traffic/...`.

- [ ] **Step 3: Реализация запросов**

`api/src/lib/searchStats/queries.ts`:

```ts
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

export async function getTrafficSources(from: string, to: string): Promise<TrafficSourcesResponse> {
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
```

`api/src/routes/admin/traffic.ts`:

```ts
import { Router } from 'express'
import { getTrafficSources, getTrafficStatus } from '../../lib/searchStats/queries.js'
import { requireAdminAuth, requireCsrfToken, requireRole } from '../middleware/requireAdminAuth.js'
import { StatsQuerySchema } from './stats.schemas.js'

export const adminTrafficRouter: Router = Router()

adminTrafficRouter.use(requireAdminAuth)
adminTrafficRouter.use(requireCsrfToken)
// Трафик рядом с суммами заказов (блок 2 в следующих PR): только роль admin.
adminTrafficRouter.use(requireRole('admin'))

// GET /api/admin/traffic/status — журнал синхронизаций и диапазон данных.
adminTrafficRouter.get('/status', async (_req, res, next) => {
  try {
    res.json({ data: await getTrafficStatus(process.env) })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/traffic/sources?from=YYYY-MM-DD&to=YYYY-MM-DD — оба дня включительно.
adminTrafficRouter.get('/sources', async (req, res, next) => {
  try {
    const { from, to } = StatsQuerySchema.parse(req.query)
    res.json({ data: await getTrafficSources(from, to) })
  } catch (err) {
    next(err)
  }
})
```

В `api/src/app.ts` после строки 29:

```ts
import { adminTrafficRouter } from './routes/admin/traffic.js'
```

и после строки 160:

```ts
app.use('/api/admin/traffic', adminTrafficRouter)
```

- [ ] **Step 4: Тесты проходят**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api -- src/routes/admin-traffic.test.ts src/routes/admin-stats.test.ts`
Expected: PASS. Если «неверный период» вернул не 400 — посмотреть, как это проверяет `admin-stats.test.ts`, и
привести ожидание к тому же поведению (обработчик ошибок общий).
Run: `npm run typecheck -w api` — без ошибок.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/searchStats/queries.ts api/src/routes/admin/traffic.ts api/src/routes/admin-traffic.test.ts api/src/app.ts
git commit -m "feat(api): /api/admin/traffic — статус синхронизации и визиты по источникам" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Страница «Трафик и рост» в админке

**Files:**

- Modify: `web/app/admin/(authed)/statsPeriod.ts` (пресет `quarter`), `web/app/admin/(authed)/statsPeriod.test.ts`
- Modify: `web/app/admin/(authed)/StatsDashboard.tsx:45-47` (`export` у `CHIP_ACTIVE`, `CHIP_IDLE`)
- Modify: `web/components/admin/AdminShell.tsx:25-35` (пункт меню), `web/components/admin/AdminShell.test.tsx`
- Create: `web/app/admin/(authed)/traffic/trafficFormat.ts`, `syncBanner.ts`, `sourcesChart.ts`,
  `SourcesChart.tsx`, `SyncStatusBanner.tsx`, `TrafficDashboard.tsx`, `page.tsx`
- Test: `web/app/admin/(authed)/traffic/trafficFormat.test.ts`, `syncBanner.test.ts`, `sourcesChart.test.ts`,
  `TrafficDashboard.test.tsx`

**Interfaces:**

- Consumes: `GET /api/admin/traffic/status`, `GET /api/admin/traffic/sources` (Task 5); типы `TrafficStatus`,
  `TrafficSourcesResponse`, `TrafficWeek` (Task 1); `resolvePeriod`, `StatsPeriod`, `PeriodPreset` (`statsPeriod.ts`);
  `ADMIN_API_URL_SERVER` (`@/lib/adminAuth`), `fetchCurrentAdmin` (`@/lib/adminSession`).
- Produces: `sourceLabel(code)`, `engineLabel(code)`, `formatDelta(cur, prev)`, `formatCount(n)`;
  `syncBannerState(status, now): BannerState`; `SERIES`, `seriesKey(source)`, `stackLayout(weeks, width, height): StackBar[]`;
  компоненты `SourcesChart`, `SyncStatusBanner`, `TrafficDashboard`; страница `/admin/traffic`.

- [ ] **Step 1: Тесты чистых функций (падают)**

`web/app/admin/(authed)/traffic/trafficFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { engineLabel, formatCount, formatDelta, sourceLabel } from './trafficFormat'

describe('подписи и числа', () => {
  it('источники и поисковики по-русски, неизвестный код — как есть', () => {
    expect(sourceLabel('organic')).toBe('Поиск')
    expect(sourceLabel('direct')).toBe('Прямые заходы')
    expect(sourceLabel('newthing')).toBe('newthing')
    expect(engineLabel('yandex')).toBe('Яндекс')
    expect(engineLabel('google')).toBe('Google')
    expect(engineLabel('undefined')).toBe('Не определено')
  })
  it('formatDelta: процент, рост с нуля — «новое», ноль к нулю — тире', () => {
    expect(formatDelta(150, 100)).toBe('+50%')
    expect(formatDelta(50, 100)).toBe('−50%')
    expect(formatDelta(100, 100)).toBe('0%')
    expect(formatDelta(5, 0)).toBe('новое')
    expect(formatDelta(0, 0)).toBe('—')
  })
  it('formatCount — с разрядами', () => {
    expect(formatCount(4738)).toBe('4 738')
  })
})
```

`web/app/admin/(authed)/traffic/syncBanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { TrafficStatus } from '@ximi4ka-shop/shared'
import { syncBannerState } from './syncBanner'

const NOW = new Date('2026-10-28T12:00:00Z')

function status(
  over: Partial<TrafficStatus['runs'][number]> = {},
  configured = true,
): TrafficStatus {
  return {
    configured,
    dataSince: null,
    dataUntil: null,
    runs: [
      {
        source: 'metrika',
        lastStartedAt: null,
        lastStatus: null,
        lastError: null,
        lastSuccessAt: null,
        ...over,
      },
      {
        source: 'webmaster',
        lastStartedAt: null,
        lastStatus: null,
        lastError: null,
        lastSuccessAt: null,
      },
    ],
  }
}

describe('syncBannerState', () => {
  it('не настроена', () => {
    expect(syncBannerState(status({}, false), NOW)).toEqual({ kind: 'not_configured' })
  })
  it('последний запуск с ошибкой — текст ошибки', () => {
    expect(
      syncBannerState(status({ lastStatus: 'error', lastError: 'Токен отозван' }), NOW),
    ).toEqual({ kind: 'error', message: 'Токен отозван' })
  })
  it('настроена, но успеха ещё не было', () => {
    expect(syncBannerState(status({ lastStatus: 'running' }), NOW)).toEqual({ kind: 'pending' })
  })
  it('успех старше 48 часов — устарели', () => {
    const at = '2026-10-26T11:00:00.000Z'
    expect(syncBannerState(status({ lastStatus: 'ok', lastSuccessAt: at }), NOW)).toEqual({
      kind: 'stale',
      lastSuccessAt: at,
    })
  })
  it('свежий успех', () => {
    const at = '2026-10-28T01:10:00.000Z'
    expect(syncBannerState(status({ lastStatus: 'ok', lastSuccessAt: at }), NOW)).toEqual({
      kind: 'ok',
      lastSuccessAt: at,
    })
  })
})
```

`web/app/admin/(authed)/traffic/sourcesChart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seriesKey, stackLayout } from './sourcesChart'

describe('stackLayout', () => {
  it('высота столбца пропорциональна сумме, сегменты в порядке SERIES снизу вверх', () => {
    const bars = stackLayout(
      [
        { weekStart: '2026-10-12', visitsBySource: { organic: 10, direct: 10 } },
        { weekStart: '2026-10-19', visitsBySource: { organic: 30, social: 10 } },
      ],
      200,
      100,
    )
    expect(bars).toHaveLength(2)
    expect(bars[1].total).toBe(40)
    expect(bars[1].segments.reduce((s, x) => s + x.height, 0)).toBeCloseTo(100)
    expect(bars[0].segments.reduce((s, x) => s + x.height, 0)).toBeCloseTo(50)
    expect(bars[1].segments.map((s) => s.key)).toEqual(['organic', 'other'])
    // нижний сегмент упирается в ось
    const bottom = bars[1].segments[0]
    expect(bottom.y + bottom.height).toBeCloseTo(100)
  })
  it('пусто и нули — без деления на ноль', () => {
    expect(stackLayout([], 200, 100)).toEqual([])
    const [bar] = stackLayout([{ weekStart: '2026-10-19', visitsBySource: {} }], 200, 100)
    expect(bar.segments).toEqual([])
  })
  it('seriesKey: малые источники — в «Остальное»', () => {
    expect(seriesKey('organic')).toBe('organic')
    expect(seriesKey('messenger')).toBe('other')
  })
})
```

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `npm run test -w web -- "app/admin/(authed)/traffic"`
Expected: FAIL — нет модулей.

- [ ] **Step 3: Реализация чистых функций**

`web/app/admin/(authed)/traffic/trafficFormat.ts`:

```ts
const SOURCE_LABELS: Record<string, string> = {
  organic: 'Поиск',
  direct: 'Прямые заходы',
  referral: 'Ссылки на сайтах',
  ad: 'Реклама',
  social: 'Соцсети',
  internal: 'Внутренние переходы',
  recommend: 'Рекомендательные системы',
  messenger: 'Мессенджеры',
  email: 'Почта',
  saved: 'Сохранённые страницы',
  qrcode: 'QR-коды',
  undefined: 'Не определено',
}

const ENGINE_LABELS: Record<string, string> = {
  yandex: 'Яндекс',
  google: 'Google',
  undefined: 'Не определено',
}

export const sourceLabel = (code: string) => SOURCE_LABELS[code] ?? code
export const engineLabel = (code: string) => ENGINE_LABELS[code] ?? code

export function formatCount(n: number): string {
  return n.toLocaleString('ru-RU')
}

export function formatDelta(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? 'новое' : '—'
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct > 0) return `+${pct}%`
  if (pct < 0) return `−${Math.abs(pct)}%`
  return '0%'
}
```

`web/app/admin/(authed)/traffic/syncBanner.ts`:

```ts
import type { TrafficStatus } from '@ximi4ka-shop/shared'

const STALE_MS = 48 * 60 * 60 * 1000

export type BannerState =
  | { kind: 'not_configured' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'stale'; lastSuccessAt: string }
  | { kind: 'ok'; lastSuccessAt: string }

// Пока в PR 1 только Метрика: состояние по её журналу.
export function syncBannerState(status: TrafficStatus, now: Date): BannerState {
  if (!status.configured) return { kind: 'not_configured' }
  const run = status.runs.find((r) => r.source === 'metrika')
  if (run?.lastStatus === 'error') {
    return { kind: 'error', message: run.lastError ?? 'Неизвестная ошибка' }
  }
  if (!run?.lastSuccessAt) return { kind: 'pending' }
  if (now.getTime() - Date.parse(run.lastSuccessAt) > STALE_MS) {
    return { kind: 'stale', lastSuccessAt: run.lastSuccessAt }
  }
  return { kind: 'ok', lastSuccessAt: run.lastSuccessAt }
}
```

`web/app/admin/(authed)/traffic/sourcesChart.ts`:

```ts
import type { TrafficWeek } from '@ximi4ka-shop/shared'

// Пять серий: крупные источники отдельно, остальное вместе — больше цветов не читаются.
export const SERIES = [
  { key: 'organic', label: 'Поиск', color: '#2563eb' },
  { key: 'direct', label: 'Прямые заходы', color: '#64748b' },
  { key: 'referral', label: 'Ссылки', color: '#16a34a' },
  { key: 'ad', label: 'Реклама', color: '#d97706' },
  { key: 'other', label: 'Остальное', color: '#a78bfa' },
] as const

export type SeriesKey = (typeof SERIES)[number]['key']

const MAIN = new Set<string>(['organic', 'direct', 'referral', 'ad'])
export const seriesKey = (source: string): SeriesKey =>
  MAIN.has(source) ? (source as SeriesKey) : 'other'

export interface StackSegment {
  key: SeriesKey
  y: number
  height: number
  visits: number
}

export interface StackBar {
  weekStart: string
  x: number
  width: number
  total: number
  segments: StackSegment[]
}

export function stackLayout(weeks: TrafficWeek[], width: number, height: number): StackBar[] {
  if (!weeks.length) return []
  const grouped = weeks.map((w) => {
    const bySeries = new Map<SeriesKey, number>()
    for (const [source, visits] of Object.entries(w.visitsBySource)) {
      const k = seriesKey(source)
      bySeries.set(k, (bySeries.get(k) ?? 0) + visits)
    }
    return {
      weekStart: w.weekStart,
      bySeries,
      total: [...bySeries.values()].reduce((s, v) => s + v, 0),
    }
  })
  const max = Math.max(...grouped.map((g) => g.total), 0)
  const slot = width / weeks.length
  const barWidth = Math.max(1, slot * 0.7)
  return grouped.map((g, i) => {
    let top = height
    const segments: StackSegment[] = []
    for (const s of SERIES) {
      const visits = g.bySeries.get(s.key) ?? 0
      if (!visits || !max) continue
      const h = (visits / max) * height
      top -= h
      segments.push({ key: s.key, y: top, height: h, visits })
    }
    return {
      weekStart: g.weekStart,
      x: i * slot + (slot - barWidth) / 2,
      width: barWidth,
      total: g.total,
      segments,
    }
  })
}
```

- [ ] **Step 4: Пресет «90 дней» и экспорт плашек**

В `statsPeriod.ts`:

```ts
export type PeriodPreset = 'week' | 'month' | 'quarter' | 'custom'
```

```ts
const PRESET_DAYS = { week: 7, month: 30, quarter: 90 } as const
```

и в `resolvePeriod` заменить строку выбора пресета:

```ts
const preset = params.preset === 'month' || params.preset === 'quarter' ? params.preset : 'week'
```

В `statsPeriod.test.ts` добавить:

```ts
it('quarter — 90 дней, включая сегодня', () => {
  expect(resolvePeriod({ preset: 'quarter' }, new Date('2026-10-28T09:00:00Z'))).toEqual({
    preset: 'quarter',
    from: '2026-07-31',
    to: '2026-10-28',
  })
})
```

(импорт `resolvePeriod` и `it` в файле уже есть; если `describe`-блок другой — положить тест в блок `resolvePeriod`).

В `StatsDashboard.tsx:45-47` — `const CHIP_ACTIVE` → `export const CHIP_ACTIVE`, `const CHIP_IDLE` → `export const CHIP_IDLE`.
Главный дашборд пресет `quarter` не показывает (его `PRESETS` не меняется).

- [ ] **Step 5: Тест дашборда (падает)**

`web/app/admin/(authed)/traffic/TrafficDashboard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { TrafficDashboard } from './TrafficDashboard'

const period = { preset: 'week' as const, from: '2026-10-20', to: '2026-10-26' }
const NOW = new Date('2026-10-28T12:00:00Z')

const status: TrafficStatus = {
  configured: true,
  dataSince: '2026-10-10',
  dataUntil: '2026-10-27',
  runs: [
    {
      source: 'metrika',
      lastStartedAt: '2026-10-28T01:00:00.000Z',
      lastStatus: 'ok',
      lastError: null,
      lastSuccessAt: '2026-10-28T01:10:00.000Z',
    },
    {
      source: 'webmaster',
      lastStartedAt: null,
      lastStatus: null,
      lastError: null,
      lastSuccessAt: null,
    },
  ],
}

const sources: TrafficSourcesResponse = {
  from: '2026-10-20',
  to: '2026-10-26',
  prevFrom: '2026-10-13',
  prevTo: '2026-10-19',
  totalVisits: 45,
  prevTotalVisits: 30,
  sources: [
    { source: 'organic', visits: 30, prevVisits: 20 },
    { source: 'direct', visits: 15, prevVisits: 10 },
  ],
  engines: [{ engine: 'yandex', visits: 20, prevVisits: 15 }],
  weeks: [{ weekStart: '2026-10-19', visitsBySource: { organic: 30, direct: 15 } }],
}

describe('TrafficDashboard', () => {
  it('итоги, таблица источников с разницей и поисковики', () => {
    render(<TrafficDashboard status={status} sources={sources} period={period} now={NOW} />)
    expect(screen.getByRole('heading', { name: 'Трафик и рост' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Визиты по источникам' })
    const organic = within(table).getByText('Поиск').closest('tr') as HTMLElement
    expect(within(organic).getByText('30')).toBeInTheDocument()
    expect(within(organic).getByText('+50%')).toBeInTheDocument()
    expect(screen.getByText('Яндекс')).toBeInTheDocument()
    expect(screen.getByText(/обновлено/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Визиты по неделям и источникам' })).toBeInTheDocument()
  })

  it('синхронизация не настроена — плашка и пустое состояние вместо таблицы', () => {
    render(
      <TrafficDashboard
        status={{ ...status, configured: false, dataSince: null, dataUntil: null }}
        sources={{
          ...sources,
          totalVisits: 0,
          prevTotalVisits: 0,
          sources: [],
          engines: [],
          weeks: [],
        }}
        period={period}
        now={NOW}
      />,
    )
    expect(screen.getByText(/Синхронизация не настроена/)).toBeInTheDocument()
    expect(screen.getByText('За этот период данных нет.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('ошибка синхронизации — текст ошибки', () => {
    render(
      <TrafficDashboard
        status={{
          ...status,
          runs: [
            { ...status.runs[0], lastStatus: 'error', lastError: 'Токен отозван или истёк' },
            status.runs[1],
          ],
        }}
        sources={sources}
        period={period}
        now={NOW}
      />,
    )
    expect(screen.getByText(/Токен отозван или истёк/)).toBeInTheDocument()
  })

  it('плашки периода ведут в /admin/traffic, есть «90 дней»', () => {
    render(<TrafficDashboard status={status} sources={sources} period={period} now={NOW} />)
    expect(screen.getByRole('link', { name: '90 дней' })).toHaveAttribute(
      'href',
      '/admin/traffic?preset=quarter',
    )
  })
})
```

- [ ] **Step 6: Компоненты и страница**

`web/app/admin/(authed)/traffic/SyncStatusBanner.tsx`:

```tsx
import type { TrafficStatus } from '@ximi4ka-shop/shared'
import { syncBannerState } from './syncBanner'

const WARN = 'rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900'

function formatMsk(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function SyncStatusBanner({ status, now }: { status: TrafficStatus; now: Date }) {
  const state = syncBannerState(status, now)
  switch (state.kind) {
    case 'not_configured':
      return (
        <div className={WARN}>
          Синхронизация не настроена: нужен токен YANDEX_STATS_OAUTH_TOKEN и
          SEARCH_STATS_SYNC_ENABLED=true (deploy/README.md, «Статистика трафика в админке»).
        </div>
      )
    case 'pending':
      return <div className={WARN}>Первая синхронизация с Метрикой ещё не прошла.</div>
    case 'error':
      return <div className={WARN}>Синхронизация с Метрикой не удалась: {state.message}</div>
    case 'stale':
      return (
        <div className={WARN}>
          Данные устарели: последнее обновление {formatMsk(state.lastSuccessAt)}.
        </div>
      )
    case 'ok':
      return (
        <p className="text-sm text-brand-text-secondary">
          Данные на вчера, обновлено {formatMsk(state.lastSuccessAt)}
          {status.dataSince ? `; есть с ${status.dataSince.split('-').reverse().join('.')}` : ''}.
        </p>
      )
  }
}
```

`web/app/admin/(authed)/traffic/SourcesChart.tsx`:

```tsx
import type { TrafficWeek } from '@ximi4ka-shop/shared'
import { shortDate } from '../RevenueChart'
import { SERIES, stackLayout } from './sourcesChart'
import { formatCount } from './trafficFormat'

// Сложенные столбцы по неделям на inline-SVG, как RevenueChart: без библиотеки и клиентского JS.
const WIDTH = 640
const CHART_HEIGHT = 140
const HEIGHT = 164

export function SourcesChart({ weeks }: { weeks: TrafficWeek[] }) {
  const bars = stackLayout(weeks, WIDTH, CHART_HEIGHT)
  const label = (key: string) => SERIES.find((s) => s.key === key)?.label ?? key
  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Визиты по неделям и источникам"
        className="w-full h-auto"
      >
        <line
          x1="0"
          y1={CHART_HEIGHT}
          x2={WIDTH}
          y2={CHART_HEIGHT}
          className="stroke-brand-border"
          strokeWidth="1"
        />
        {bars.map((b) => (
          <g key={b.weekStart}>
            {b.segments.map((s) => (
              <rect
                key={s.key}
                x={b.x}
                y={s.y}
                width={b.width}
                height={s.height}
                fill={SERIES.find((x) => x.key === s.key)?.color}
              >
                <title>{`Неделя с ${shortDate(b.weekStart)}: ${label(s.key)} — ${formatCount(s.visits)} из ${formatCount(b.total)}`}</title>
              </rect>
            ))}
            <text
              x={b.x + b.width / 2}
              y={HEIGHT - 4}
              textAnchor="middle"
              className="fill-brand-text-secondary"
              fontSize="11"
            >
              {shortDate(b.weekStart)}
            </text>
          </g>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-text-secondary">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`web/app/admin/(authed)/traffic/TrafficDashboard.tsx`:

```tsx
import Link from 'next/link'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { CHIP_ACTIVE, CHIP_IDLE } from '../StatsDashboard'
import type { PeriodPreset, StatsPeriod } from '../statsPeriod'
import { SourcesChart } from './SourcesChart'
import { SyncStatusBanner } from './SyncStatusBanner'
import { engineLabel, formatCount, formatDelta, sourceLabel } from './trafficFormat'

const PRESETS: Array<{ value: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: '90 дней' },
]

const CARD = 'bg-white rounded-2xl border border-brand-border p-5'

export function TrafficDashboard({
  status,
  sources,
  period,
  now,
}: {
  status: TrafficStatus
  sources: TrafficSourcesResponse
  period: StatsPeriod
  now: Date
}) {
  const organic = sources.sources.find((s) => s.source === 'organic') ?? {
    visits: 0,
    prevVisits: 0,
  }
  const empty = sources.sources.length === 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-text">Трафик и рост</h1>
      <SyncStatusBanner status={status} now={now} />

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => {
          const active = period.preset === p.value
          return (
            <Link
              key={p.value}
              href={`/admin/traffic?preset=${p.value}`}
              aria-current={active ? 'page' : undefined}
              className={active ? CHIP_ACTIVE : CHIP_IDLE}
            >
              {p.label}
            </Link>
          )
        })}
        <form
          key={`${period.from}_${period.to}`}
          method="get"
          action="/admin/traffic"
          className="flex flex-wrap items-end gap-2 ml-2"
        >
          <input type="hidden" name="preset" value="custom" />
          <label className="text-sm text-brand-text-secondary">
            <span className="mr-1">С</span>
            <input
              type="date"
              name="from"
              defaultValue={period.from}
              required
              className="px-2 py-1 rounded-lg border border-brand-border bg-white text-brand-text"
            />
          </label>
          <label className="text-sm text-brand-text-secondary">
            <span className="mr-1">По</span>
            <input
              type="date"
              name="to"
              defaultValue={period.to}
              required
              className="px-2 py-1 rounded-lg border border-brand-border bg-white text-brand-text"
            />
          </label>
          <button type="submit" className={period.preset === 'custom' ? CHIP_ACTIVE : CHIP_IDLE}>
            Показать
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={CARD}>
          <div className="text-sm text-brand-text-secondary">Визиты</div>
          <div className="mt-1 text-3xl font-bold text-brand-text">
            {formatCount(sources.totalVisits)}
          </div>
          <div className="mt-1 text-xs text-brand-text-secondary">
            {formatDelta(sources.totalVisits, sources.prevTotalVisits)} к прошлому периоду
          </div>
        </div>
        <div className={CARD}>
          <div className="text-sm text-brand-text-secondary">Из поиска</div>
          <div className="mt-1 text-3xl font-bold text-brand-text">
            {formatCount(organic.visits)}
          </div>
          <div className="mt-1 text-xs text-brand-text-secondary">
            {formatDelta(organic.visits, organic.prevVisits)} к прошлому периоду
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-3 text-sm font-medium text-brand-text">Визиты по неделям</div>
        <SourcesChart weeks={sources.weeks} />
      </div>

      <div className={CARD}>
        <div className="mb-3 text-sm font-medium text-brand-text">Источники</div>
        {empty ? (
          <p className="text-sm text-brand-text-secondary">За этот период данных нет.</p>
        ) : (
          <table aria-label="Визиты по источникам" className="w-full text-sm">
            <thead>
              <tr className="text-left text-brand-text-secondary">
                <th className="py-1 font-normal">Источник</th>
                <th className="py-1 font-normal text-right">Визиты</th>
                <th className="py-1 font-normal text-right">К прошлому периоду</th>
              </tr>
            </thead>
            <tbody>
              {sources.sources.map((s) => (
                <tr key={s.source} className="border-t border-brand-border">
                  <td className="py-1.5 text-brand-text">{sourceLabel(s.source)}</td>
                  <td className="py-1.5 text-right text-brand-text">{formatCount(s.visits)}</td>
                  <td className="py-1.5 text-right text-brand-text-secondary">
                    {formatDelta(s.visits, s.prevVisits)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sources.engines.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-sm font-medium text-brand-text">Поиск по системам</div>
            <ul className="space-y-1 text-sm">
              {sources.engines.map((e) => (
                <li key={e.engine} className="flex justify-between">
                  <span className="text-brand-text">{engineLabel(e.engine)}</span>
                  <span className="text-brand-text-secondary">
                    {formatCount(e.visits)} · {formatDelta(e.visits, e.prevVisits)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
```

`web/app/admin/(authed)/traffic/page.tsx`:

```tsx
import { cookies } from 'next/headers'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { fetchCurrentAdmin } from '@/lib/adminSession'
import { resolvePeriod } from '../statsPeriod'
import { TrafficDashboard } from './TrafficDashboard'

// Тот же паттерн, что у главной админки: cookie пробрасываем вручную (api на
// другом origin), cache: 'no-store'. Во внешние API страница не ходит.
async function fetchAdmin<T>(path: string): Promise<T> {
  const store = await cookies()
  const res = await fetch(`${ADMIN_API_URL_SERVER}${path}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Admin traffic failed: ${res.status} ${path}`)
  return ((await res.json()) as { data: T }).data
}

interface SearchParams {
  preset?: string
  from?: string
  to?: string
}

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  // Роль сверяем до запросов: layout не остановит параллельный рендер страницы.
  const admin = await fetchCurrentAdmin()
  if (admin?.role !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-brand-border p-6 max-w-xl">
        <h1 className="text-xl font-bold text-brand-text mb-2">Трафик и рост</h1>
        <p className="text-brand-text-secondary">Раздел доступен только администратору.</p>
      </div>
    )
  }

  const period = resolvePeriod((await searchParams) ?? {}, new Date())
  const params = new URLSearchParams({ from: period.from, to: period.to })

  let status: TrafficStatus
  let sources: TrafficSourcesResponse
  try {
    ;[status, sources] = await Promise.all([
      fetchAdmin<TrafficStatus>('/api/admin/traffic/status'),
      fetchAdmin<TrafficSourcesResponse>(`/api/admin/traffic/sources?${params.toString()}`),
    ])
  } catch (err) {
    console.error('Admin traffic failed', err)
    return (
      <div className="bg-white rounded-2xl border border-brand-border p-6 max-w-xl">
        <h1 className="text-xl font-bold text-brand-text mb-2">Трафик и рост</h1>
        <p className="text-brand-text-secondary">
          Не удалось загрузить данные. Обновите страницу или попробуйте позже.
        </p>
      </div>
    )
  }

  return <TrafficDashboard status={status} sources={sources} period={period} now={new Date()} />
}
```

Добавить в `TrafficDashboard.test.tsx` проверку страницы для редактора (по образцу `page.test.tsx` главной: там уже
замокан `fetchCurrentAdmin`; повторить тот же `vi.mock('@/lib/adminSession', …)` и `vi.mock('next/headers', …)`):

(`vi` добавить в уже существующий импорт из `vitest` в начале файла, отдельной строкой не импортировать.)

```tsx
import AdminTrafficPage from './page'

vi.mock('@/lib/adminSession', () => ({
  fetchCurrentAdmin: vi.fn(async () => ({ role: 'editor' })),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => '' }) }))

describe('страница /admin/traffic', () => {
  it('редактор видит отказ, запросов к api нет', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(await AdminTrafficPage({}))
    expect(screen.getByText('Раздел доступен только администратору.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
```

(если в `page.test.tsx` главной моки устроены иначе — повторить их форму, а не эту.)

В `web/components/admin/AdminShell.tsx` в `NAV` после `Главная`:

```ts
  { href: '/admin/traffic', label: 'Трафик и рост', adminOnly: true },
```

В `web/components/admin/AdminShell.test.tsx` добавить в существующий блок проверки ролей (по образцу соседних
проверок `Заказы`/`Настройки`) утверждения: у admin есть ссылка «Трафик и рост» на `/admin/traffic`, у editor её нет.

- [ ] **Step 7: Тесты web проходят**

Run: `npm run test -w web -- "app/admin" components/admin`
Expected: PASS (новые и старые тесты админки, включая `statsPeriod.test.ts` и `StatsDashboard.test.tsx`).
Run: `npm run typecheck -w web && npm run lint -w web` — без ошибок.

- [ ] **Step 8: Commit**

```bash
git add "web/app/admin/(authed)" web/components/admin
git commit -m "feat(web): раздел админки «Трафик и рост» — источники и статус синхронизации" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Проверка целиком и PR

**Files:** без новых файлов; правки только по результатам проверок.

- [ ] **Step 1: Все проверки репозитория**

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_traffic npm run test -w api
npm run test -w web
npx prettier --check .
```

Expected: всё зелёное. `prettier` ругается — `npx prettier --write` по перечисленным файлам и повторить.

- [ ] **Step 2: Живая проверка в dev-сервере**

Turbopack резолвит `shared` иначе, чем vitest: новый `@ximi4ka-shop/shared/types/traffic` проверить вживую.

1. Локальная база с миграциями (`npm run migration:run -w api`), в ней тестовые строки:

```sql
INSERT INTO traffic_sources_daily (day, source, search_engine, visits, users, bounce_rate, page_depth) VALUES
  (CURRENT_DATE - 3, 'organic', '', 40, 35, 20, 2.1),
  (CURRENT_DATE - 3, 'organic', 'yandex', 28, 25, 18, 2.2),
  (CURRENT_DATE - 3, 'organic', 'google', 12, 10, 25, 1.9),
  (CURRENT_DATE - 3, 'direct', '', 25, 20, 30, 1.6),
  (CURRENT_DATE - 10, 'organic', '', 30, 28, 22, 2.0),
  (CURRENT_DATE - 10, 'social', '', 5, 5, 60, 1.1);
```

2. Запустить api и web через preview (`.claude/launch.json`), войти в админку тестовым админом, открыть
   `/admin/traffic`, переключить «Неделя / Месяц / 90 дней».
3. Проверить: нет ошибок в консоли и логах; таблица и график показывают засеянные цифры; плашка «Синхронизация не
   настроена» (флага локально нет); под редактором пункта меню нет.
4. Скриншот страницы приложить к PR. Тестовые строки удалить: `TRUNCATE traffic_sources_daily`.

- [ ] **Step 3: Ревью ветки**

Отдельный ревьюер (`code-reviewer` или `/code-review`) по всей ветке; `/security-review`, так как задеты токены и
данные. Исправления — отдельными коммитами.

- [ ] **Step 4: PR без мёржа**

```bash
git push -u origin claude/website-traffic-organic-57a9e0
gh pr create --base main --title "Трафик и рост в админке, PR 1: источники из Метрики" --body-file <подготовленный файл>
```

В описании PR: что сделано (ссылка на спецификацию и этот план), что мёрж ничего не включает без флага и токена, шаги
владельца из `deploy/README.md` «Статистика трафика в админке», команда пробного скрипта, скриншот, результаты проверок;
последней строкой — `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Мёрж — только по команде
владельца.
