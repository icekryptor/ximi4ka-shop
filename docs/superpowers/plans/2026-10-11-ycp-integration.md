# YCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Yandex calls our shop under `/api/v1` (Yandex Commerce Protocol 0.0.14), so a buyer can press «Купить в 1 клик» in Alice AI or Yandex Search. The order then enters our system (admin, Google Sheet, Telegram, CDEK queue) and is fulfilled exactly like a site order.

**Architecture:** A new Express router `api/src/routes/ycp/` is mounted at `/api/v1` with its own Bearer-token middleware and its own error handler that returns `{"error": "..."}`. Domain logic lives in `api/src/lib/ycp/`: pricing, order creation, locked status changes, delivery options and the nationwide CDEK pickup-point cache. It reuses `wholesaleLineTotals`, `packCart`, `quoteDelivery`, `nextOrderNumber`, `enqueueOrderEvent`, `enqueueCdekShipment` and the status-event write that `saveOrderWithStatusEvent` already uses. The YML feed gets `is_checkout_enabled`, `weight` and `dimensions`. The admin gets a per-product flag and a source badge on orders.

**Tech Stack:** Node ≥22.18, Express 4, TypeORM 0.3 + Postgres, zod 4, vitest 2 + supertest (api), Next.js 16 (non-standard, see `web/AGENTS.md`) + React 19 + Testing Library (web). New api devDependencies (Task 11): `ajv@^8.17.1`, `ajv-formats@^3.0.1`.

**Spec:** `docs/superpowers/specs/2026-10-11-ycp-integration-design.md` (protocol reference: `docs/ycp/ycp-api-spec-notes.md`; vendored schema: `docs/ycp/ycp-openapi-0.0.14.json`)

## Global Constraints

- Every `/api/v1` method answers within **5 seconds**. The only network calls on the request path are CDEK calls in `POST /checkout/delivery/options`, and they share one deadline `YCP_CDEK_TIMEOUT_MS` (default **3500 ms**, accepted range 1–4000).
- Every non-2xx body under `/api/v1` is exactly `{"error": "<string>"}`, plus `actual_inventory` / `checkout_canceled` on `/checkout` 409. It is never our public `{error:{code,message,details}}` shape.
- Auth: the header `Authorization: Bearer <token>` is compared with env `YCP_API_TOKEN` in constant time (sha256 of both sides + `crypto.timingSafeEqual`). If the env token is missing, empty or shorter than **32** chars, every request gets `401 {"error":"Unauthorized"}`.
- The YCP product id is `Product.id` (uuid) = the feed `<offer id>`, so `offers_id_from_merchant_center` true and false are handled identically.
- Stock is a constant: `stockStatus === 'in_stock'` → `available_quantity: 99`, anything else → `0`. There is no reservation.
- Payment is online only. `payment_method: 'on_delivery'` never makes an order `paid`; it gets `409` and a Telegram alert to the manager.
- YCP orders get no gift: `loadGift` is never called, and order total = Σ(final_price × quantity) + `Math.round(delivery.price)`.
- `products.ycp_enabled` defaults to `false`. Only flagged, published, non-deleted products appear in `basket/check`, and only they get `<param name="is_checkout_enabled">true</param>`.
- No merge to `main`, no deploy, no prod server or prod DB access without an explicit owner command in chat. Merge to `main` is a prod deploy. Open the PR only when the owner asks.
- Code comments are in Russian, matching the surrounding code. Error strings returned to Yandex are in English, like the Yandex examples (`"Unauthorized"`, `"Invalid request format: ..."`).
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- api tests run on a disposable DB: `TEST_DATABASE_URL` (default `postgres://localhost:5432/ximi4ka_shop_test`, created and migrated by `api/src/test/globalSetup.ts`). Never point it at `DATABASE_URL`.
- Before the PR: `npm run lint`, `npm run typecheck`, `npm test -w api`, `npm test -w web`, `npm test -w shared`, and `npx prettier --check .` at the repo root.
- Next.js here is not the one in training data. Before touching `web/app/**`, read the relevant guide in `web/node_modules/next/dist/docs/`.

## Review Focus

1. **Odd item ids and quantities in `basket/check`, `delivery/options` and `/checkout`.** A non-uuid id string must not reach Postgres, because the uuid cast fails, the API returns 500, and Yandex pauses the button with `client_5xx`. Unknown uuids are silently omitted. Duplicate ids are merged before pricing. `quantity` 0, negative or >10000 gets 400. Tests: Task 4 Step 5 (`basket.test.ts` cases «не-uuid…», «повторяющиеся id…», «некорректное количество…»).
2. **`/checkout/placed` arriving before `/checkout`, twice in a row, or twice concurrently.** It returns 404 when there is no session yet. On repeats, exactly one `status:paid` event pair is written, one CDEK shipment, and one history entry; the order row is locked with `FOR UPDATE`. Tests: Task 9 Step 1 (`placed.test.ts` «до /checkout», «повтор…», «два одновременных…»).
3. **Price tampering or stale prices in `/checkout` items, including quantity above the constant stock.** The answer is 409 with `actual_inventory` built from the server-side price and no order row. Tests: Task 7 Step 1 (`checkout.test.ts` «подменённая цена…», «больше 99…», «нет в наличии…», «неизвестный товар…»).
4. **CDEK slow or down, and a courier address without `locality`.** `delivery/options` answers with the fallback tariff from `SHIPPING_RULES` well under 5 s. A courier target without `locality` or `address` gets 400 instead of a CDEK call with half an address. Tests: Task 6 Step 3 (`delivery-options.test.ts` «СДЭК молчит…», «курьер без locality…»).
5. **`YCP_API_TOKEN` absent, empty or short in env.** Nothing authorizes: not `Bearer `, not `Bearer undefined`, not the "right" token. Tests: Task 2 Step 1 (`auth.test.ts` «токен не задан…», «короткий токен…»).

---

## Plan-level decisions (the spec left these open)

- **Per-unit price rounding.** Yandex charges `final_price × quantity`. Our site line total (`wholesaleLineTotals`) is not always divisible by quantity: percent tiers give `round(list × (100 − p) / 100)` (5 × 119 ₽ at −15 % = 506 ₽), and batch prices give 5 test tubes for 99 ₽. The rule: `final_price = Math.floor(lineTotalRub / quantity)`. The buyer never pays more in Yandex than on the site, and the shop loses less than 1 ₽ per unit. The YCP order stores `unitPriceRub = final_price` and `lineTotalRub = final_price × quantity`, i.e. what Yandex actually collected. `/checkout` compares `regular_price` and `final_price` as exact integers with **no tolerance**, because Yandex echoes what `basket/check` returned.
- **VAT.** `vat` is not sent; Yandex defaults it to 22. The tax regime is an owner and Yandex question (RUNBOOK checklist).
- **Customer linking** uses e-mail only (`normalizeEmail` → `Customer.email`), exactly as the public checkout. Phone is not used, because the public checkout does not link by phone and phones are unverified.
- **Pickup-point cache.** It is held in process memory and in a one-row jsonb table `ycp_pickup_points_snapshot`, created in the same `AddYcpFields` migration, so a restart serves the last good list immediately. The background job loads the snapshot at startup and then refreshes from CDEK `GET /v2/deliverypoints?country_code=RU&type=PVZ&is_handout=true&size=1000&page=N` every 12 h. An empty CDEK answer never replaces a good snapshot. The table was chosen over a file because `uploads/` is the only persistent volume and it is served publicly at `/uploads`. Size: a few thousand points at ~450 B of JSON each is a few MB. A 1000-point page is an `Array.slice`, so it takes milliseconds.
- **Pickup-point `time_zone`.** CDEK does not return it in the point list. We approximate it with `ceil(longitude / 15)`, clamped to 2..12 and with negative longitudes wrapped. This is exact for Moscow, Kaliningrad, Samara, Yekaterinburg and Krasnoyarsk, and off by 1 h in a few Siberian and Far-East regions. Working hours stay local.
- **Delivery option id.** The format is `pvz-<tariff>-<cityCode|0>` or `courier-<tariff>-<cityCode|0>`. `/checkout` parses it back to fill `deliveryAddress.cityCode`. Dates: Moscow today + 1 handover day + CDEK `period_min`/`period_max`, falling back to 3..7 days, with `time_zone: 3`.
- **Courier city.** It is resolved with `suggestCities(locality)[0].code`, which is cached and shares the deadline. When there is no match, CDEK is quoted by full address only, as the site already allows.
- **Manager alerts.** Two new `OrderEventKey`s, `ycp:on_delivery` and `ycp:cancel_after_ship`, go to the Telegram channel only and are sent as a plain message, not the order card. The existing outbox unique index makes them idempotent.
- **Status writes.** `saveOrderWithStatusEvent` is split into `writeOrderStatusEvent(em, order, prev)`. The wrapper stays for existing callers. The YCP flows call the inner function inside a transaction that locked the row (`pessimistic_write`).
- **Migration is idempotent** (`IF NOT EXISTS`), because `deploy/deploy.sh` switches containers **before** running migrations (see `deploy/README.md`, AddBlogPostAuthor section). The RUNBOOK tells the owner to pre-create the columns with the same SQL before merging.
- **Reconcile.** It explicitly skips `payment_provider = 'ycp'`.

## File Structure

| Path                                                                | Responsibility                                                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `api/src/migrations/1790800000000-AddYcpFields.ts`                  | new columns, partial unique index, pickup-point snapshot table (Task 1)                                                    |
| `api/src/entities/Product.ts`, `Order.ts`                           | `ycpEnabled`; `source`, `externalSessionId`, `externalOrderId` (Task 1)                                                    |
| `shared/src/types/order.ts`, `product.ts`, `notifications.ts`       | `OrderSource`, `PaymentProvider 'ycp'`, history actor `'ycp'`, `ProductShippingUnit`, alert event keys (Tasks 1, 4, 8, 12) |
| `api/src/lib/ycp/config.ts`                                         | env readers: token, warehouse, site origin, CDEK deadline, stock constant (Tasks 2, 3, 4, 6)                               |
| `api/src/lib/ycp/pricing.ts`                                        | `loadYcpLines`, per-unit price rule, pack lines, goods total (Task 4)                                                      |
| `api/src/lib/ycp/basket.ts`                                         | pure `ycpBasketItem` response mapper (Task 4)                                                                              |
| `api/src/lib/shipping/unit.ts`                                      | `unitShipping` — one unit in its packaging (Task 4; feed reuses it in Task 12)                                             |
| `api/src/lib/ycp/pickupPoints.ts`                                   | nationwide CDEK PVZ cache: fetch, map, snapshot, job (Task 5)                                                              |
| `api/src/lib/ycp/deliveryOptions.ts`                                | deadline wrapper, option id, dates, `ycpDeliveryOption` (Task 6)                                                           |
| `api/src/lib/ycp/orders.ts`                                         | `inventoryConflict`, `createYcpOrder`, locked `markYcpOrderPlaced`, `cancelYcpSession`, `cancelYcpOrder` (Tasks 7, 9, 10)  |
| `api/src/lib/pgErrors.ts`                                           | `isUniqueViolation` (moved out of `routes/checkout.ts`, Task 7)                                                            |
| `api/src/routes/ycp/index.ts`                                       | `createYcpRouter()` — auth + sub-routers + JSON 404 (Task 2, extended in 3–10)                                             |
| `api/src/routes/ycp/auth.ts`, `errors.ts`, `schemas.ts`             | Bearer middleware; `YcpError` + `ycpErrorHandler`; zod request schemas                                                     |
| `api/src/routes/ycp/warehouses.ts`                                  | `GET /warehouses` (Task 3)                                                                                                 |
| `api/src/routes/ycp/basket.ts`                                      | `POST /checkout/basket/check` (Task 4)                                                                                     |
| `api/src/routes/ycp/delivery.ts`                                    | `GET /checkout/delivery/pickup_points` (Task 5), `POST /checkout/delivery/options` (Task 6)                                |
| `api/src/routes/ycp/checkout.ts`                                    | `POST /checkout` (7), `POST /checkout/placed` (9), `POST /checkout/cancel` (10)                                            |
| `api/src/routes/ycp/orders.ts`                                      | `POST /order/cancel` (Task 10)                                                                                             |
| `api/src/routes/ycp/testHelpers.ts`                                 | shared test data for the YCP route tests (not a `*.test.ts`)                                                               |
| `api/src/routes/ycp/contract.test.ts`                               | every response validated against the vendored OpenAPI (Task 11)                                                            |
| `api/src/lib/notifications/{outbox,format,worker}.ts`               | manager alerts + `writeOrderStatusEvent` (Tasks 8, 9)                                                                      |
| `api/src/lib/payments/reconcile.ts`                                 | skip YCP orders (Task 9)                                                                                                   |
| `api/src/routes/public/products.ts`                                 | `include=shipping` → `shippingUnit` (Task 12)                                                                              |
| `web/lib/ymlFeed.ts`, `web/app/yml.xml/route.ts`, `web/lib/api.ts`  | feed `is_checkout_enabled`, `weight`, `dimensions` (Task 12)                                                               |
| `web/components/admin/ProductForm.tsx`, `web/lib/adminApi.ts`       | admin checkbox (Task 13)                                                                                                   |
| `web/app/admin/(authed)/orders/{orderUi.ts,page.tsx}`               | provider/actor labels (Task 1), source badge (Task 13)                                                                     |
| `web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx`         | labels for the alert event keys (Task 8)                                                                                   |
| `api/.env.example`, `deploy/app.env.example`, `docs/ycp/RUNBOOK.md` | env docs and rollout/rollback (Task 14)                                                                                    |

---

### Task 1: Schema — migration, entities, shared types

**Files:**

- Create: `api/src/migrations/1790800000000-AddYcpFields.ts`
- Modify: `api/src/entities/Product.ts:85-87` (after `minBox`)
- Modify: `api/src/entities/Order.ts:12-17` (imports), `:113` (after `idempotencyKey`)
- Modify: `shared/src/types/order.ts:7-10, 56-62, 64-95`; `shared/src/types/product.ts:31-37`; `shared/src/index.ts:1-13`
- Modify: `web/app/admin/(authed)/orders/orderUi.ts:27-40`
- Test: `api/src/entities/ycpFields.test.ts`, `web/app/admin/(authed)/orders/page.test.tsx`

**Interfaces:**

- Consumes: `seedOrder(overrides)` from `api/src/routes/testUtils.ts`.
- Produces: `Product.ycpEnabled: boolean`; `Order.source: OrderSource`; `Order.externalSessionId: string | null`; `Order.externalOrderId: string | null`; shared `type OrderSource = 'site' | 'ycp'`; `PaymentProvider = 'manual' | 'tbank' | 'ycp'`; `OrderStatusHistoryEntry['by']` includes `'ycp'`; `OrderDto.source?: OrderSource`; `Product.ycpEnabled?: boolean` (shared); table `ycp_pickup_points_snapshot(id smallint pk = 1, entries jsonb, built_at timestamptz)`.

- [ ] **Step 1: Write the failing api test**

Create `api/src/entities/ycpFields.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from './Product.js'
import { Order } from './Order.js'
import { seedOrder } from '../routes/testUtils.js'

describe('поля YCP в схеме (миграция AddYcpFields)', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, ycp_pickup_points_snapshot RESTART IDENTITY CASCADE',
    )
  })

  it('товар по умолчанию без кнопки Яндекса', async () => {
    const repo = AppDataSource.getRepository(Product)
    const saved = await repo.save(
      repo.create({
        slug: 'kit-ycp',
        name: 'Набор',
        priceRub: 100,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )
    expect((await repo.findOneByOrFail({ id: saved.id })).ycpEnabled).toBe(false)
  })

  it('заказ по умолчанию с сайта, без внешних идентификаторов', async () => {
    const order = await seedOrder()
    const fresh = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(fresh).toMatchObject({ source: 'site', externalSessionId: null, externalOrderId: null })
  })

  it('session_id Яндекса уникален, а пустые значения друг другу не мешают', async () => {
    await seedOrder({ source: 'ycp', externalSessionId: 'sess-1' })
    await expect(seedOrder({ source: 'ycp', externalSessionId: 'sess-1' })).rejects.toMatchObject({
      code: '23505',
    })
    await seedOrder()
    await seedOrder()
    expect(await AppDataSource.getRepository(Order).count()).toBe(3)
  })

  it('снимок пунктов выдачи — ровно одна строка с id = 1', async () => {
    await AppDataSource.query(
      `INSERT INTO ycp_pickup_points_snapshot (id, entries, built_at) VALUES (1, '[]', now())`,
    )
    await expect(
      AppDataSource.query(
        `INSERT INTO ycp_pickup_points_snapshot (id, entries, built_at) VALUES (2, '[]', now())`,
      ),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w api -- src/entities/ycpFields.test.ts`
Expected: FAIL. `beforeEach` throws `relation "ycp_pickup_points_snapshot" does not exist`, so all 4 tests fail.

- [ ] **Step 3: Write the migration**

Create `api/src/migrations/1790800000000-AddYcpFields.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Yandex Commerce Protocol (docs/superpowers/specs/2026-10-11-ycp-integration-design.md):
// флаг кнопки «Купить в 1 клик» у товара, источник заказа и идентификаторы
// сессии и заказа на стороне Яндекса, снимок пунктов выдачи СДЭК для
// GET /api/v1/checkout/delivery/pickup_points (переживает перезапуск api).
//
// IF NOT EXISTS — потому что deploy.sh сначала переключает контейнеры и только
// потом гоняет миграции: колонки заранее добавляет владелец тем же SQL
// (docs/ycp/RUNBOOK.md), а миграция при деплое проходит как no-op.
export class AddYcpFields1790800000000 implements MigrationInterface {
  name = 'AddYcpFields1790800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ycp_enabled" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" character varying(16) NOT NULL DEFAULT 'site'`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "external_session_id" character varying(64)`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "external_order_id" character varying(64)`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orders_external_session_id" ON "orders" ("external_session_id") WHERE "external_session_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_external_order_id" ON "orders" ("external_order_id") WHERE "external_order_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ycp_pickup_points_snapshot" (
        "id" smallint NOT NULL,
        "entries" jsonb NOT NULL,
        "built_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_ycp_pickup_points_snapshot" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ycp_pickup_points_snapshot_single" CHECK ("id" = 1)
      )`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ycp_pickup_points_snapshot"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_external_order_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_external_session_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "external_order_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "external_session_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "source"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "ycp_enabled"`)
  }
}
```

- [ ] **Step 4: Shared types**

In `shared/src/types/order.ts`, replace the `PaymentProvider` block (lines 7-10) with:

```ts
// Payment provider actually wired to the order. `manual` — no online payment:
// the order stays pending and a manager contacts the customer. `tbank` —
// Т-Касса (Т-Банк, ex-Tinkoff Kassa) internet acquiring. `ycp` — оплату принял
// Яндекс (Яндекс Пэй, Сплит) в «Купить в 1 клик»; в Т-Кассу такие заказы не идут.
export type PaymentProvider = 'manual' | 'tbank' | 'ycp'

// Откуда пришёл заказ: витрина или «Купить в 1 клик» в Яндексе (YCP).
export type OrderSource = 'site' | 'ycp'
```

In the same file, change `OrderStatusHistoryEntry.by` to:

```ts
by: 'tbank' | 'admin' | 'reconcile' | 'ycp'
```

In `OrderDto`, after `deliveryMethod: string`, add:

```ts
  /** Откуда заказ. API отдаёт всегда; в типе необязательно, чтобы старые фикстуры не ломались. */
  source?: OrderSource
```

In `shared/src/types/product.ts`, after `minBox?: ShippingBox | null` (line 36), add:

```ts
  /** Кнопка «Купить в 1 клик» в Яндексе (YCP). API отдаёт всегда. */
  ycpEnabled?: boolean
```

In `shared/src/index.ts`, add `OrderSource,` after `OrderStatusHistoryEntry,` in the first `export type { … } from './types/order.js'` list.

- [ ] **Step 5: Entities**

In `api/src/entities/Product.ts`, after the `minBox` column (line 86), add:

```ts
  // Кнопка «Купить в 1 клик» в Яндексе (YCP): товар отдаётся в
  // /api/v1/checkout/basket/check и в фиде получает is_checkout_enabled=true.
  @Column({ type: 'boolean', name: 'ycp_enabled', default: false })
  ycpEnabled!: boolean
```

In `api/src/entities/Order.ts`, extend the shared type import to:

```ts
import type {
  OrderSource,
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentProvider,
  DeliveryAddress,
} from '@ximi4ka-shop/shared'
```

and after the `idempotencyKey` column (line 113), add:

```ts
  // Откуда заказ: site — витрина, ycp — «Купить в 1 клик» в Яндексе.
  @Column({ type: 'varchar', length: 16, default: 'site' })
  source!: OrderSource

  // session_id сессии оформления YCP; уникален среди ненулевых (миграция AddYcpFields).
  @Column({ type: 'varchar', length: 64, name: 'external_session_id', nullable: true })
  externalSessionId!: string | null

  // order_id заказа в Яндексе из /checkout/placed; по нему приходит /order/cancel.
  @Column({ type: 'varchar', length: 64, name: 'external_order_id', nullable: true })
  externalOrderId!: string | null
```

- [ ] **Step 6: Run the api test to see it pass**

Run: `npm test -w api -- src/entities/ycpFields.test.ts`
Expected: PASS (4 tests). globalSetup applies `AddYcpFields1790800000000` to the test DB.

- [ ] **Step 7: Write the failing web test for the new labels**

In `web/app/admin/(authed)/orders/page.test.tsx`, change the import from `'./orderUi'` to:

```ts
import {
  HISTORY_ACTOR_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_PROVIDER_LABELS,
  formatRub,
  isOrderStatus,
} from './orderUi'
```

and add inside `describe('order UI helpers', …)`:

```ts
it('подписывает провайдера и автора смены статуса из Яндекса', () => {
  expect(PAYMENT_PROVIDER_LABELS.ycp).toBe('Яндекс')
  expect(HISTORY_ACTOR_LABELS.ycp).toBe('Яндекс')
})
```

Run: `npm test -w web -- "app/admin/(authed)/orders/page.test.tsx"`
Expected: FAIL with `expected undefined to be 'Яндекс'`.

- [ ] **Step 8: Labels**

In `web/app/admin/(authed)/orders/orderUi.ts`, set:

```ts
export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  manual: 'Вручную',
  tbank: 'Т-Касса',
  ycp: 'Яндекс',
}
```

and add `ycp: 'Яндекс',` as the last entry of `HISTORY_ACTOR_LABELS`.

Run: `npm test -w web -- "app/admin/(authed)/orders/page.test.tsx"` then `npm run typecheck`
Expected: PASS, and typecheck exits 0 in all three workspaces.

- [ ] **Step 9: Commit**

```bash
git add api/src/migrations/1790800000000-AddYcpFields.ts api/src/entities/Product.ts api/src/entities/Order.ts api/src/entities/ycpFields.test.ts shared/src/types/order.ts shared/src/types/product.ts shared/src/index.ts "web/app/admin/(authed)/orders/orderUi.ts" "web/app/admin/(authed)/orders/page.test.tsx"
git commit -m "feat(ycp): поля YCP в схеме — флаг товара, источник и внешние id заказа, снимок ПВЗ" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Router skeleton — token, error format, mount at /api/v1

**Files:**

- Create: `api/src/lib/ycp/config.ts`
- Create: `api/src/routes/ycp/auth.ts`, `api/src/routes/ycp/errors.ts`, `api/src/routes/ycp/index.ts`, `api/src/routes/ycp/testHelpers.ts`
- Modify: `api/src/app.ts:23-30` (imports), `:97` (after `adminSettingsRouter`)
- Test: `api/src/routes/ycp/auth.test.ts`

**Interfaces:**

- Consumes: `createApp()`, `AppDataSource`, `Product`, `ProductCategory`.
- Produces:
  - `YCP_TOKEN_MIN_LENGTH = 32`; `ycpTokenFromEnv(env?: NodeJS.ProcessEnv): string | null`
  - `isValidYcpToken(header: string | undefined, expected: string | null): boolean`; `requireYcpToken(req, res, next): void`
  - `class YcpError extends Error { status: number; body?: Record<string, unknown> }`; `ycpBadRequest(msg)`, `ycpNotFound(msg)`, `ycpConflict(msg, body?)` → `YcpError`; `ycpErrorHandler(err, req, res, next): void`
  - `createYcpRouter(): Router`
  - test helpers: `YCP_TEST_TOKEN`, `YCP_TEST_ENV`, `ycpAuth`, `applyYcpTestEnv(stub)`, `seedYcpProduct(overrides?)`, `seedCategory(slug, products)`, `ycpCheckoutBody(items, overrides?)`

- [ ] **Step 1: Write the failing test**

