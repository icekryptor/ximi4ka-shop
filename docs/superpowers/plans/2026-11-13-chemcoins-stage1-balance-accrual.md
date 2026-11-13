# Химикоины, этап 1: баланс и начисление — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** покупатель видит будущий кэшбек в корзине и на чекауте, получает химикоины, когда заказ получен, и видит
баланс в шапке и кабинете; владелец видит и правит балансы в админке. Тратить химикоины на этом этапе нельзя.

**Architecture:** история операций `coin_transactions` — источник правды; `customers.coin_balance` — кэш, меняется
только вместе с записью в истории под блокировкой строки покупателя. Сумма кэшбека фиксируется в заказе при создании
и начисляется при первом переходе в новый статус `delivered`, в той же точке, где сейчас выдаются материалы
(`writeOrderStatusEvent`). Статус `delivered` приходит из слежения за отправлением СДЭК или ставится админом.

**Tech Stack:** api — Node, Express, TypeORM, Postgres, vitest; web — Next.js (см. `web/AGENTS.md`, читать до правок),
vitest; shared — типы и чистые функции.

**Spec:** `docs/superpowers/specs/2026-11-12-chemcoins-cashback-design.md`

## Global Constraints

- Все суммы — целые рубли и целые химикоины; 1 химикоин = 1 ₽; кэшбек округляется вниз.
- База кэшбека = `subtotalRub − discountRub − promoDiscountRub`. Доставка и надбавка CloudPayments не входят.
- Процент кэшбека по умолчанию 10, хранится в настройках, не в коде.
- Баланс никогда не уходит в минус; запись истории нельзя изменить или удалить; одно событие — одна запись.
- Кэшбек получают только заказы, созданные при включённой программе. Старым заказам — 0.
- Программа выключена по умолчанию (`site_settings.coins_enabled = false`): после мёржа покупатель ничего не видит.
- Тексты: «химикоины», только 14+ — без слов «детям», «ребёнку», «игрушка». Строки на русском, прямо в коде
  (next-intl в проекте нет).
- `shared`: без runtime-импортов `./x.js`, внутри только `import type`; runtime-функции — в самодостаточных файлах,
  подключаются по подпути (`@ximi4ka-shop/shared/types/coins`). После правок shared проверять в dev-сервере web.
- Миграции: `api/src/migrations/<13 цифр>-PascalName.ts`, `ADD COLUMN IF NOT EXISTS`; новые сущности — в массив
  `entities` в `api/src/config/dataSource.ts:94`.
- Тесты api идут на `TEST_DATABASE_URL` (по умолчанию `ximi4ka_shop_test`), запуск одного файла:
  `npm test -w api -- src/<путь>.test.ts`.
- Перед PR из корня: `npm run lint`, `npm run typecheck`, `npm test`, `npx prettier --check .`.
- Коммиты — в ветку задачи. Push, PR и мёрж в `main` (= выкатка в прод) — только по команде владельца в чате.
- Вёрстка шапки, чипа и карточек — через навык `ui-ux-pro-max`; проверка в браузере обязательна (задачи 8–11).

## Review Focus

1. **Два источника «получен» одновременно** (тик слежения СДЭК и клик админа): начисление одно. Тест — задача 4.
2. **Запоздавший вебхук оплаты по уже полученному заказу** не сбрасывает статус и не начисляет второй раз. Тест —
   задача 3.
3. **Гостевой заказ получен раньше, чем привязан к аккаунту**, и слияние двух аккаунтов с балансами: химикоины не
   теряются и не удваиваются. Тесты — задача 5.
4. **Админ списывает больше баланса**: отказ 409, баланс и история не меняются. Тест — задача 7.
5. **Программу выключили, пока заказ в пути**: обещанный кэшбек всё равно начисляется, новые заказы обещания не
   получают. Тесты — задачи 2 и 4.

## Карта файлов

Создаются:

- `shared/src/types/coins.ts` — чистые функции и типы химикоинов.
- `api/src/migrations/1790870000000-AddCoins.ts`
- `api/src/entities/CoinTransaction.ts`
- `api/src/lib/coins/ledger.ts` — запись операций и баланс.
- `api/src/lib/coins/cashback.ts` — обещание, начисление, отзыв.
- `api/src/lib/cdek/tracking.ts` — слежение за вручением.
- `api/src/routes/account/coins.ts`, `api/src/routes/admin/customers.ts` (+ `customers.schemas.ts`)
- `web/lib/coins.ts`, `web/lib/useCoinsProgram.ts`, `web/components/CoinIcon.tsx`,
  `web/components/cart/CashbackRow.tsx`
- `web/app/[locale]/(public)/account/(authed)/_components/CoinsCard.tsx`
- `web/app/[locale]/(public)/himikoiny/page.tsx` — правила программы.
- `web/app/admin/(authed)/customers/page.tsx`, `customers/[id]/page.tsx`, `customers/[id]/CoinAdjustForm.tsx`
- `web/app/admin/(authed)/orders/[id]/OrderCoinsPanel.tsx`

