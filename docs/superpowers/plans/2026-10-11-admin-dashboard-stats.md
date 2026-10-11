# Дашборд статистики в админке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дашборд на `/admin` со сводкой (клики, корзины, заказы, сумма заказов, логины в ЛК, новые пользователи) за неделю, месяц или выбранный период и небольшим графиком выручки по дням.

**Architecture:** Клики и корзины пишем в новую таблицу `analytics_events` через публичный `POST /api/public/events`, события шлёт тонкий клиентский трекер из обёртки `reachGoal`. Остальное считается из существующих таблиц одним агрегатным SQL-запросом в `GET /api/admin/stats`. Страница — серверный компонент, который берёт период из `searchParams`, а график — inline-SVG без новых зависимостей.

**Tech Stack:** Express 4, TypeORM 0.3 (сырой SQL для агрегатов), zod 4, Postgres 16, Vitest + supertest (api), Next.js 16 / React 19 / Tailwind v4 (web), Vitest + RTL (web).

**Spec:** `docs/superpowers/specs/2026-10-11-admin-dashboard-stats-design.md`

## Global Constraints

- Миграции: файл `api/src/migrations/1790810000000-AddAnalyticsEvents.ts`, класс `AddAnalyticsEvents1790810000000`, SQL через `queryRunner.query`, UUID по умолчанию `gen_random_uuid()`. (В проекте уже есть две миграции с ts `1790800000000`, берём больший.)
- `synchronize: false` — схема меняется только миграциями.
- Сырые запросы по `orders` всегда с `deleted_at IS NULL`.
- Границы дней — `Europe/Moscow`; период не больше 366 дней.
- Выручка: `SUM(total_rub)` по `status IN ('paid','shipped')`, день по `paid_at`.
- В `analytics_events` не хранятся IP и User-Agent.
- Новые зависимости не добавляем (график — inline-SVG).
- Админский интерфейс только на русском; стили — токены проекта (`bg-white rounded-2xl border border-brand-border`).
- Next.js 16 отличается от обучающих данных: перед правкой `web/` прочитать нужный раздел `web/node_modules/next/dist/docs/` (`web/AGENTS.md`).
- Перед PR: `npm run lint`, `npm run typecheck`, тесты `api`, `web`, `shared`, `npx prettier --check .` в корне.
- **Коммиты и push:** по глобальному правилу владельца коммитим только с его разрешения. Шаги «Commit» ниже выполнять, только если владелец разрешил коммитить в эту ветку; push, PR и мёрж в `main` (= автодеплой в прод) — только по явной команде владельца.

## Review Focus

Входы и условия, которых спек прямо не перечисляет, но которые чаще всего ломают такую статистику; у каждого есть тест в задаче-владельце.

1. Событие или заказ в 23:59:59 и в 00:00:00 по Москве попадает в правильный день (границы периода по Москве, а не по UTC) — Task 3.
2. Период из одного дня (`from == to`), ровно 366 дней, 367 дней, несуществующая дата `2026-02-31`, `from > to` — Task 3 (API) и Task 5 (страница откатывается на неделю).
3. Пустая база и период без данных: нули, ряд дней без дыр, график не делит на ноль — Task 3 и Task 5.
4. Заказ оплачен в периоде, а создан раньше: выручка в день оплаты, заказ — в день создания; soft-deleted и отменённый заказ с `paid_at` в выручку не входят — Task 3.
5. Трекер при недоступном `localStorage`, отсутствии `sendBeacon`/`fetch`, сетевой ошибке: молчит, не бросает, `visitorId` остаётся стабильным в рамках страницы — Task 4.
6. Публичный endpoint: чужой тип события, не-uuid, огромный `meta`, бот, всплеск запросов — Task 2.

## Структура файлов

Создаются:

- `shared/src/types/analytics.ts` — типы событий и DTO ответа статистики, константа `MAX_STATS_DAYS`.
- `shared/src/types/analytics.test.ts` — тест константы.
- `api/src/migrations/1790810000000-AddAnalyticsEvents.ts` — таблица и индексы.
- `api/src/routes/public/events.ts` — приём событий.
- `api/src/routes/public-events.test.ts` — тесты приёма.
- `api/src/lib/analytics/stats.ts` — агрегаты (`getStats`).
- `api/src/routes/admin/stats.schemas.ts` — валидация периода.
- `api/src/routes/admin/stats.ts` — роутер `/api/admin/stats`.
- `api/src/routes/admin-stats.test.ts` — тесты статистики.
- `web/lib/track.ts` и `web/lib/track.test.ts` — клиентский трекер.
- `web/app/admin/(authed)/statsPeriod.ts` и `statsPeriod.test.ts` — разбор периода.
- `web/app/admin/(authed)/chartScale.ts` и `chartScale.test.ts` — геометрия графика.
- `web/app/admin/(authed)/RevenueChart.tsx` — SVG-график.
- `web/app/admin/(authed)/StatsDashboard.tsx` и `StatsDashboard.test.tsx` — карточки, выбор периода.

Меняются:

- `shared/src/index.ts`, `shared/package.json` — экспорт типов и подпути `./types/analytics`.
- `api/src/app.ts` — монтирование двух роутеров и лимитера.
- `web/lib/metrika.ts` — вызов `trackEvent` из `reachGoal`; `web/lib/metrika.test.ts` — мок трекера и новые тесты.
- `web/app/admin/(authed)/page.tsx` — заглушка заменяется дашбордом.

Отступление от спека: отдельный TypeORM-entity `AnalyticsEvent` не заводим. Таблицу пишут и читают только сырые запросы, entity был бы мёртвым кодом, а источник схемы — миграция. Индекс по событиям — `(occurred_at, type)`, а не `(type, occurred_at)`: запрос кликов фильтрует только по периоду, и ведущая колонка `type` его бы не ускорила.

---

### Task 0: Подготовка окружения

**Files:** изменений в коде нет.

- [ ] **Step 1: Проверить ветку и установить зависимости**

Run: `git status --short --branch && npm install`
Expected: ветка `claude/admin-dashboard-stats-3586e7`, чистое дерево (кроме двух документов в `docs/superpowers/`), установка без ошибок.

- [ ] **Step 2: Проверить, что Postgres для тестов доступен**

Run: `pg_isready`
Expected: `accepting connections`. Тесты `api` сами создадут базу `ximi4ka_shop_test` (`TEST_DATABASE_URL`, по умолчанию `postgres://localhost:5432/ximi4ka_shop_test`).

- [ ] **Step 3: Базовый прогон тестов (до правок)**

Run: `npm test -w api 2>&1 | tail -15; npm test -w web 2>&1 | tail -15; npm test -w shared 2>&1 | tail -8`
Expected: всё зелёное. Если что-то красное ещё до наших правок — зафиксировать названия падающих тестов, чтобы не путать их с регрессией.

- [ ] **Step 4: Прочитать документацию Next 16 по теме страницы**

Run: `ls web/node_modules/next/dist/docs/ 2>/dev/null || ls node_modules/next/dist/docs/`
Прочитать разделы про `page` (`searchParams` как `Promise`), серверные компоненты и `next/link`. Ничего нового сверх уже используемого в `orders/page.tsx` не ожидается; если документация говорит иначе — править Task 6 под неё.

- [ ] **Step 5: Проверить форматирование двух документов**

Run: `npx prettier --check docs/superpowers`
Expected: если есть замечания, выполнить `npx prettier --write docs/superpowers` (CI проверяет и `.md`).

---

### Task 1: Общие типы (shared)

**Files:**

- Create: `shared/src/types/analytics.ts`
- Create: `shared/src/types/analytics.test.ts`
- Modify: `shared/src/index.ts` (добавить экспорт типов в конец)
- Modify: `shared/package.json` (добавить подпуть в `exports`)

**Interfaces:**