Create `api/src/routes/ycp/auth.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { isValidYcpToken } from './auth.js'
import { YCP_TEST_TOKEN, applyYcpTestEnv, ycpAuth } from './testHelpers.js'

describe('isValidYcpToken', () => {
  it('принимает только точный токен в схеме Bearer', () => {
    expect(isValidYcpToken(`Bearer ${YCP_TEST_TOKEN}`, YCP_TEST_TOKEN)).toBe(true)
    expect(isValidYcpToken(`bearer   ${YCP_TEST_TOKEN}`, YCP_TEST_TOKEN)).toBe(true)
    expect(isValidYcpToken(`Bearer ${YCP_TEST_TOKEN}x`, YCP_TEST_TOKEN)).toBe(false)
    expect(isValidYcpToken(YCP_TEST_TOKEN, YCP_TEST_TOKEN)).toBe(false)
    expect(isValidYcpToken(`Basic ${YCP_TEST_TOKEN}`, YCP_TEST_TOKEN)).toBe(false)
    expect(isValidYcpToken(undefined, YCP_TEST_TOKEN)).toBe(false)
  })

  it('без ожидаемого токена не пускает никого', () => {
    expect(isValidYcpToken('Bearer ', null)).toBe(false)
    expect(isValidYcpToken('Bearer null', null)).toBe(false)
    expect(isValidYcpToken('Bearer undefined', null)).toBe(false)
  })
})

describe('/api/v1 — доступ и формат ошибок', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('401 без заголовка Authorization', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app).get('/api/v1/warehouses')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('401 с чужим токеном', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${'z'.repeat(40)}`)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('токен не задан в окружении — 401 на любой заголовок', async () => {
    vi.stubEnv('YCP_API_TOKEN', '')
    for (const header of ['Bearer ', 'Bearer undefined', `Bearer ${YCP_TEST_TOKEN}`]) {
      const res = await request(app).get('/api/v1/warehouses').set('Authorization', header)
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Unauthorized' })
    }
  })

  it('короткий токен в окружении считается незаданным', async () => {
    vi.stubEnv('YCP_API_TOKEN', 'short-token')
    const res = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', 'Bearer short-token')
    expect(res.status).toBe(401)
  })

  it('неизвестный путь с верным токеном — 404 в формате Яндекса', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app).get('/api/v1/nope').set(ycpAuth)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('битый JSON — 400 {"error": строка}', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .set('Content-Type', 'application/json')
      .send('{"session_id":')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid request format: malformed JSON' })
  })

  it('соседние маршруты не задеты: публичный чекаут отвечает в своём формате', async () => {
    const res = await request(app).post('/api/checkout').send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w api -- src/routes/ycp/auth.test.ts`
Expected: FAIL with `Failed to load url ./auth.js` (the module does not exist).

- [ ] **Step 3: Config and test helpers**

Create `api/src/lib/ycp/config.ts`:

```ts
// Настройки интеграции с Yandex Commerce Protocol (спека
// docs/superpowers/specs/2026-10-11-ycp-integration-design.md). Читаются из
// окружения на каждый вызов: тест или перезапуск с новым app.env меняют их
// без пересборки.

// Токен короче 32 символов считается незаданным — как секреты SSO в app.env.
export const YCP_TOKEN_MIN_LENGTH = 32

export function ycpTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.YCP_API_TOKEN?.trim() ?? ''
  return token.length >= YCP_TOKEN_MIN_LENGTH ? token : null
}
```

Create `api/src/routes/ycp/testHelpers.ts`:

```ts
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'

// Общие данные тестов YCP. Не *.test.ts: файл импортируют тесты, сам он тестов
// не содержит (как routes/testUtils.ts). vitest сюда не импортируем — подмену
// окружения тест передаёт сам: applyYcpTestEnv((k, v) => vi.stubEnv(k, v)).

export const YCP_TEST_TOKEN = 'ycp-test-token-0123456789abcdef0123456789abcdef'

export const YCP_TEST_ENV: Readonly<Record<string, string>> = {
  YCP_API_TOKEN: YCP_TEST_TOKEN,
  YCP_WAREHOUSE_ID: 'msk-1',
  YCP_WAREHOUSE_TITLE: 'Склад Химички',
  YCP_WAREHOUSE_ADDRESS: 'Москва, ул. Примерная, 1',
  YCP_WAREHOUSE_PHONE: '+7 (495) 000-00-00',
  WEB_ORIGIN: 'https://new.ximi4ka.ru',
  CDEK_FROM_CITY_CODE: '44',
  CDEK_TARIFF_PVZ: '136',
  CDEK_TARIFF_COURIER: '137',
}

export const ycpAuth: Record<string, string> = { Authorization: `Bearer ${YCP_TEST_TOKEN}` }

export function applyYcpTestEnv(stub: (name: string, value: string) => unknown): void {
  for (const [name, value] of Object.entries(YCP_TEST_ENV)) stub(name, value)
}

// Товар, доступный для кнопки: опубликован, в наличии, флаг ycpEnabled.
// Вес 800 г, без своих коробок — одна штука едет в малой коробке (830 г, 10×10×4 см).
export async function seedYcpProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug: `ycp-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Набор юного химика',
      sku: 'XIM-001',
      priceRub: 1500,
      stockStatus: 'in_stock',
      isPublished: true,
      ycpEnabled: true,
      weightG: 800,
      longDescriptionBlocks: [],
      translations: {},
      ...overrides,
    }),
  )
}

export async function seedCategory(slug: string, products: Product[]): Promise<ProductCategory> {
  const repo = AppDataSource.getRepository(ProductCategory)
  return repo.save(repo.create({ slug, name: slug, translations: {}, products }))
}

export interface YcpTestItem {
  id: string
  quantity: number
  regular_price: number
  final_price: number
}

// Тело POST /api/v1/checkout как в примере Яндекса (ПВЗ). overrides —
// поля верхнего уровня (session_id, delivery, customer…).
export function ycpCheckoutBody(
  items: YcpTestItem[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    session_id: 'sess-0001',
    warehouse_id: 'msk-1',
    items,
    customer: { full_name: 'Иван Иванов', phone: '+79991234567', email: 'ivan@example.com' },
    delivery: {
      delivery_method: 'pickup_point',
      service_type: 'merchant_ship',
      price: 350,
      address: { pickup_point_id: 'MSK1', locality: 'Москва', address: 'ул. Тестовая, 1' },
      delivery_date_interval: {
        start_interval: { date: '2026-10-14' },
        end_interval: { date: '2026-10-16' },
        time_zone: 3,
      },
      ycp_delivery_option_id: 'pvz-136-44',
    },
    ...overrides,
  }
}
```

- [ ] **Step 4: Auth, errors, router**

Create `api/src/routes/ycp/auth.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { ycpTokenFromEnv } from '../../lib/ycp/config.js'

// sha256 выравнивает длины: timingSafeEqual требует буферы одной длины, а
// отдельное сравнение длин выдало бы длину токена.
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function isValidYcpToken(header: string | undefined, expected: string | null): boolean {
  if (!expected || !header) return false
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) return false
  return timingSafeEqual(digest(match[1]), digest(expected))
}

// Яндекс шлёт «Authorization: Bearer <токен>» на каждый вызов (спека YCP,
// «Доступ»). Токен не задан или короток — не пускаем никого.
export function requireYcpToken(req: Request, res: Response, next: NextFunction): void {
  if (isValidYcpToken(req.header('Authorization'), ycpTokenFromEnv())) {
    next()
    return
  }
  res.status(401).json({ error: 'Unauthorized' })
}
```

Create `api/src/routes/ycp/errors.ts`:

```ts
import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

// Ошибки YCP — в формате Яндекса {"error": "<строка>"} (спека, «Формат
// ответов»), а не {error:{code,message}} нашего API. body — дополнительные
// поля ответа 409 на /checkout (actual_inventory, checkout_canceled).
export class YcpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'YcpError'
  }
}

export function ycpBadRequest(message: string): YcpError {
  return new YcpError(400, message)
}

export function ycpNotFound(message: string): YcpError {
  return new YcpError(404, message)
}

export function ycpConflict(message: string, body?: Record<string, unknown>): YcpError {
  return new YcpError(409, message, body)
}

function zodMessage(err: ZodError): string {
  const issue = err.issues[0]
  const where = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : 'body'
  return `Invalid request format: ${where}: ${issue?.message ?? 'invalid value'}`
}

// Подключён в app.ts на /api/v1 после роутера и до общего errorHandler:
// так он ловит и ошибки роутера, и битый JSON из express.json().
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ycpErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof YcpError) {
    res.status(err.status).json({ error: err.message, ...err.body })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: zodMessage(err) })
    return
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({ error: 'Invalid request format: malformed JSON' })
    return
  }
  console.error('ycp:', err)
  res.status(500).json({ error: 'Failed to process request' })
}
```

Create `api/src/routes/ycp/index.ts`:

```ts
import { Router } from 'express'
import { requireYcpToken } from './auth.js'

// Методы, которые Яндекс вызывает у магазина (docs/ycp/ycp-openapi-0.0.14.json,
// servers[0].url = api/v1). Токен проверяется до любого маршрута, поэтому и на
// неизвестный путь без токена ответ — 401.
export function createYcpRouter(): Router {
  const router = Router()
  router.use(requireYcpToken)
  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  return router
}
```

- [ ] **Step 5: Mount in app.ts**

In `api/src/app.ts`, add after `import { cdekLocationsRouter } …` (line 29):

```ts
import { createYcpRouter } from './routes/ycp/index.js'
import { ycpErrorHandler } from './routes/ycp/errors.js'
```

After `app.use('/api/admin/settings', adminSettingsRouter)` (line 97), add:

```ts
// Yandex Commerce Protocol: Яндекс вызывает методы магазина под /api/v1
// (servers[0].url спецификации). Префикс свободен — других /api/v1 нет. Свой
// обработчик ошибок — формат Яндекса {"error": "..."}; стоит до общего, чтобы
// перехватить и битый JSON из express.json().
app.use('/api/v1', createYcpRouter())
app.use('/api/v1', ycpErrorHandler)
```

- [ ] **Step 6: Run the test to see it pass**

Run: `npm test -w api -- src/routes/ycp/auth.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/ycp/config.ts api/src/routes/ycp/ api/src/app.ts
git commit -m "feat(ycp): роутер /api/v1 — Bearer-токен YCP_API_TOKEN и ошибки в формате Яндекса" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: GET /warehouses

**Files:**

- Modify: `api/src/lib/ycp/config.ts` (append)
- Create: `api/src/routes/ycp/schemas.ts`, `api/src/routes/ycp/warehouses.ts`
- Modify: `api/src/routes/ycp/index.ts`
- Test: `api/src/routes/ycp/warehouses.test.ts`

**Interfaces:**

- Consumes: `YcpError` (Task 2), `YCP_TEST_ENV`, `applyYcpTestEnv`, `ycpAuth` (Task 2).
- Produces: `interface YcpWarehouse { id: string; title: string; address: string; phone: string }`; `ycpWarehouseFromEnv(env?): YcpWarehouse | null`; `PageQuerySchema` (zod: `limit` 0..10000 default 1000, `offset` ≥0 default 0); `ycpWarehousesRouter: Router`.

- [ ] **Step 1: Write the failing test**

Create `api/src/routes/ycp/warehouses.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, ycpAuth } from './testHelpers.js'

const WAREHOUSE = {
  id: 'msk-1',
  title: 'Склад Химички',
  address: 'Москва, ул. Примерная, 1',
  phone: '+7 (495) 000-00-00',
  self_pickup_options: { enabled: false },
  ycp_delivery_options: { enabled: false },
}

describe('GET /api/v1/warehouses', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(() => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('отдаёт единственный склад из окружения', async () => {
    const res = await request(app).get('/api/v1/warehouses?limit=1000&offset=0').set(ycpAuth)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ warehouses: [WAREHOUSE], total_count: 1 })
  })

  it('без limit и offset — первая страница', async () => {
    const res = await request(app).get('/api/v1/warehouses').set(ycpAuth)
    expect(res.body).toEqual({ warehouses: [WAREHOUSE], total_count: 1 })
  })

  it('offset за концом списка — пустая страница, total_count прежний', async () => {
    const res = await request(app).get('/api/v1/warehouses?limit=10&offset=1').set(ycpAuth)
    expect(res.body).toEqual({ warehouses: [], total_count: 1 })
  })

  it('нечисловой limit — 400', async () => {
    const res = await request(app).get('/api/v1/warehouses?limit=abc&offset=0').set(ycpAuth)
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })

  it('склад не настроен — 500 в формате Яндекса', async () => {
    vi.stubEnv('YCP_WAREHOUSE_ADDRESS', '')
    const res = await request(app).get('/api/v1/warehouses').set(ycpAuth)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Warehouse is not configured' })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w api -- src/routes/ycp/warehouses.test.ts`
Expected: FAIL. The first test gets `expected 404 to be 200`, because the route does not exist yet.

- [ ] **Step 3: Implement**

Append to `api/src/lib/ycp/config.ts`:

```ts
export interface YcpWarehouse {
  id: string
  title: string
  address: string
  phone: string
}

// Склад один — магазин отгружает из Москвы. Пустое любое поле — склада нет:
// методы, которым он нужен, отвечают 500 (Яндекс повторит позже).
export function ycpWarehouseFromEnv(env: NodeJS.ProcessEnv = process.env): YcpWarehouse | null {
  const id = env.YCP_WAREHOUSE_ID?.trim()
  const title = env.YCP_WAREHOUSE_TITLE?.trim()
  const address = env.YCP_WAREHOUSE_ADDRESS?.trim()
  const phone = env.YCP_WAREHOUSE_PHONE?.trim()
  if (!id || !title || !address || !phone) return null
  return { id, title, address, phone }
}
```

Create `api/src/routes/ycp/schemas.ts`:

```ts
import { z } from 'zod'

// Входные данные методов YCP (docs/ycp/ycp-openapi-0.0.14.json). Поля, которые
// спецификация называет обязательными, но в своих же примерах опускает, здесь
// необязательны: отказ на них выключил бы кнопку.

// limit/offset обязательны по спецификации; без них отдаём первую страницу.
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).max(10_000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})
```

Create `api/src/routes/ycp/warehouses.ts`:

```ts
import { Router } from 'express'
import { ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import { YcpError } from './errors.js'
import { PageQuerySchema } from './schemas.js'

export const ycpWarehousesRouter: Router = Router()

// Кнопка «Обновить склады через YCP» в кабинете. Самовывоза нет, доставку
// считаем сами (merchant_ship) — доставка силами YCP со склада выключена.
ycpWarehousesRouter.get('/', (req, res, next) => {
  try {
    const { limit, offset } = PageQuerySchema.parse(req.query)
    const warehouse = ycpWarehouseFromEnv()
    if (!warehouse) throw new YcpError(500, 'Warehouse is not configured')
    const all = [
      {
        ...warehouse,
        self_pickup_options: { enabled: false },
        ycp_delivery_options: { enabled: false },
      },
    ]
    res.json({ warehouses: all.slice(offset, offset + limit), total_count: all.length })
  } catch (err) {
    next(err)
  }
})
```

Replace `api/src/routes/ycp/index.ts` with:

```ts
import { Router } from 'express'
import { requireYcpToken } from './auth.js'
import { ycpWarehousesRouter } from './warehouses.js'

// Методы, которые Яндекс вызывает у магазина (docs/ycp/ycp-openapi-0.0.14.json,
// servers[0].url = api/v1). Токен проверяется до любого маршрута, поэтому и на
// неизвестный путь без токена ответ — 401.
export function createYcpRouter(): Router {
  const router = Router()
  router.use(requireYcpToken)
  router.use('/warehouses', ycpWarehousesRouter)
  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  return router
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npm test -w api -- src/routes/ycp/warehouses.test.ts src/routes/ycp/auth.test.ts`
Expected: PASS (5 + 9 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/ycp/config.ts api/src/routes/ycp/
git commit -m "feat(ycp): GET /api/v1/warehouses — склад из окружения" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pricing and availability + POST /checkout/basket/check

**Files:**

- Modify: `shared/src/types/product.ts` (append type), `shared/src/index.ts`
- Create: `api/src/lib/shipping/unit.ts`, test `api/src/lib/shipping/unit.test.ts`
- Modify: `api/src/lib/ycp/config.ts` (append)
- Create: `api/src/lib/ycp/pricing.ts`, `api/src/lib/ycp/basket.ts`, test `api/src/lib/ycp/basket.test.ts`
- Modify: `api/src/routes/ycp/schemas.ts` (append), `api/src/routes/ycp/index.ts`
- Create: `api/src/routes/ycp/basket.ts`, test `api/src/routes/ycp/basket.test.ts`

**Interfaces:**

- Consumes: `packCart`, `PackLine` (`lib/shipping/pack.ts`); `wholesaleLineTotals` (`lib/pricing/wholesale.ts`); `ycpWarehouseFromEnv`, `YcpError`, `ycpNotFound`, `seedYcpProduct`, `seedCategory`.
- Produces:
  - shared `interface ProductShippingUnit { weightG: number; lengthCm: number; widthCm: number; heightCm: number }`
  - `unitShipping(p: { id: string; weightG?: number | null; shipBoxes?: ShippingBox[] | null; looseUnits?: number | null; minBox?: ShippingBox | null }): ProductShippingUnit`
  - `YCP_IN_STOCK_QUANTITY = 99`; `ycpSiteOrigin(env?): string`
  - `interface YcpLine { product: Product; quantity: number; regularPriceRub: number; finalPriceRub: number; availableQuantity: number; shipping: ProductShippingUnit }`
  - `normalizeYcpId(id: string): string`; `mergeYcpItems(items): Map<string, number>`; `ycpUnitPrice(lineTotalRub, quantity): number`; `loadYcpLines(items: readonly { id: string; quantity: number }[]): Promise<Map<string, YcpLine>>` (keys = normalized ids, request order); `ycpPackLines(lines: Iterable<YcpLine>): PackLine[]`; `ycpGoodsTotal(lines: Iterable<YcpLine>): number`
  - `interface YcpBasketItem`; `ycpBasketItem(line: YcpLine, warehouseId: string, origin: string): YcpBasketItem`
  - `ItemRefSchema`, `BasketCheckSchema`; `ycpBasketRouter: Router`

- [ ] **Step 1: Write the failing unit tests**

Create `api/src/lib/shipping/unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { unitShipping } from './unit.js'

describe('unitShipping — одна штука в упаковке', () => {
  it('мелочь — в малой коробке, вес с тарой', () => {
    expect(
      unitShipping({ id: 'p', weightG: 100, shipBoxes: [], looseUnits: 1, minBox: null }),
    ).toEqual({ weightG: 130, lengthCm: 10, widthCm: 10, heightCm: 4 })
  })

  it('набор в своей коробке — её размеры и вес из каталога', () => {
    expect(
      unitShipping({ id: 'k', weightG: 1200, shipBoxes: ['large'], looseUnits: 1, minBox: null }),
    ).toEqual({ weightG: 1200, lengthCm: 40, widthCm: 32, heightCm: 8 })
  })

  it('комбо из двух коробок — стопкой: высота и вес складываются', () => {
    expect(
      unitShipping({
        id: 'c',
        weightG: 2000,
        shipBoxes: ['medium', 'medium'],
        looseUnits: 1,
        minBox: null,
      }),
    ).toEqual({ weightG: 2000, lengthCm: 17, widthCm: 15, heightCm: 24 })
  })

  it('без веса — вес по умолчанию; минимальная коробка учитывается', () => {
    expect(
      unitShipping({ id: 'm', weightG: null, shipBoxes: [], looseUnits: 1, minBox: 'medium' }),
    ).toEqual({ weightG: 220, lengthCm: 17, widthCm: 15, heightCm: 12 })
  })
})
```

Create `api/src/lib/ycp/basket.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Product } from '../../entities/Product.js'
import { ycpBasketItem } from './basket.js'
import { ycpUnitPrice, type YcpLine } from './pricing.js'

function line(product: Partial<Product>): YcpLine {
  return {
    product: {
      id: 'p-1',
      slug: 'nabor',
      name: 'Набор',
      canonicalUrl: null,
      images: [],
      ...product,
    } as Product,
    quantity: 2,
    regularPriceRub: 1500,
    finalPriceRub: 1400,
    availableQuantity: 99,
    shipping: { weightG: 830, lengthCm: 10, widthCm: 10, heightCm: 4 },
  }
}

describe('ycpUnitPrice', () => {
  it('округляет цену за штуку вниз', () => {
    expect(ycpUnitPrice(506, 5)).toBe(101)
    expect(ycpUnitPrice(99, 5)).toBe(19)
    expect(ycpUnitPrice(14000, 5)).toBe(2800)
  })
})

describe('ycpBasketItem', () => {
  it('собирает товар в формате Яндекса: мм и граммы, без вариантов', () => {
    const item = ycpBasketItem(
      line({
        images: [
          { url: '/uploads/b.webp', sortOrder: 1 },
          { url: '/uploads/a b.webp', sortOrder: 0 },
        ] as Product['images'],
      }),
      'msk-1',
      'https://new.ximi4ka.ru',
    )
    expect(item).toEqual({
      id: 'p-1',
      name: 'Набор',
      regular_price: 1500,
      final_price: 1400,
      img: 'https://new.ximi4ka.ru/uploads/a%20b.webp',
      url: 'https://new.ximi4ka.ru/product/nabor',
      warehouses: [{ id: 'msk-1', available_quantity: 99 }],
      dimensions: { width: 100, height: 40, depth: 100, weight: 830 },
      characteristics: [],
      variations: [],
    })
  })

  it('канонический адрес товара важнее адреса по слагу; без фото нет img', () => {
    const item = ycpBasketItem(
      line({ canonicalUrl: 'https://ximi4ka.ru/product/x' }),
      'msk-1',
      'https://new.ximi4ka.ru',
    )
    expect(item.url).toBe('https://ximi4ka.ru/product/x')
    expect(item).not.toHaveProperty('img')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w api -- src/lib/shipping/unit.test.ts src/lib/ycp/basket.test.ts`
Expected: FAIL with `Failed to load url ./unit.js` and `./basket.js`.

- [ ] **Step 3: Implement unit shipping, pricing, basket mapper**

Append to `shared/src/types/product.ts`:

```ts
/** Вес и габариты одной штуки в упаковке (packCart на одну штуку). */
export interface ProductShippingUnit {
  weightG: number
  lengthCm: number
  widthCm: number
  heightCm: number
}
```

In `shared/src/index.ts`, change the product export to `export type { Product, ProductImage, ProductShippingUnit, StockStatus } from './types/product.js'`.

Create `api/src/lib/shipping/unit.ts`:

```ts
import type { ProductShippingUnit, ShippingBox } from '@ximi4ka-shop/shared'
import { packCart } from './pack.js'

export interface UnitSource {
  id: string
  weightG?: number | null
  shipBoxes?: ShippingBox[] | null
  looseUnits?: number | null
  minBox?: ShippingBox | null
}

// Вес и габариты одной штуки в упаковке — для YCP (basket/check) и фида
// (weight, dimensions). Считает тот же packCart, что и доставка. Несколько
// мест (комбо) кладём стопкой: длина и ширина — наибольшие, высота и вес — сумма.
export function unitShipping(product: UnitSource): ProductShippingUnit {
  const packages = packCart([
    {
      productId: product.id,
      quantity: 1,
      weightG: product.weightG ?? null,
      shipBoxes: product.shipBoxes ?? [],
      looseUnits: product.looseUnits ?? 1,
      minBox: product.minBox ?? null,
    },
  ])
  return packages.reduce<ProductShippingUnit>(
    (acc, p) => ({
      weightG: acc.weightG + p.weightG,
      lengthCm: Math.max(acc.lengthCm, p.lengthCm),
      widthCm: Math.max(acc.widthCm, p.widthCm),
      heightCm: acc.heightCm + p.heightCm,
    }),
    { weightG: 0, lengthCm: 0, widthCm: 0, heightCm: 0 },
  )
}
```

Append to `api/src/lib/ycp/config.ts`:

```ts
// Остаток — константа (спека YCP, «Остатки»): реального учёта и резерва нет.
export const YCP_IN_STOCK_QUANTITY = 99

// Адрес витрины для ссылок на товар и картинки в ответах Яндексу.
export function ycpSiteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.WEB_ORIGIN?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
}
```

Create `api/src/lib/ycp/pricing.ts`:

```ts
import { In, IsNull } from 'typeorm'
import type { ProductShippingUnit } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { wholesaleLineTotals } from '../pricing/wholesale.js'
import type { PackLine } from '../shipping/pack.js'
import { unitShipping } from '../shipping/unit.js'
import { YCP_IN_STOCK_QUANTITY } from './config.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface YcpLine {
  product: Product
  /** Количество после сложения повторяющихся id. */
  quantity: number
  regularPriceRub: number
  /** Цена за штуку, которую спишет Яндекс (× quantity); см. ycpUnitPrice. */
  finalPriceRub: number
  availableQuantity: number
  shipping: ProductShippingUnit
}

// id товара в Яндексе = Product.id (uuid, он же offer id фида).
export function normalizeYcpId(id: string): string {
  return id.trim().toLowerCase()
}

// Повторяющиеся id складываем, как loadCart: цена партии и процент зависят от
// общего количества.
export function mergeYcpItems(
  items: readonly { id: string; quantity: number }[],
): Map<string, number> {
  const qty = new Map<string, number>()
  for (const item of items) {
    const id = normalizeYcpId(item.id)
    qty.set(id, (qty.get(id) ?? 0) + item.quantity)
  }
  return qty
}

// Яндекс берёт final_price × quantity. Сумма строки на сайте
// (wholesaleLineTotals) делится на штуки нацело не всегда: процентные ступени
// дают round(list × (100 − p) / 100), цены партий — 5 пробирок за 99 ₽.
// Округляем вниз: в Яндексе покупатель не платит больше, чем на сайте, а
// магазин теряет меньше рубля на штуке.
export function ycpUnitPrice(lineTotalRub: number, quantity: number): number {
  return Math.floor(lineTotalRub / quantity)
}

// Товары, которые можно купить через Яндекс: опубликованы, не удалены,
// отмечены ycpEnabled. Остальные id (в т.ч. не-uuid) в результат не попадают.
// Порядок — как в запросе.
export async function loadYcpLines(
  items: readonly { id: string; quantity: number }[],
): Promise<Map<string, YcpLine>> {
  const qty = mergeYcpItems(items)
  // Не-uuid в запрос к базе не пускаем: Postgres ответил бы ошибкой приведения
  // типа (500), а за 5xx Яндекс ставит кнопку на паузу (client_5xx).
  const ids = [...qty.keys()].filter((id) => UUID_RE.test(id))
  if (ids.length === 0) return new Map()
  const products = await AppDataSource.getRepository(Product).find({
    where: { id: In(ids), isPublished: true, ycpEnabled: true, deletedAt: IsNull() },
    relations: { categories: true, images: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))
  const totals = wholesaleLineTotals(
    products.map((p) => ({
      slug: p.slug,
      quantity: qty.get(p.id)!,
      priceRub: p.priceRub,
      categories: (p.categories ?? []).map((c) => c.slug),
    })),
  )
  const lines = new Map<string, YcpLine>()
  for (const id of ids) {
    const product = byId.get(id)
    if (!product) continue
    const quantity = qty.get(id)!
    lines.set(id, {
      product,
      quantity,
      regularPriceRub: product.priceRub,
      finalPriceRub: ycpUnitPrice(totals.get(product.slug)!, quantity),
      availableQuantity: product.stockStatus === 'in_stock' ? YCP_IN_STOCK_QUANTITY : 0,
      shipping: unitShipping(product),
    })
  }
  return lines
}

export function ycpPackLines(lines: Iterable<YcpLine>): PackLine[] {
  return [...lines].map(({ product: p, quantity }) => ({
    productId: p.id,
    quantity,
    weightG: p.weightG,
    shipBoxes: p.shipBoxes ?? [],
    looseUnits: p.looseUnits ?? 1,
    minBox: p.minBox,
  }))
}

// Сумма за товары, которую спишет Яндекс.
export function ycpGoodsTotal(lines: Iterable<YcpLine>): number {
  let sum = 0
  for (const l of lines) sum += l.finalPriceRub * l.quantity
  return sum
}
```

Create `api/src/lib/ycp/basket.ts`:

```ts
import type { YcpLine } from './pricing.js'

export interface YcpBasketItem {
  id: string
  name: string
  regular_price: number
  final_price: number
  img?: string
  url?: string
  warehouses: { id: string; available_quantity: number }[]
  dimensions: { width: number; height: number; depth: number; weight: number }
  characteristics: never[]
  variations: never[]
}

function safeUrl(value: string | null | undefined, origin: string): string | undefined {
  if (!value?.trim()) return undefined
  try {
    return new URL(value.trim(), `${origin}/`).toString()
  } catch {
    return undefined
  }
}

// Товар для basket/check (схема BasketItem). vat не передаём — Яндекс
// подставит 22 (налоговый режим — вопрос владельца, docs/ycp/RUNBOOK.md).
// Размеры — в мм, вес — в граммах; вариантов и характеристик у нас нет.
export function ycpBasketItem(line: YcpLine, warehouseId: string, origin: string): YcpBasketItem {
  const p = line.product
  const image = [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]
  const img = safeUrl(image?.url, origin)
  const s = line.shipping
  return {
    id: p.id,
    name: p.name,
    regular_price: line.regularPriceRub,
    final_price: line.finalPriceRub,
    ...(img ? { img } : {}),
    url: safeUrl(p.canonicalUrl, origin) ?? `${origin}/product/${encodeURIComponent(p.slug)}`,
    warehouses: [{ id: warehouseId, available_quantity: line.availableQuantity }],
    dimensions: {
      width: s.widthCm * 10,
      height: s.heightCm * 10,
      depth: s.lengthCm * 10,
      weight: s.weightG,
    },
    characteristics: [],
    variations: [],
  }
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `npm test -w api -- src/lib/shipping/unit.test.ts src/lib/ycp/basket.test.ts`
Expected: PASS (4 + 3 tests).

- [ ] **Step 5: Write the failing route test**

Create `api/src/routes/ycp/basket.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, seedCategory, seedYcpProduct, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/basket/check'

function body(items: { id: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  return {
    items,
    offers_id_from_merchant_center: true,
    locality: 'Москва',
    is_health_check: false,
    ...extra,
  }
}

describe('POST /api/v1/checkout/basket/check', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE products, product_categories, product_images RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('отдаёт цену, остаток-константу и габариты штуки в упаковке', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: p.id, quantity: 1 }]))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      items: [
        {
          id: p.id,
          name: 'Набор юного химика',
          regular_price: 1500,
          final_price: 1500,
          url: `https://new.ximi4ka.ru/product/${p.slug}`,
          warehouses: [{ id: 'msk-1', available_quantity: 99 }],
          dimensions: { width: 100, height: 40, depth: 100, weight: 830 },
          characteristics: [],
          variations: [],
        },
      ],
    })
  })

  it('нет в наличии — товар в ответе с остатком 0', async () => {
    const p = await seedYcpProduct({ stockStatus: 'out_of_stock' })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: p.id, quantity: 1 }]))
    expect(res.body.items[0].warehouses).toEqual([{ id: 'msk-1', available_quantity: 0 }])
  })

  it('без флага, неопубликованный и удалённый не отдаются; если ничего не осталось — 404', async () => {
    const off = await seedYcpProduct({ ycpEnabled: false })
    const draft = await seedYcpProduct({ isPublished: false })
    const gone = await seedYcpProduct()
    await AppDataSource.getRepository(Product).softDelete(gone.id)
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([off, draft, gone].map((p) => ({ id: p.id, quantity: 1 }))))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Products not found' })
  })

  it('не-uuid и неизвестный uuid рядом с настоящим товаром — 200 только с настоящим, без 500', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        body([
          { id: '50', quantity: 1 },
          { id: '00000000-0000-4000-8000-000000000000', quantity: 1 },
          { id: p.id, quantity: 1 },
        ]),
      )
    expect(res.status).toBe(200)
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([p.id])
  })

  it('только не-uuid — 404, а не ошибка базы', async () => {
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: 'not-a-uuid', quantity: 1 }]))
    expect(res.status).toBe(404)
  })

  it('повторяющиеся id складываются; процентная скидка округляется вниз за штуку', async () => {
    const reagent = await seedYcpProduct({ slug: 'sernaya-kislota', priceRub: 119 })
    await seedCategory('reagents', [reagent])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        body([
          { id: reagent.id, quantity: 2 },
          { id: reagent.id, quantity: 3 },
        ]),
      )
    // 5 × 119 = 595, −15 % = 505,75 → строка 506 ₽ на сайте; за штуку 101 ₽.
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({ regular_price: 119, final_price: 101 })
  })

  it('цена партии: 5 пробирок за 99 ₽ — 19 ₽ за штуку', async () => {
    const tube = await seedYcpProduct({ slug: 'probirka', priceRub: 25 })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: tube.id, quantity: 5 }]))
    expect(res.body.items[0]).toMatchObject({ regular_price: 25, final_price: 19 })
  })

  it('скидка на наборы — целая цена за штуку', async () => {
    const kit = await seedYcpProduct({ slug: 'himichka-30', priceRub: 3099 })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: kit.id, quantity: 5 }]))
    expect(res.body.items[0]).toMatchObject({ regular_price: 3099, final_price: 2800 })
  })

  it.each([
    ['ноль', [{ id: '00000000-0000-4000-8000-000000000001', quantity: 0 }]],
    ['минус', [{ id: '00000000-0000-4000-8000-000000000001', quantity: -1 }]],
    ['слишком много', [{ id: '00000000-0000-4000-8000-000000000001', quantity: 10_001 }]],
    ['пустой список', []],
  ])('некорректное количество или пустой список (%s) — 400', async (_name, items) => {
    const res = await request(app).post(URL).set(ycpAuth).send(body(items))
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })

  it('is_health_check не меняет ни код, ни тело ответа', async () => {
    const p = await seedYcpProduct()
    const items = [{ id: p.id, quantity: 2 }]
    const real = await request(app).post(URL).set(ycpAuth).send(body(items))
    const check = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body(items, { is_health_check: true }))
    expect(check.status).toBe(real.status)
    expect(check.body).toEqual(real.body)
  })

  it('uuid в верхнем регистре находит товар и возвращает канонический id', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: p.id.toUpperCase(), quantity: 1 }]))
    expect(res.status).toBe(200)
    expect(res.body.items[0].id).toBe(p.id)
  })
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `npm test -w api -- src/routes/ycp/basket.test.ts`
Expected: FAIL. The first test gets `expected 404 to be 200`; the router answers `Not found` because the route is not mounted.