Меняются: перечислены в задачах.

---

### Task 1: Чистые функции и типы в shared

**Files:**

- Create: `shared/src/types/coins.ts`, `shared/src/types/coins.test.ts`
- Modify: `shared/package.json` (подпуть `./types/coins`), `shared/src/index.ts` (реэкспорт типов),
  `shared/src/types/order.ts:7`, `shared/src/types/notifications.ts:6-9`

**Interfaces — Produces:**

```ts
// shared/src/types/coins.ts — без импортов
export const DEFAULT_CASHBACK_PERCENT = 10
export type CoinTransactionKind = 'order_cashback' | 'order_cashback_revoke' | 'admin_adjust'
export function cashbackCoins(goodsPaidRub: number, percent: number): number
export interface PublicCoins {
  cashbackPercent: number
}

// shared/src/types/order.ts
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'failed' | 'cancelled'
export const PAID_ORDER_STATUSES = ['paid', 'shipped', 'delivered'] as const
export function isPaidOrderStatus(status: OrderStatus): boolean

// shared/src/types/notifications.ts — в OrderEventKey добавить 'status:delivered'
```

- [ ] **Step 1: тест** `shared/src/types/coins.test.ts`

```ts
expect(cashbackCoins(1900, 10)).toBe(190)
expect(cashbackCoins(1999, 10)).toBe(199) // вниз
expect(cashbackCoins(9, 10)).toBe(0)
expect(cashbackCoins(0, 10)).toBe(0)
expect(cashbackCoins(-50, 10)).toBe(0)
expect(cashbackCoins(1000, 0)).toBe(0)
expect(cashbackCoins(1000.9, 10)).toBe(100) // нецелый вход — сначала вниз
expect(isPaidOrderStatus('delivered')).toBe(true)
expect(isPaidOrderStatus('cancelled')).toBe(false)
```

- [ ] **Step 2:** `npm test -w shared` — падает: модуля нет.
- [ ] **Step 3:** реализовать по сигнатурам выше. `order.ts` остаётся без runtime-импортов.
- [ ] **Step 4:** `npm test -w shared` — зелёный. `npm run typecheck` из корня **упадёт** в api и web на
      `Record<OrderStatus, …>` и `switch` — это ожидаемо, чинится в задаче 3; список упавших мест сохранить.
- [ ] **Step 5:** коммит `feat(shared): химикоины — расчёт кэшбека и статус delivered`.

---

### Task 2: Схема, история операций, настройки, обещание кэшбека в заказе

**Files:**

- Create: `api/src/migrations/1790870000000-AddCoins.ts`, `api/src/entities/CoinTransaction.ts`,
  `api/src/lib/coins/ledger.ts`, `api/src/lib/coins/ledger.test.ts`, `api/src/lib/coins/cashback.ts`
- Modify: `api/src/entities/Order.ts`, `Customer.ts`, `CdekShipment.ts`, `SiteSettings.ts`,
  `api/src/config/dataSource.ts:94`, `api/src/routes/admin/settings.ts:37-40`, `api/src/routes/public/settings.ts`,
  `api/src/routes/checkout.ts:210-272`, `api/src/lib/ycp/orders.ts:125`, `api/src/routes/testUtils.ts`
  (`resetAccountTables` чистит `coin_transactions`), `web/lib/api.ts:324` (`PublicSettings.coins`)
- Test: `api/src/lib/coins/ledger.test.ts`, дополнить `api/src/routes/checkout.test.ts` и тест публичных настроек

**Миграция (точные имена):**

| Таблица             | Колонка                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coin_transactions` | `id uuid PK`, `customer_id uuid NOT NULL → customers(id)`, `amount integer NOT NULL CHECK (amount <> 0)`, `kind varchar(32) NOT NULL`, `order_id uuid NULL → orders(id)`, `comment text NULL`, `admin_user_id uuid NULL`, `idempotency_key varchar(128) NOT NULL UNIQUE`, `created_at timestamptz NOT NULL DEFAULT now()`; индекс `(customer_id, created_at DESC)` |
| `customers`         | `coin_balance integer NOT NULL DEFAULT 0 CHECK (coin_balance >= 0)`                                                                                                                                                                                                                                                                                                |
| `orders`            | `cashback_promised_coins integer NOT NULL DEFAULT 0`, `cashback_shortfall_coins integer NOT NULL DEFAULT 0`, `delivered_at timestamptz NULL`, `delivery_problem varchar(64) NULL`                                                                                                                                                                                  |
| `cdek_shipments`    | `tracking_state varchar(16) NOT NULL DEFAULT 'none'`, `next_track_at timestamptz NULL`, `last_cdek_status varchar(64) NULL`                                                                                                                                                                                                                                        |
| `site_settings`     | `coins_enabled boolean NOT NULL DEFAULT false`, `coins_cashback_percent integer NOT NULL DEFAULT 10`                                                                                                                                                                                                                                                               |

Владелец таблиц на проде — не `supabase_admin` (см. память «Владелец таблиц прод-базы»): новую таблицу создаёт роль
приложения, отдельных GRANT не нужно; проверить на копии базы `migration:run` и `down`.

**Interfaces — Produces:**

```ts
// api/src/lib/coins/ledger.ts
export class InsufficientCoinsError extends Error {}
export interface CoinTransactionInput {
  customerId: string
  amount: number // со знаком, не 0
  kind: CoinTransactionKind
  idempotencyKey: string
  orderId?: string | null
  comment?: string | null
  adminUserId?: string | null
}
export function applyCoinTransaction(
  em: EntityManager,
  input: CoinTransactionInput,
): Promise<{ applied: boolean; balance: number }>
export function listCoinTransactions(
  em: EntityManager,
  customerId: string,
  limit?: number,
): Promise<CoinTransaction[]>