- Consumes: ничего.
- Produces (через `@ximi4ka-shop/shared`): `AnalyticsEventType`, `StatsTotals`, `StatsDay`, `StatsResponse`. Через подпуть `@ximi4ka-shop/shared/types/analytics`: `ANALYTICS_EVENT_TYPES`, `MAX_STATS_DAYS` и те же типы.

- [ ] **Step 1: Write the failing test**

`shared/src/types/analytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ANALYTICS_EVENT_TYPES, MAX_STATS_DAYS } from './analytics.js'

describe('analytics types', () => {
  it('белый список событий — те же цели, что уходят в Метрику, без purchase', () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([
      'add_to_cart',
      'open_cart',
      'begin_checkout',
      'material_lead',
    ])
  })

  it('максимальный период статистики — 366 дней', () => {
    expect(MAX_STATS_DAYS).toBe(366)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL — `Cannot find module './analytics.js'`.

- [ ] **Step 3: Write minimal implementation**

`shared/src/types/analytics.ts`:

```ts
// События собственной аналитики витрины (таблица analytics_events) и ответ
// админской статистики. События — те же цели, что уходят в Метрику
// (web/lib/metrika.ts); purchase не пишем: заказ и так есть в orders.
export const ANALYTICS_EVENT_TYPES = [
  'add_to_cart',
  'open_cart',
  'begin_checkout',
  'material_lead',
] as const

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number]

// Потолок периода статистики, дней (включая обе границы).
export const MAX_STATS_DAYS = 366

export interface StatsTotals {
  /** Все события из белого списка за период. */
  clicks: number
  /** Уникальные посетители с add_to_cart. */
  carts: number
  /** Заказы, созданные в периоде (без удалённых), все статусы. */
  orders: number
  /** Сумма заказов в статусах paid и shipped по дате оплаты. */
  revenueRub: number
  /** Новые сессии кабинета; вход по уже живой сессии не считается. */
  logins: number
  /** Новые аккаунты кабинета. */
  newUsers: number
}

export interface StatsDay {
  /** День по Москве, YYYY-MM-DD. */
  date: string
  /** Заказы, созданные в этот день. */
  orders: number
  /** Выручка по заказам, оплаченным в этот день. */
  revenueRub: number
}

export interface StatsResponse {
  from: string
  to: string
  totals: StatsTotals
  days: StatsDay[]
}
```

В `shared/src/index.ts` добавить в конец:

```ts
export type { AnalyticsEventType, StatsTotals, StatsDay, StatsResponse } from './types/analytics.js'
```

В `shared/package.json` в `exports` после строки `./types/materialLead` добавить (не забыть запятую у предыдущей строки):

```json
    "./types/materialLead": "./src/types/materialLead.ts",
    "./types/analytics": "./src/types/analytics.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w shared`
Expected: PASS (включая `tsc --noEmit`).

- [ ] **Step 5: Commit** (только с разрешения владельца)

```bash
git add shared/src/types/analytics.ts shared/src/types/analytics.test.ts shared/src/index.ts shared/package.json
git commit -m "feat(shared): типы событий аналитики и ответа статистики"
```

---

### Task 2: Таблица событий и публичный приёмник

**Files:**

- Create: `api/src/migrations/1790810000000-AddAnalyticsEvents.ts`
- Create: `api/src/routes/public/events.ts`
- Create: `api/src/routes/public-events.test.ts`
- Modify: `api/src/app.ts` (импорт и два `app.use` рядом с `/api/public/material-leads`)

**Interfaces:**

- Consumes: `ANALYTICS_EVENT_TYPES` из `@ximi4ka-shop/shared/types/analytics` (Task 1); `rateLimit` из `./routes/middleware/rateLimit.js`; `guard` и `envLimit` из `app.ts`.
- Produces: таблица `analytics_events(id, type, occurred_at, visitor_id, path, meta)`; `POST /api/public/events` с телом `{ type, visitorId, path, meta? }` → `204`; `createEventsRouter(): Router`.

- [ ] **Step 1: Write the failing test**

`api/src/routes/public-events.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'

const VISITOR = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
const valid = {
  type: 'add_to_cart',
  visitorId: VISITOR,
  path: '/product/kit',
  meta: { product_id: 'p1', quantity: 2 },
}

async function rows(): Promise<Array<Record<string, unknown>>> {
  return AppDataSource.query(
    'SELECT type, visitor_id, path, meta FROM analytics_events ORDER BY occurred_at',
  )
}

describe('POST /api/public/events', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE analytics_events')
    app = createApp()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('сохраняет событие и отвечает 204', async () => {
    const res = await request(app).post('/api/public/events').send(valid)
    expect(res.status).toBe(204)
    expect(await rows()).toEqual([
      {
        type: 'add_to_cart',
        visitor_id: VISITOR,
        path: '/product/kit',
        meta: { product_id: 'p1', quantity: 2 },
      },
    ])
  })

  it('meta необязателен', async () => {
    const { meta: _meta, ...noMeta } = valid
    expect((await request(app).post('/api/public/events').send(noMeta)).status).toBe(204)
    expect((await rows())[0]).toMatchObject({ meta: null })
  })

  it('чужой тип события — 400, ничего не пишется', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, type: 'purchase' })
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('visitorId не uuid — 400', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, visitorId: 'abc' })
    expect(res.status).toBe(400)
  })

  it('пустое тело — 400', async () => {
    expect((await request(app).post('/api/public/events').send({})).status).toBe(400)
  })

  it('meta не объект — 400', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, meta: 'text' })
    expect(res.status).toBe(400)
  })

  it('слишком большой meta — 400', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, meta: { blob: 'x'.repeat(2000) } })
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('длинный path обрезается до 300 символов', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, path: `/${'a'.repeat(1000)}` })
    expect(res.status).toBe(204)
    const [row] = await rows()
    expect((row.path as string).length).toBe(300)
  })

  it('бот по User-Agent: 204, но событие не пишется', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .set('User-Agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
      .send(valid)
    expect(res.status).toBe(204)
    expect(await rows()).toHaveLength(0)
  })

  it('лимит частоты: после порога 429', async () => {
    vi.stubEnv('EVENTS_RATE_LIMIT', '2')
    const limited = createApp()
    expect((await request(limited).post('/api/public/events').send(valid)).status).toBe(204)
    expect((await request(limited).post('/api/public/events').send(valid)).status).toBe(204)
    const blocked = await request(limited).post('/api/public/events').send(valid)
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('rate_limited')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w api -- public-events`
Expected: FAIL — таблицы `analytics_events` нет (`relation "analytics_events" does not exist`) либо 404 на роут.

- [ ] **Step 3: Write the migration**

`api/src/migrations/1790810000000-AddAnalyticsEvents.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Собственная аналитика витрины: клики и корзины для дашборда админки.
// Без IP и User-Agent — visitor_id случайный и живёт в localStorage браузера.
// Индексы на orders нужны агрегатам статистики по периоду: раньше по
// created_at и paid_at индексов не было.
export class AddAnalyticsEvents1790810000000 implements MigrationInterface {
  name = 'AddAnalyticsEvents1790810000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" character varying(32) NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "visitor_id" uuid NOT NULL,
        "path" character varying(300) NOT NULL,
        "meta" jsonb,
        CONSTRAINT "PK_analytics_events" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_occurred_type" ON "analytics_events" ("occurred_at", "type")`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_orders_created_at" ON "orders" ("created_at")`)
    await queryRunner.query(`CREATE INDEX "IDX_orders_paid_at" ON "orders" ("paid_at")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_paid_at"`)
    await queryRunner.query(`DROP INDEX "IDX_orders_created_at"`)
    await queryRunner.query(`DROP INDEX "IDX_analytics_events_occurred_type"`)
    await queryRunner.query(`DROP TABLE "analytics_events"`)
  }
}
```

- [ ] **Step 4: Write the router**

`api/src/routes/public/events.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { ANALYTICS_EVENT_TYPES } from '@ximi4ka-shop/shared/types/analytics'
import { AppDataSource } from '../../config/dataSource.js'