- [ ] **Step 7: Schema, route, mount**

Append to `api/src/routes/ycp/schemas.ts`:

```ts
// Позиция корзины. id — строка до 80 символов, как offer id фида; не-uuid
// не ошибка: такого товара просто нет в ответе.
export const ItemRefSchema = z.object({
  id: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(10_000),
})

export const BasketCheckSchema = z.object({
  items: z.array(ItemRefSchema).min(1).max(100),
  // Обязательны по схеме, но пример запроса Яндекса их опускает. Ответ от них
  // не зависит: id у нас один и тот же в обоих режимах, остаток не региональный,
  // проверка здоровья отвечает как настоящий запрос.
  offers_id_from_merchant_center: z.boolean().optional(),
  locality: z.string().max(255).optional(),
  is_health_check: z.boolean().optional(),
})
```

Create `api/src/routes/ycp/basket.ts`:

```ts
import { Router } from 'express'
import { ycpSiteOrigin, ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import { ycpBasketItem } from '../../lib/ycp/basket.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpNotFound } from './errors.js'
import { BasketCheckSchema } from './schemas.js'

export const ycpBasketRouter: Router = Router()

// Цены и наличие для корзины Яндекса — без внешних вызовов. Неизвестный или
// недоступный товар не включается; ни одного товара — 404 по спецификации.
ycpBasketRouter.post('/check', async (req, res, next) => {
  try {
    const { items } = BasketCheckSchema.parse(req.body)
    const warehouse = ycpWarehouseFromEnv()
    if (!warehouse) throw new YcpError(500, 'Warehouse is not configured')
    const lines = await loadYcpLines(items)
    if (lines.size === 0) throw ycpNotFound('Products not found')
    const origin = ycpSiteOrigin()
    res.json({ items: [...lines.values()].map((l) => ycpBasketItem(l, warehouse.id, origin)) })
  } catch (err) {
    next(err)
  }
})
```

In `api/src/routes/ycp/index.ts`, add `import { ycpBasketRouter } from './basket.js'` and, after the `/warehouses` line, `router.use('/checkout/basket', ycpBasketRouter)`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/ycp/ src/lib/ycp/ src/lib/shipping/`
Expected: PASS. `basket.test.ts` has 14 tests, because the `it.each` expands to 4.

- [ ] **Step 9: Commit**

```bash
git add shared/src/types/product.ts shared/src/index.ts api/src/lib/shipping/unit.ts api/src/lib/shipping/unit.test.ts api/src/lib/ycp/ api/src/routes/ycp/
git commit -m "feat(ycp): basket/check — цены по оптовым правилам сайта, остаток 99/0, габариты штуки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Nationwide CDEK pickup-point cache + GET /checkout/delivery/pickup_points

**Files:**

- Create: `api/src/lib/ycp/pickupPoints.ts`, test `api/src/lib/ycp/pickupPoints.test.ts`
- Create: `api/src/routes/ycp/delivery.ts`, test `api/src/routes/ycp/pickup-points.test.ts`
- Modify: `api/src/routes/ycp/index.ts`, `api/src/routes/ycp/testHelpers.ts`, `api/src/index.ts:7-8, 36-37`

**Interfaces:**

- Consumes: `getCdekClient()` (`lib/cdek/index.ts`); `CdekClient` type; `describeCdekError` (`lib/cdek/locations.ts`); `ycpTokenFromEnv`; table `ycp_pickup_points_snapshot` (Task 1); `PageQuerySchema`, `YcpError`.
- Produces:
  - `interface YcpPickupPoint`; `interface PickupPointEntry { point: YcpPickupPoint; cityCode: number }`
  - `CDEK_PAGE_SIZE = 1000`, `CDEK_MAX_PAGES = 100`, `PICKUP_POINTS_REFRESH_MS = 43_200_000`
  - `workingHoursFrom(list: unknown): YcpWorkingHours`; `approxTimeZone(longitude: number): number`; `toPickupPointEntry(raw: unknown): PickupPointEntry | null`
  - `fetchCdekPickupPoints(cdek: Pick<CdekClient,'get'>): Promise<PickupPointEntry[]>`; `refreshPickupPoints(cdek, now?): Promise<number>`; `loadPickupPointsSnapshot(): Promise<boolean>`
  - `pickupPointsPage(limit: number, offset: number): { points: YcpPickupPoint[]; total: number } | null`
  - `lookupPickupPoint(code: string): PickupPointEntry | 'unknown' | 'not_ready'`
  - `setPickupPointsForTests(entries: PickupPointEntry[] | null): void`
  - `startPickupPointsJob(opts?: { cdek?: Pick<CdekClient,'get'>; intervalMs?: number; env?: NodeJS.ProcessEnv }): NodeJS.Timeout | null`
  - `ycpDeliveryRouter: Router`; test helper `makePickupEntry(code?: string, cityCode?: number): PickupPointEntry`

- [ ] **Step 1: Write the failing lib test**

Create `api/src/lib/ycp/pickupPoints.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import {
  CDEK_PAGE_SIZE,
  approxTimeZone,
  fetchCdekPickupPoints,
  loadPickupPointsSnapshot,
  lookupPickupPoint,
  pickupPointsPage,
  refreshPickupPoints,
  setPickupPointsForTests,
  startPickupPointsJob,
  toPickupPointEntry,
  workingHoursFrom,
} from './pickupPoints.js'

// Пункт так, как его отдаёт GET /v2/deliverypoints (урезан до нужных полей).
const RAW_POINT = {
  code: 'MSK123',
  name: ' Москва, Ленина ',
  type: 'PVZ',
  have_cash: true,
  have_cashless: false,
  is_dressing_room: true,
  work_time_list: [
    { day: 1, time: '10:00/20:00' },
    { day: 6, time: '11:00/16:00' },
  ],
  location: {
    city_code: 44,
    longitude: 37.62,
    latitude: 55.75,
    address: 'ул. Ленина, 1',
    address_full: 'Россия, Москва, ул. Ленина, 1',
  },
}

function rawPoint(code: string) {
  return { ...RAW_POINT, code }
}

function fakeCdek(pages: unknown[][]) {
  const get = vi.fn(async (_path: string, query?: Record<string, unknown>) => {
    return pages[Number(query?.page ?? 0)] ?? []
  })
  return { get } as unknown as Parameters<typeof fetchCdekPickupPoints>[0] & {
    get: typeof get
  }
}

describe('toPickupPointEntry', () => {
  it('переводит пункт СДЭК в формат Яндекса', () => {
    expect(toPickupPointEntry(RAW_POINT)).toEqual({
      cityCode: 44,
      point: {
        id: 'MSK123',
        name: 'Москва, Ленина',
        address: 'Россия, Москва, ул. Ленина, 1',
        has_fitting: true,
        is_cash_available: true,
        is_card_available: false,
        working_hours: { mon: '10:00-20:00', sat: '11:00-16:00' },
        coordinates: { lat: 55.75, lon: 37.62 },
        time_zone: 3,
        display_service_type: 'cdek',
      },
    })
  })

  it('пропускает пункт без кода, координат, города или адреса', () => {
    expect(toPickupPointEntry(null)).toBeNull()
    expect(toPickupPointEntry({ ...RAW_POINT, code: undefined })).toBeNull()
    expect(
      toPickupPointEntry({ ...RAW_POINT, location: { ...RAW_POINT.location, latitude: 'x' } }),
    ).toBeNull()
    expect(
      toPickupPointEntry({
        ...RAW_POINT,
        location: { ...RAW_POINT.location, city_code: undefined },
      }),
    ).toBeNull()
    expect(
      toPickupPointEntry({
        ...RAW_POINT,
        location: { ...RAW_POINT.location, address: ' ', address_full: '' },
      }),
    ).toBeNull()
  })
})

describe('workingHoursFrom', () => {
  it('понимает «/» и «-», пропускает мусор и выходные', () => {
    expect(
      workingHoursFrom([
        { day: 2, time: '09:00-21:00' },
        { day: 7, time: 'выходной' },
        { day: 9, time: '10:00/20:00' },
        null,
      ]),
    ).toEqual({ tue: '09:00-21:00' })
    expect(workingHoursFrom(undefined)).toEqual({})
  })
})

describe('approxTimeZone', () => {
  it.each([
    [37.62, 3],
    [20.51, 2],
    [60.6, 5],
    [92.87, 7],
    [158.65, 11],
    [-173.2, 12],
  ])('долгота %s → UTC+%s', (lon, tz) => {
    expect(approxTimeZone(lon)).toBe(tz)
  })
})

describe('fetchCdekPickupPoints', () => {
  it('листает СДЭК страницами, убирает повторы и сортирует по коду', async () => {
    const first = Array.from({ length: CDEK_PAGE_SIZE }, (_, i) =>
      rawPoint(`P${String(i).padStart(4, '0')}`),
    )
    const cdek = fakeCdek([first, [rawPoint('P0001'), rawPoint('A0001'), rawPoint('Z9999')]])
    const entries = await fetchCdekPickupPoints(cdek)
    expect(entries).toHaveLength(CDEK_PAGE_SIZE + 2)
    expect(entries[0].point.id).toBe('A0001')
    expect(entries.at(-1)!.point.id).toBe('Z9999')
    expect(cdek.get).toHaveBeenCalledTimes(2)
    expect(cdek.get).toHaveBeenNthCalledWith(1, '/deliverypoints', {
      country_code: 'RU',
      type: 'PVZ',
      is_handout: true,
      size: CDEK_PAGE_SIZE,
      page: 0,
    })
    expect(cdek.get).toHaveBeenNthCalledWith(
      2,
      '/deliverypoints',
      expect.objectContaining({ page: 1 }),
    )
  })

  it('ответ не-список — ошибка', async () => {
    const cdek = { get: vi.fn(async () => ({ error: 'x' })) } as never
    await expect(fetchCdekPickupPoints(cdek)).rejects.toThrow('не список')
  })
})

describe('снимок пунктов выдачи', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE ycp_pickup_points_snapshot')
    setPickupPointsForTests(null)
  })
  afterEach(() => {
    setPickupPointsForTests(null)
  })

  it('сохраняет снимок в базу и поднимает его после перезапуска', async () => {
    expect(await refreshPickupPoints(fakeCdek([[rawPoint('MSK1'), rawPoint('MSK2')]]))).toBe(2)
    expect(pickupPointsPage(10, 0)?.total).toBe(2)
    setPickupPointsForTests(null)
    expect(pickupPointsPage(10, 0)).toBeNull()
    expect(await loadPickupPointsSnapshot()).toBe(true)
    expect(pickupPointsPage(10, 0)?.points.map((p) => p.id)).toEqual(['MSK1', 'MSK2'])
  })

  it('пустой ответ СДЭК не затирает прежний снимок', async () => {
    await refreshPickupPoints(fakeCdek([[rawPoint('MSK1')]]))
    await expect(refreshPickupPoints(fakeCdek([[]]))).rejects.toThrow('пустой список')
    expect(pickupPointsPage(10, 0)?.total).toBe(1)
  })

  it('lookupPickupPoint различает «кеш не собран» и «нет такого пункта»', async () => {
    expect(lookupPickupPoint('MSK1')).toBe('not_ready')
    await refreshPickupPoints(fakeCdek([[rawPoint('MSK1')]]))
    expect(lookupPickupPoint('MSK1')).toMatchObject({ cityCode: 44, point: { id: 'MSK1' } })
    expect(lookupPickupPoint('NOPE')).toBe('unknown')
  })

  it('фоновая задача не запускается без токена YCP', () => {
    expect(startPickupPointsJob({ env: {} })).toBeNull()
  })

  it('фоновая задача с токеном сразу собирает кеш', async () => {
    const timer = startPickupPointsJob({
      env: { YCP_API_TOKEN: 'x'.repeat(32) },
      cdek: fakeCdek([[rawPoint('MSK1')]]),
      intervalMs: 60_000,
    })
    expect(timer).not.toBeNull()
    await vi.waitFor(() => expect(pickupPointsPage(10, 0)?.total).toBe(1))
    clearInterval(timer!)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w api -- src/lib/ycp/pickupPoints.test.ts`
Expected: FAIL with `Failed to load url ./pickupPoints.js`.

- [ ] **Step 3: Implement the cache**

Create `api/src/lib/ycp/pickupPoints.ts`:

```ts
import { AppDataSource } from '../../config/dataSource.js'
import type { CdekClient } from '../cdek/client.js'
import { getCdekClient } from '../cdek/index.js'
import { describeCdekError } from '../cdek/locations.js'
import { ycpTokenFromEnv } from './config.js'

// Пункты выдачи СДЭК по всей России для GET /checkout/delivery/pickup_points
// (спека YCP). Список большой — тысячи ПВЗ, — поэтому запрос его не строит:
// фоновая задача забирает СДЭК постранично и кладёт в память и в таблицу
// ycp_pickup_points_snapshot (переживает перезапуск api), а метод только режет
// готовый массив. Объём: ~450 байт JSON на пункт, единицы мегабайт на всю
// Россию; срез на 1000 пунктов — миллисекунды, далеко от предела в 5 секунд.

type CdekGet = Pick<CdekClient, 'get'>

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export type YcpWorkingHours = Partial<Record<(typeof DAY_KEYS)[number], string>>

export interface YcpPickupPoint {
  id: string
  name: string
  address: string
  has_fitting?: boolean
  is_cash_available: boolean
  is_card_available: boolean
  working_hours: YcpWorkingHours
  coordinates: { lat: number; lon: number }
  time_zone: number
  display_service_type: 'cdek'
}

// cityCode — для расчёта доставки до пункта: калькулятор СДЭК ждёт код города.
export interface PickupPointEntry {
  point: YcpPickupPoint
  cityCode: number
}

export const CDEK_PAGE_SIZE = 1000
// Предохранитель от бесконечного цикла, если СДЭК перестанет укорачивать страницы.
export const CDEK_MAX_PAGES = 100
export const PICKUP_POINTS_REFRESH_MS = 12 * 60 * 60_000

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// work_time_list СДЭК: [{ day: 1..7, time: "10:00/20:00" }] → { mon: "10:00-20:00" }.
// Выходной день Яндекс просит не передавать — его просто нет в объекте.
export function workingHoursFrom(list: unknown): YcpWorkingHours {
  const hours: YcpWorkingHours = {}
  if (!Array.isArray(list)) return hours
  for (const item of list) {
    const r = item as { day?: unknown; time?: unknown } | null
    if (!r || !isNumber(r.day) || r.day < 1 || r.day > 7) continue
    const m = /^(\d{2}:\d{2})\s*[/-]\s*(\d{2}:\d{2})$/.exec(text(r.time))
    if (m) hours[DAY_KEYS[r.day - 1]] = `${m[1]}-${m[2]}`
  }
  return hours
}

// Часовой пояс СДЭК в списке пунктов не отдаёт. Приближение по долготе:
// российское время опережает солнечное примерно на час, ceil(lon/15) даёт
// Москве +3, Калининграду +2, Екатеринбургу +5, Красноярску +7; в части
// Сибири и Дальнего Востока ошибка — час. Время работы пункта — местное, пояс
// влияет только на пересчёт у Яндекса.
export function approxTimeZone(longitude: number): number {
  const lon = longitude < 0 ? longitude + 360 : longitude
  return Math.min(12, Math.max(2, Math.ceil(lon / 15)))
}

export function toPickupPointEntry(raw: unknown): PickupPointEntry | null {
  const r = raw as {
    code?: unknown
    name?: unknown
    have_cash?: unknown
    have_cashless?: unknown
    is_dressing_room?: unknown
    work_time_list?: unknown
    location?: {
      city_code?: unknown
      longitude?: unknown
      latitude?: unknown
      address?: unknown
      address_full?: unknown
    } | null
  } | null
  const loc = r?.location
  const code = text(r?.code)
  if (!r || !code || !loc) return null
  if (!isNumber(loc.longitude) || !isNumber(loc.latitude) || !isNumber(loc.city_code)) return null
  const address = text(loc.address_full) || text(loc.address)
  if (!address) return null
  return {
    cityCode: loc.city_code,
    point: {
      id: code,
      name: text(r.name) || code,
      address,
      ...(typeof r.is_dressing_room === 'boolean' ? { has_fitting: r.is_dressing_room } : {}),
      is_cash_available: r.have_cash === true,
      is_card_available: r.have_cashless === true,
      working_hours: workingHoursFrom(r.work_time_list),
      coordinates: { lat: loc.latitude, lon: loc.longitude },
      time_zone: approxTimeZone(loc.longitude),
      display_service_type: 'cdek',
    },
  }
}

// Все ПВЗ с выдачей по России. Страница короче size — последняя. По коду:
// стабильный порядок для пагинации Яндекса.
export async function fetchCdekPickupPoints(cdek: CdekGet): Promise<PickupPointEntry[]> {
  const byCode = new Map<string, PickupPointEntry>()
  for (let page = 0; page < CDEK_MAX_PAGES; page++) {
    const raw = await cdek.get<unknown>('/deliverypoints', {
      country_code: 'RU',
      type: 'PVZ',
      is_handout: true,
      size: CDEK_PAGE_SIZE,
      page,
    })
    if (!Array.isArray(raw)) throw new Error('СДЭК вернул не список пунктов выдачи')
    for (const item of raw) {
      const entry = toPickupPointEntry(item)
      if (entry) byCode.set(entry.point.id, entry)
    }
    if (raw.length < CDEK_PAGE_SIZE) break
  }
  return [...byCode.values()].sort((a, b) =>
    a.point.id < b.point.id ? -1 : a.point.id > b.point.id ? 1 : 0,
  )
}

interface Snapshot {
  entries: PickupPointEntry[]
  byCode: Map<string, PickupPointEntry>
  builtAt: Date
}

let snapshot: Snapshot | null = null

function install(entries: PickupPointEntry[], builtAt: Date): void {
  snapshot = { entries, byCode: new Map(entries.map((e) => [e.point.id, e])), builtAt }
}

// Для тестов: модульный кеш иначе переживал бы соседние тесты.
export function setPickupPointsForTests(entries: PickupPointEntry[] | null): void {
  if (entries === null) snapshot = null
  else install(entries, new Date())
}

export function pickupPointsPage(
  limit: number,
  offset: number,
): { points: YcpPickupPoint[]; total: number } | null {
  if (!snapshot) return null
  return {
    points: snapshot.entries.slice(offset, offset + limit).map((e) => e.point),
    total: snapshot.entries.length,
  }
}

// not_ready — кеш ещё не собран, проверить пункт нечем; unknown — кеш есть, а
// пункта в нём нет.
export function lookupPickupPoint(code: string): PickupPointEntry | 'unknown' | 'not_ready' {
  if (!snapshot) return 'not_ready'
  return snapshot.byCode.get(code.trim()) ?? 'unknown'
}

export async function refreshPickupPoints(cdek: CdekGet, now: Date = new Date()): Promise<number> {
  const entries = await fetchCdekPickupPoints(cdek)
  // Пустой список — скорее сбой СДЭК, чем Россия без ПВЗ: прежний снимок не трогаем.
  if (entries.length === 0) throw new Error('СДЭК вернул пустой список пунктов выдачи')
  await AppDataSource.query(
    `INSERT INTO ycp_pickup_points_snapshot (id, entries, built_at) VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET entries = EXCLUDED.entries, built_at = EXCLUDED.built_at`,
    [JSON.stringify(entries), now],
  )
  install(entries, now)
  return entries.length
}

export async function loadPickupPointsSnapshot(): Promise<boolean> {
  const rows = (await AppDataSource.query(
    `SELECT entries, built_at FROM ycp_pickup_points_snapshot WHERE id = 1`,
  )) as { entries: unknown; built_at: Date }[]
  const row = rows[0]
  if (!row || !Array.isArray(row.entries) || row.entries.length === 0) return false
  install(row.entries as PickupPointEntry[], new Date(row.built_at))
  return true
}

// Запускается из api/src/index.ts: снимок из базы сразу, затем свежий список
// из СДЭК и обновление раз в 12 часов. No-op без YCP_API_TOKEN.
export function startPickupPointsJob(
  opts: { cdek?: CdekGet; intervalMs?: number; env?: NodeJS.ProcessEnv } = {},
): NodeJS.Timeout | null {
  if (!ycpTokenFromEnv(opts.env)) return null
  let running = false
  const run = (): void => {
    if (running) return
    running = true
    Promise.resolve()
      .then(() => refreshPickupPoints(opts.cdek ?? getCdekClient()))
      .then((count) => console.info(`ycp: пункты выдачи СДЭК обновлены — ${count}`))
      .catch((err) => console.error('ycp: пункты выдачи не обновлены —', describeCdekError(err)))
      .finally(() => {
        running = false
      })
  }
  loadPickupPointsSnapshot()
    .catch((err) =>
      console.error(
        'ycp: снимок пунктов выдачи не прочитан —',
        err instanceof Error ? err.message : String(err),
      ),
    )
    .finally(run)
  const timer = setInterval(run, opts.intervalMs ?? PICKUP_POINTS_REFRESH_MS)
  timer.unref()
  return timer
}
```

Run: `npm test -w api -- src/lib/ycp/pickupPoints.test.ts`
Expected: PASS (16 tests, with the `it.each` expanding to 6).

- [ ] **Step 4: Write the failing route test**

Append to `api/src/routes/ycp/testHelpers.ts`. Add the import at the top of the file:

```ts
import type { PickupPointEntry } from '../../lib/ycp/pickupPoints.js'
```

and the function at the end:

```ts
export function makePickupEntry(code = 'MSK1', cityCode = 44): PickupPointEntry {
  return {
    cityCode,
    point: {
      id: code,
      name: `Пункт ${code}`,
      address: 'Москва, ул. Тестовая, 1',
      is_cash_available: true,
      is_card_available: true,
      working_hours: { mon: '10:00-20:00' },
      coordinates: { lat: 55.75, lon: 37.62 },
      time_zone: 3,
      display_service_type: 'cdek',
    },
  }
}
```

Create `api/src/routes/ycp/pickup-points.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import { applyYcpTestEnv, makePickupEntry, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/delivery/pickup_points'

describe('GET /api/v1/checkout/delivery/pickup_points', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(() => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setPickupPointsForTests(null)
  })

  it('кеш ещё не собран — 500, Яндекс повторит', async () => {
    const res = await request(app).get(`${URL}?limit=1000&offset=0`).set(ycpAuth)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Pickup points are not loaded yet' })
  })

  it('режет кеш по limit и offset, total_count — весь список', async () => {
    setPickupPointsForTests([makePickupEntry('A1'), makePickupEntry('B2'), makePickupEntry('C3')])
    const res = await request(app).get(`${URL}?limit=2&offset=1`).set(ycpAuth)
    expect(res.status).toBe(200)
    expect(res.body.total_count).toBe(3)
    expect(res.body.pickup_points.map((p: { id: string }) => p.id)).toEqual(['B2', 'C3'])
    expect(res.body.pickup_points[0]).toEqual(makePickupEntry('B2').point)
  })

  it('без limit и offset — первая тысяча', async () => {
    setPickupPointsForTests([makePickupEntry('A1')])
    const res = await request(app).get(URL).set(ycpAuth)
    expect(res.body).toEqual({ pickup_points: [makePickupEntry('A1').point], total_count: 1 })
  })
})
```

Run: `npm test -w api -- src/routes/ycp/pickup-points.test.ts`
Expected: FAIL. The first test gets `expected 404 to be 500`, because the route is not mounted.

- [ ] **Step 5: Route, mount, background job**

Create `api/src/routes/ycp/delivery.ts`:

```ts
import { Router } from 'express'
import { pickupPointsPage } from '../../lib/ycp/pickupPoints.js'
import { YcpError } from './errors.js'
import { PageQuerySchema } from './schemas.js'

export const ycpDeliveryRouter: Router = Router()

// Пункты выдачи — только из кеша (lib/ycp/pickupPoints.ts). До первой сборки
// — 500: Яндекс повторит запрос позже (спека YCP).
ycpDeliveryRouter.get('/pickup_points', (req, res, next) => {
  try {
    const { limit, offset } = PageQuerySchema.parse(req.query)
    const page = pickupPointsPage(limit, offset)
    if (!page) throw new YcpError(500, 'Pickup points are not loaded yet')
    res.json({ pickup_points: page.points, total_count: page.total })
  } catch (err) {
    next(err)
  }
})
```

In `api/src/routes/ycp/index.ts`, add `import { ycpDeliveryRouter } from './delivery.js'` and, after the `/checkout/basket` line, `router.use('/checkout/delivery', ycpDeliveryRouter)`.

In `api/src/index.ts`, add `import { startPickupPointsJob } from './lib/ycp/pickupPoints.js'` after the `startCdekShipmentWorker` import. After the CDEK worker block (line 37), add:

```ts
// Пункты выдачи СДЭК по всей России для YCP: снимок из базы, затем свежий
// список и обновление раз в 12 часов. No-op без YCP_API_TOKEN.
if (startPickupPointsJob()) {
  logger.info('ycp pickup points job started')
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/ycp/pickup-points.test.ts src/lib/ycp/pickupPoints.test.ts` then `npm run typecheck -w api`
Expected: PASS (3 + 16 tests); typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/ycp/pickupPoints.ts api/src/lib/ycp/pickupPoints.test.ts api/src/routes/ycp/ api/src/index.ts
git commit -m "feat(ycp): пункты выдачи СДЭК по всей России — кеш в памяти и снимок в базе, фоновое обновление" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: POST /checkout/delivery/options

**Files:**

- Modify: `api/src/lib/ycp/config.ts` (append)
- Create: `api/src/lib/ycp/deliveryOptions.ts`, test `api/src/lib/ycp/deliveryOptions.test.ts`
- Modify: `api/src/routes/ycp/schemas.ts` (append), `api/src/routes/ycp/delivery.ts` (replace whole file)
- Test: `api/src/routes/ycp/delivery-options.test.ts`

**Interfaces:**

- Consumes: `quoteDelivery`, `deliveryConfigFromEnv`, `tariffFor`, `DeliveryConfig` (`lib/shipping/quote.ts`); `SHIPPING_RULES` (`lib/shipping/rates.ts`); `suggestCities` (`lib/cdek/locations.ts`); `getCdekClient`; `packCart`; `loadYcpLines`, `ycpPackLines`, `ycpGoodsTotal`, `YcpLine` (Task 4); `lookupPickupPoint` (Task 5); `ItemRefSchema`, `ycpBadRequest`.
- Produces:
  - `YCP_CDEK_TIMEOUT_MS_DEFAULT = 3500`; `ycpCdekTimeoutMs(env?): number`
  - `class DeadlineError`; `withDeadline(cdek: Pick<CdekClient,'get'|'post'>, ms: number): Pick<CdekClient,'get'|'post'>`
  - `ycpOptionId(method: DeliveryMethod, tariffCode: number, cityCode: number | null): string`; `parseYcpOptionId(id: string | null | undefined): { method: DeliveryMethod; tariffCode: number; cityCode: number | null } | null`
  - `FALLBACK_PERIOD_DAYS = { min: 3, max: 7 }`, `HANDOVER_DAYS = 1`, `MOSCOW_UTC_OFFSET = 3`; `moscowDate(now: Date, addDays: number): string`; `deliveryDateInterval(quote, now): YcpDeliveryDateInterval`; `fallbackQuote(method, subtotalRub, config): DeliveryQuote`
  - `type YcpDeliveryTarget = { method: 'pickup_point'; pickupPointId: string } | { method: 'courier'; locality: string; address: string }`; `interface YcpDeliveryOption { id: string; cost: number; delivery_date_interval: YcpDeliveryDateInterval }`; `class UnknownPickupPointError`
  - `ycpDeliveryOption(input: { target: YcpDeliveryTarget; lines: YcpLine[]; now: Date }, deps: { cdek: Pick<CdekClient,'get'|'post'>; timeoutMs: number; config?: DeliveryConfig }): Promise<YcpDeliveryOption>`
  - schemas: `AddressSchema`, `type YcpAddress`, `checkAddressFor(method: string, address: YcpAddress, report: (path: string[], message: string) => void): void`, `DeliveryOptionsSchema`

- [ ] **Step 1: Write the failing unit test**

Create `api/src/lib/ycp/deliveryOptions.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  DeadlineError,
  deliveryDateInterval,
  fallbackQuote,
  moscowDate,
  parseYcpOptionId,
  withDeadline,
  ycpOptionId,
} from './deliveryOptions.js'

const CONFIG = { fromCityCode: 44, tariffPvz: 136, tariffCourier: 137 }

describe('id варианта доставки', () => {
  it('детерминирован и разбирается обратно', () => {
    expect(ycpOptionId('cdek_pvz', 136, 44)).toBe('pvz-136-44')
    expect(ycpOptionId('cdek_courier', 137, null)).toBe('courier-137-0')
    expect(parseYcpOptionId('pvz-136-44')).toEqual({
      method: 'cdek_pvz',
      tariffCode: 136,
      cityCode: 44,
    })
    expect(parseYcpOptionId('courier-137-0')).toEqual({
      method: 'cdek_courier',
      tariffCode: 137,
      cityCode: null,
    })
  })

  it.each(['', 'pvz-136', 'x-1-2', 'pvz-136-44-1', 'option-12345'])(
    'чужой id «%s» → null',
    (id) => {
      expect(parseYcpOptionId(id)).toBeNull()
    },
  )

  it('без id → null', () => {
    expect(parseYcpOptionId(undefined)).toBeNull()
  })
})

describe('сроки доставки', () => {
  it('дата — по Москве', () => {
    // 22:30 UTC 11-го — уже 01:30 12-го в Москве.
    expect(moscowDate(new Date('2026-10-11T22:30:00Z'), 0)).toBe('2026-10-12')
    expect(moscowDate(new Date('2026-10-11T09:00:00Z'), 3)).toBe('2026-10-14')
  })

  it('день передачи в СДЭК + срок калькулятора; без срока — ориентировочный', () => {
    const now = new Date('2026-10-11T09:00:00Z')
    expect(deliveryDateInterval({ periodMin: 2, periodMax: 4 }, now)).toEqual({
      start_interval: { date: '2026-10-14' },
      end_interval: { date: '2026-10-16' },
      time_zone: 3,
    })
    expect(deliveryDateInterval({ periodMin: null, periodMax: null }, now)).toEqual({
      start_interval: { date: '2026-10-15' },
      end_interval: { date: '2026-10-19' },
      time_zone: 3,
    })
  })
})

describe('fallbackQuote', () => {
  it('фиксированная ставка и порог бесплатной доставки, как на сайте', () => {
    expect(fallbackQuote('cdek_pvz', 1500, CONFIG)).toMatchObject({
      tariffCode: 136,
      customerPriceRub: 350,
      source: 'fallback',
    })
    expect(fallbackQuote('cdek_pvz', 3000, CONFIG).customerPriceRub).toBe(0)
    expect(fallbackQuote('cdek_courier', 4999, CONFIG).customerPriceRub).toBe(500)
  })
})

describe('withDeadline', () => {
  it('быстрый ответ проходит, медленный обрывается DeadlineError', async () => {
    const cdek = {
      get: vi.fn(async () => 'ok'),
      post: vi.fn(() => new Promise(() => undefined)),
    }
    const limited = withDeadline(cdek as never, 30)
    await expect(limited.get('/x')).resolves.toBe('ok')
    const started = Date.now()
    await expect(limited.post('/y', {})).rejects.toBeInstanceOf(DeadlineError)
    expect(Date.now() - started).toBeLessThan(500)
  })
})
```

Run: `npm test -w api -- src/lib/ycp/deliveryOptions.test.ts`
Expected: FAIL with `Failed to load url ./deliveryOptions.js`.

- [ ] **Step 2: Implement the lib**

Append to `api/src/lib/ycp/config.ts`:

```ts
// Общий срок на вызовы СДЭК в /checkout/delivery/options: ответ Яндексу — до
// 5 секунд, запас на базу и сеть. Больше 4000 не принимаем.
export const YCP_CDEK_TIMEOUT_MS_DEFAULT = 3500

export function ycpCdekTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.YCP_CDEK_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 && n <= 4000 ? n : YCP_CDEK_TIMEOUT_MS_DEFAULT
}
```

Create `api/src/lib/ycp/deliveryOptions.ts`:

```ts
import type { DeliveryMethod, DeliveryQuote } from '@ximi4ka-shop/shared'
import type { CdekClient } from '../cdek/client.js'
import { suggestCities } from '../cdek/locations.js'
import { packCart } from '../shipping/pack.js'
import {
  deliveryConfigFromEnv,
  quoteDelivery,
  tariffFor,
  type DeliveryConfig,
} from '../shipping/quote.js'
import { SHIPPING_RULES } from '../shipping/rates.js'
import { lookupPickupPoint } from './pickupPoints.js'
import { ycpGoodsTotal, ycpPackLines, type YcpLine } from './pricing.js'

type Cdek = Pick<CdekClient, 'get' | 'post'>

export class DeadlineError extends Error {
  constructor() {
    super('СДЭК не ответил вовремя')
    this.name = 'DeadlineError'
  }
}

function race<T>(promise: Promise<T>, deadlineAt: number): Promise<T> {
  const left = deadlineAt - Date.now()
  if (left <= 0) return Promise.reject(new DeadlineError())
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), left)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Общий срок на все вызовы СДЭК одного запроса: подсказка города и калькулятор
// вместе укладываются в него. Клиент СДЭК сам ждёт до 10 секунд — без обёртки
// калькулятор съел бы весь лимит Яндекса в 5 секунд.
export function withDeadline(cdek: Cdek, ms: number): Cdek {
  const deadlineAt = Date.now() + ms
  return {
    get: <T = unknown>(path: string, query?: Parameters<CdekClient['get']>[1]) =>
      race(cdek.get<T>(path, query), deadlineAt),
    post: <T = unknown>(path: string, body: unknown) => race(cdek.post<T>(path, body), deadlineAt),
  }
}

export type YcpDeliveryTarget =
  | { method: 'pickup_point'; pickupPointId: string }
  | { method: 'courier'; locality: string; address: string }

export interface YcpDeliveryDateInterval {
  start_interval: { date: string }
  end_interval: { date: string }
  time_zone: number
}

export interface YcpDeliveryOption {
  id: string
  cost: number
  delivery_date_interval: YcpDeliveryDateInterval
}

export class UnknownPickupPointError extends Error {
  constructor(code: string) {
    super(`Пункт выдачи ${code} не найден`)
    this.name = 'UnknownPickupPointError'
  }
}

// Ориентировочный срок в пути, если СДЭК не назвал свой.
export const FALLBACK_PERIOD_DAYS = { min: 3, max: 7 } as const
// Посылку относим в СДЭК на следующий день после заказа.
export const HANDOVER_DAYS = 1
export const MOSCOW_UTC_OFFSET = 3

const OPTION_PREFIX: Record<DeliveryMethod, string> = { cdek_pvz: 'pvz', cdek_courier: 'courier' }

// Детерминированный id варианта: способ, тариф и код города (0 — неизвестен).
// Яндекс вернёт его в /checkout как ycp_delivery_option_id — оттуда берём город.
export function ycpOptionId(
  method: DeliveryMethod,
  tariffCode: number,
  cityCode: number | null,
): string {
  return `${OPTION_PREFIX[method]}-${tariffCode}-${cityCode ?? 0}`
}

export function parseYcpOptionId(
  id: string | null | undefined,
): { method: DeliveryMethod; tariffCode: number; cityCode: number | null } | null {
  const m = /^(pvz|courier)-(\d{1,6})-(\d{1,9})$/.exec(id ?? '')
  if (!m) return null
  const cityCode = Number(m[3])
  return {
    method: m[1] === 'pvz' ? 'cdek_pvz' : 'cdek_courier',
    tariffCode: Number(m[2]),
    cityCode: cityCode > 0 ? cityCode : null,
  }
}

export function moscowDate(now: Date, addDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now.getTime() + addDays * 86_400_000))
}

export function deliveryDateInterval(
  quote: Pick<DeliveryQuote, 'periodMin' | 'periodMax'>,
  now: Date,
): YcpDeliveryDateInterval {
  const min = quote.periodMin ?? FALLBACK_PERIOD_DAYS.min
  const max = Math.max(quote.periodMax ?? FALLBACK_PERIOD_DAYS.max, min)
  return {
    start_interval: { date: moscowDate(now, HANDOVER_DAYS + min) },
    end_interval: { date: moscowDate(now, HANDOVER_DAYS + max) },
    time_zone: MOSCOW_UTC_OFFSET,
  }
}

// Та же фиксированная ставка, что берёт quoteDelivery, когда СДЭК молчит, —
// для ПВЗ, чей город неизвестен (кеш пунктов ещё не собран).
export function fallbackQuote(
  method: DeliveryMethod,
  subtotalRub: number,
  config: DeliveryConfig,
): DeliveryQuote {
  const rule = SHIPPING_RULES[method]
  const free = subtotalRub >= rule.freeFromRub
  return {
    method,
    tariffCode: tariffFor(method, config),
    customerPriceRub: free ? 0 : rule.priceRub,
    cdekPriceRub: null,
    periodMin: null,
    periodMax: null,
    free,
    source: 'fallback',
  }
}

async function resolveCityCode(cdek: Cdek, locality: string): Promise<number | null> {
  try {
    return (await suggestCities(cdek, locality))[0]?.code ?? null
  } catch {
    return null
  }
}

// Один вариант на запрос — тот способ, что выбрал покупатель. Цена — та же,
// что на сайте (quoteDelivery, порог бесплатной доставки по сумме за товары).
export async function ycpDeliveryOption(
  input: { target: YcpDeliveryTarget; lines: YcpLine[]; now: Date },
  deps: { cdek: Cdek; timeoutMs: number; config?: DeliveryConfig },
): Promise<YcpDeliveryOption> {
  const config = deps.config ?? deliveryConfigFromEnv()
  const cdek = withDeadline(deps.cdek, deps.timeoutMs)
  const subtotalRub = ycpGoodsTotal(input.lines)
  const packages = packCart(ycpPackLines(input.lines))
  const { target } = input
  let quote: DeliveryQuote
  let cityCode: number | null = null
  if (target.method === 'pickup_point') {
    const found = lookupPickupPoint(target.pickupPointId)
    if (found === 'unknown') throw new UnknownPickupPointError(target.pickupPointId)
    if (found === 'not_ready') {
      quote = fallbackQuote('cdek_pvz', subtotalRub, config)
    } else {
      cityCode = found.cityCode
      quote = await quoteDelivery(
        {
          destination: { method: 'cdek_pvz', cityCode, address: found.point.address },
          subtotalRub,
          packages,
        },
        { cdek, config },
      )
    }
  } else {
    cityCode = await resolveCityCode(cdek, target.locality)
    quote = await quoteDelivery(
      {
        destination: {
          method: 'cdek_courier',
          ...(cityCode ? { cityCode } : {}),
          address: `${target.locality}, ${target.address}`,
        },
        subtotalRub,
        packages,
      },
      { cdek, config },
    )
  }
  return {
    id: ycpOptionId(quote.method, quote.tariffCode, cityCode),
    cost: quote.customerPriceRub,
    delivery_date_interval: deliveryDateInterval(quote, input.now),
  }
}
```

Run: `npm test -w api -- src/lib/ycp/deliveryOptions.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 3: Write the failing route test**

Create `api/src/routes/ycp/delivery-options.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { setCdekClientForTests } from '../../lib/cdek/index.js'
import { clearCdekLocationCache } from '../../lib/cdek/locations.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import { applyYcpTestEnv, makePickupEntry, seedYcpProduct, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/delivery/options'

function stubCdek(post: () => Promise<unknown>, cities: unknown[] = []) {
  const get = vi.fn(async () => cities)
  const postFn = vi.fn(post)
  setCdekClientForTests({ get, post: postFn, raw: vi.fn() } as never)
  return { get, post: postFn }
}

const pvzTarget = { delivery_method: 'pickup_point', address: { pickup_point_id: 'MSK1' } }
const courierTarget = {
  delivery_method: 'courier',
  address: { locality: 'Новосибирск', address: 'ул. Ленина, 1' },
}