// api/src/lib/coins/cashback.ts
export function promisedCashback(
  order: Pick<Order, 'subtotalRub' | 'discountRub' | 'promoDiscountRub'>,
  settings: Pick<SiteSettings, 'coinsEnabled' | 'coinsCashbackPercent'>,
): number // 0, если программа выключена

// GET /api/public/settings → coins: PublicCoins | null (null при выключенной программе)
```

`applyCoinTransaction`: `SELECT … FROM customers WHERE id = $1 FOR UPDATE`, затем
`INSERT … ON CONFLICT (idempotency_key) DO NOTHING`; если строка не вставилась — `applied: false`, баланс не трогать;
если `coin_balance + amount < 0` — `InsufficientCoinsError` (до вставки). Требует, чтобы `em` был внутри транзакции.

- [ ] **Step 1: тесты истории** `ledger.test.ts`

```ts
// начисление
expect(await apply({ amount: 190, idempotencyKey: 'k1' })).toEqual({ applied: true, balance: 190 })
// повтор того же ключа
expect(await apply({ amount: 190, idempotencyKey: 'k1' })).toEqual({ applied: false, balance: 190 })
// минус не допускается, история не растёт
await expect(apply({ amount: -191, idempotencyKey: 'k2' })).rejects.toBeInstanceOf(
  InsufficientCoinsError,
)
expect(await countTransactions(customerId)).toBe(1)
// гонка: 190 на балансе, два параллельных списания по 150 в разных транзакциях
const results = await Promise.allSettled([debit('a', -150), debit('b', -150)])
expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
expect(await balanceOf(customerId)).toBe(40)
// инвариант: кэш равен сумме истории
expect(await balanceOf(customerId)).toBe(await sumTransactions(customerId))
// amount = 0 и нецелый amount отклоняются до обращения к базе
```

- [ ] **Step 2:** запустить — падает.
- [ ] **Step 3:** миграция, сущность, поля сущностей, `ledger.ts`.
- [ ] **Step 4: тесты обещания** в `checkout.test.ts` и тесте публичных настроек

```ts
// программа включена, товары 4000, промокод RENATA2026 (−200), доставка 350
expect(order.cashbackPromisedCoins).toBe(380)
// совпадает с тем, что считает витрина
expect(order.cashbackPromisedCoins).toBe(cashbackCoins(4000 - 200, 10))
// оптовая скидка тоже вычитается; доставка и надбавка CloudPayments — нет
// гостевой заказ тоже получает обещание (привяжется позже)
// программа выключена → 0, а GET /api/public/settings отдаёт coins: null
// включена → coins: { cashbackPercent: 10 }
```

- [ ] **Step 5:** `promisedCashback`; запись `cashbackPromisedCoins` при создании заказа в `checkout.ts` и в заказе
      «в 1 клик» (`lib/ycp/orders.ts`, рядом с `placedSignedIn: false`); поля в zod-схеме настроек
      (`coinsCashbackPercent`: целое 0–50); `coins` в публичных настройках и в `PublicSettings` на web.
- [ ] **Step 6:** все тесты задачи зелёные; `migration:run` и откат проверены на локальной копии базы.
- [ ] **Step 7:** коммит `feat(api): история химикоинов, настройки и обещание кэшбека в заказе`.

---

### Task 3: Статус `delivered` везде, где есть статусы

**Files (исчерпывающий список мест со статусами, проверен 13.11.2026):**

- api: `lib/payments/orderStatus.ts:28,33`; `lib/ycp/orders.ts:244,327,331`; `lib/cdek/worker.ts:59`;
  `lib/notifications/format.ts:58-61`; `lib/notifications/outbox.ts:73-87`; `lib/analytics/stats.ts:36,60`;
  `routes/admin/orders.ts:165-178,236,247`; `routes/admin/orders.schemas.ts:6,13`;
  `routes/webhooks/cloudpayments.ts:164,175`; `seeds/_lib/methodichki-materials.ts:85`
- web: `lib/orderStatus.ts:17-24,46-69`; `lib/adminApi.ts:490`;
  `app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx:141`;
  `app/admin/(authed)/orders/page.tsx:44-50`; `orders/orderUi.ts:5-22`; `orders/[id]/OrderStatusActions.tsx:12-68`;
  `orders/[id]/CdekShipmentPanel.tsx:45,54`; `orders/[id]/OrderNotifications.tsx:16-19`; `orders/[id]/page.tsx:193,345`;
  `app/admin/(authed)/StatsDashboard.tsx:18`
- Перед правкой повторить `grep -rn "shipped" api/src web shared/src` и сверить со списком: новых мест быть не должно.

**Правила:**

- Везде, где проверяется «оплачен» (`paid` или `shipped`), использовать `isPaidOrderStatus` / `PAID_ORDER_STATUSES`;
  в SQL — `IN ('paid','shipped','delivered')`.
- Подписи: витрина «Получен», админка «Получен», уведомления «получен». В ленте статусов заказа на витрине
  `delivered` — последний шаг после «Отправлен».
- Переходы в админке: `shipped → delivered` разрешён; `delivered → cancelled` разрешён; `delivered → shipped/paid`
  запрещён; `paid → delivered` запрещён (сначала «Отправлен»). Кнопка «Получен» — в `OrderStatusActions.tsx`.
- `writeOrderStatusEvent`: при первом переходе в `delivered` (`order.status === 'delivered' && previousStatus !==
'delivered'`) проставить `deliveredAt = new Date()` и включить его в `em.update`.
- Событие `status:delivered` идёт тем же путём, что `status:shipped` — поведение уведомлений не менять.

**Interfaces — Produces:** `Order.deliveredAt: Date | null` заполняется; админский `PATCH` статуса принимает
`'delivered'`.

- [ ] **Step 1: тесты** (дополнить существующие файлы тестов этих модулей)

```ts
// orderStatus: запоздавшая оплата не трогает полученный заказ
order.status = 'delivered'
expect(applyPaymentStatus(order, 'paid')).toBe(false)
expect(order.status).toBe('delivered')
// и не роняет его в failed
expect(applyPaymentStatus(order, 'failed')).toBe(false)
// админка: shipped → delivered ок, deliveredAt заполнен
// админка: paid → delivered → 4xx; delivered → shipped → 4xx; delivered → cancelled → 200
// статистика: полученный заказ входит в выручку
// материалы: grantMaterialsForOrder не вызывается второй раз при shipped → delivered
// web/lib/orderStatus.test.ts: orderStatusLabel('delivered') === 'Получен', последний шаг ленты активен
```

- [ ] **Step 2:** запустить — падают.
- [ ] **Step 3:** правки по списку файлов.
- [ ] **Step 4:** `npm run typecheck` из корня зелёный (все `Record<OrderStatus>` и `switch` закрыты);
      `npm test -w api`, `npm test -w web` зелёные.
- [ ] **Step 5:** коммит `feat: статус заказа «Получен»`.

---

### Task 4: Начисление и отзыв кэшбека

**Files:**

- Modify: `api/src/lib/coins/cashback.ts`, `api/src/lib/notifications/outbox.ts:83-87`
- Test: `api/src/lib/coins/cashback.test.ts`

**Interfaces:**

- Consumes: `applyCoinTransaction`, `Order.cashbackPromisedCoins`, `Order.deliveredAt`.
- Produces:

```ts
export function accrueCashbackForOrder(em: EntityManager, order: Order): Promise<void>
export function revokeCashbackForOrder(em: EntityManager, order: Order): Promise<void>
```

- `accrueCashbackForOrder`: ничего не делает, если `status !== 'delivered'`, нет `customerId` или обещание 0. Иначе
  `applyCoinTransaction({ amount: cashbackPromisedCoins, kind: 'order_cashback', orderId, idempotencyKey:
'order_cashback:' + order.id })`. Настройку `coinsEnabled` **не** проверяет: обещанное начисляется всегда.
- `revokeCashbackForOrder`: если по заказу есть `order_cashback` и нет `order_cashback_revoke` — списать
  `min(обещано, баланс)` с ключом `'order_cashback_revoke:' + order.id`; разницу записать в
  `orders.cashback_shortfall_coins`. Если списывать нечего (баланс 0) — записи нет, недостача = обещанное.
- `outbox.ts`: первый переход в `delivered` → `accrueCashbackForOrder`; переход `delivered → cancelled` →
  `revokeCashbackForOrder`. Повторно после отзыва кэшбек не начисляется (ключ уже занят) — правит админ вручную.

- [ ] **Step 1: тесты** `cashback.test.ts`

```ts
// заказ с покупателем, обещано 190, shipped → delivered
expect(await balanceOf(customer.id)).toBe(190)
// повторный вызов saveOrderWithStatusEvent(order, 'shipped') — баланс тот же, запись одна
// Review Focus 1: два параллельных перехода в delivered (две транзакции) → одна запись order_cashback
const [a, b] = await Promise.allSettled([deliver(order.id), deliver(order.id)])
expect(await countKind(customer.id, 'order_cashback')).toBe(1)
// гость (customerId = null): записи нет, ошибки нет
// обещано 0 (старый заказ): записи нет
// Review Focus 5: coinsEnabled выключили после создания заказа → при delivered всё равно +190
// отзыв: delivered → cancelled при балансе 190 → баланс 0, shortfall 0
// отзыв с недостачей: потрачено 150 (admin_adjust −150), баланс 40 → после отмены баланс 0, shortfall 150
// отзыв дважды — вторая запись не создаётся
```

- [ ] **Step 2:** падают. **Step 3:** реализация. **Step 4:** зелёные.
- [ ] **Step 5:** коммит `feat(api): начисление кэшбека при получении заказа и отзыв при отмене`.

---

### Task 5: Привязка гостевых заказов и слияние аккаунтов

**Files:**

- Modify: `api/src/lib/account/customers.ts:53` (`claimOrdersByEmail`), `:73` (`mergeCustomers`),
  `api/src/lib/coins/cashback.ts`
- Test: дополнить `api/src/entities/customer.test.ts` или тест рядом с `customers.ts`

**Interfaces — Produces:**

```ts
export function accrueCashbackForCustomer(em: EntityManager, customerId: string): Promise<void>
// находит заказы покупателя в статусе delivered без записи order_cashback и вызывает accrueCashbackForOrder
```

- `claimOrdersByEmail` в конце вызывает `accrueCashbackForCustomer(em, customerId)`.
- `mergeCustomers(em, keepId, dropId)`: до удаления `dropId` — заблокировать обе строки покупателей в порядке
  возрастания id, перенести `coin_transactions.customer_id` на `keepId`, прибавить `coin_balance` удаляемого к
  оставшемуся. Новых записей истории слияние не создаёт.

- [ ] **Step 1: тесты**

```ts
// Review Focus 3a: гостевой заказ (обещано 190) получен, затем покупатель входит по той же почте
await claimOrdersByEmail(em, customer.id, 'buyer@test.local')
expect(await balanceOf(customer.id)).toBe(190)
await claimOrdersByEmail(em, customer.id, 'buyer@test.local') // повтор
expect(await balanceOf(customer.id)).toBe(190)
// привязанный, но ещё не полученный заказ: баланс 0, начислится при delivered
// Review Focus 3b: слияние — keep с 100, drop с 250
await mergeCustomers(em, keep.id, drop.id)
expect(await balanceOf(keep.id)).toBe(350)
expect(await sumTransactions(keep.id)).toBe(350)
expect(await countTransactions(drop.id)).toBe(0)
```

- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5:** коммит `feat(api): химикоины при привязке заказов и слиянии аккаунтов`.

---

### Task 6: Слежение за вручением в СДЭК

**Files:**

- Create: `api/src/lib/cdek/tracking.ts`, `api/src/lib/cdek/tracking.test.ts`
- Modify: `api/src/lib/cdek/worker.ts` (`poll` :186, тик :252/:338; тип `CdekOrderInfo` :46-55),
  `shared/src/types/cdek.ts`

**Interfaces — Produces:**

```ts
// shared/src/types/cdek.ts (тип колонки cdek_shipments.tracking_state)
export type CdekTrackingState = 'none' | 'tracking' | 'delivered' | 'not_delivered' | 'stopped'
// api/src/lib/cdek/tracking.ts
export const CDEK_TRACK_INTERVAL_MS = 3 * 60 * 60 * 1000
export const CDEK_TRACK_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
export function classifyCdekStatuses(statuses: unknown): {
  outcome: 'delivered' | 'not_delivered' | 'in_transit'
  code: string | null
}
export function processDueTracking(deps: CdekShipmentDeps, now: Date): Promise<number>
```

- [ ] **Step 1: свериться с документацией СДЭК.** Через агента `document-specialist` по официальной документации API
      СДЭК v2 подтвердить: в каком поле ответа `GET /v2/orders/{uuid}` лежит список статусов, какие коды означают
      «вручён» и «не вручён / возврат», и в каком порядке идут элементы. Записать подтверждённые коды константами в
      `tracking.ts` со ссылкой на страницу документации в комментарии. Коды из памяти не использовать.
- [ ] **Step 2: тесты** `tracking.test.ts` (фикстуры ответов — по форме из шага 1)

```ts
// classify: вручён → 'delivered'; не вручён → 'not_delivered'; в пути → 'in_transit'
// classify: undefined, [], не массив, элементы без code → 'in_transit', code: null (не падает)
// poll при переходе отправления в created ставит trackingState='tracking', nextTrackAt = now + 3 ч
// processDueTracking: вручён, заказ shipped → заказ delivered, deliveredAt заполнен,
//   кэшбек начислен, trackingState='delivered'
// то же для заказа в статусе paid (админ не нажал «Отправлен»)
// не вручён → заказ остаётся shipped, order.deliveryProblem='cdek_not_delivered', trackingState='not_delivered'
// в пути → nextTrackAt сдвинут на 3 ч, lastCdekStatus обновлён
// заказ cancelled → trackingState='stopped', статус заказа не меняется
// старше 60 дней от submittedAt → 'stopped', deliveryProblem='cdek_tracking_timeout'
// ошибка СДЭК 429/5xx → состояние не меняется, nextTrackAt сдвинут, тик не падает
// отправления с trackingState='none' (созданные до этой версии) не опрашиваются
```

- [ ] **Step 3:** реализация. `processDueTracking` берёт не больше 3 отправлений за тик
      (`state = 'created' AND tracking_state = 'tracking' AND next_track_at <= now`), смену статуса заказа делает
      через `writeOrderStatusEvent` в транзакции; вызывается из того же тика воркера после `processDueShipments`.
- [ ] **Step 4:** зелёные, включая существующие `worker.test.ts` и `worker.ycpCancel.test.ts`.
- [ ] **Step 5:** коммит `feat(api): слежение за вручением СДЭК и автоматический статус «Получен»`.

---

### Task 7: API кабинета и админки

**Files:**

- Create: `api/src/routes/account/coins.ts`, `api/src/routes/admin/customers.ts`,
  `api/src/routes/admin/customers.schemas.ts`, `api/src/routes/account-coins.test.ts`,
  `api/src/routes/admin-customers.test.ts`
- Modify: `api/src/routes/account/index.ts`, `api/src/app.ts:171-191`, обработчик `/api/account/me`,
  `api/src/lib/account/orders.ts`, `api/src/routes/admin/orders.ts` (ответ карточки заказа), `web/lib/accountApi.ts`,
  `web/lib/adminApi.ts`

**Interfaces — Produces:**

```ts
// GET /api/account/me → + coinBalance: number
// GET /api/account/coins (requireCustomerAuth + requireCustomerCsrf)
interface AccountCoins {
  balance: number
  pending: number // сумма cashbackPromisedCoins по заказам paid/shipped этого покупателя
  transactions: {
    id: string
    amount: number
    kind: CoinTransactionKind
    orderNumber: string | null
    comment: string | null
    createdAt: string
  }[] // последние 50
}
// заказ в кабинете → + cashbackPromisedCoins: number, cashbackAccrued: boolean