// Приём событий собственной аналитики витрины (add_to_cart, open_cart, ...).
// Публичный и анонимный, поэтому: белый список типов, жёсткие размеры, лимит
// частоты на уровне app.ts и тихий отброс ботов. IP и User-Agent не храним.
const MAX_META_CHARS = 1000
const MAX_PATH_CHARS = 300

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|httpclient/i

const EventSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  visitorId: z.uuid(),
  // Длинный путь не повод отказывать: режем до колонки.
  path: z
    .string()
    .min(1)
    .max(2000)
    .transform((p) => p.slice(0, MAX_PATH_CHARS)),
  meta: z
    .record(z.string(), z.unknown())
    .refine((m) => JSON.stringify(m).length <= MAX_META_CHARS, { message: 'meta слишком большой' })
    .optional(),
})

export function createEventsRouter(): Router {
  const router = Router()

  // POST /api/public/events
  router.post('/', async (req, res, next) => {
    try {
      const event = EventSchema.parse(req.body)
      // Бота не пугаем ошибкой, просто не пишем: его «клики» не нужны в статистике.
      if (BOT_UA.test(req.get('user-agent') ?? '')) {
        res.status(204).end()
        return
      }
      await AppDataSource.query(
        `INSERT INTO analytics_events (type, visitor_id, path, meta) VALUES ($1, $2, $3, $4)`,
        [event.type, event.visitorId, event.path, event.meta ? JSON.stringify(event.meta) : null],
      )
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}
```

В `api/src/app.ts`: добавить импорт рядом с `createMaterialLeadsRouter`:

```ts
import { createEventsRouter } from './routes/public/events.js'
```

и после строки `app.use('/api/public/material-leads', createMaterialLeadsRouter())` добавить:

```ts
// Аналитика витрины: анонимный публичный POST. 300 событий за 10 минут с IP
// хватает живому посетителю (и школе за одним NAT), но не даёт забить таблицу.
app.use(
  '/api/public/events',
  guard('/', rateLimit({ limit: envLimit('EVENTS_RATE_LIMIT', 300), windowMs: 10 * 60 * 1000 })),
)
app.use('/api/public/events', createEventsRouter())
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w api -- public-events`
Expected: PASS (глобальная настройка прогонит миграцию в тестовой базе). Затем `npm run typecheck -w api` — без ошибок.

- [ ] **Step 6: Commit** (только с разрешения владельца)

```bash
git add api/src/migrations/1790810000000-AddAnalyticsEvents.ts api/src/routes/public/events.ts api/src/routes/public-events.test.ts api/src/app.ts
git commit -m "feat(api): таблица analytics_events и публичный приём событий"
```

---

### Task 3: Агрегаты статистики и `GET /api/admin/stats`

**Files:**

- Create: `api/src/lib/analytics/stats.ts`
- Create: `api/src/routes/admin/stats.schemas.ts`
- Create: `api/src/routes/admin/stats.ts`
- Create: `api/src/routes/admin-stats.test.ts`
- Modify: `api/src/app.ts` (импорт и `app.use('/api/admin/stats', adminStatsRouter)` рядом с `/api/admin/orders`)

**Interfaces:**

- Consumes: `StatsResponse`, `MAX_STATS_DAYS` (Task 1); таблица `analytics_events` (Task 2); `requireAdminAuth`, `requireCsrfToken`; `loginAsAdmin`, `authHeaders`, `seedOrder` из `testUtils.ts`.
- Produces: `getStats(from: string, to: string): Promise<StatsResponse>` (`from`/`to` — `YYYY-MM-DD`, оба включительно); `StatsQuerySchema`; `GET /api/admin/stats?from&to` → `{ data: StatsResponse }`.

- [ ] **Step 1: Write the failing test**

`api/src/routes/admin-stats.test.ts`:

```ts
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, seedOrder, type AdminAuth } from './testUtils.js'

// Все метки времени заданы со смещением +03:00: границы дней считаются по Москве.
const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const V3 = '33333333-3333-4333-8333-333333333333'
const V4 = '44444444-4444-4444-8444-444444444444'

async function seedOrderAt(
  overrides: Parameters<typeof seedOrder>[0],
  createdAt: string,
  paidAt: string | null,
  deletedAt: string | null = null,
): Promise<void> {
  const order = await seedOrder(overrides)
  await AppDataSource.query(
    'UPDATE orders SET created_at = $1, paid_at = $2, deleted_at = $3 WHERE id = $4',
    [createdAt, paidAt, deletedAt, order.id],
  )
}

async function seedEvent(type: string, visitorId: string, occurredAt: string): Promise<void> {
  await AppDataSource.query(
    'INSERT INTO analytics_events (type, visitor_id, path, occurred_at) VALUES ($1, $2, $3, $4)',
    [type, visitorId, '/', occurredAt],
  )
}

async function seedCustomer(createdAt: string): Promise<string> {
  const [row] = await AppDataSource.query(
    'INSERT INTO customers (email, created_at) VALUES ($1, $2) RETURNING id',
    [`${randomUUID()}@test.local`, createdAt],
  )
  return row.id as string
}

async function seedSession(customerId: string, createdAt: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO customer_sessions (token_hash, customer_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4)`,
    [
      randomUUID().replaceAll('-', '').repeat(2),
      customerId,
      '2027-01-01T00:00:00+03:00',
      createdAt,
    ],
  )
}

describe('GET /api/admin/stats', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  const get = (query: string) =>
    request(app).get(`/api/admin/stats?${query}`).set(authHeaders(auth))

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
      'TRUNCATE analytics_events, customer_sessions, customers, order_items, orders RESTART IDENTITY CASCADE',
    )
  })

  it('без сессии админа — 401', async () => {
    const res = await request(app).get('/api/admin/stats?from=2026-10-05&to=2026-10-07')
    expect(res.status).toBe(401)
  })

  it('считает итоги и ряд по дням; границы дней — по Москве', async () => {
    // Период 2026-10-05..2026-10-07 по Москве = [04.10 21:00Z, 07.10 21:00Z).
    // A: создан и оплачен 05.10 → заказ и выручка 05.10.
    await seedOrderAt(
      { status: 'paid', totalRub: 1000 },
      '2026-10-05T10:00:00+03:00',
      '2026-10-05T10:05:00+03:00',
    )
    // B: создан за секунду до периода, оплачен ровно в 00:00 06.10 → только выручка 06.10.
    await seedOrderAt(
      { status: 'shipped', totalRub: 2500 },
      '2026-10-04T23:59:59+03:00',
      '2026-10-06T00:00:00+03:00',
    )
    // C: ожидает оплаты → заказ 06.10, выручки нет.
    await seedOrderAt({ status: 'pending', totalRub: 700 }, '2026-10-06T12:00:00+03:00', null)
    // D: отменён, но с paid_at → заказ 07.10 (последняя секунда), в выручку не входит.
    await seedOrderAt(
      { status: 'cancelled', totalRub: 900 },
      '2026-10-07T23:59:59+03:00',
      '2026-10-07T12:00:00+03:00',
    )
    // E: после периода (00:00 08.10) — не считается нигде.
    await seedOrderAt(
      { status: 'paid', totalRub: 5000 },
      '2026-10-08T00:00:00+03:00',
      '2026-10-08T00:00:00+03:00',
    )
    // F: удалён мягко — не считается нигде.
    await seedOrderAt(
      { status: 'paid', totalRub: 3000 },
      '2026-10-05T11:00:00+03:00',
      '2026-10-05T11:05:00+03:00',
      '2026-10-06T09:00:00+03:00',
    )

    await seedEvent('add_to_cart', V1, '2026-10-05T12:00:00+03:00')
    await seedEvent('add_to_cart', V1, '2026-10-06T12:00:00+03:00') // тот же посетитель
    await seedEvent('add_to_cart', V2, '2026-10-07T23:59:59+03:00')
    await seedEvent('open_cart', V1, '2026-10-05T12:01:00+03:00')
    await seedEvent('begin_checkout', V3, '2026-10-04T23:59:59+03:00') // до периода
    await seedEvent('add_to_cart', V4, '2026-10-08T00:00:00+03:00') // после периода

    const c1 = await seedCustomer('2026-10-05T09:00:00+03:00')
    await seedCustomer('2026-10-06T09:00:00+03:00')
    await seedCustomer('2026-10-04T23:59:59+03:00') // до периода
    await seedSession(c1, '2026-10-05T09:00:00+03:00')
    await seedSession(c1, '2026-10-06T09:00:00+03:00')
    await seedSession(c1, '2026-10-07T09:00:00+03:00')
    await seedSession(c1, '2026-10-04T23:59:59+03:00') // до периода

    const res = await get('from=2026-10-05&to=2026-10-07')
    expect(res.status).toBe(200)
    const data = res.body.data as StatsResponse
    expect(data.from).toBe('2026-10-05')
    expect(data.to).toBe('2026-10-07')
    expect(data.totals).toEqual({
      clicks: 4, // три add_to_cart и один open_cart внутри периода
      carts: 2, // V1 и V2, V1 засчитан один раз
      orders: 3, // A, C, D
      revenueRub: 3500, // A 1000 + B 2500
      logins: 3,
      newUsers: 2,
    })
    expect(data.days).toEqual([
      { date: '2026-10-05', orders: 1, revenueRub: 1000 },
      { date: '2026-10-06', orders: 1, revenueRub: 2500 },
      { date: '2026-10-07', orders: 1, revenueRub: 0 },
    ])
  })

  it('пустая база: нули и ряд без дыр', async () => {
    const res = await get('from=2026-10-05&to=2026-10-07')
    expect(res.status).toBe(200)
    expect(res.body.data.totals).toEqual({
      clicks: 0,
      carts: 0,
      orders: 0,
      revenueRub: 0,
      logins: 0,
      newUsers: 0,
    })
    expect(res.body.data.days).toEqual([
      { date: '2026-10-05', orders: 0, revenueRub: 0 },
      { date: '2026-10-06', orders: 0, revenueRub: 0 },
      { date: '2026-10-07', orders: 0, revenueRub: 0 },
    ])
  })

  it('период из одного дня', async () => {
    const res = await get('from=2026-10-05&to=2026-10-05')
    expect(res.status).toBe(200)
    expect(res.body.data.days).toEqual([{ date: '2026-10-05', orders: 0, revenueRub: 0 }])
  })

  it('ровно 366 дней можно, 367 — нет', async () => {
    const ok = await get('from=2025-10-07&to=2026-10-07')
    expect(ok.status).toBe(200)
    expect(ok.body.data.days).toHaveLength(366)

    const tooLong = await get('from=2025-10-06&to=2026-10-07')
    expect(tooLong.status).toBe(400)
  })

  it.each([
    ['формат даты', 'from=foo&to=2026-10-07'],
    ['нет to', 'from=2026-10-05'],
    ['from позже to', 'from=2026-10-08&to=2026-10-07'],
    ['несуществующая дата', 'from=2026-02-31&to=2026-03-05'],
  ])('400: %s', async (_name, query) => {
    const res = await get(query)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w api -- admin-stats`
Expected: FAIL — роут не найден (404 вместо 200/400/401).

- [ ] **Step 3: Write the schema**

`api/src/routes/admin/stats.schemas.ts`:

```ts
import { z } from 'zod'
import { MAX_STATS_DAYS } from '@ximi4ka-shop/shared/types/analytics'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

// Время в UTC-полночь для корректной даты YYYY-MM-DD, иначе null. Проверка
// «туда-обратно» отсекает 2026-02-31, который Date иначе мог бы перекатить в март.
function parseDay(value: string): number | null {
  if (!DAY_RE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

export const StatsQuerySchema = z
  .object({ from: z.string(), to: z.string() })
  .superRefine((q, ctx) => {
    const from = parseDay(q.from)
    const to = parseDay(q.to)
    if (from === null) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from: ожидается дата YYYY-MM-DD' })
    }
    if (to === null) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to: ожидается дата YYYY-MM-DD' })
    }
    if (from === null || to === null) return
    if (from > to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'to раньше from' })
    } else if ((to - from) / MS_PER_DAY + 1 > MAX_STATS_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `Период не больше ${MAX_STATS_DAYS} дней`,
      })
    }
  })
```

- [ ] **Step 4: Write the aggregates**

`api/src/lib/analytics/stats.ts`:

```ts
import type { StatsDay, StatsResponse, StatsTotals } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'

const TZ = 'Europe/Moscow'

// Границы периода по Москве: [00:00 from, 00:00 дня после to). Москва без
// перехода на летнее время, но AT TIME ZONE оставляет решение базе.
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
           SELECT (o.created_at AT TIME ZONE '${TZ}')::date AS day, COUNT(*) AS orders
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
```

- [ ] **Step 5: Write the router and mount it**

`api/src/routes/admin/stats.ts`:

```ts
import { Router } from 'express'
import { getStats } from '../../lib/analytics/stats.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'
import { StatsQuerySchema } from './stats.schemas.js'

export const adminStatsRouter: Router = Router()

adminStatsRouter.use(requireAdminAuth)
adminStatsRouter.use(requireCsrfToken)

// GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — оба дня включительно, по Москве.
adminStatsRouter.get('/', async (req, res, next) => {
  try {
    const { from, to } = StatsQuerySchema.parse(req.query)
    res.json({ data: await getStats(from, to) })
  } catch (err) {
    next(err)
  }
})
```

В `api/src/app.ts` добавить импорт рядом с `adminOrdersRouter`:

```ts
import { adminStatsRouter } from './routes/admin/stats.js'
```

и после `app.use('/api/admin/orders', adminOrdersRouter)`:

```ts
app.use('/api/admin/stats', adminStatsRouter)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w api -- admin-stats`
Expected: PASS. Если упадёт `seedCustomer` или `seedSession` из-за NOT NULL колонки, которой нет в вставке, — добавить недостающее поле в `INSERT` тестового помощника (не менять миграции). Затем `npm run typecheck -w api`.

- [ ] **Step 7: Commit** (только с разрешения владельца)

```bash
git add api/src/lib/analytics/stats.ts api/src/routes/admin/stats.schemas.ts api/src/routes/admin/stats.ts api/src/routes/admin-stats.test.ts api/src/app.ts
git commit -m "feat(api): GET /api/admin/stats — агрегаты за период по Москве"
```

---

### Task 4: Клиентский трекер и подключение к `reachGoal`

**Files:**

- Create: `web/lib/track.ts`
- Create: `web/lib/track.test.ts`
- Modify: `web/lib/metrika.ts` (импорт и одна строка в начале `reachGoal`)
- Modify: `web/lib/metrika.test.ts` (мок трекера и два теста)

**Interfaces:**

- Consumes: `ANALYTICS_EVENT_TYPES`, `AnalyticsEventType` из `@ximi4ka-shop/shared/types/analytics` (Task 1); `POST /api/public/events` (Task 2).
- Produces: `trackEvent(name: string, meta?: Record<string, unknown>): void` — отправляет событие, только если `name` из белого списка; `buildEvent(name, meta?)` — собирает тело запроса или `null`; `resetTrackerForTests(): void`.

- [ ] **Step 1: Write the failing tests**

`web/lib/track.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEvent, resetTrackerForTests, trackEvent } from './track'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

beforeEach(() => {
  window.localStorage.clear()
  resetTrackerForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
})

describe('buildEvent', () => {
  it('отбрасывает цели не из белого списка (purchase)', () => {
    expect(buildEvent('purchase')).toBeNull()
    expect(buildEvent('whatever')).toBeNull()
  })

  it('собирает тело: тип, visitorId, путь, meta', () => {
    const event = buildEvent('add_to_cart', { product_id: 'p1', quantity: 2 })
    expect(event).toMatchObject({
      type: 'add_to_cart',
      path: window.location.pathname,
      meta: { product_id: 'p1', quantity: 2 },
    })
    expect(event?.visitorId).toMatch(UUID_RE)
  })

  it('без meta поле не добавляется', () => {
    expect(buildEvent('open_cart')).not.toHaveProperty('meta')
  })

  it('visitorId стабилен между событиями и лежит в localStorage', () => {
    const a = buildEvent('open_cart')
    const b = buildEvent('open_cart')
    expect(a?.visitorId).toBe(b?.visitorId)
    expect(window.localStorage.getItem('ximi4ka-visitor-id')).toBe(a?.visitorId)
  })

  it('подхватывает сохранённый visitorId после перезагрузки страницы', () => {
    const stored = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
    window.localStorage.setItem('ximi4ka-visitor-id', stored)
    expect(buildEvent('open_cart')?.visitorId).toBe(stored)
  })

  it('мусор в localStorage заменяется новым uuid', () => {
    window.localStorage.setItem('ximi4ka-visitor-id', 'not-a-uuid')
    expect(buildEvent('open_cart')?.visitorId).toMatch(UUID_RE)
  })

  it('недоступный localStorage: id всё равно стабилен в рамках страницы', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const a = buildEvent('open_cart')
    const b = buildEvent('open_cart')
    expect(a?.visitorId).toMatch(UUID_RE)
    expect(a?.visitorId).toBe(b?.visitorId)
  })
})

describe('trackEvent', () => {
  it('шлёт через sendBeacon JSON-Blob на /api/public/events', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('add_to_cart', { quantity: 1 })

    expect(beacon).toHaveBeenCalledTimes(1)
    const [url, body] = beacon.mock.calls[0] as unknown as [string, Blob]
    expect(url).toMatch(/\/api\/public\/events$/)
    expect(body).toBeInstanceOf(Blob)
    expect(body.type).toBe('application/json')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('без sendBeacon падает на fetch с keepalive', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('open_cart')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/public\/events$/)
    expect(init).toMatchObject({ method: 'POST', keepalive: true })
  })

  it('sendBeacon вернул false (очередь полна) — тоже fetch', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: () => false, configurable: true })
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('begin_checkout')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('не-целевое событие ничего не отправляет', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('purchase')

    expect(beacon).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('сетевая ошибка fetch и исключение sendBeacon не пробрасываются', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(() => trackEvent('open_cart')).not.toThrow()
    await Promise.resolve()

    Object.defineProperty(navigator, 'sendBeacon', {
      value: () => {
        throw new Error('boom')
      },
      configurable: true,
    })
    expect(() => trackEvent('open_cart')).not.toThrow()
  })

  it('нет ни sendBeacon, ни fetch — не бросает', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    vi.stubGlobal('fetch', undefined)
    expect(() => trackEvent('open_cart')).not.toThrow()
  })
})
```

Добавить в `web/lib/metrika.test.ts` в самый верх (после существующих `import`, до `type W`) мок трекера, и обновить импорт — `vi.mock` поднимается наверх файла автоматически:

```ts
import { trackEvent } from './track'

vi.mock('./track', () => ({ trackEvent: vi.fn() }))
```

а в `describe('reachGoal', …)` добавить два теста:

```ts
it('дублирует цель в собственную аналитику даже без счётчика Метрики', () => {
  reachGoal(METRIKA_GOALS.addToCart, { product_id: 'p1', quantity: 2 })
  expect(trackEvent).toHaveBeenCalledWith('add_to_cart', { product_id: 'p1', quantity: 2 })
})

it('со счётчиком по-прежнему зовёт ym и трекер', () => {
  const ym = vi.fn()
  w.ym = ym
  setMetrikaCounterId('12345')
  reachGoal('open_cart')
  expect(ym).toHaveBeenCalledWith('12345', 'reachGoal', 'open_cart')
  expect(trackEvent).toHaveBeenCalledWith('open_cart', undefined)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- lib/track lib/metrika`
Expected: FAIL — `Cannot find module './track'`.

- [ ] **Step 3: Write minimal implementation**

`web/lib/track.ts`:

```ts
import {
  ANALYTICS_EVENT_TYPES,
  type AnalyticsEventType,
} from '@ximi4ka-shop/shared/types/analytics'

// Собственная аналитика витрины для дашборда админки: те же цели, что уходят в
// Метрику (см. reachGoal в metrika.ts), плюс случайный visitorId из localStorage.
// Без IP и персональных данных. Любой сбой молча глотается: трекер не должен
// мешать каталогу и оформлению заказа.
const VISITOR_KEY = 'ximi4ka-visitor-id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENTS_URL = `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
)}/api/public/events`

// Если localStorage недоступен, id живёт до перезагрузки страницы: иначе каждое
// событие считалось бы новой корзиной.
let memoryVisitorId: string | null = null

export interface TrackedEvent {
  type: AnalyticsEventType
  visitorId: string
  path: string
  meta?: Record<string, unknown>
}

export function resetTrackerForTests(): void {
  memoryVisitorId = null
}

function isTrackable(name: string): name is AnalyticsEventType {
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(name)
}

function newId(): string | null {
  try {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : null
  } catch {
    return null
  }
}

function visitorId(): string | null {
  if (memoryVisitorId) return memoryVisitorId
  try {
    const stored = window.localStorage.getItem(VISITOR_KEY)
    if (stored && UUID_RE.test(stored)) {
      memoryVisitorId = stored
      return stored
    }
  } catch {
    // хранилище недоступно — идём дальше с id в памяти
  }
  const id = newId()
  if (!id) return null
  memoryVisitorId = id
  try {
    window.localStorage.setItem(VISITOR_KEY, id)
  } catch {
    // см. выше
  }
  return id
}

export function buildEvent(name: string, meta?: Record<string, unknown>): TrackedEvent | null {
  if (!isTrackable(name)) return null
  const id = visitorId()
  if (!id) return null
  return {
    type: name,
    visitorId: id,
    path: window.location.pathname,
    ...(meta !== undefined ? { meta } : {}),
  }
}

export function trackEvent(name: string, meta?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const event = buildEvent(name, meta)
    if (!event) return
    const body = JSON.stringify(event)
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(EVENTS_URL, new Blob([body], { type: 'application/json' }))
    ) {
      return
    }
    void fetch(EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    // Аналитика не должна ломать магазин.
  }
}
```

В `web/lib/metrika.ts` добавить в начало файла импорт (после комментария-шапки, до `export const METRIKA_GOALS`):

```ts
import { trackEvent } from './track'
```

и первой строкой тела `reachGoal` (до `const w = metrikaWindow()`):

```ts
// Собственная аналитика для дашборда админки живёт независимо от счётчика
// Метрики: события пишутся, даже если счётчик не задан.
trackEvent(goal, params)
```

Обновить JSDoc над `reachGoal` одной строкой: «Заодно шлёт цель в собственную аналитику (`trackEvent`); не из белого списка — игнорируется».

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- lib/track lib/metrika`
Expected: PASS, включая все существующие тесты `metrika.test.ts`. Затем `npm run typecheck -w web`.

- [ ] **Step 5: Commit** (только с разрешения владельца)

```bash
git add web/lib/track.ts web/lib/track.test.ts web/lib/metrika.ts web/lib/metrika.test.ts
git commit -m "feat(web): трекер собственной аналитики поверх reachGoal"
```

---

### Task 5: Период и геометрия графика (чистые функции)

**Files:**

- Create: `web/app/admin/(authed)/statsPeriod.ts`
- Create: `web/app/admin/(authed)/statsPeriod.test.ts`
- Create: `web/app/admin/(authed)/chartScale.ts`
- Create: `web/app/admin/(authed)/chartScale.test.ts`

**Interfaces:**

- Consumes: `MAX_STATS_DAYS` из `@ximi4ka-shop/shared/types/analytics`, тип `StatsDay` из `@ximi4ka-shop/shared`.
- Produces:
  - `type PeriodPreset = 'week' | 'month' | 'custom'`, `interface StatsPeriod { preset: PeriodPreset; from: string; to: string }`.
  - `todayMsk(now: Date): string`, `addDays(day: string, delta: number): string`, `resolvePeriod(params: { preset?: string; from?: string; to?: string }, now: Date): StatsPeriod`.
  - `interface Bar { x: number; y: number; width: number; height: number; date: string; revenueRub: number; orders: number }`, `barLayout(days: StatsDay[], width: number, height: number): Bar[]`.
- Решение по умолчанию (спек не уточняет): «Неделя» — последние 7 дней, «Месяц» — последние 30 дней, оба включая сегодня по Москве.

- [ ] **Step 1: Write the failing tests**

`web/app/admin/(authed)/statsPeriod.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { addDays, resolvePeriod, todayMsk } from './statsPeriod'

const NOW = new Date('2026-10-11T09:00:00Z') // 12:00 по Москве

describe('todayMsk', () => {
  it('день определяется по Москве, а не по UTC', () => {
    expect(todayMsk(new Date('2026-10-10T21:30:00Z'))).toBe('2026-10-11')
    expect(todayMsk(new Date('2026-10-10T20:59:59Z'))).toBe('2026-10-10')
  })
})

describe('addDays', () => {
  it('переходит через границу месяца и года', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('resolvePeriod', () => {
  it('по умолчанию — неделя: 7 дней, включая сегодня', () => {
    expect(resolvePeriod({}, NOW)).toEqual({
      preset: 'week',
      from: '2026-10-05',
      to: '2026-10-11',
    })
  })

  it('месяц — 30 дней, включая сегодня', () => {
    expect(resolvePeriod({ preset: 'month' }, NOW)).toEqual({
      preset: 'month',
      from: '2026-09-12',
      to: '2026-10-11',
    })
  })

  it('свой период принимается как есть', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-15' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-15',
    })
  })

  it('один день — допустимый период', () => {
    expect(resolvePeriod({ preset: 'custom', from: '2026-09-01', to: '2026-09-01' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-01',
    })
  })

  it.each([
    ['from позже to', { preset: 'custom', from: '2026-09-15', to: '2026-09-01' }],
    ['мусор вместо даты', { preset: 'custom', from: 'foo', to: '2026-09-01' }],
    ['несуществующая дата', { preset: 'custom', from: '2026-02-31', to: '2026-03-05' }],
    ['нет to', { preset: 'custom', from: '2026-09-01' }],
    ['длиннее 366 дней', { preset: 'custom', from: '2025-10-06', to: '2026-10-07' }],
    ['неизвестный пресет', { preset: 'year' }],
  ])('откатывается на неделю: %s', (_name, params) => {
    expect(resolvePeriod(params, NOW)).toEqual({
      preset: 'week',
      from: '2026-10-05',
      to: '2026-10-11',
    })
  })

  it('ровно 366 дней допустимо', () => {
    expect(
      resolvePeriod({ preset: 'custom', from: '2025-10-07', to: '2026-10-07' }, NOW).preset,
    ).toBe('custom')
  })
})
```

`web/app/admin/(authed)/chartScale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { barLayout } from './chartScale'

const day = (date: string, revenueRub: number, orders = 0) => ({ date, revenueRub, orders })

describe('barLayout', () => {
  it('высота пропорциональна выручке, максимум занимает всю высоту', () => {
    const bars = barLayout(
      [day('2026-10-05', 0), day('2026-10-06', 500), day('2026-10-07', 1000)],
      300,
      100,
    )
    expect(bars.map((b) => b.height)).toEqual([0, 50, 100])
    expect(bars.map((b) => b.y)).toEqual([100, 50, 0])
  })

  it('столбцы идут слева направо и помещаются в ширину', () => {
    const bars = barLayout([day('a', 1), day('b', 1), day('c', 1)], 300, 100)
    expect(bars[0].x).toBeLessThan(bars[1].x)
    expect(bars[1].x).toBeLessThan(bars[2].x)
    const last = bars[2]
    expect(last.x + last.width).toBeLessThanOrEqual(300)
    expect(bars[0].x).toBeGreaterThanOrEqual(0)
  })

  it('данные дня переносятся в столбец для подсказки', () => {
    const [bar] = barLayout([day('2026-10-05', 1200, 3)], 100, 50)
    expect(bar).toMatchObject({ date: '2026-10-05', revenueRub: 1200, orders: 3 })
  })

  it('нулевой максимум: все высоты 0, без NaN', () => {
    const bars = barLayout([day('a', 0), day('b', 0)], 100, 50)
    expect(bars.every((b) => b.height === 0 && Number.isFinite(b.y))).toBe(true)
  })

  it('маленькая ненулевая выручка остаётся видимой (минимум 2)', () => {
    const bars = barLayout([day('a', 1), day('b', 1_000_000)], 100, 100)
    expect(bars[0].height).toBeGreaterThanOrEqual(2)
  })

  it('пустой ряд — пустой результат', () => {
    expect(barLayout([], 100, 50)).toEqual([])
  })

  it('один день занимает почти всю ширину', () => {
    const [bar] = barLayout([day('a', 10)], 100, 50)
    expect(bar.width).toBeGreaterThan(80)
    expect(bar.x + bar.width).toBeLessThanOrEqual(100)
  })

  it('366 дней: ширина столбца не меньше 1 и никто не вылезает за край', () => {
    const days = Array.from({ length: 366 }, (_, i) => day(String(i), i + 1))
    const bars = barLayout(days, 640, 100)
    expect(bars).toHaveLength(366)
    expect(bars.every((b) => b.width >= 1 && b.x >= 0 && b.x + b.width <= 640.001)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- statsPeriod chartScale`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Write minimal implementation**

`web/app/admin/(authed)/statsPeriod.ts`:

```ts
import { MAX_STATS_DAYS } from '@ximi4ka-shop/shared/types/analytics'

// Период дашборда из searchParams. Неделя и месяц — скользящие окна из 7 и
// 30 дней, включая сегодня по Москве (как и границы дней в api). Любой
// некорректный ввод откатывается на неделю, а не на ошибку страницы.
export type PeriodPreset = 'week' | 'month' | 'custom'

export interface StatsPeriod {
  preset: PeriodPreset
  from: string
  to: string
}

const PRESET_DAYS = { week: 7, month: 30 } as const
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function todayMsk(now: Date): string {
  // en-CA даёт ровно YYYY-MM-DD.
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

function parseDay(value: string | undefined): number | null {
  if (!value || !DAY_RE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

export function resolvePeriod(
  params: { preset?: string; from?: string; to?: string },
  now: Date,
): StatsPeriod {
  if (params.preset === 'custom') {
    const from = parseDay(params.from)
    const to = parseDay(params.to)
    if (
      from !== null &&
      to !== null &&
      from <= to &&
      (to - from) / MS_PER_DAY + 1 <= MAX_STATS_DAYS
    ) {
      return { preset: 'custom', from: params.from as string, to: params.to as string }
    }
  }
  const preset = params.preset === 'month' ? 'month' : 'week'
  const today = todayMsk(now)
  return { preset, from: addDays(today, -(PRESET_DAYS[preset] - 1)), to: today }
}
```

`web/app/admin/(authed)/chartScale.ts`:

```ts
import type { StatsDay } from '@ximi4ka-shop/shared'

// Геометрия столбчатого графика выручки: чистая функция, отдельно от SVG,
// чтобы масштаб (нулевой максимум, 366 дней, крошечные значения) тестировался.
export interface Bar {
  x: number
  y: number
  width: number
  height: number
  date: string
  revenueRub: number
  orders: number
}

const MIN_VISIBLE_HEIGHT = 2

export function barLayout(days: StatsDay[], width: number, height: number): Bar[] {
  if (days.length === 0) return []
  const max = Math.max(...days.map((d) => d.revenueRub))
  const slot = width / days.length
  // Зазор не больше четверти слота: на длинных периодах столбцы тоньше, но не исчезают.
  const gap = Math.min(4, slot * 0.25)
  const barWidth = Math.max(1, slot - gap)
  return days.map((d, i) => {
    const raw = max > 0 ? (d.revenueRub / max) * height : 0
    const h = d.revenueRub > 0 ? Math.max(MIN_VISIBLE_HEIGHT, raw) : 0
    return {
      x: i * slot + (slot - barWidth) / 2,
      y: height - h,
      width: barWidth,
      height: h,
      date: d.date,
      revenueRub: d.revenueRub,
      orders: d.orders,
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- statsPeriod chartScale`
Expected: PASS. Если `todayMsk` в Node без полного ICU вернёт не `YYYY-MM-DD` — это сигнал заменить `Intl.DateTimeFormat` на ручную сборку из `formatToParts`; проверить вывод `todayMsk(NOW)` отдельно.

- [ ] **Step 5: Commit** (только с разрешения владельца)

```bash
git add "web/app/admin/(authed)/statsPeriod.ts" "web/app/admin/(authed)/statsPeriod.test.ts" "web/app/admin/(authed)/chartScale.ts" "web/app/admin/(authed)/chartScale.test.ts"
git commit -m "feat(web): разбор периода и геометрия графика для дашборда"
```

---

### Task 6: Страница дашборда

**Files:**

- Create: `web/app/admin/(authed)/RevenueChart.tsx`
- Create: `web/app/admin/(authed)/StatsDashboard.tsx`
- Create: `web/app/admin/(authed)/StatsDashboard.test.tsx`
- Modify: `web/app/admin/(authed)/page.tsx` (заменить заглушку целиком)
- Возможно изменить: существующий тест страницы `/admin`, если он проверяет заглушку (см. Step 1).

**Interfaces:**

- Consumes: `StatsResponse` (Task 1); `resolvePeriod`, `StatsPeriod` (Task 5); `barLayout`, `Bar` (Task 5); `formatRub` из `./orders/orderUi`; `ADMIN_API_URL_SERVER` из `@/lib/adminAuth`; `GET /api/admin/stats` (Task 3).
- Produces: `StatsDashboard({ stats, period })` — синхронный компонент; `RevenueChart({ days })`; страница `AdminDashboardPage` (async server component).

- [ ] **Step 1: Найти тесты, привязанные к заглушке**

Run: `grep -rln "Добро пожаловать" web --include='*.test.tsx' --include='*.test.ts' | grep -v node_modules; ls "web/app/admin/(authed)"`
Expected: список тестов, которые проверяют текст заглушки. Если такой тест есть — заменить проверку на «страница — async server component» (`expect(AdminDashboardPage.constructor.name).toBe('AsyncFunction')`, как в `orders/page.test.tsx`).

- [ ] **Step 2: Write the failing test**

`web/app/admin/(authed)/StatsDashboard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import { StatsDashboard } from './StatsDashboard'
import AdminDashboardPage from './page'

const period = { preset: 'week' as const, from: '2026-10-05', to: '2026-10-07' }

const stats: StatsResponse = {
  from: '2026-10-05',
  to: '2026-10-07',
  totals: { clicks: 42, carts: 7, orders: 5, revenueRub: 12500, logins: 9, newUsers: 3 },
  days: [
    { date: '2026-10-05', orders: 1, revenueRub: 1000 },
    { date: '2026-10-06', orders: 3, revenueRub: 9000 },
    { date: '2026-10-07', orders: 1, revenueRub: 2500 },
  ],
}

const empty: StatsResponse = {
  from: '2026-10-05',
  to: '2026-10-07',
  totals: { clicks: 0, carts: 0, orders: 0, revenueRub: 0, logins: 0, newUsers: 0 },
  days: stats.days.map((d) => ({ ...d, orders: 0, revenueRub: 0 })),
}

describe('StatsDashboard', () => {
  it('показывает все шесть метрик и сумму в рублях', () => {
    render(<StatsDashboard stats={stats} period={period} />)
    for (const label of [
      'Сумма заказов',
      'Заказы',
      'Корзины',
      'Клики',
      'Входы в ЛК',
      'Новые пользователи',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(/12\s?500\s?₽/)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('переключатель периода: неделя, месяц и свой период; активный помечен', () => {
    render(<StatsDashboard stats={stats} period={period} />)
    const week = screen.getByRole('link', { name: 'Неделя' })
    expect(week).toHaveAttribute('href', '/admin?preset=week')
    expect(week).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Месяц' })).toHaveAttribute(
      'href',
      '/admin?preset=month',
    )
    expect(screen.getByLabelText('С')).toHaveValue('2026-10-05')
    expect(screen.getByLabelText('По')).toHaveValue('2026-10-07')
  })

  it('график: столбец на каждый день с подсказкой', () => {
    const { container } = render(<StatsDashboard stats={stats} period={period} />)
    expect(container.querySelectorAll('svg rect')).toHaveLength(3)
    expect(container.querySelector('svg title')?.textContent).toMatch(/05\.10/)
  })

  it('пустой период: нули, текст про отсутствие данных, график не ломается', () => {
    const { container } = render(<StatsDashboard stats={empty} period={period} />)
    expect(screen.getByText(/данных за этот период нет/i)).toBeInTheDocument()
    expect(container.querySelectorAll('svg rect')).toHaveLength(3)
  })

  it('оговорки про приближённые метрики видны', () => {
    render(<StatsDashboard stats={stats} period={period} />)
    expect(screen.getByText(/без учёта входа по действующей сессии/i)).toBeInTheDocument()
  })
})

describe('AdminDashboardPage', () => {
  it('async server component', () => {
    expect(AdminDashboardPage.constructor.name).toBe('AsyncFunction')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w web -- StatsDashboard`
Expected: FAIL — `Cannot find module './StatsDashboard'`.

- [ ] **Step 4: Write the chart**

`web/app/admin/(authed)/RevenueChart.tsx`:

```tsx
import type { StatsDay } from '@ximi4ka-shop/shared'
import { barLayout } from './chartScale'
import { formatRub } from './orders/orderUi'

// Столбцы выручки по дням на inline-SVG: без библиотеки и без клиентского JS.
// Подсказка — нативный <title> внутри столбца.
const WIDTH = 640
const CHART_HEIGHT = 140
const HEIGHT = 164

export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}.${month}`
}

export function RevenueChart({ days }: { days: StatsDay[] }) {
  const bars = barLayout(days, WIDTH, CHART_HEIGHT)
  const first = days[0]
  const last = days[days.length - 1]
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Выручка по дням"
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
        <rect
          key={b.date}
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
          rx={Math.min(3, b.width / 2)}
          className="fill-brand"
        >
          <title>{`${shortDate(b.date)}: ${formatRub(b.revenueRub)}, заказов: ${b.orders}`}</title>
        </rect>
      ))}
      {first && (
        <text x="0" y={HEIGHT - 4} className="fill-brand-text-secondary" fontSize="11">
          {shortDate(first.date)}
        </text>
      )}
      {last && last !== first && (
        <text
          x={WIDTH}
          y={HEIGHT - 4}
          textAnchor="end"
          className="fill-brand-text-secondary"
          fontSize="11"
        >
          {shortDate(last.date)}
        </text>
      )}
    </svg>
  )
}
```

- [ ] **Step 5: Write the dashboard component**

`web/app/admin/(authed)/StatsDashboard.tsx`:

```tsx
import Link from 'next/link'
import type { StatsResponse, StatsTotals } from '@ximi4ka-shop/shared'
import type { PeriodPreset, StatsPeriod } from './statsPeriod'
import { RevenueChart } from './RevenueChart'
import { formatRub } from './orders/orderUi'

interface CardDef {
  key: keyof StatsTotals
  label: string
  hint: string
  format?: (value: number) => string
}

const CARDS: CardDef[] = [
  {
    key: 'revenueRub',
    label: 'Сумма заказов',
    hint: 'оплаченные и отправленные, по дате оплаты',
    format: formatRub,
  },
  { key: 'orders', label: 'Заказы', hint: 'созданные за период, любой статус' },
  { key: 'carts', label: 'Корзины', hint: 'уникальные посетители, добавившие товар' },
  {
    key: 'clicks',
    label: 'Клики',
    hint: 'в корзину, открытие корзины, оформление, заявки на материалы',
  },
  {
    key: 'logins',
    label: 'Входы в ЛК',
    hint: 'новые сессии, без учёта входа по действующей сессии',
  },
  { key: 'newUsers', label: 'Новые пользователи', hint: 'зарегистрированные аккаунты кабинета' },
]

const PRESETS: Array<{ value: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
]

const CHIP_ACTIVE = 'px-3 py-1.5 rounded-full bg-brand text-white text-sm font-semibold'
const CHIP_IDLE =
  'px-3 py-1.5 rounded-full bg-white border border-brand-border text-sm text-brand-text-secondary hover:bg-brand-bg-soft'

function isEmpty(stats: StatsResponse): boolean {
  const t = stats.totals
  return (
    t.clicks + t.carts + t.orders + t.revenueRub + t.logins + t.newUsers === 0 &&
    stats.days.every((d) => d.orders === 0 && d.revenueRub === 0)
  )
}

export function StatsDashboard({ stats, period }: { stats: StatsResponse; period: StatsPeriod }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-text">Статистика</h1>

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => {
          const active = period.preset === p.value
          return (
            <Link
              key={p.value}
              href={`/admin?preset=${p.value}`}
              aria-current={active ? 'page' : undefined}
              className={active ? CHIP_ACTIVE : CHIP_IDLE}
            >
              {p.label}
            </Link>
          )
        })}
        <form method="get" action="/admin" className="flex flex-wrap items-end gap-2 ml-2">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <div key={c.key} className="bg-white rounded-2xl border border-brand-border p-5">
            <div className="text-sm text-brand-text-secondary">{c.label}</div>
            <div className="mt-1 text-3xl font-bold text-brand-text">
              {(c.format ?? String)(stats.totals[c.key])}
            </div>
            <div className="mt-1 text-xs text-brand-text-secondary">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-brand-border p-5">
        <div className="mb-3 text-sm font-medium text-brand-text">Выручка по дням</div>
        <RevenueChart days={stats.days} />
        {isEmpty(stats) && (
          <p className="mt-3 text-sm text-brand-text-secondary">Данных за этот период нет.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Replace the page stub**

`web/app/admin/(authed)/page.tsx` (весь файл):

```tsx
import { cookies } from 'next/headers'
import type { StatsResponse } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { StatsDashboard } from './StatsDashboard'
import { resolvePeriod } from './statsPeriod'

// Главная админки — статистика. Тот же паттерн, что у списка заказов: cookie
// пробрасываем вручную (api на другом origin), cache: 'no-store' для свежих данных.
async function fetchStats(from: string, to: string): Promise<StatsResponse> {
  const store = await cookies()
  const params = new URLSearchParams({ from, to })
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/stats?${params.toString()}`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin stats failed: ${res.status}`)
  }
  return ((await res.json()) as { data: StatsResponse }).data
}

interface SearchParams {
  preset?: string
  from?: string
  to?: string
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const period = resolvePeriod(params, new Date())

  let stats: StatsResponse
  try {
    stats = await fetchStats(period.from, period.to)
  } catch {
    return (
      <div className="bg-white rounded-2xl border border-brand-border p-6 max-w-xl">
        <h1 className="text-xl font-bold text-brand-text mb-2">Статистика</h1>
        <p className="text-brand-text-secondary">
          Не удалось загрузить статистику. Обновите страницу или попробуйте позже.
        </p>
      </div>
    )
  }

  return <StatsDashboard stats={stats} period={period} />
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w web -- StatsDashboard statsPeriod chartScale && npm run typecheck -w web && npm run lint -w web`
Expected: PASS без ошибок типов и линтера. Если тест из Step 1 проверял заглушку — он обновлён и проходит.

- [ ] **Step 8: Commit** (только с разрешения владельца)

```bash
git add "web/app/admin/(authed)/RevenueChart.tsx" "web/app/admin/(authed)/StatsDashboard.tsx" "web/app/admin/(authed)/StatsDashboard.test.tsx" "web/app/admin/(authed)/page.tsx"
git commit -m "feat(web): дашборд статистики на главной админки"
```

---

### Task 7: Сквозная проверка, безопасность, форматирование

**Files:** правки только по найденным замечаниям.

- [ ] **Step 1: Полный прогон проверок из корня**

Run: `npm run lint && npm run typecheck && npm test && npx prettier --check .`
Expected: всё зелёное. При падении `prettier --check` — `npx prettier --write <файл>` и повторить.

- [ ] **Step 2: Проверка на заглушки и обходы**

Run: `git diff main --stat; git diff main | grep -nE "TODO|FIXME|\.skip\(|\.only\(|it\.todo" || echo "чисто"`
Expected: `чисто` (никаких TODO, `.skip`, `.only`, заглушек).

- [ ] **Step 3: Проверка дашборда в живом приложении (локальная база, не прод)**

Поднять api и web через `preview_start` (конфигурации из `.claude/launch.json`, если нет — создать по образцу из описания инструмента), использовать локальную dev-базу. Войти в админку; если локального админа нет — завести скриптом из `api/package.json` (`grep -n admin api/package.json`). Отправить несколько событий:

```bash
curl -i -X POST http://localhost:3001/api/public/events \
  -H 'Content-Type: application/json' \
  -d '{"type":"add_to_cart","visitorId":"3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b","path":"/product/test"}'
```

Expected: `204`. Открыть `/admin`: шесть карточек, график, переключатель Неделя/Месяц/«Свой период», клик «Месяц» меняет ссылку на `?preset=month`, ввод своего диапазона работает, неверный диапазон (`from` позже `to`) возвращает на неделю. Проверить на ширине 375px (`resize_window`): без горизонтального скролла страницы. Проверить консоль браузера и `preview_logs` — без ошибок. На витрине добавить товар в корзину и убедиться, что в консоли нет ошибок трекера, а в `analytics_events` появилась строка (`psql` к dev-базе: `SELECT type, path FROM analytics_events ORDER BY occurred_at DESC LIMIT 3;`). Приложить скриншот.

- [ ] **Step 4: Ревью безопасности**

Вызвать `/security-review` на диффе ветки. Особое внимание: публичный `POST /api/public/events` (белый список, размеры, лимит, нет IP/UA в БД), параметризованный SQL во всех запросах (никакой подстановки `from`/`to` в строку), доступ к `/api/admin/stats` только по сессии админа.

- [ ] **Step 5: Независимое ревью кода**

Вызвать `/code-review` на диффе (отдельным проходом, не самим автором). Исправить подтверждённые замечания, повторить Step 1.

- [ ] **Step 6: Отчёт владельцу**

В отчёте: что сделано, результаты Step 1 (с выводом команд), скриншот дашборда, оговорки по метрикам (логины и новые пользователи — приближения; корзины и клики копятся с момента выкатки), открытый вопрос по приватности из спека. Напомнить: мёрж в `main` = автодеплой в прод, миграция `1790810000000` выполнится при старте; делать это только по команде владельца.