describe('POST /api/v1/checkout/delivery/options', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE products, product_categories RESTART IDENTITY CASCADE')
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T09:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    setCdekClientForTests(null)
    clearCdekLocationCache()
    setPickupPointsForTests(null)
  })

  it('пункт выдачи: цена и срок СДЭК, оба ключа ответа с одним массивом', async () => {
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const cdek = stubCdek(async () => ({ total_sum: 412.4, period_min: 2, period_max: 4 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(res.status).toBe(200)
    const option = {
      id: 'pvz-136-44',
      cost: 413,
      delivery_date_interval: {
        start_interval: { date: '2026-10-14' },
        end_interval: { date: '2026-10-16' },
        time_zone: 3,
      },
    }
    expect(res.body).toEqual({ options: [option], delivery_options: [option] })
    expect(cdek.post).toHaveBeenCalledWith(
      '/calculator/tariff',
      expect.objectContaining({ tariff_code: 136, to_location: { code: 44 } }),
    )
  })

  it('от 3000 ₽ за товары до ПВЗ — бесплатно', async () => {
    const p = await seedYcpProduct({ priceRub: 3500 })
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    stubCdek(async () => ({ total_sum: 412, period_min: 2, period_max: 4 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(res.body.options[0]).toMatchObject({ id: 'pvz-136-44', cost: 0 })
  })

  it('курьер: город по подсказке СДЭК, адрес целиком в калькулятор', async () => {
    const p = await seedYcpProduct()
    const cdek = stubCdek(
      async () => ({ total_sum: 650, period_min: 3, period_max: 5 }),
      [{ code: 270, full_name: 'Новосибирск, Новосибирская обл., Россия' }],
    )
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: courierTarget })
    expect(res.status).toBe(200)
    expect(res.body.options[0]).toEqual({
      id: 'courier-137-270',
      cost: 650,
      delivery_date_interval: {
        start_interval: { date: '2026-10-15' },
        end_interval: { date: '2026-10-17' },
        time_zone: 3,
      },
    })
    expect(cdek.get).toHaveBeenCalledWith('/location/suggest/cities', {
      name: 'Новосибирск',
      country_code: 'RU',
    })
    expect(cdek.post).toHaveBeenCalledWith(
      '/calculator/tariff',
      expect.objectContaining({
        tariff_code: 137,
        to_location: { code: 270, address: 'Новосибирск, ул. Ленина, 1' },
      }),
    )
  })

  it('курьер без locality — 400, СДЭК не вызывается', async () => {
    const p = await seedYcpProduct()
    const cdek = stubCdek(async () => ({ total_sum: 650 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'courier', address: { address: 'ул. Ленина, 1' } },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('locality')
    expect(cdek.post).not.toHaveBeenCalled()
  })

  it('ПВЗ без pickup_point_id — 400', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'pickup_point', address: {} },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('pickup_point_id')
  })

  it('неизвестный пункт при собранном кеше — 400', async () => {
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'pickup_point', address: { pickup_point_id: 'NOPE' } },
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Unknown pickup point' })
  })

  it('кеш пунктов не собран — фиксированная ставка и ориентировочный срок', async () => {
    const p = await seedYcpProduct()
    const cdek = stubCdek(async () => ({ total_sum: 412 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(res.body.options[0]).toEqual({
      id: 'pvz-136-0',
      cost: 350,
      delivery_date_interval: {
        start_interval: { date: '2026-10-15' },
        end_interval: { date: '2026-10-19' },
        time_zone: 3,
      },
    })
    expect(cdek.post).not.toHaveBeenCalled()
  })

  it('СДЭК молчит — ответ по запасному тарифу задолго до 5 секунд', async () => {
    vi.stubEnv('YCP_CDEK_TIMEOUT_MS', '50')
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    stubCdek(() => new Promise(() => undefined))
    const started = performance.now()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(performance.now() - started).toBeLessThan(1000)
    expect(res.status).toBe(200)
    expect(res.body.options[0]).toMatchObject({ id: 'pvz-136-44', cost: 350 })
  })

  it('ни одного доступного товара — 400', async () => {
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
        delivery_target: pvzTarget,
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Products not found' })
  })
})
```

- [ ] **Step 4: Run it to see it fail**

Run: `npm test -w api -- src/routes/ycp/delivery-options.test.ts`
Expected: FAIL. The first test gets `expected 404 to be 200`.

- [ ] **Step 5: Schemas and route**

Append to `api/src/routes/ycp/schemas.ts`:

```ts
const optionalText = (max: number) => z.string().trim().max(max).optional()

export const AddressSchema = z.object({
  locality: optionalText(255),
  address: optionalText(1000),
  apartment: optionalText(64),
  entrance: optionalText(64),
  floor: optionalText(64),
  intercom: optionalText(64),
  pickup_point_id: optionalText(32),
})

export type YcpAddress = z.infer<typeof AddressSchema>

// Поля адреса в схеме Яндекса все необязательны, но по описанию для ПВЗ нужен
// pickup_point_id, а для курьера и самовывоза — locality и address. Без них
// калькулятор СДЭК получил бы поладреса.
export function checkAddressFor(
  method: string,
  address: YcpAddress,
  report: (path: string[], message: string) => void,
): void {
  if (method === 'pickup_point') {
    if (!address.pickup_point_id) {
      report(['address', 'pickup_point_id'], 'pickup_point_id is required for pickup_point')
    }
    return
  }
  if (!address.locality || !address.address) {
    report(['address'], 'locality and address are required')
  }
}

export const DeliveryOptionsSchema = z.object({
  items: z.array(ItemRefSchema).min(1).max(100),
  delivery_target: z
    .object({ delivery_method: z.enum(['pickup_point', 'courier']), address: AddressSchema })
    .superRefine((v, ctx) =>
      checkAddressFor(v.delivery_method, v.address, (path, message) =>
        ctx.addIssue({ code: 'custom', path, message }),
      ),
    ),
})
```

Replace `api/src/routes/ycp/delivery.ts` with:

```ts
import { Router } from 'express'
import { getCdekClient } from '../../lib/cdek/index.js'
import { ycpCdekTimeoutMs } from '../../lib/ycp/config.js'
import {
  UnknownPickupPointError,
  ycpDeliveryOption,
  type YcpDeliveryTarget,
} from '../../lib/ycp/deliveryOptions.js'
import { pickupPointsPage } from '../../lib/ycp/pickupPoints.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpBadRequest } from './errors.js'
import { DeliveryOptionsSchema, PageQuerySchema } from './schemas.js'

export const ycpDeliveryRouter: Router = Router()

// Пункты выдачи — только из кеша (lib/ycp/pickupPoints.ts). До первой сборки
// — 500: Яндекс повторит запрос позже (спека YCP).
ycpDeliveryRouter.get('/pickup_points', (req, res, next) => {
  try {
    const { limit, offset } = PageQuerySchema.parse(req.query)
    const page = pickupPointsPage(limit, offset)
    if (!page) throw new YcpError(500, 'Pickup points are not loaded yet')
    res.json({ pickup_points: page.points, total_count: page.total })
  } catch (err) {
    next(err)
  }
})

// Цена и срок доставки СДЭК для выбранного покупателем способа.
ycpDeliveryRouter.post('/options', async (req, res, next) => {
  try {
    const { items, delivery_target: t } = DeliveryOptionsSchema.parse(req.body)
    const lines = [...(await loadYcpLines(items)).values()]
    if (lines.length === 0) throw ycpBadRequest('Products not found')
    // Обязательность полей адреса уже проверила схема (checkAddressFor).
    const target: YcpDeliveryTarget =
      t.delivery_method === 'pickup_point'
        ? { method: 'pickup_point', pickupPointId: t.address.pickup_point_id ?? '' }
        : {
            method: 'courier',
            locality: t.address.locality ?? '',
            address: t.address.address ?? '',
          }
    const option = await ycpDeliveryOption(
      { target, lines, now: new Date() },
      { cdek: getCdekClient(), timeoutMs: ycpCdekTimeoutMs() },
    )
    // Схема Яндекса называет ключ delivery_options, а пример — options: отдаём оба.
    res.json({ options: [option], delivery_options: [option] })
  } catch (err) {
    next(err instanceof UnknownPickupPointError ? ycpBadRequest('Unknown pickup point') : err)
  }
})
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/ycp/ src/lib/ycp/`
Expected: PASS. `delivery-options.test.ts` has 9 tests, and every earlier YCP test is still green.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/ycp/ api/src/routes/ycp/
git commit -m "feat(ycp): delivery/options — тарифы СДЭК 136/137 с общим сроком 3,5 с и запасной ставкой" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: POST /checkout — session, revalidation, order creation

**Files:**

- Create: `api/src/lib/pgErrors.ts`
- Modify: `api/src/routes/checkout.ts:24-31` (remove local `isUniqueViolation`), imports
- Create: `api/src/lib/ycp/orders.ts`
- Modify: `api/src/routes/ycp/schemas.ts` (append), `api/src/routes/ycp/index.ts`
- Create: `api/src/routes/ycp/checkout.ts`
- Test: `api/src/routes/ycp/checkout.test.ts`

**Interfaces:**

- Consumes: `nextOrderNumber(em)`; `enqueueOrderEvent(em, orderId, 'created')`; `normalizeEmail`; `packCart`; `loadYcpLines`, `normalizeYcpId`, `ycpGoodsTotal`, `ycpPackLines`, `YcpLine` (Task 4); `lookupPickupPoint` (Task 5); `parseYcpOptionId` (Task 6); `AddressSchema`, `checkAddressFor`, `ItemRefSchema`, `optionalText` (Task 6); `ycpWarehouseFromEnv`; `ycpConflict`, `ycpBadRequest`, `YcpError`.
- Produces:
  - `isUniqueViolation(err: unknown): boolean` (`lib/pgErrors.ts`)
  - `interface ActualInventoryItem { id: string; regular_price: number; final_price: number; warehouses: { id: string; available_quantity: number }[] }`
  - `inventoryConflict(items: readonly { id: string; regular_price: number; final_price: number }[], lines: ReadonlyMap<string, YcpLine>, warehouseId: string): { items: ActualInventoryItem[] } | null`
  - `interface YcpOrderAddress`, `interface YcpCheckoutInput`
  - `createYcpOrder(input: YcpCheckoutInput, lines: YcpLine[]): Promise<{ created: Order } | { existing: Order }>`
  - `CreateCheckoutSchema`; `ycpCheckoutRouter: Router` (POST `/`)

- [ ] **Step 1: Write the failing test**

Create `api/src/routes/ycp/checkout.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { createApp } from '../../app.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import {
  applyYcpTestEnv,
  makePickupEntry,
  seedCategory,
  seedYcpProduct,
  ycpAuth,
  ycpCheckoutBody,
} from './testHelpers.js'

const URL = '/api/v1/checkout'

describe('POST /api/v1/checkout', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories, customers RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setPickupPointsForTests(null)
  })

  async function orders(): Promise<Order[]> {
    return AppDataSource.getRepository(Order).find({ relations: { items: true } })
  }

  it('создаёт заказ из Яндекса до ПВЗ: цены Яндекса, доставка из delivery.price, событие created', async () => {
    const reagent = await seedYcpProduct({ slug: 'sernaya-kislota', priceRub: 119, sku: 'H2SO4' })
    await seedCategory('reagents', [reagent])
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([{ id: reagent.id, quantity: 5, regular_price: 119, final_price: 101 }]),
      )
    expect(res.status).toBe(201)
    expect(res.body.order_number).toMatch(/^XM-\d{4}-\d{5}$/)

    const [order] = await orders()
    expect(order).toMatchObject({
      orderNumber: res.body.order_number,
      status: 'pending',
      source: 'ycp',
      paymentProvider: 'ycp',
      externalSessionId: 'sess-0001',
      externalOrderId: null,
      customerName: 'Иван Иванов',
      customerPhone: '+79991234567',
      customerEmail: 'ivan@example.com',
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 595,
      discountRub: 90,
      shippingRub: 350,
      totalRub: 855,
    })
    expect(order.deliveryAddress).toMatchObject({
      address: 'Москва, ул. Тестовая, 1',
      deliveryPointCode: 'MSK1',
      cityCode: 44,
      quote: null,
    })
    expect(order.deliveryAddress.packages).toHaveLength(1)
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({
      productId: reagent.id,
      quantity: 5,
      unitPriceRub: 101,
      lineTotalRub: 505,
      isGift: false,
      productSnapshot: { name: 'Набор юного химика', sku: 'H2SO4', priceRub: 119 },
    })
    const events = await AppDataSource.getRepository(OrderNotification).findBy({
      orderId: order.id,
    })
    expect(events.map((e) => [e.channel, e.eventKey])).toEqual([['sheets', 'created']])
  })

  it('подарок к заказам из Яндекса не добавляется даже от 3000 ₽', async () => {
    const kit = await seedYcpProduct({ priceRub: 3500 })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: kit.id, quantity: 1, regular_price: 3500, final_price: 3500 }]))
    expect(res.status).toBe(201)
    const [order] = await orders()
    expect(order.items).toHaveLength(1)
    expect(order.items.every((i) => !i.isGift)).toBe(true)
  })

  it('курьер: адрес с квартирой, детали подъезда в комментарий, город из id варианта', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }], {
          delivery: {
            delivery_method: 'courier',
            service_type: 'merchant_ship',
            price: 650,
            address: {
              locality: 'Новосибирск',
              address: 'ул. Ленина, 1',
              apartment: '10',
              entrance: '2',
              floor: '3',
              intercom: '12',
            },
            delivery_date_interval: {
              start_interval: { date: '2026-10-15' },
              end_interval: { date: '2026-10-17' },
            },
            ycp_delivery_option_id: 'courier-137-270',
            delivery_notes: 'позвонить заранее',
          },
        }),
      )
    expect(res.status).toBe(201)
    const [order] = await orders()
    expect(order.deliveryMethod).toBe('cdek_courier')
    expect(order.shippingRub).toBe(650)
    expect(order.deliveryAddress).toMatchObject({
      address: 'Новосибирск, ул. Ленина, 1, кв. 10',
      comment: 'позвонить заранее; подъезд 2; этаж 3; домофон 12',
      cityCode: 270,
      deliveryPointCode: null,
    })
  })

  it('связывает заказ с покупателем по подтверждённому email без учёта регистра', async () => {
    const customer = await AppDataSource.getRepository(Customer).save(
      AppDataSource.getRepository(Customer).create({ email: 'ivan@example.com' }),
    )
    const p = await seedYcpProduct()
    await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }], {
          customer: { full_name: 'Иван', phone: '+79991234567', email: 'IVAN@example.com' },
        }),
      )
    const [order] = await orders()
    expect(order.customerId).toBe(customer.id)
    expect(order.placedSignedIn).toBe(false)
  })

  it('подменённая цена — 409 с actual_inventory по цене сервера, заказа нет', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1 }]))
    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: 'Prices or availability changed',
      actual_inventory: {
        items: [
          {
            id: p.id,
            regular_price: 1500,
            final_price: 1500,
            warehouses: [{ id: 'msk-1', available_quantity: 99 }],
          },
        ],
      },
    })
    expect(await orders()).toHaveLength(0)
  })

  it('больше 99 штук — 409, в наличии 99', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: p.id, quantity: 100, regular_price: 1500, final_price: 1500 }]))
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items[0].warehouses).toEqual([
      { id: 'msk-1', available_quantity: 99 },
    ])
  })

  it('нет в наличии — 409 с остатком 0', async () => {
    const p = await seedYcpProduct({ stockStatus: 'out_of_stock' })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }]))
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items[0].warehouses[0].available_quantity).toBe(0)
  })

  it('неизвестный товар — 409 с присланными ценами и остатком 0', async () => {
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ id: 'ghost', quantity: 1, regular_price: 10, final_price: 9 }]))
    expect(res.status).toBe(409)
    expect(res.body.actual_inventory.items).toEqual([
      {
        id: 'ghost',
        regular_price: 10,
        final_price: 9,
        warehouses: [{ id: 'msk-1', available_quantity: 0 }],
      },
    ])
  })

  it('повтор сессии — 409; у отменённой сессии checkout_canceled: true', async () => {
    const p = await seedYcpProduct()
    const send = () =>
      request(app)
        .post(URL)
        .set(ycpAuth)
        .send(ycpCheckoutBody([{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }]))
    expect((await send()).status).toBe(201)
    const again = await send()
    expect(again.status).toBe(409)
    expect(again.body).toEqual({
      error: 'Checkout session already exists',
      checkout_canceled: false,
    })
    await AppDataSource.getRepository(Order).update(
      { externalSessionId: 'sess-0001' },
      { status: 'cancelled' },
    )
    expect((await send()).body.checkout_canceled).toBe(true)
    expect(await orders()).toHaveLength(1)
  })

  it('два одновременных запроса одной сессии — один заказ, второй получает 409', async () => {
    const p = await seedYcpProduct()
    const body = ycpCheckoutBody([
      { id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 },
    ])
    const results = await Promise.all([
      request(app).post(URL).set(ycpAuth).send(body),
      request(app).post(URL).set(ycpAuth).send(body),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await orders()).toHaveLength(1)
  })

  it('самовывоз не поддерживается — 400', async () => {
    const p = await seedYcpProduct()
    const base = ycpCheckoutBody([
      { id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 },
    ])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        ...base,
        delivery: {
          ...(base.delivery as Record<string, unknown>),
          delivery_method: 'self_pickup',
          address: { locality: 'Москва', address: 'ул. Примерная, 1' },
        },
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Self pickup is not supported' })
  })

  it('курьер без locality — 400', async () => {
    const p = await seedYcpProduct()
    const base = ycpCheckoutBody([
      { id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 },
    ])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        ...base,
        delivery: {
          ...(base.delivery as Record<string, unknown>),
          delivery_method: 'courier',
          address: { address: 'ул. Ленина, 1' },
        },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('locality')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w api -- src/routes/ycp/checkout.test.ts`
Expected: FAIL. Most tests get `expected 400 to be 201`: there is no YCP checkout route yet, and the JSON-404 fallback answers. The 400 tests still fail on body mismatch.

- [ ] **Step 3: Move isUniqueViolation**

Create `api/src/lib/pgErrors.ts`:

```ts
// Нарушение уникального индекса Postgres (23505). TypeORM переносит code из
// ошибки драйвера в QueryFailedError.
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}
```

In `api/src/routes/checkout.ts`, delete lines 24-31 (the local `function isUniqueViolation…`). Add `import { isUniqueViolation } from '../lib/pgErrors.js'` after `import { nextOrderNumber } from '../lib/orderNumber.js'`.

Run: `npm test -w api -- src/routes/checkout.test.ts`
Expected: PASS (unchanged behaviour of the public checkout).

- [ ] **Step 4: Order creation lib**

Create `api/src/lib/ycp/orders.ts`:

```ts
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { normalizeEmail } from '../account/emailCodes.js'
import { enqueueOrderEvent } from '../notifications/outbox.js'
import { nextOrderNumber } from '../orderNumber.js'
import { isUniqueViolation } from '../pgErrors.js'
import { packCart } from '../shipping/pack.js'
import { parseYcpOptionId } from './deliveryOptions.js'
import { lookupPickupPoint } from './pickupPoints.js'
import { normalizeYcpId, ycpGoodsTotal, ycpPackLines, type YcpLine } from './pricing.js'

export interface ActualInventoryItem {
  id: string
  regular_price: number
  final_price: number
  warehouses: { id: string; available_quantity: number }[]
}

// Расхождение цены или нехватка остатка — 409 с actual_inventory (спека YCP,
// POST /checkout п. 2). Сверяем целые рубли без допуска: Яндекс присылает ровно
// то, что отдал basket/check, а тот считает тем же loadYcpLines.
export function inventoryConflict(
  items: readonly { id: string; regular_price: number; final_price: number }[],
  lines: ReadonlyMap<string, YcpLine>,
  warehouseId: string,
): { items: ActualInventoryItem[] } | null {
  let changed = false
  const actual = new Map<string, ActualInventoryItem>()
  for (const item of items) {
    const key = normalizeYcpId(item.id)
    const line = lines.get(key)
    if (!line) {
      changed = true
      actual.set(key, {
        id: item.id,
        regular_price: item.regular_price,
        final_price: item.final_price,
        warehouses: [{ id: warehouseId, available_quantity: 0 }],
      })
      continue
    }
    if (
      line.regularPriceRub !== item.regular_price ||
      line.finalPriceRub !== item.final_price ||
      line.quantity > line.availableQuantity
    ) {
      changed = true
    }
    actual.set(key, {
      id: line.product.id,
      regular_price: line.regularPriceRub,
      final_price: line.finalPriceRub,
      warehouses: [{ id: warehouseId, available_quantity: line.availableQuantity }],
    })
  }
  return changed ? { items: [...actual.values()] } : null
}

export interface YcpOrderAddress {
  locality?: string
  address?: string
  apartment?: string
  entrance?: string
  floor?: string
  intercom?: string
  pickup_point_id?: string
}

export interface YcpCheckoutInput {
  session_id: string
  customer: { full_name: string; phone: string; email: string }
  delivery: {
    delivery_method: 'courier' | 'pickup_point'
    price: number
    address: YcpOrderAddress
    ycp_delivery_option_id?: string
    delivery_notes?: string
  }
}

function joinParts(parts: (string | null | undefined)[], separator: string): string | null {
  const joined = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(separator)
  return joined === '' ? null : joined
}

// Заказ из Яндекса: та же структура, что у заказа с сайта, но цены — те, что
// спишет Яндекс (final_price × количество), доставка — delivery.price, подарка
// нет, оплата — у Яндекса (paymentProvider ycp, в Т-Кассу не идёт).
export async function createYcpOrder(
  input: YcpCheckoutInput,
  lines: YcpLine[],
): Promise<{ created: Order } | { existing: Order }> {
  const d = input.delivery
  const a = d.address
  const isPvz = d.delivery_method === 'pickup_point'
  const option = parseYcpOptionId(d.ycp_delivery_option_id)
  const found = isPvz && a.pickup_point_id ? lookupPickupPoint(a.pickup_point_id) : null
  const point = typeof found === 'object' ? found : null
  const subtotalRub = lines.reduce((sum, l) => sum + l.regularPriceRub * l.quantity, 0)
  const goodsRub = ycpGoodsTotal(lines)
  const shippingRub = Math.round(d.price)
  // Тем же правилом, что и публичный чекаут: владелец подтверждённого email.
  // По телефону не связываем — телефон не подтверждён.
  const owner = await AppDataSource.getRepository(Customer).findOneBy({
    email: normalizeEmail(input.customer.email),
  })
  try {
    const created = await AppDataSource.transaction(async (em) => {
      const orderNumber = await nextOrderNumber(em)
      const repo = em.getRepository(Order)
      const order = await repo.save(
        repo.create({
          orderNumber,
          status: 'pending',
          source: 'ycp',
          externalSessionId: input.session_id,
          customerId: owner?.id ?? null,
          placedSignedIn: false,
          customerName: input.customer.full_name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          customerTelegram: null,
          deliveryAddress: {
            address: isPvz
              ? (point?.point.address ??
                joinParts([a.locality, a.address], ', ') ??
                `ПВЗ СДЭК ${a.pickup_point_id}`)
              : (joinParts(
                  [a.locality, a.address, a.apartment ? `кв. ${a.apartment}` : null],
                  ', ',
                ) ?? ''),
            comment: joinParts(
              [
                d.delivery_notes,
                a.entrance ? `подъезд ${a.entrance}` : null,
                a.floor ? `этаж ${a.floor}` : null,
                a.intercom ? `домофон ${a.intercom}` : null,
              ],
              '; ',
            ),
            cityCode: point?.cityCode ?? option?.cityCode ?? null,
            deliveryPointCode: isPvz ? (a.pickup_point_id ?? null) : null,
            postalCode: null,
            // Расчёт делал Яндекс по нашему delivery/options; тариф для СДЭК
            // воркер возьмёт из окружения по способу доставки.
            quote: null,
            packages: packCart(ycpPackLines(lines)),
          },
          deliveryMethod: isPvz ? 'cdek_pvz' : 'cdek_courier',
          subtotalRub,
          discountRub: subtotalRub - goodsRub,
          shippingRub,
          totalRub: goodsRub + shippingRub,
          paymentProvider: 'ycp',
          idempotencyKey: null,
          statusHistory: [],
        }),
      )
      const itemRepo = em.getRepository(OrderItem)
      order.items = await itemRepo.save(
        lines.map((l) =>
          itemRepo.create({
            orderId: order.id,
            productId: l.product.id,
            productSnapshot: {
              name: l.product.name,
              sku: l.product.sku,
              priceRub: l.product.priceRub,
            },
            quantity: l.quantity,
            unitPriceRub: l.finalPriceRub,
            lineTotalRub: l.finalPriceRub * l.quantity,
          }),
        ),
      )
      await enqueueOrderEvent(em, order.id, 'created')
      return order
    })
    return { created }
  } catch (err) {
    // Два одновременных /checkout одной сессии: проигравший гонку за
    // уникальный индекс отвечает 409, как на обычный повтор.
    if (!isUniqueViolation(err)) throw err
    const existing = await AppDataSource.getRepository(Order).findOneBy({
      externalSessionId: input.session_id,
    })
    if (!existing) throw err
    return { existing }
  }
}
```

- [ ] **Step 5: Schema and route**

Append to `api/src/routes/ycp/schemas.ts`:

```ts
const PricedItemSchema = ItemRefSchema.extend({
  regular_price: z.number().int().min(0),
  final_price: z.number().int().min(0),
})

const IntervalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().max(16).optional(),
})