// админка, те же три middleware, что в routes/admin/orders.ts:21-25
// GET  /api/admin/customers?q=&page=   → { items: { id, email, telegramUsername, name, coinBalance, ordersCount }[], total }
// GET  /api/admin/customers/:id        → { customer, coinBalance, transactions, orders }
// POST /api/admin/customers/:id/coins  { amount: int ≠ 0, |amount| ≤ 100000, comment: string ≥ 3, requestId: uuid }
//      → 200 { balance } | 409 { error: 'insufficient_coins' }
// карточка заказа в админке → + cashbackPromisedCoins, cashbackAccruedCoins, cashbackShortfallCoins,
//                               deliveredAt, deliveryProblem
```

Ручная правка: `kind: 'admin_adjust'`, ключ `'admin_adjust:' + requestId`, `adminUserId` из сессии. Комментарий
админа покупателю в кабинете не показывается — вместо него подпись «Корректировка».

- [ ] **Step 1: тесты**

```ts
// кабинет: без сессии 401; чужие операции не видны
// кабинет: balance 190, pending 380 при одном начисленном и одном оплаченном заказе
// me: coinBalance присутствует
// Review Focus 4: баланс 100, POST amount −150 → 409, баланс 100, записей admin_adjust 0
// POST +500 дважды с одним requestId → баланс вырос один раз
// POST без комментария, amount 0, amount 1.5, amount 100001 → 400
// POST без admin-сессии или без CSRF → 401/403
// список: поиск q по почте и по telegram_username
```

- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5:** коммит `feat(api): химикоины в кабинете и раздел покупателей в админке`.

---

### Task 8: Шапка — аватарка и чип баланса

**Files:**

- Create: `web/lib/coins.ts`, `web/lib/coins.test.ts`, `web/components/CoinIcon.tsx`
- Modify: `web/components/AccountLink.tsx`, `web/components/Header.tsx:170`,
  `web/app/[locale]/(public)/layout.tsx:17-23`

**Interfaces — Produces:**

```ts
// web/lib/coins.ts
export function coinsWord(n: number): 'химикоин' | 'химикоина' | 'химикоинов'
export function formatCoins(n: number): string // '1 900'
export function avatarInitial(name: string | null, email: string | null): string // заглавная буква или '?'
// Header: новый проп signedInHint: boolean
```

- `layout.tsx` (серверный) читает наличие cookie `ximi4ka_customer_session` и передаёт `signedInHint` в `<Header>`.
  Страницы витрины уже динамические; исполнитель сверяется с `web/AGENTS.md`, что чтение cookie в layout не меняет
  поведение кэша, и фиксирует это в описании PR.
- `AccountLink`: при `signedInHint === false` — прежний человечек, запросов нет. При `true` — сразу рендерит кружок и
  чип фиксированной ширины (заглушка), затем `getMeOrNull()` и подстановка буквы и баланса. Чип показывается только
  если `getPublicSettings().coins !== null` или баланс > 0. Если `getMeOrNull()` вернул `null` (сессия протухла) —
  человечек.
- `aria-label`: «Личный кабинет, баланс 190 химикоинов».

- [ ] **Step 1: тесты** `coins.test.ts`

```ts
expect(coinsWord(1)).toBe('химикоин')
expect(coinsWord(3)).toBe('химикоина')
expect(coinsWord(5)).toBe('химикоинов')
expect(coinsWord(11)).toBe('химикоинов')
expect(coinsWord(21)).toBe('химикоин')
expect(coinsWord(0)).toBe('химикоинов')
expect(formatCoins(1900)).toBe('1 900')
expect(avatarInitial('рената', null)).toBe('Р')
expect(avatarInitial(null, 'buyer@test.local')).toBe('B')
expect(avatarInitial('  ', null)).toBe('?')
```

- [ ] **Step 2–3:** падают → реализация; вёрстка через `ui-ux-pro-max`, по макету витрины (Figma
      `nogum1exHXcND7QKIbx7NN`, компоненты шапки).
- [ ] **Step 4: проверка в браузере** (dev-сервер из worktree, см. память «Локальный сайт из worktree»): гость;
      вошедший с балансом 0, 190 и 12 345; ширины 375 и 1440; шапка не прыгает при загрузке баланса (сравнить
      положение соседних элементов до и после через `getBoundingClientRect`). Скриншоты приложить к PR.
- [ ] **Step 5:** коммит `feat(web): аватарка и баланс химикоинов в шапке`.

---

### Task 9: Строка кэшбека в корзине и на чекауте

**Files:**

- Create: `web/lib/useCoinsProgram.ts`, `web/components/cart/CashbackRow.tsx`, тест рядом
- Modify: `web/components/cart/CartSummaryRows.tsx`, `web/components/CartDrawer.tsx:216`,
  `web/app/[locale]/(public)/cart/page.tsx:97`, `web/app/[locale]/(public)/checkout/page.tsx:227-234,618-619`

**Interfaces — Produces:**

```ts
export function useCoinsProgram(): { percent: number | null; signedIn: boolean } // percent null — программа выключена
export function CashbackRow(props: { coins: number; signedIn: boolean }): JSX.Element | null // null при coins <= 0
// CartSummaryRows: новый необязательный проп cashback?: { coins: number; signedIn: boolean }
```

- Корзина и выезжающая корзина: `coins = cashbackCoins(totals.totalRub, percent)`.
- Чекаут: `coins = cashbackCoins(totals.totalRub − promoRub, percent)` — та же база, что на сервере (задача 2).
- Тексты: вошедшему «Вернём 190 химикоинов»; гостю «Войдите, чтобы получить 190 химикоинов», «Войдите» — ссылка на
  `/account` с возвратом на текущую страницу. Рядом ссылка-значок на `/himikoiny`.

- [ ] **Step 1: тесты**

```ts
// CashbackRow: coins 190, signedIn → текст 'Вернём 190 химикоинов'
// coins 1 → '1 химикоин'; coins 0 → ничего не рендерит
// гость → есть ссылка 'Войдите' на /account
// CartSummaryRows без пропа cashback рендерится как раньше (снимок не меняется)
```

- [ ] **Step 2–3:** падают → реализация.
- [ ] **Step 4: проверка в браузере:** сумма в строке на чекауте совпадает с `cashbackPromisedCoins` созданного
      заказа — с промокодом RENATA2026 и с оптовой скидкой; программа выключена — строки нет.
- [ ] **Step 5:** коммит `feat(web): будущий кэшбек в корзине и на чекауте`.

---

### Task 10: Кабинет и страница правил

**Files:**

- Create: `web/app/[locale]/(public)/account/(authed)/_components/CoinsCard.tsx`,
  `web/app/[locale]/(public)/himikoiny/page.tsx`
- Modify: `web/app/[locale]/(public)/account/(authed)/page.tsx`, компонент `OrdersList`, страница заказа
  `OrderStatusView.tsx`, `web/lib/accountApi.ts` (`getCoins`)

- `CoinsCard` стоит между `<ProfileCard/>` и `<MaterialsLink/>`: баланс, «Ожидает начисления: 380» (скрыто при 0),
  история операций, ссылка «Правила программы». Подписи операций: `order_cashback` — «Кэшбек за заказ №…»,
  `order_cashback_revoke` — «Отмена заказа №…», `admin_adjust` — «Корректировка». Пустая история: «Химикоины придут
  после получения первого заказа».
- В списке заказов и на странице заказа: «+190 химикоинов после получения» / «Начислено 190 химикоинов».
- `/himikoiny` — отдельный маршрут по образцу `order-process/page.tsx` (`buildMetadata`), `notFound()`, если
  `getPublicSettings().coins === null`. Текст правил — из раздела «Правила в цифрах» документа дизайна, только то,
  что работает на этапе 1 (как получить, когда начисляются, не сгорают, что при отмене); про оплату химикоинами —
  одна строка «скоро». **Текст до включения программы утверждает владелец.**

- [ ] **Step 1: тесты** — `CoinsCard` с балансом 190 / pending 380 / пустой историей; подписи трёх видов операций;
      комментарий админа не выводится.
- [ ] **Step 2–3:** падают → реализация (вёрстка через `ui-ux-pro-max`).
- [ ] **Step 4:** проверка в браузере на 375 и 1440; `/himikoiny` отдаёт 404 при выключенной программе.
- [ ] **Step 5:** коммит `feat(web): химикоины в кабинете и правила программы`.

---

### Task 11: Админка — покупатели, заказ, настройки

**Files:**

- Create: `web/app/admin/(authed)/customers/page.tsx`, `customers/[id]/page.tsx`,
  `customers/[id]/CoinAdjustForm.tsx`, `web/app/admin/(authed)/orders/[id]/OrderCoinsPanel.tsx`
- Modify: `web/components/admin/AdminShell.tsx:25-35` (пункт «Покупатели», `adminOnly`), `orders/[id]/page.tsx`,
  страница настроек админки (найти по `cloudpaymentsEnabled`), `web/lib/adminApi.ts`

- Список покупателей: поиск по почте и Telegram, колонка баланса. Карточка: баланс, история (здесь комментарии
  админа видны), заказы, форма «Начислить / Списать» с обязательным комментарием; `requestId` генерируется при
  открытии формы и меняется после успешной отправки; ответ 409 — «На балансе меньше, чем вы списываете».
- `OrderCoinsPanel` в карточке заказа: обещано, начислено или «ожидает получения», недостача (заметно, если > 0),
  пометка `deliveryProblem`: `cdek_not_delivered` — «СДЭК: посылка не вручена», `cdek_tracking_timeout` — «СДЭК: 60
  дней без вручения».
- Настройки: переключатель «Химикоины включены» и поле «Кэшбек, %».

- [ ] **Step 1: тесты** — форма не отправляется без комментария и с нулём; 409 показывает текст ошибки; панель заказа
      показывает недостачу и пометку СДЭК.
- [ ] **Step 2–3:** падают → реализация.
- [ ] **Step 4:** проверка в браузере: начислить 500, списать 600 (отказ), списать 200; перевести заказ в «Получен»
      кнопкой и увидеть начисление в карточке покупателя.
- [ ] **Step 5:** коммит `feat(admin): покупатели, химикоины в заказе, настройки программы`.

---

### Task 12: Сквозная проверка и подготовка PR

- [ ] **Step 1:** сквозной сценарий на локальном сайте: включить программу → гость видит «Войдите, чтобы получить» →
      вход → заказ с промокодом → оплата (тестовая) → «Отправлен» → «Получен» → баланс в шапке и кабинете → отмена →
      отзыв. Отдельно: программа выключена — нигде ни одного упоминания химикоинов.
- [ ] **Step 2:** из корня `npm run lint`, `npm run typecheck`, `npm test`, `npx prettier --check .` — всё зелёное,
      вывод приложить.
- [ ] **Step 3:** поиск по диффу `TODO|FIXME|test.skip|\.only` — пусто.
- [ ] **Step 4:** `/code-review` по диффу ветки; исправить найденное. `/security-review` — новые маршруты админки
      меняют баланс.
- [ ] **Step 5:** описание PR: что видит покупатель, скриншоты, порядок включения. PR открывается и мёржится только по
      команде владельца.

## Включение на проде (после мёржа, решает владелец)

1. Миграция применяется при деплое; программа выключена.
2. Владелец читает и утверждает текст `/himikoiny`.
3. Проверить, что `CDEK_ORDERS_ENABLED=true` (слежение работает в том же воркере).
4. В админке включить «Химикоины включены». С этого момента новые заказы получают обещание кэшбека.
5. Первый заказ довести до «Получен» и убедиться, что начисление пришло.

## Не входит в этот план

Оплата химикоинами на чекауте, чек 54-ФЗ и корзина Яндекса (этап 2), вызовы для learn (этап 3) — отдельные планы
после этого.