export const CreateCheckoutSchema = z.object({
  session_id: z.string().trim().min(1).max(64),
  warehouse_id: z.string().trim().min(1).max(64),
  items: z.array(PricedItemSchema).min(1).max(100),
  customer: z.object({
    full_name: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(5).max(64),
    email: z.string().trim().email().max(255),
  }),
  delivery: z
    .object({
      delivery_method: z.enum(['courier', 'pickup_point', 'self_pickup']),
      service_type: z.string().trim().max(32),
      service_display_name: optionalText(255),
      price: z.number().min(0).max(1_000_000),
      address: AddressSchema,
      // time_zone обязателен по схеме, но в примерах Яндекса его нет.
      delivery_date_interval: z.object({
        start_interval: IntervalSchema,
        end_interval: IntervalSchema,
        time_zone: z.number().int().optional(),
      }),
      ycp_delivery_option_id: optionalText(64),
      delivery_notes: optionalText(1000),
    })
    .superRefine((v, ctx) =>
      checkAddressFor(v.delivery_method, v.address, (path, message) =>
        ctx.addIssue({ code: 'custom', path, message }),
      ),
    ),
})
```

(`optionalText`, `AddressSchema`, `checkAddressFor` and `ItemRefSchema` are defined earlier in the same file by Tasks 4 and 6.)

Create `api/src/routes/ycp/checkout.ts`:

```ts
import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { ycpWarehouseFromEnv } from '../../lib/ycp/config.js'
import { createYcpOrder, inventoryConflict } from '../../lib/ycp/orders.js'
import { loadYcpLines } from '../../lib/ycp/pricing.js'
import { YcpError, ycpBadRequest, ycpConflict } from './errors.js'
import { CreateCheckoutSchema } from './schemas.js'

export const ycpCheckoutRouter: Router = Router()

function sessionConflict(order: Order): YcpError {
  return ycpConflict('Checkout session already exists', {
    checkout_canceled: order.status === 'cancelled',
  })
}

// Сессия оформления (спека YCP, POST /checkout): повтор сессии — 409, затем
// перепроверка цен и наличия, затем заказ. Внешних вызовов нет.
ycpCheckoutRouter.post('/', async (req, res, next) => {
  try {
    const body = CreateCheckoutSchema.parse(req.body)
    const method = body.delivery.delivery_method
    if (method === 'self_pickup') throw ycpBadRequest('Self pickup is not supported')
    const warehouse = ycpWarehouseFromEnv()
    if (!warehouse) throw new YcpError(500, 'Warehouse is not configured')
    const existing = await AppDataSource.getRepository(Order).findOneBy({
      externalSessionId: body.session_id,
    })
    if (existing) throw sessionConflict(existing)
    const lines = await loadYcpLines(body.items)
    const actual = inventoryConflict(body.items, lines, warehouse.id)
    if (actual) throw ycpConflict('Prices or availability changed', { actual_inventory: actual })
    const result = await createYcpOrder(
      { ...body, delivery: { ...body.delivery, delivery_method: method } },
      [...lines.values()],
    )
    if ('existing' in result) throw sessionConflict(result.existing)
    res.status(201).json({ order_number: result.created.orderNumber })
  } catch (err) {
    next(err)
  }
})
```

In `api/src/routes/ycp/index.ts`, add `import { ycpCheckoutRouter } from './checkout.js'` and, after the `/checkout/delivery` line, `router.use('/checkout', ycpCheckoutRouter)`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/ycp/ src/routes/checkout.test.ts`
Expected: PASS. `checkout.test.ts` (ycp) has 12 tests, and the public checkout suite is unchanged.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/pgErrors.ts api/src/routes/checkout.ts api/src/lib/ycp/orders.ts api/src/routes/ycp/
git commit -m "feat(ycp): POST /checkout — сессия Яндекса, перепроверка цен (409 actual_inventory), заказ без подарка" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Manager alerts in Telegram (outbox events)

**Files:**

- Modify: `shared/src/types/notifications.ts:4-9`
- Modify: `api/src/lib/notifications/outbox.ts:8-22`
- Modify: `api/src/lib/notifications/format.ts` (append)
- Modify: `api/src/lib/notifications/worker.ts:7-8, 85-90`
- Modify: `web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx:14-20`
- Test: `api/src/lib/notifications/managerAlerts.test.ts`, `api/src/lib/notifications/worker.test.ts` (add one test)

**Interfaces:**

- Consumes: `escapeHtml`, `NotifiableOrder` (format.ts); worker test helpers `seedOrder`, `enqueue`, `fakeChannels`, `NOW`, `minutesAgo` (`worker.test.ts` module scope).
- Produces: `OrderEventKey` adds `'ycp:on_delivery' | 'ycp:cancel_after_ship'`; `MANAGER_ALERT_EVENTS: readonly OrderEventKey[]`; `isManagerAlert(eventKey: OrderEventKey): boolean`; `type ManagerAlertOrder`; `managerAlertText(order: ManagerAlertOrder, eventKey: OrderEventKey): string`.

- [ ] **Step 1: Write the failing tests**

Create `api/src/lib/notifications/managerAlerts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { channelsForEvent, isManagerAlert } from './outbox.js'
import { managerAlertText } from './format.js'

const order = {
  orderNumber: 'XM-2026-00042',
  customerName: 'Иван <script>',
  customerPhone: '+79991234567',
  totalRub: 1850,
  externalOrderId: 'ya-order-1',
}

describe('сигналы менеджеру по заказам из Яндекса', () => {
  it('уходят только в Telegram', () => {
    expect(channelsForEvent('ycp:on_delivery')).toEqual(['telegram'])
    expect(channelsForEvent('ycp:cancel_after_ship')).toEqual(['telegram'])
    expect(isManagerAlert('ycp:on_delivery')).toBe(true)
    expect(isManagerAlert('status:paid')).toBe(false)
    expect(channelsForEvent('status:paid')).toEqual(['sheets', 'telegram'])
  })

  it('оплата при получении: что случилось и что делать', () => {
    const text = managerAlertText(order, 'ycp:on_delivery')
    expect(text).toContain('XM-2026-00042')
    expect(text).toContain('оплатой при получении')
    expect(text).toContain('ya-order-1')
    expect(text).toContain('Иван &lt;script&gt;')
  })

  it('отмена после отправки: отменить в СДЭК и проверить возврат', () => {
    const text = managerAlertText({ ...order, externalOrderId: null }, 'ycp:cancel_after_ship')
    expect(text).toContain('отправка в СДЭК уже создана')
    expect(text).toContain('возврат')
    expect(text).not.toContain('Заказ в Яндексе')
  })
})
```

In `api/src/lib/notifications/worker.test.ts`, inside `describe('processDueNotifications', …)`, after the test `'status:paid: строка в таблицу, карточка в чат, id карточки сохраняется'`, add:

```ts
it('сигнал менеджеру по заказу из Яндекса — отдельное сообщение в чат, без таблицы', async () => {
  const order = await seedOrder({
    source: 'ycp',
    paymentProvider: 'ycp',
    externalOrderId: 'ya-order-1',
    telegramMessageId: 777,
  })
  await enqueue(order.id, 'ycp:on_delivery', minutesAgo(1))
  const channels = fakeChannels()

  const result = await processDueNotifications(channels, { now: NOW })

  expect(result).toEqual({ sent: 1, retried: 0, failed: 0 })
  expect(channels.sheets.upsertOrderRow).not.toHaveBeenCalled()
  const [text, replyTo] = channels.telegram.sendMessage.mock.calls[0]
  expect(text).toContain(order.orderNumber)
  expect(text).toContain('оплатой при получении')
  expect(replyTo).toBeUndefined()
  // Карточка заказа уже была — сигнал её id не перезаписывает.
  const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
  expect(saved.telegramMessageId).toBe(777)
})
```

Run: `npm test -w api -- src/lib/notifications/managerAlerts.test.ts src/lib/notifications/worker.test.ts`
Expected: FAIL. `isManagerAlert is not a function`; the worker test fails with `sent: 0, failed: 1` (the worker rejects non-paid telegram rows).

- [ ] **Step 2: Implement**

In `shared/src/types/notifications.ts`, replace `OrderEventKey` with:

```ts
export type OrderEventKey =
  | 'created'
  | 'status:paid'
  | 'status:shipped'
  | 'status:cancelled'
  | 'status:failed'
  // Сигналы менеджеру по заказам из Яндекса (YCP): оплата при получении и
  // отмена заказа, уже отправленного в СДЭК.
  | 'ycp:on_delivery'
  | 'ycp:cancel_after_ship'
```

In `api/src/lib/notifications/outbox.ts`, replace `channelsForEvent` (lines 20-22) with:

```ts
// Сигналы менеджеру — отдельные сообщения в рабочий чат, не карточка заказа
// и не строка таблицы (заказы из Яндекса, docs/superpowers/specs/2026-10-11-ycp-integration-design.md).
export const MANAGER_ALERT_EVENTS: readonly OrderEventKey[] = [
  'ycp:on_delivery',
  'ycp:cancel_after_ship',
]

export function isManagerAlert(eventKey: OrderEventKey): boolean {
  return MANAGER_ALERT_EVENTS.includes(eventKey)
}

export function channelsForEvent(eventKey: OrderEventKey): NotificationChannel[] {
  if (isManagerAlert(eventKey)) return ['telegram']
  return eventKey === TELEGRAM_EVENT ? CHANNELS : ['sheets']
}
```

Append to `api/src/lib/notifications/format.ts`:

```ts
export type ManagerAlertOrder = Pick<
  NotifiableOrder,
  'orderNumber' | 'customerName' | 'customerPhone' | 'totalRub'
> & { externalOrderId: string | null }

// Сигнал менеджеру по заказу из Яндекса: что случилось и что сделать руками.
export function managerAlertText(order: ManagerAlertOrder, eventKey: OrderEventKey): string {
  const reason =
    eventKey === 'ycp:on_delivery'
      ? 'Яндекс прислал заказ с оплатой при получении. Такие заказы не поддерживаются: заказ не оплачен и в СДЭК не отправлен. Свяжитесь с покупателем.'
      : 'Яндекс отменил заказ, а отправка в СДЭК уже создана. Отмените её в СДЭК вручную и проверьте возврат денег покупателю.'
  return [
    `<b>Внимание: заказ ${escapeHtml(order.orderNumber)} из Яндекса</b>`,
    escapeHtml(reason),
    `Покупатель: ${escapeHtml(order.customerName)}, ${escapeHtml(order.customerPhone)}`,
    `Сумма: ${rub(order.totalRub)}`,
    order.externalOrderId ? `Заказ в Яндексе: ${escapeHtml(order.externalOrderId)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
```

and change the first import line of `format.ts` to `import type { DeliveryAddress, OrderEventKey, OrderStatus } from '@ximi4ka-shop/shared'`.

In `api/src/lib/notifications/worker.ts`, change the imports to:

```ts
import { managerAlertText, sheetRow, telegramCard } from './format.js'
import { CHANNELS, TELEGRAM_EVENT, isManagerAlert } from './outbox.js'
```

In `deliver()`, right after `const bot = channels.telegram!`, insert:

```ts
if (isManagerAlert(row.eventKey)) {
  // Сигнал менеджеру — отдельное сообщение, не карточка: id не сохраняем.
  await bot.sendMessage(managerAlertText(order, row.eventKey))
  return {}
}
```

In `web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx`, add to `EVENT_LABELS`:

```ts
  'ycp:on_delivery': 'Яндекс: оплата при получении',
  'ycp:cancel_after_ship': 'Яндекс: отмена после отправки',
```

- [ ] **Step 3: Run the tests to see them pass**

Run: `npm test -w api -- src/lib/notifications/` then `npm run typecheck`
Expected: PASS (all notification tests, including 3 new ones and 1 new worker test); typecheck exits 0.

- [ ] **Step 4: Commit**

```bash
git add shared/src/types/notifications.ts api/src/lib/notifications/ "web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx"
git commit -m "feat(ycp): сигналы менеджеру в Telegram — оплата при получении и отмена после отправки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: POST /checkout/placed — locked transition to paid

**Files:**

- Modify: `api/src/lib/notifications/outbox.ts:54-74` (split `saveOrderWithStatusEvent`)
- Modify: `api/src/lib/ycp/orders.ts` (append)
- Modify: `api/src/lib/payments/reconcile.ts:33`
- Modify: `api/src/routes/ycp/schemas.ts` (append), `api/src/routes/ycp/checkout.ts` (append route), `api/src/routes/ycp/testHelpers.ts` (append)
- Test: `api/src/routes/ycp/placed.test.ts`, `api/src/lib/payments/reconcile.test.ts` (add one test)

**Interfaces:**

- Consumes: `enqueueOrderEvent`, `enqueueCdekShipment` (via outbox), `'ycp:on_delivery'` (Task 8), `createYcpOrder` flow (Task 7).
- Produces:
  - `writeOrderStatusEvent(em: EntityManager, order: Order, previousStatus: OrderStatus): Promise<void>` (outbox); `saveOrderWithStatusEvent` keeps its signature.
  - `withLockedOrder<T>(where: FindOptionsWhere<Order>, fn: (em: EntityManager, order: Order | null) => Promise<T>): Promise<T>` (exported for Task 10)
  - `type YcpPlacedOutcome = 'paid' | 'already_paid' | 'on_delivery' | 'cancelled' | 'not_found'`; `interface YcpPlacedInput`; `markYcpOrderPlaced(input: YcpPlacedInput, now?: Date): Promise<YcpPlacedOutcome>`
  - `appendYcpHistory(order: Order, to: OrderStatus, now: Date, comment: string): void`
  - `CheckoutPlacedSchema`; test helper `createYcpCheckout(app: Express, sessionId: string): Promise<Order>`

- [ ] **Step 1: Write the failing tests**

Append to `api/src/routes/ycp/testHelpers.ts`. Add to the imports at the top:

```ts
import request from 'supertest'
import type { Express } from 'express'
import { Order } from '../../entities/Order.js'
```

and at the end:

```ts
// Заказ из Яндекса через настоящий POST /api/v1/checkout — для тестов placed и
// отмен. Окружение YCP тест подменяет сам до вызова.
export async function createYcpCheckout(app: Express, sessionId: string): Promise<Order> {
  const product = await seedYcpProduct()
  const res = await request(app)
    .post('/api/v1/checkout')
    .set(ycpAuth)
    .send(
      ycpCheckoutBody(
        [
          {
            id: product.id,
            quantity: 1,
            regular_price: product.priceRub,
            final_price: product.priceRub,
          },
        ],
        { session_id: sessionId },
      ),
    )
  if (res.status !== 201) {
    throw new Error(`createYcpCheckout: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return AppDataSource.getRepository(Order).findOneByOrFail({ externalSessionId: sessionId })
}
```

Create `api/src/routes/ycp/placed.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, createYcpCheckout, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/placed'

function placed(sessionId: string, extra: Record<string, unknown> = {}) {
  return {
    session_id: sessionId,
    order_id: 'ya-order-1',
    order_number: 1234,
    payment_method: 'online',
    online_payment_method: 'split',
    acquiring_id: 'acq-1',
    ...extra,
  }
}

describe('POST /api/v1/checkout/placed', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, cdek_shipments RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const reload = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })
  const events = (orderId: string) =>
    AppDataSource.getRepository(OrderNotification).findBy({ orderId })
  const shipments = (orderId: string) =>
    AppDataSource.getRepository(CdekShipment).countBy({ orderId })

  it('онлайн-оплата: заказ оплачен, событие paid в таблицу и чат, отправка в очередь СДЭК', async () => {
    const order = await createYcpCheckout(app, 'sess-1')
    const res = await request(app).post(URL).set(ycpAuth).send(placed('sess-1'))
    expect(res.status).toBe(200)
    expect(res.text).toBe('')
    const fresh = await reload(order.id)
    expect(fresh).toMatchObject({
      status: 'paid',
      paymentIntentId: 'acq-1',
      externalOrderId: 'ya-order-1',
    })
    expect(fresh.paidAt).not.toBeNull()
    expect(fresh.statusHistory).toEqual([
      expect.objectContaining({
        from: 'pending',
        to: 'paid',
        by: 'ycp',
        comment: 'Оплата в Яндексе: split',
      }),
    ])
    expect(
      (await events(order.id))
        .filter((e) => e.eventKey === 'status:paid')
        .map((e) => e.channel)
        .sort(),
    ).toEqual(['sheets', 'telegram'])
    expect(await shipments(order.id)).toBe(1)
  })

  it('устаревшие query-параметры вместо тела тоже принимаются', async () => {
    const order = await createYcpCheckout(app, 'sess-q')
    const res = await request(app)
      .post(`${URL}?session_id=sess-q&order_id=ya-order-q&payment_method=online`)
      .set(ycpAuth)
      .send({})
    expect(res.status).toBe(200)
    expect((await reload(order.id)).status).toBe('paid')
  })

  it('повтор для оплаченного заказа — 200 без побочных эффектов', async () => {
    const order = await createYcpCheckout(app, 'sess-2')
    await request(app).post(URL).set(ycpAuth).send(placed('sess-2'))
    const again = await request(app).post(URL).set(ycpAuth).send(placed('sess-2'))
    expect(again.status).toBe(200)
    expect((await reload(order.id)).statusHistory).toHaveLength(1)
    expect(await shipments(order.id)).toBe(1)
  })

  it('два одновременных вызова — одна запись истории, одна пара событий, одна отправка', async () => {
    const order = await createYcpCheckout(app, 'sess-3')
    const results = await Promise.all([
      request(app).post(URL).set(ycpAuth).send(placed('sess-3')),
      request(app).post(URL).set(ycpAuth).send(placed('sess-3')),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect((await reload(order.id)).statusHistory).toHaveLength(1)
    expect((await events(order.id)).filter((e) => e.eventKey === 'status:paid')).toHaveLength(2)
    expect(await shipments(order.id)).toBe(1)
  })

  it('до /checkout (сессии нет) — 404, Яндекс повторит', async () => {
    const res = await request(app).post(URL).set(ycpAuth).send(placed('sess-unknown'))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Order not found' })
  })

  it('отменённый заказ — 409, статус не меняется', async () => {
    const order = await createYcpCheckout(app, 'sess-4')
    await AppDataSource.getRepository(Order).update(order.id, { status: 'cancelled' })
    const res = await request(app).post(URL).set(ycpAuth).send(placed('sess-4'))
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Order already cancelled' })
    expect((await reload(order.id)).status).toBe('cancelled')
  })

  it('оплата при получении — 409, заказ не оплачен, один сигнал менеджеру', async () => {
    const order = await createYcpCheckout(app, 'sess-5')
    const body = placed('sess-5', {
      payment_method: 'on_delivery',
      online_payment_method: undefined,
      acquiring_id: undefined,
    })
    const res = await request(app).post(URL).set(ycpAuth).send(body)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Payment on delivery is not supported' })
    await request(app).post(URL).set(ycpAuth).send(body)
    const fresh = await reload(order.id)
    expect(fresh.status).toBe('pending')
    expect(fresh.externalOrderId).toBe('ya-order-1')
    expect(
      (await events(order.id))
        .filter((e) => e.eventKey === 'ycp:on_delivery')
        .map((e) => e.channel),
    ).toEqual(['telegram'])
    expect(await shipments(order.id)).toBe(0)
  })

  it('неизвестный payment_method — 400', async () => {
    await createYcpCheckout(app, 'sess-6')
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(placed('sess-6', { payment_method: 'cash' }))
    expect(res.status).toBe(400)
  })
})
```

In `api/src/lib/payments/reconcile.test.ts`, inside `describe('reconcilePendingOrders', …)`, add:

```ts
it('не трогает заказы из Яндекса: деньги принял Яндекс, а не Т-Касса', async () => {
  const ycp = await seedOrder({ paymentProvider: 'ycp', source: 'ycp', paymentIntentId: 'acq-1' })
  await ageOrder(ycp.id, 5)
  const provider = fakeProvider('failed')

  const result = await reconcilePendingOrders(provider)

  expect(result).toEqual({ checked: 0, updated: 0 })
  expect(provider.calls).toEqual([])
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w api -- src/routes/ycp/placed.test.ts src/lib/payments/reconcile.test.ts`
Expected: FAIL. placed gets `expected 404 to be 200`, because `/placed` is unrouted and `ycpCheckoutRouter` has no such path. reconcile gets `expected { checked: 1, updated: 1 } to deeply equal { checked: 0, updated: 0 }`.

- [ ] **Step 3: Split the status write in outbox.ts**

Replace `saveOrderWithStatusEvent` in `api/src/lib/notifications/outbox.ts` (lines 47-74, the comment included) with:

```ts
// Пишет смену статуса заказа и, если статус изменился, ставит событие и, при
// оплате, заказ в очередь СДЭК — внутри переданной транзакции. Пишем только
// колонки, которые эти вызовы меняют (status, paid_at, status_history и
// привязку платежа), а не всю сущность: save() записал бы и устаревший
// telegram_message_id из памяти поверх id карточки, который обработчик
// очереди успел сохранить, пока шли сетевые вызовы.
export async function writeOrderStatusEvent(
  em: EntityManager,
  order: Order,
  previousStatus: OrderStatus,
): Promise<void> {
  await em.update(Order, order.id, {
    status: order.status,
    paidAt: order.paidAt,
    statusHistory: order.statusHistory,
    // Привязку платежа никто не снимает — null из памяти не пишем.
    ...(order.paymentIntentId ? { paymentIntentId: order.paymentIntentId } : {}),
  })
  const key = order.status === previousStatus ? null : statusEventKey(order.status)
  if (key) await enqueueOrderEvent(em, order.id, key)
  // Оплаченный заказ — в очередь создания в СДЭК, той же транзакцией.
  if (order.status === 'paid' && previousStatus !== 'paid') {
    await enqueueCdekShipment(em, order)
  }
}

// То же в своей транзакции — для вебхука Т-Кассы, сверки и ручной смены
// статуса в админке.
export async function saveOrderWithStatusEvent(
  order: Order,
  previousStatus: OrderStatus,
): Promise<Order> {
  return AppDataSource.transaction(async (em) => {
    await writeOrderStatusEvent(em, order, previousStatus)
    return order
  })
}
```

Run: `npm test -w api -- src/lib/notifications/outbox.test.ts src/routes/tbank-webhook.test.ts`
Expected: PASS (behaviour unchanged).

- [ ] **Step 4: Locked placed transition, reconcile filter**

Append to `api/src/lib/ycp/orders.ts`, and add to its imports `import type { EntityManager, FindOptionsWhere } from 'typeorm'`, `import type { OrderStatus } from '@ximi4ka-shop/shared'`, and change the outbox import to `import { enqueueOrderEvent, writeOrderStatusEvent } from '../notifications/outbox.js'`:

```ts
// Заказ под блокировкой строки (SELECT … FOR UPDATE): два одновременных вызова
// Яндекса для одного заказа выполняются по очереди, и второй видит уже
// изменённый статус — событие и отправка в СДЭК не двоятся.
export async function withLockedOrder<T>(
  where: FindOptionsWhere<Order>,
  fn: (em: EntityManager, order: Order | null) => Promise<T>,
): Promise<T> {
  return AppDataSource.transaction(async (em) => {
    const order = await em
      .getRepository(Order)
      .findOne({ where, lock: { mode: 'pessimistic_write' } })
    return fn(em, order)
  })
}

export function appendYcpHistory(order: Order, to: OrderStatus, now: Date, comment: string): void {
  order.statusHistory = [
    ...(order.statusHistory ?? []),
    { from: order.status, to, at: now.toISOString(), by: 'ycp', comment },
  ]
  order.status = to
}

export type YcpPlacedOutcome = 'paid' | 'already_paid' | 'on_delivery' | 'cancelled' | 'not_found'

export interface YcpPlacedInput {
  sessionId: string
  orderId: string
  paymentMethod: 'online' | 'on_delivery'
  onlinePaymentMethod: string | null
  acquiringId: string | null
}

// Яндекс сообщил, что заказ оформлен (спека YCP, POST /checkout/placed).
// online — деньги уже у Яндекса: paid тем же путём, что вебхук Т-Кассы
// (событие, карточка в чат, очередь СДЭК). on_delivery не поддерживаем:
// заказ остаётся неоплаченным, менеджеру — сигнал.
export async function markYcpOrderPlaced(
  input: YcpPlacedInput,
  now: Date = new Date(),
): Promise<YcpPlacedOutcome> {
  return withLockedOrder({ externalSessionId: input.sessionId }, async (em, order) => {
    if (!order) return 'not_found'
    if (order.status === 'cancelled') return 'cancelled'
    if (order.status === 'paid' || order.status === 'shipped') return 'already_paid'
    await em.update(Order, order.id, { externalOrderId: input.orderId })
    if (input.paymentMethod === 'on_delivery') {
      await enqueueOrderEvent(em, order.id, 'ycp:on_delivery')
      return 'on_delivery'
    }
    const previous = order.status
    order.paidAt = order.paidAt ?? now
    order.paymentIntentId = input.acquiringId ?? order.paymentIntentId
    appendYcpHistory(
      order,
      'paid',
      now,
      input.onlinePaymentMethod
        ? `Оплата в Яндексе: ${input.onlinePaymentMethod}`
        : 'Оплата в Яндексе',
    )
    await writeOrderStatusEvent(em, order, previous)
    return 'paid'
  })
}
```

In `api/src/lib/payments/reconcile.ts`, after `.andWhere('o.payment_intent_id IS NOT NULL')`, add:

```ts
    // Заказы из Яндекса оплачены у Яндекса: Т-Касса о них не знает.
    .andWhere("o.payment_provider <> 'ycp'")
```

- [ ] **Step 5: Schema and route**

Append to `api/src/routes/ycp/schemas.ts`:

```ts
// Тело — контракт; query-параметры устарели, но обязательны по схеме, поэтому
// принимаем оба источника (тело важнее).
export const CheckoutPlacedSchema = z.object({
  session_id: z.string().trim().min(1).max(64),
  order_id: z.string().trim().min(1).max(64),
  order_number: z.coerce.number().int().optional(),
  payment_method: z.enum(['online', 'on_delivery']),
  online_payment_method: z.enum(['card', 'sbp', 'split', 'split_sbp']).optional(),
  acquiring_id: z.string().trim().max(255).optional(),
})
```

In `api/src/routes/ycp/checkout.ts`, extend the imports. Use `import { createYcpOrder, inventoryConflict, markYcpOrderPlaced } from '../../lib/ycp/orders.js'`, `import { YcpError, ycpBadRequest, ycpConflict, ycpNotFound } from './errors.js'` and `import { CheckoutPlacedSchema, CreateCheckoutSchema } from './schemas.js'`. Then append:

```ts
ycpCheckoutRouter.post('/placed', async (req, res, next) => {
  try {
    const body = CheckoutPlacedSchema.parse({
      ...req.query,
      ...(typeof req.body === 'object' && req.body !== null ? req.body : {}),
    })
    const outcome = await markYcpOrderPlaced({
      sessionId: body.session_id,
      orderId: body.order_id,
      paymentMethod: body.payment_method,
      onlinePaymentMethod: body.online_payment_method ?? null,
      acquiringId: body.acquiring_id ?? null,
    })
    if (outcome === 'not_found') throw ycpNotFound('Order not found')
    if (outcome === 'cancelled') throw ycpConflict('Order already cancelled')
    if (outcome === 'on_delivery') throw ycpConflict('Payment on delivery is not supported')
    res.status(200).end()
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/ycp/ src/lib/payments/ src/lib/notifications/ src/routes/tbank-webhook.test.ts`
Expected: PASS. `placed.test.ts` has 8 tests, and reconcile has +1.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/notifications/outbox.ts api/src/lib/ycp/orders.ts api/src/lib/payments/reconcile.ts api/src/lib/payments/reconcile.test.ts api/src/routes/ycp/
git commit -m "feat(ycp): checkout/placed — оплата Яндекса переводит заказ в paid под блокировкой строки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: POST /checkout/cancel and POST /order/cancel

**Files:**

- Modify: `api/src/lib/ycp/orders.ts` (append)
- Modify: `api/src/routes/ycp/schemas.ts` (append), `api/src/routes/ycp/checkout.ts` (append), `api/src/routes/ycp/index.ts`
- Create: `api/src/routes/ycp/orders.ts`
- Test: `api/src/routes/ycp/cancel.test.ts`

**Interfaces:**

- Consumes: `withLockedOrder`, `appendYcpHistory`, `writeOrderStatusEvent`, `enqueueOrderEvent(em, id, 'ycp:cancel_after_ship')`, `CdekShipment` entity, `createYcpCheckout` test helper.
- Produces: `isShipmentStarted(s: Pick<CdekShipment,'state'|'cdekUuid'|'submittedAt'> | null): boolean`; `cancelYcpSession(sessionId: string, now?: Date): Promise<'not_found' | 'cancelled' | 'unchanged'>`; `cancelYcpOrder(externalOrderId: string, now?: Date): Promise<'not_found' | 'cancelled' | 'cancelled_after_ship' | 'unchanged'>`; `SessionQuerySchema`, `OrderQuerySchema`; `ycpOrdersRouter: Router`.

- [ ] **Step 1: Write the failing test**

Create `api/src/routes/ycp/cancel.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, createYcpCheckout, ycpAuth } from './testHelpers.js'

describe('отмены из Яндекса', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, cdek_shipments RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const reload = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })
  const alerts = async (orderId: string) =>
    (await AppDataSource.getRepository(OrderNotification).findBy({ orderId })).filter(
      (e) => e.eventKey === 'ycp:cancel_after_ship',
    )

  async function paidOrder(sessionId: string): Promise<Order> {
    const order = await createYcpCheckout(app, sessionId)
    const res = await request(app)
      .post('/api/v1/checkout/placed')
      .set(ycpAuth)
      .send({
        session_id: sessionId,
        order_id: `ya-${sessionId}`,
        order_number: 1,
        payment_method: 'online',
        acquiring_id: 'acq-1',
      })
    expect(res.status).toBe(200)
    return reload(order.id)
  }

  describe('POST /api/v1/checkout/cancel', () => {
    it('неоплаченная сессия отменяется, событие cancelled в таблицу', async () => {
      const order = await createYcpCheckout(app, 'sess-c1')
      const res = await request(app).post('/api/v1/checkout/cancel?session_id=sess-c1').set(ycpAuth)
      expect(res.status).toBe(200)
      expect(res.text).toBe('')
      const fresh = await reload(order.id)
      expect(fresh.status).toBe('cancelled')
      expect(fresh.statusHistory.at(-1)).toMatchObject({ to: 'cancelled', by: 'ycp' })
      const keys = (
        await AppDataSource.getRepository(OrderNotification).findBy({ orderId: order.id })
      ).map((e) => e.eventKey)
      expect(keys).toContain('status:cancelled')
    })

    it('оплаченный заказ не меняется — 200', async () => {
      const order = await paidOrder('sess-c2')
      const res = await request(app).post('/api/v1/checkout/cancel?session_id=sess-c2').set(ycpAuth)
      expect(res.status).toBe(200)
      expect((await reload(order.id)).status).toBe('paid')
    })

    it('нет сессии — 404; нет session_id — 400', async () => {
      const missing = await request(app)
        .post('/api/v1/checkout/cancel?session_id=nope')
        .set(ycpAuth)
      expect(missing.status).toBe(404)
      expect(missing.body).toEqual({ error: 'Session not found' })
      const bad = await request(app).post('/api/v1/checkout/cancel').set(ycpAuth)
      expect(bad.status).toBe(400)
    })
  })

  describe('POST /api/v1/order/cancel', () => {
    it('оплаченный заказ без отправки в СДЭК — отменён, сигнала нет', async () => {
      const order = await paidOrder('sess-o1')
      const res = await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o1').set(ycpAuth)
      expect(res.status).toBe(200)
      expect(res.text).toBe('')
      expect((await reload(order.id)).status).toBe('cancelled')
      expect(await alerts(order.id)).toHaveLength(0)
    })

    it('отправка в СДЭК уже создана — заказ отменён, менеджеру сигнал (один на повторы)', async () => {
      const order = await paidOrder('sess-o2')
      await AppDataSource.getRepository(CdekShipment).update(
        { orderId: order.id },
        { state: 'created', cdekUuid: '11111111-1111-4111-8111-111111111111', cdekNumber: '1000' },
      )
      const url = '/api/v1/order/cancel?order_id=ya-sess-o2'
      expect((await request(app).post(url).set(ycpAuth)).status).toBe(200)
      expect((await request(app).post(url).set(ycpAuth)).status).toBe(200)
      expect((await reload(order.id)).status).toBe('cancelled')
      expect((await alerts(order.id)).map((a) => a.channel)).toEqual(['telegram'])
    })

    it('отправка ещё в очереди — сигнала нет: обработчик СДЭК отменённый заказ не отправит', async () => {
      const order = await paidOrder('sess-o3')
      await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o3').set(ycpAuth)
      expect(await alerts(order.id)).toHaveLength(0)
    })

    it('заказ уже отправлен (shipped) — отменён с сигналом', async () => {
      const order = await paidOrder('sess-o4')
      await AppDataSource.getRepository(Order).update(order.id, { status: 'shipped' })
      await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o4').set(ycpAuth)
      expect((await reload(order.id)).status).toBe('cancelled')
      expect(await alerts(order.id)).toHaveLength(1)
    })

    it('неизвестный order_id — 404', async () => {
      const res = await request(app).post('/api/v1/order/cancel?order_id=nope').set(ycpAuth)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Order not found' })
    })

    it('после отмены placed отвечает 409', async () => {
      await paidOrder('sess-o5')
      await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o5').set(ycpAuth)
      const res = await request(app).post('/api/v1/checkout/placed').set(ycpAuth).send({
        session_id: 'sess-o5',
        order_id: 'ya-sess-o5',
        order_number: 1,
        payment_method: 'online',
      })
      expect(res.status).toBe(409)
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -w api -- src/routes/ycp/cancel.test.ts`
Expected: FAIL. The first test gets `expected 404 to be 200`.

- [ ] **Step 3: Implement**

Append to `api/src/lib/ycp/orders.ts`, and add `import { CdekShipment } from '../../entities/CdekShipment.js'` to its imports:

```ts
// Отправка в СДЭК начата: заказ уже ушёл в СДЭК или мог уйти (POST был).
// Очередь queued без попытки отправки ещё не начата — обработчик отменённый
// заказ не отправит (lib/cdek/worker.ts, PAID_STATUSES).
export function isShipmentStarted(
  s: Pick<CdekShipment, 'state' | 'cdekUuid' | 'submittedAt'> | null,
): boolean {
  if (!s) return false
  return (
    s.state === 'registering' ||
    s.state === 'created' ||
    s.cdekUuid !== null ||
    s.submittedAt !== null
  )
}

// Сессия не завершена (час прошёл или покупатель вернулся в корзину). Резерва
// нет — снимать нечего; оплаченный заказ не трогаем.
export async function cancelYcpSession(
  sessionId: string,
  now: Date = new Date(),
): Promise<'not_found' | 'cancelled' | 'unchanged'> {
  return withLockedOrder({ externalSessionId: sessionId }, async (em, order) => {
    if (!order) return 'not_found'
    if (order.status !== 'pending') return 'unchanged'
    const previous = order.status
    appendYcpHistory(order, 'cancelled', now, 'Сессия оформления в Яндексе отменена')
    await writeOrderStatusEvent(em, order, previous)
    return 'cancelled'
  })
}

// Яндекс отменил оформленный заказ. Отменяем в базе всегда; если отправка в
// СДЭК начата или заказ отправлен — менеджеру сигнал: отмена в СДЭК и возврат
// денег — руками (автовозврата нет, порядок возврата у Яндекса не описан).
export async function cancelYcpOrder(
  externalOrderId: string,
  now: Date = new Date(),
): Promise<'not_found' | 'cancelled' | 'cancelled_after_ship' | 'unchanged'> {
  return withLockedOrder({ externalOrderId }, async (em, order) => {
    if (!order) return 'not_found'
    if (order.status === 'cancelled') return 'unchanged'
    const shipment = await em.getRepository(CdekShipment).findOneBy({ orderId: order.id })
    const shipped = order.status === 'shipped' || isShipmentStarted(shipment)
    const previous = order.status
    appendYcpHistory(order, 'cancelled', now, 'Заказ отменён в Яндексе')
    await writeOrderStatusEvent(em, order, previous)
    if (shipped) await enqueueOrderEvent(em, order.id, 'ycp:cancel_after_ship')
    return shipped ? 'cancelled_after_ship' : 'cancelled'
  })
}
```

Append to `api/src/routes/ycp/schemas.ts`:

```ts
export const SessionQuerySchema = z.object({ session_id: z.string().trim().min(1).max(64) })
export const OrderQuerySchema = z.object({ order_id: z.string().trim().min(1).max(64) })
```

In `api/src/routes/ycp/checkout.ts`, add `cancelYcpSession` to the orders import and `SessionQuerySchema` to the schemas import. Then append:

```ts
ycpCheckoutRouter.post('/cancel', async (req, res, next) => {
  try {
    const { session_id } = SessionQuerySchema.parse(req.query)
    if ((await cancelYcpSession(session_id)) === 'not_found') throw ycpNotFound('Session not found')
    res.status(200).end()
  } catch (err) {
    next(err)
  }
})
```

Create `api/src/routes/ycp/orders.ts`:

```ts
import { Router } from 'express'
import { cancelYcpOrder } from '../../lib/ycp/orders.js'
import { ycpNotFound } from './errors.js'
import { OrderQuerySchema } from './schemas.js'

export const ycpOrdersRouter: Router = Router()

// order_id — id заказа в Яндексе из /checkout/placed (orders.external_order_id).
ycpOrdersRouter.post('/cancel', async (req, res, next) => {
  try {
    const { order_id } = OrderQuerySchema.parse(req.query)
    if ((await cancelYcpOrder(order_id)) === 'not_found') throw ycpNotFound('Order not found')
    res.status(200).end()
  } catch (err) {
    next(err)
  }
})
```

Replace `api/src/routes/ycp/index.ts` with its final form:

```ts
import { Router } from 'express'
import { requireYcpToken } from './auth.js'
import { ycpBasketRouter } from './basket.js'
import { ycpCheckoutRouter } from './checkout.js'
import { ycpDeliveryRouter } from './delivery.js'
import { ycpOrdersRouter } from './orders.js'
import { ycpWarehousesRouter } from './warehouses.js'

// Методы, которые Яндекс вызывает у магазина (docs/ycp/ycp-openapi-0.0.14.json,
// servers[0].url = api/v1). Токен проверяется до любого маршрута, поэтому и на
// неизвестный путь без токена ответ — 401. GET /order и POST /order/delivered
// не реализованы: они нужны только при доставке силами Яндекса.
export function createYcpRouter(): Router {
  const router = Router()
  router.use(requireYcpToken)
  router.use('/warehouses', ycpWarehousesRouter)
  router.use('/checkout/basket', ycpBasketRouter)
  router.use('/checkout/delivery', ycpDeliveryRouter)
  router.use('/checkout', ycpCheckoutRouter)
  router.use('/order', ycpOrdersRouter)
  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  return router
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/ycp/`
Expected: PASS. `cancel.test.ts` has 9 tests, and all YCP suites pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/ycp/orders.ts api/src/routes/ycp/
git commit -m "feat(ycp): отмена сессии и заказа из Яндекса; после отправки в СДЭК — сигнал менеджеру" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Contract test against the vendored OpenAPI 0.0.14

**Files:**

- Modify: `api/package.json` (devDependencies), `package-lock.json`
- Test: `api/src/routes/ycp/contract.test.ts`
- Uses: `docs/ycp/ycp-openapi-0.0.14.json` (already vendored; `info.version` = `0.0.14`)

**Interfaces:**

- Consumes: every route from Tasks 3–10; test helpers `applyYcpTestEnv`, `createYcpCheckout`, `makePickupEntry`, `seedYcpProduct`, `ycpAuth`, `ycpCheckoutBody`; `setCdekClientForTests`, `setPickupPointsForTests`.
- Produces: `expectSchema(body, path, method, status)` (file-local).

- [ ] **Step 1: Add the devDependencies**

The repo has no JSON-schema validator of its own. The root `node_modules/ajv` is v6, pulled in by eslint, and has no OpenAPI-friendly formats. Add explicit api devDependencies:

Run: `npm install -D -w api ajv@^8.17.1 ajv-formats@^3.0.1`
Expected: `api/package.json` devDependencies gain `"ajv": "^8.x"` and `"ajv-formats": "^3.0.1"`; `package-lock.json` updated.

- [ ] **Step 2: Write the contract test**

Create `api/src/routes/ycp/contract.test.ts`:

```ts
import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import AjvModule from 'ajv'
import addFormatsModule from 'ajv-formats'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { setCdekClientForTests } from '../../lib/cdek/index.js'
import { clearCdekLocationCache } from '../../lib/cdek/locations.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import {
  applyYcpTestEnv,
  createYcpCheckout,
  makePickupEntry,
  seedYcpProduct,
  ycpAuth,
  ycpCheckoutBody,
} from './testHelpers.js'

// CJS-пакеты под ESM: default — сам класс или модуль с .default, смотря кто грузит.
const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule
const addFormats =
  (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ?? addFormatsModule

const SPEC = JSON.parse(
  readFileSync(new URL('../../../../docs/ycp/ycp-openapi-0.0.14.json', import.meta.url), 'utf8'),
) as { info: { version: string } }

// strict: false — в OpenAPI есть example и deprecated, которых нет в JSON Schema.
const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false })
addFormats(ajv)
// Форматы OpenAPI без аналога в JSON Schema: числа и так проверяет type.
ajv.addFormat('float', true)
ajv.addFormat('uint32', true)
ajv.addSchema(SPEC, 'ycp')

const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1')

function expectSchema(body: unknown, path: string, method: 'get' | 'post', status: number): void {
  const ref = `ycp#/paths/${esc(path)}/${method}/responses/${status}/content/${esc('application/json')}/schema`
  const validate = ajv.getSchema(ref)
  if (!validate) throw new Error(`нет схемы ответа ${ref}`)
  const ok = validate(body)
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
}

describe('ответы /api/v1 соответствуют OpenAPI Яндекса 0.0.14', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories, cdek_shipments RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    setCdekClientForTests({
      get: vi.fn(async () => [{ code: 44, full_name: 'Москва, Россия' }]),
      post: vi.fn(async () => ({ total_sum: 400, period_min: 2, period_max: 4 })),
      raw: vi.fn(),
    } as never)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setCdekClientForTests(null)
    clearCdekLocationCache()
    setPickupPointsForTests(null)
  })

  it('схема в репозитории — версии 0.0.14', () => {
    expect(SPEC.info.version).toBe('0.0.14')
  })

  it('GET /warehouses: 200 и 401', async () => {
    const ok = await request(app).get('/api/v1/warehouses?limit=1000&offset=0').set(ycpAuth)
    expectSchema(ok.body, '/warehouses', 'get', 200)
    const denied = await request(app).get('/api/v1/warehouses')
    expect(denied.status).toBe(401)
    expectSchema(denied.body, '/warehouses', 'get', 401)
  })

  it('POST /checkout/basket/check: 200, 400, 404', async () => {
    const p = await seedYcpProduct()
    const path = '/checkout/basket/check'
    const ok = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 2 }],
        offers_id_from_merchant_center: true,
        locality: 'Москва',
        is_health_check: false,
      })
    expect(ok.status).toBe(200)
    expectSchema(ok.body, path, 'post', 200)
    const bad = await request(app).post(`/api/v1${path}`).set(ycpAuth).send({ items: [] })
    expect(bad.status).toBe(400)
    expectSchema(bad.body, path, 'post', 400)
    const missing = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({ items: [{ id: 'nope', quantity: 1 }] })
    expect(missing.status).toBe(404)
    expectSchema(missing.body, path, 'post', 404)
  })

  it('POST /checkout: 201, 409 (цены), 409 (сессия), 400', async () => {
    const p = await seedYcpProduct()
    const items = [{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }]
    const created = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .send(ycpCheckoutBody(items))
    expect(created.status).toBe(201)
    expectSchema(created.body, '/checkout', 'post', 201)
    const again = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .send(ycpCheckoutBody(items))
    expect(again.status).toBe(409)
    expectSchema(again.body, '/checkout', 'post', 409)
    const stale = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ ...items[0], final_price: 1 }], { session_id: 'sess-other' }))
    expect(stale.status).toBe(409)
    expectSchema(stale.body, '/checkout', 'post', 409)
    const bad = await request(app).post('/api/v1/checkout').set(ycpAuth).send({})
    expect(bad.status).toBe(400)
    expectSchema(bad.body, '/checkout', 'post', 400)
  })

  it('POST /checkout/delivery/options: 200 (оба ключа) и 400', async () => {
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const path = '/checkout/delivery/options'
    const ok = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'pickup_point', address: { pickup_point_id: 'MSK1' } },
      })
    expect(ok.status).toBe(200)
    expectSchema(ok.body, path, 'post', 200)
    expectSchema({ delivery_options: ok.body.options }, path, 'post', 200)
    const bad = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'courier', address: {} },
      })
    expect(bad.status).toBe(400)
    expectSchema(bad.body, path, 'post', 400)
  })

  it('GET /checkout/delivery/pickup_points: 500 до сборки кеша и 200 после', async () => {
    const path = '/checkout/delivery/pickup_points'
    const early = await request(app).get(`/api/v1${path}?limit=1000&offset=0`).set(ycpAuth)
    expect(early.status).toBe(500)
    expectSchema(early.body, path, 'get', 500)
    setPickupPointsForTests([makePickupEntry('MSK1'), makePickupEntry('MSK2')])
    const ok = await request(app).get(`/api/v1${path}?limit=1000&offset=0`).set(ycpAuth)
    expect(ok.status).toBe(200)
    expectSchema(ok.body, path, 'get', 200)
  })

  it('POST /checkout/placed: 200 без тела, 404, 409', async () => {
    await createYcpCheckout(app, 'sess-p')
    const body = {
      session_id: 'sess-p',
      order_id: 'ya-p',
      order_number: 1,
      payment_method: 'online',
    }
    const ok = await request(app).post('/api/v1/checkout/placed').set(ycpAuth).send(body)
    expect(ok.status).toBe(200)
    expect(ok.text).toBe('')
    const missing = await request(app)
      .post('/api/v1/checkout/placed')
      .set(ycpAuth)
      .send({ ...body, session_id: 'nope' })
    expect(missing.status).toBe(404)
    expectSchema(missing.body, '/checkout/placed', 'post', 404)
    await createYcpCheckout(app, 'sess-x')
    await request(app).post('/api/v1/checkout/cancel?session_id=sess-x').set(ycpAuth)
    const cancelled = await request(app)
      .post('/api/v1/checkout/placed')
      .set(ycpAuth)
      .send({ ...body, session_id: 'sess-x' })
    expect(cancelled.status).toBe(409)
    expectSchema(cancelled.body, '/checkout/placed', 'post', 409)
  })

  it('POST /checkout/cancel и /order/cancel: 200 без тела и 404', async () => {
    await createYcpCheckout(app, 'sess-c')
    const ok = await request(app).post('/api/v1/checkout/cancel?session_id=sess-c').set(ycpAuth)
    expect(ok.status).toBe(200)
    expect(ok.text).toBe('')
    const noSession = await request(app)
      .post('/api/v1/checkout/cancel?session_id=nope')
      .set(ycpAuth)
    expectSchema(noSession.body, '/checkout/cancel', 'post', 404)

    await createYcpCheckout(app, 'sess-o')
    await request(app).post('/api/v1/checkout/placed').set(ycpAuth).send({
      session_id: 'sess-o',
      order_id: 'ya-o',
      order_number: 2,
      payment_method: 'online',
    })
    const cancelled = await request(app).post('/api/v1/order/cancel?order_id=ya-o').set(ycpAuth)
    expect(cancelled.status).toBe(200)
    expect(cancelled.text).toBe('')
    const noOrder = await request(app).post('/api/v1/order/cancel?order_id=nope').set(ycpAuth)
    expect(noOrder.status).toBe(404)
    expectSchema(noOrder.body, '/order/cancel', 'post', 404)
  })
})
```

- [ ] **Step 3: Run it**

Run: `npm test -w api -- src/routes/ycp/contract.test.ts`
Expected: PASS (8 tests).

If a test fails, ajv's `validate.errors` array is printed by the `toEqual([])` assertion. Each entry names the JSON path and the violated keyword. Fix the **route's response** (in its owning task's files) so it matches the schema. Never edit `docs/ycp/ycp-openapi-0.0.14.json`.

- [ ] **Step 4: Commit**

```bash
git add api/package.json package-lock.json api/src/routes/ycp/contract.test.ts
git commit -m "test(ycp): контрактный тест ответов по OpenAPI Яндекса 0.0.14" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Feed — is_checkout_enabled, weight, dimensions

**Files:**

- Modify: `api/src/routes/public/products.ts:11-41`
- Modify: `shared/src/types/product.ts` (Product gains `shippingUnit?`)
- Modify: `web/lib/api.ts:100-109`, `web/app/yml.xml/route.ts:24`, `web/lib/ymlFeed.ts:137-211`
- Test: `api/src/routes/products.test.ts` (add one test), `web/lib/ymlFeed.test.ts` (add describe), `web/app/yml.xml/route.test.ts` (add one assertion)

**Interfaces:**

- Consumes: `unitShipping` (Task 4), `ProductShippingUnit` (Task 4), `Product.ycpEnabled` (Task 1).
- Produces: `GET /api/public/products?include=categories,shipping` rows carry `shippingUnit: ProductShippingUnit`; shared `Product.shippingUnit?: ProductShippingUnit`; `listPublishedProducts(opts: { limit?; offset?; include?: 'categories' | 'categories,shipping' })`.

Before touching `web/app/yml.xml/route.ts`, read `web/node_modules/next/dist/docs/` for route handlers (per `web/AGENTS.md`). The change below keeps the existing `GET(): Promise<Response>` + `dynamic = 'force-dynamic'` shape.

- [ ] **Step 1: Write the failing API test**

In `api/src/routes/products.test.ts`, inside `describe('GET /api/public/products', …)`, after `'returns categoryIds when include=categories is passed'`, add:

```ts
it('отдаёт вес и габариты штуки в упаковке при include=shipping', async () => {
  const {
    body: {
      data: { id },
    },
  } = await request(app)
    .post('/api/admin/products')
    .set(authHeaders(auth))
    .send({ slug: 'ship-kit', name: 'Kit', priceRub: 100, weightG: 1200, shipBoxes: ['large'] })
  await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth)).send()

  const withShipping = await request(app).get('/api/public/products?include=categories,shipping')
  expect(withShipping.body.data[0].shippingUnit).toEqual({
    weightG: 1200,
    lengthCm: 40,
    widthCm: 32,
    heightCm: 8,
  })
  expect(withShipping.body.data[0].ycpEnabled).toBe(false)
  expect(withShipping.body.data[0]).toHaveProperty('categoryIds')

  const plain = await request(app).get('/api/public/products')
  expect(plain.body.data[0]).not.toHaveProperty('shippingUnit')
})
```

Run: `npm test -w api -- src/routes/products.test.ts`
Expected: FAIL with `expected undefined to deeply equal { weightG: 1200, … }`.

- [ ] **Step 2: API include=shipping**

In `api/src/routes/public/products.ts`, add `import { unitShipping } from '../../lib/shipping/unit.js'`. Replace the block from `const wantsCategories = …` to `res.json(…)` with:

```ts
const wantsCategories = include.includes('categories')
const wantsShipping = include.includes('shipping')
const [items, total] = await repo.findAndCount({
  where: { isPublished: true, deletedAt: IsNull() },
  order: { sortOrder: 'ASC', createdAt: 'DESC' },
  skip: offset,
  take: limit,
  // Always eager-load images so storefront cards and the YML feed
  // can render product photos without N+1 fetches. Categories are
  // optional (only needed by the YML feed generator).
  relations: { images: true, categories: wantsCategories },
})
// Shape the include output as a flat `categoryIds` array per product —
// feeds only need the id strings, and keeping the DB rows private
// avoids leaking meta_title / meta_description into a CDN-cacheable
// public response. shipping — вес и габариты одной штуки в упаковке для
// фида (weight, dimensions), тот же packCart, что и доставка.
const data = items.map((p) => ({
  ...p,
  ...(wantsCategories
    ? { categoryIds: (p.categories ?? []).map((c) => c.id), categories: undefined }
    : {}),
  ...(wantsShipping ? { shippingUnit: unitShipping(p) } : {}),
}))
res.json({ data, pagination: { limit, offset, total } })
```

In `shared/src/types/product.ts`, after `ycpEnabled?: boolean` in `Product`, add:

```ts
  /** Вес и габариты одной штуки в упаковке; только в списке с include=shipping (фид). */
  shippingUnit?: ProductShippingUnit
```

Run: `npm test -w api -- src/routes/products.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing feed tests**

Append to `web/lib/ymlFeed.test.ts`:

```ts
describe('generateYmlXml — Яндекс Товары и «Купить в 1 клик»', () => {
  const xmlFor = (overrides: Partial<ProductWithCategoryIds>) =>
    generateYmlXml({
      products: [makeProduct({ categoryIds: ['cat-1'], ...overrides })],
      categories: [makeCategory({ id: 'cat-1' })],
      settings: baseSettings,
      siteUrl: 'https://ximi4ka.ru',
      now: new Date('2026-10-11T00:00:00Z'),
    })

  it('is_checkout_enabled=true только у товаров с флагом ycpEnabled', () => {
    expect(xmlFor({ ycpEnabled: true })).toContain('<param name="is_checkout_enabled">true</param>')
    expect(xmlFor({ ycpEnabled: false })).toContain(
      '<param name="is_checkout_enabled">false</param>',
    )
    expect(xmlFor({})).toContain('<param name="is_checkout_enabled">false</param>')
  })

  it('вес в кг и габариты в см (Д/Ш/В) из упаковки одной штуки', () => {
    const xml = xmlFor({ shippingUnit: { weightG: 830, lengthCm: 10, widthCm: 10, heightCm: 4 } })
    expect(xml).toContain('<weight>0.83</weight>')
    expect(xml).toContain('<dimensions>10/10/4</dimensions>')
  })

  it('без данных упаковки weight и dimensions не выводятся', () => {
    const xml = xmlFor({})
    expect(xml).not.toContain('<weight>')
    expect(xml).not.toContain('<dimensions>')
  })

  it('новые элементы идут после description', () => {
    const xml = xmlFor({
      shortDescription: 'Описание',
      shippingUnit: { weightG: 1200, lengthCm: 40, widthCm: 32, heightCm: 8 },
    })
    const offer = xml.slice(xml.indexOf('<offer '))
    const order = [
      '<description>',
      '<param name="is_checkout_enabled">',
      '<weight>',
      '<dimensions>',
    ].map((tag) => offer.indexOf(tag))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('не выводит элементы, не рекомендованные для Яндекс Товаров', () => {
    const xml = xmlFor({
      ycpEnabled: true,
      sku: 'X-1',
      compareAtPriceRub: 2000,
      shippingUnit: { weightG: 830, lengthCm: 10, widthCm: 10, heightCm: 4 },
    })
    for (const tag of [
      'count',
      'vat',
      'bid',
      'age',
      'gifts',
      'min-quantity',
      'purchase_price',
      'supplier',
      'expiry',
      'manufacturer_warranty',
      'country_of_origin',
      'downloadable',
      'enable_auto_discounts',
    ]) {
      expect(xml).not.toMatch(new RegExp(`<${tag}[\\s>/]`))
    }
  })

  it('id оффера — по-прежнему id товара', () => {
    expect(xmlFor({ id: '11111111-2222-4333-8444-555555555555' })).toContain(
      '<offer id="11111111-2222-4333-8444-555555555555"',
    )
  })
})
```

In `web/app/yml.xml/route.test.ts`, in the first test (`'returns a well-formed YML catalog …'`), after the response assertions, add:

```ts
expect(vi.mocked(listPublishedProducts)).toHaveBeenCalledWith({
  limit: 5000,
  include: 'categories,shipping',
})
```

Run: `npm test -w web -- lib/ymlFeed.test.ts app/yml.xml/route.test.ts`
Expected: FAIL. `is_checkout_enabled` is not found, and the route was called with `include: 'categories'`.

- [ ] **Step 4: Implement the feed changes**

In `web/lib/api.ts`, change the `listPublishedProducts` signature to:

```ts
export async function listPublishedProducts(
  opts: { limit?: number; offset?: number; include?: 'categories' | 'categories,shipping' } = {},
): Promise<Paginated<Product>> {
```

In `web/app/yml.xml/route.ts`, change line 24 to `listPublishedProducts({ limit: 5000, include: 'categories,shipping' }),`.

In `web/lib/ymlFeed.ts`, replace the comment above `generateYmlXml` (lines 137-141) with:

```ts
// Build the YML XML string. Pure function so tests can feed it fixtures and
// assert line-level. Follows the minimal spec from the task brief: shop
// metadata + currencies + categories + offers. We deliberately skip
// variants/grouped offers — not needed for the MVP. barcode и sales_notes не
// выводим: в модели товара и настройках сайта для них нет данных. Элементы, не
// рекомендованные для Яндекс Товаров (count, vat, bid и др.), не выводим вовсе.
```

Add this helper above `generateYmlXml`:

```ts
// Вес (кг, до 3 знаков) и габариты (см, Д/Ш/В) одной штуки в упаковке — от api
// (include=shipping, тот же packCart, что и доставка). Нет данных — не выводим.
function shippingLines(product: Product): string[] {
  const unit = product.shippingUnit
  if (!unit || unit.weightG <= 0) return []
  const kg = Number((unit.weightG / 1000).toFixed(3))
  return [
    `      <weight>${kg}</weight>`,
    `      <dimensions>${unit.lengthCm}/${unit.widthCm}/${unit.heightCm}</dimensions>`,
  ]
}
```

In `offerLines`, after the `description ? … : ''` entry, add:

```ts
      // Кнопка «Купить в 1 клик» (YCP): без параметра Яндекс включил бы её всем
      // товарам фида — явно выключаем у тех, что не отмечены в админке.
      `      <param name="is_checkout_enabled">${product.ycpEnabled === true ? 'true' : 'false'}</param>`,
      ...shippingLines(product),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -w web -- lib/ymlFeed.test.ts app/yml.xml/route.test.ts` then `npm run typecheck`
Expected: PASS (6 new feed tests; existing feed tests, including the element-order test, still green); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/public/products.ts api/src/routes/products.test.ts shared/src/types/product.ts web/lib/api.ts web/app/yml.xml/route.ts web/app/yml.xml/route.test.ts web/lib/ymlFeed.ts web/lib/ymlFeed.test.ts
git commit -m "feat(ycp): фид — is_checkout_enabled по флагу товара, вес и габариты из упаковки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Admin — product checkbox and order source badge

**Files:**

- Modify: `api/src/routes/admin/products.schemas.ts:13-39`
- Modify: `web/lib/adminApi.ts:48-66`, `web/components/admin/ProductForm.tsx:53, 102-118, 258`
- Modify: `web/app/admin/(authed)/orders/orderUi.ts`, `web/app/admin/(authed)/orders/page.tsx:125-131`
- Test: `api/src/routes/products.test.ts`, `web/components/admin/ProductForm.test.tsx`, `web/app/admin/(authed)/orders/page.test.tsx`

**Interfaces:**

- Consumes: `Product.ycpEnabled` (Task 1), `OrderDto.source` (Task 1).
- Produces: `CreateProductSchema.ycpEnabled: z.boolean().optional()` (and partial in Update); `AdminProductInput.ycpEnabled?: boolean`; `ORDER_SOURCE_LABELS: Record<OrderSource, string>`; `orderSourceBadge(source: OrderSource | undefined): string | null`.

Before editing `web/app/admin/(authed)/orders/page.tsx`, read the relevant server-component guide in `web/node_modules/next/dist/docs/` (per `web/AGENTS.md`). The page stays an async server component; only JSX inside the existing row changes.

- [ ] **Step 1: Write the failing tests**

In `api/src/routes/products.test.ts`, inside `describe('PATCH /api/admin/products/:id', …)`, add:

```ts
it('флаг «Купить в 1 клик»: по умолчанию выключен, PATCH включает, прочие PATCH его не сбрасывают', async () => {
  const created = await request(app)
    .post('/api/admin/products')
    .set(authHeaders(auth))
    .send({ slug: 'ycp-flag', name: 'Y', priceRub: 100 })
  expect(created.body.data.ycpEnabled).toBe(false)
  const id = created.body.data.id
  const on = await request(app)
    .patch(`/api/admin/products/${id}`)
    .set(authHeaders(auth))
    .send({ ycpEnabled: true })
  expect(on.body.data.ycpEnabled).toBe(true)
  const renamed = await request(app)
    .patch(`/api/admin/products/${id}`)
    .set(authHeaders(auth))
    .send({ name: 'Y2' })
  expect(renamed.body.data.ycpEnabled).toBe(true)
  const bad = await request(app)
    .patch(`/api/admin/products/${id}`)
    .set(authHeaders(auth))
    .send({ ycpEnabled: 'yes' })
  expect(bad.status).toBe(400)
})
```

In `web/components/admin/ProductForm.test.tsx`, add inside `describe('ProductForm', …)`:

```ts
  it('отправляет флаг «Купить в 1 клик через Яндекс»', async () => {
    const onSubmit = vi.fn<(input: AdminProductInput) => Promise<void>>(async () => undefined)
    render(<ProductForm mode="create" onSubmit={onSubmit} submitting={false} />)
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'ycp-kit' } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Набор' } })
    const checkbox = screen.getByLabelText('Купить в 1 клик через Яндекс')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].ycpEnabled).toBe(true)
  })
```

In `web/app/admin/(authed)/orders/page.test.tsx`, add `orderSourceBadge` to the `./orderUi` import and, inside `describe('order UI helpers', …)`:

```ts
it('отметка источника — только у заказов из Яндекса', () => {
  expect(orderSourceBadge('ycp')).toBe('Яндекс')
  expect(orderSourceBadge('site')).toBeNull()
  expect(orderSourceBadge(undefined)).toBeNull()
})
```

Run: `npm test -w api -- src/routes/products.test.ts` and `npm test -w web -- components/admin/ProductForm.test.tsx "app/admin/(authed)/orders/page.test.tsx"`
Expected: FAIL. api: `expected undefined to be true` (zod strips the unknown key). web: `Unable to find a label with the text of: Купить в 1 клик через Яндекс` and `orderSourceBadge is not a function`.

- [ ] **Step 2: Implement**

In `api/src/routes/admin/products.schemas.ts`, inside `CreateProductSchema` after `noindex: z.boolean().default(false),`, add:

```ts
  // Кнопка «Купить в 1 клик» в Яндексе (YCP). Без поля — колонка не трогается
  // (при создании — default false из базы).
  ycpEnabled: z.boolean().optional(),
```

In `web/lib/adminApi.ts`, in `AdminProductInput`, after `noindex?: boolean`, add:

```ts
  /** Кнопка «Купить в 1 клик» в Яндексе (YCP). */
  ycpEnabled?: boolean
```

In `web/components/admin/ProductForm.tsx`:

- after line 53 (`const [noindex, …]`), add `const [ycpEnabled, setYcpEnabled] = useState<boolean>(initialValue?.ycpEnabled ?? false)`;
- in the `input` object, after `noindex,`, add `ycpEnabled,`;
- at the end of the «Основные» section, after the «Короткое описание» `</Field>` (line 267, just before `</Section>`), add:

```tsx
<label className="flex items-center gap-2 text-sm text-brand-text">
  <input type="checkbox" checked={ycpEnabled} onChange={(e) => setYcpEnabled(e.target.checked)} />
  <span>Купить в 1 клик через Яндекс</span>
</label>
```

In `web/app/admin/(authed)/orders/orderUi.ts`, change the first import to `import type { OrderSource, OrderStatus, PaymentProvider } from '@ximi4ka-shop/shared'` and append:

```ts
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  site: 'Сайт',
  ycp: 'Яндекс',
}

// Отметка в списке заказов — только у заказов не с сайта.
export function orderSourceBadge(source: OrderSource | undefined): string | null {
  return source === 'ycp' ? ORDER_SOURCE_LABELS.ycp : null
}
```

In `web/app/admin/(authed)/orders/page.tsx`, add `orderSourceBadge` to the `./orderUi` import. In the first `<td>` of the row, after the `</Link>`, add:

```tsx
{
  orderSourceBadge(o.source) && (
    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      {orderSourceBadge(o.source)}
    </span>
  )
}
```

- [ ] **Step 3: Run the tests to see them pass**

Run: `npm test -w api -- src/routes/products.test.ts`, `npm test -w web -- components/admin/ProductForm.test.tsx "app/admin/(authed)/orders/page.test.tsx"`, then `npm run lint` and `npm run typecheck`
Expected: PASS; lint and typecheck exit 0.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/admin/products.schemas.ts api/src/routes/products.test.ts web/lib/adminApi.ts web/components/admin/ProductForm.tsx web/components/admin/ProductForm.test.tsx "web/app/admin/(authed)/orders/orderUi.ts" "web/app/admin/(authed)/orders/page.tsx" "web/app/admin/(authed)/orders/page.test.tsx"
git commit -m "feat(ycp): админка — флаг «Купить в 1 клик через Яндекс» у товара и отметка «Яндекс» в списке заказов" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Env, runbook, full verification

**Files:**

- Modify: `api/.env.example` (append), `deploy/app.env.example` (append)
- Create: `docs/ycp/RUNBOOK.md`

**Interfaces:**

- Consumes: env names from Tasks 2–6: `YCP_API_TOKEN`, `YCP_WAREHOUSE_ID`, `YCP_WAREHOUSE_TITLE`, `YCP_WAREHOUSE_ADDRESS`, `YCP_WAREHOUSE_PHONE`, `YCP_CDEK_TIMEOUT_MS`; existing `WEB_ORIGIN`, `CDEK_ORDERS_ENABLED`.
- Produces: operator documentation only.

- [ ] **Step 1: Env examples**

Append to both `api/.env.example` and `deploy/app.env.example`:

```bash

# Yandex Commerce Protocol — «Купить в 1 клик» в Алисе и Поиске
# (docs/superpowers/specs/2026-10-11-ycp-integration-design.md, docs/ycp/RUNBOOK.md).
# Токен придумывает владелец (openssl rand -hex 32) и вносит сюда и в поле
# «Токен доступа» кабинета YCP. Пусто или короче 32 символов — /api/v1 отвечает
# 401 на всё и фоновая загрузка пунктов выдачи СДЭК не запускается.
YCP_API_TOKEN=
# Склад для GET /api/v1/warehouses и остатков в basket/check. Любое поле пустое —
# методы, которым нужен склад, отвечают 500.
YCP_WAREHOUSE_ID=msk-1
YCP_WAREHOUSE_TITLE=Склад Химички
YCP_WAREHOUSE_ADDRESS=
YCP_WAREHOUSE_PHONE=
# Общий срок на вызовы СДЭК в /api/v1/checkout/delivery/options, мс (1–4000).
# YCP_CDEK_TIMEOUT_MS=3500
```

- [ ] **Step 2: Runbook**

Create `docs/ycp/RUNBOOK.md`:

````markdown
# YCP — «Купить в 1 клик» в Яндексе: запуск и откат

Спека: [`../superpowers/specs/2026-10-11-ycp-integration-design.md`](../superpowers/specs/2026-10-11-ycp-integration-design.md).
Протокол: [`ycp-api-spec-notes.md`](ycp-api-spec-notes.md), схема — `ycp-openapi-0.0.14.json`.
Все шаги на проде — только по команде владельца.

## Окружение (`deploy/app.env`)

| Переменная                                                            | Что вписать                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `YCP_API_TOKEN`                                                       | `openssl rand -hex 32`; то же значение — в поле «Токен доступа» кабинета YCP. В репозиторий и чат не попадает. |
| `YCP_WAREHOUSE_ID`                                                    | `msk-1` (не менять после «Обновить склады через YCP»)                                                          |
| `YCP_WAREHOUSE_TITLE`, `YCP_WAREHOUSE_ADDRESS`, `YCP_WAREHOUSE_PHONE` | название, полный адрес и телефон склада отгрузки                                                               |
| `YCP_CDEK_TIMEOUT_MS`                                                 | не задавать (3500 мс)                                                                                          |
| `CDEK_ORDERS_ENABLED`                                                 | уже `true` — оплаченные заказы из Яндекса уходят в СДЭК так же, как с сайта                                    |

## Порядок запуска

1. **До мёржа — колонки заранее.** `deploy.sh` переключает контейнеры раньше, чем гоняет миграции, а новый код читает
   `products.ycp_enabled` и `orders.source`. Миграция `AddYcpFields1790800000000` написана с `IF NOT EXISTS` и при
   деплое пройдёт как no-op:

   ```bash
   docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop \
     -c 'ALTER TABLE products ADD COLUMN IF NOT EXISTS ycp_enabled boolean NOT NULL DEFAULT false;' \
     -c "ALTER TABLE orders ADD COLUMN IF NOT EXISTS source varchar(16) NOT NULL DEFAULT 'site';" \
     -c 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_session_id varchar(64);' \
     -c 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id varchar(64);' \
     -c 'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orders_external_session_id" ON orders (external_session_id) WHERE external_session_id IS NOT NULL;' \
     -c 'CREATE INDEX IF NOT EXISTS "IDX_orders_external_order_id" ON orders (external_order_id) WHERE external_order_id IS NOT NULL;' \
     -c 'CREATE TABLE IF NOT EXISTS ycp_pickup_points_snapshot (id smallint NOT NULL, entries jsonb NOT NULL, built_at timestamptz NOT NULL, CONSTRAINT "PK_ycp_pickup_points_snapshot" PRIMARY KEY (id), CONSTRAINT "CHK_ycp_pickup_points_snapshot_single" CHECK (id = 1));' \
     -c 'ALTER TABLE ycp_pickup_points_snapshot OWNER TO ximishop_user;'
   ```

   Перед этим проверьте владельца таблиц (`deploy/README.md`, раздел про AddBlogPostAuthor).

2. **Мёрж PR** — только по команде владельца (мёрж в `main` = выкатка). Пока `YCP_API_TOKEN` пуст, `/api/v1` отвечает
   401, и для покупателей сайта ничего не меняется.
3. **`/security-review`** до шага 4: авторизация, данные покупателей, платёжный статус.
4. Владелец вносит переменные из таблицы в `deploy/app.env` и перезапускает api. В логе — `ycp pickup points job started`,
   затем `ycp: пункты выдачи СДЭК обновлены — N`.
5. Яндекс Товары: фид `https://new.ximi4ka.ru/yml.xml` уже отдаёт `is_checkout_enabled`. В админке отметить товары флагом
   «Купить в 1 клик через Яндекс». Правила Яндекса исключают «едкие и взрывчатые вещества» — решение по каждому товару
   за владельцем.
6. Кабинет YCP (https://merchants.yandex.ru/ycp): «Токен доступа» = `YCP_API_TOKEN`. «URL для API» — сначала
   `https://new.ximi4ka.ru/api/v1`; если «Проверить подключение» не проходит — `https://new.ximi4ka.ru` (документация
   не говорит, нужен ли префикс). Способы оплаты — «Только онлайн-оплата». Доставка — собственная (`merchant_ship`).
7. «Склады» → «Обновить склады через YCP» (вызывает `GET /api/v1/warehouses`).
8. Тестовый заказ: чек формируется, заказ виден в админке с отметкой «Яндекс», в Telegram пришла карточка после
   оплаты, в СДЭК создан заказ. Затем «Опубликовать» (до 36 часов).

## Открытые вопросы перед публикацией

- НДС: `vat` не передаём, Яндекс подставит 22. Уточнить налоговый режим и допустимые значения у Яндекса.
- `available="false"` у товаров не в наличии остаётся в фиде (так сейчас для Маркета); Яндекс Товары советуют
  передавать только `true` — проверить замечания модерации фида.
- Описания товаров без промо-слов («скидка», «акция», «хит») — проверить на модерации фида.

## Откат

- **Быстрый:** очистить `YCP_API_TOKEN` в `deploy/app.env` и перезапустить api — все вызовы Яндекса получают 401,
  кнопка встаёт на паузу на ближайшей технической проверке Яндекса (раз в 8 часов), фоновая задача ПВЗ не стартует. Релиз не нужен.
- **Точечный:** снять флаг у товара в админке — в фиде `is_checkout_enabled=false`, в `basket/check` товар пропадает.
- **Полный:** выключить кнопку в кабинете YCP (до 8 часов). Код и колонки можно не трогать: старые заказы из Яндекса
  остаются в админке с отметкой «Яндекс».
````

- [ ] **Step 3: Full verification**

Run each and record the output:

```bash
npm run lint
npm run typecheck
TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test npm test -w api
npm test -w web
npm test -w shared
npx prettier --check .
```

Expected: every command exits 0. `npm test -w api` runs the new suites `ycpFields`, `auth`, `warehouses`, `basket` (route and lib), `unit`, `pickupPoints`, `pickup-points`, `deliveryOptions`, `delivery-options`, `checkout` (ycp), `managerAlerts`, `placed`, `cancel`, `contract`, plus all pre-existing suites, with zero failures and zero skipped. If prettier reports files, run `npx prettier --write <files>`, re-run the check, and fold the formatting into this task's commit.

Then scan the changed files for blockers:

```bash
git diff main --name-only | xargs grep -nE "TODO|FIXME|\.only\(|\.skip\(|it\.todo" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Manual gates (not automated)**

- Run `/security-review` on the branch diff. Scope: `requireYcpToken` (constant-time compare, empty-token behaviour), customer PII written by `/checkout`, the payment-status transitions in `/checkout/placed` and the cancels, and logging in `ycpErrorHandler`. Fix any finding inside the owning task's files, with a regression test.
- Do not merge or deploy. Open the PR only when the owner asks (`commit-commands:commit-push-pr`). Merge happens only on the owner's explicit command, after RUNBOOK step 1.

- [ ] **Step 5: Commit**

```bash
git add api/.env.example deploy/app.env.example docs/ycp/RUNBOOK.md
git commit -m "docs(ycp): переменные окружения и RUNBOOK запуска и отката YCP" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
