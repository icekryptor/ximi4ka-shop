# Заказ в СДЭК после оплаты (этап 4) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** оплаченный заказ с доставкой СДЭК сам создаётся в СДЭК в формате заказа 10325990882, с повторами при сбое, номером и треком в админке и кнопкой «Создать в СДЭК ещё раз»; ответы-статусы в Telegram убираются.

**Architecture:** переход заказа в `paid` в той же транзакции ставит строку в новую таблицу `cdek_shipments`. Фоновый обработчик (тик 10 с, по образцу `lib/notifications/worker.ts`) проводит строку `queued → registering → created | failed`: `POST /v2/orders`, затем опрос `GET /v2/orders/{uuid}`. Тело заказа собирает чистая функция `buildCdekOrder`. Админка читает строку и может вернуть её в очередь.

**Tech Stack:** Express + TypeORM 0.3 + Postgres (api), Next.js App Router + Tailwind v4 (web), vitest + supertest + @testing-library/react, собственный клиент СДЭК `api/src/lib/cdek/client.ts`.

**Spec:** `docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md`

## Global Constraints

- Новых зависимостей не добавлять.
- ESM: относительные импорты в api — с суффиксом `.js`; типы из `@ximi4ka-shop/shared`.
- Комментарии в коде — по-русски, объясняют «почему», как в соседних файлах.
- Форматирование — prettier репозитория (`npx prettier --write <файлы>` перед коммитом).
- Флаг `CDEK_ORDERS_ENABLED` включён только при значении ровно `true`; по умолчанию выключен.
- Вне `NODE_ENV=production` заказы на боевом `https://api.cdek.ru/v2` не создаются.
- Реквизиты отправителя — только из env, в репозиторий — только заглушки.
- Телефон получателя — `+7XXXXXXXXXX`.
- Номер заказа СДЭК (`number`) = наш номер `XM-…`; номер места — `<номер заказа>#<i+1>`; `comment` места — `приложена опись`.
- Расписание повторов — общее с уведомлениями: `nextDelayMs`/`retryWindowMs`/`GIVE_UP_AFTER_MS`/`MIN_RATE_LIMIT_PAUSE_MS` из `api/src/lib/notifications/worker.ts`, без копий.
- Коммиты — маленькие, сообщение по-русски в стиле репозитория (`feat(api): …`), в конце строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Не пушить.
- Тесты api идут против локальной тестовой базы (`TEST_DATABASE_URL`, по умолчанию `localhost/ximi4ka_shop_test`), миграции применяются сами (`src/test/globalSetup.ts`).

## Review Focus

1. **Набор в нескольких коробках:** `packCart` оставляет места набора после первого пустыми — СДЭК отвечает 400 `[packages[1].items] is empty`. Ожидание: у каждого места своя позиция, сумма `cost` равна цене набора. Тест — Task 3.
2. **Вебхук и сверка одновременно переводят заказ в `paid`:** ожидание — одна строка `cdek_shipments`, один заказ в СДЭК. Тест — Task 4.
3. **Заказ отменили, пока строка ждала в очереди:** ожидание — в СДЭК не уходит, строка `failed` с понятной причиной. Тест — Task 5.
4. **СДЭК долго держит заказ в `ACCEPTED`** (песочница 25.09 — больше трёх минут): ожидание — повторного POST нет, через 30 мин опрос уходит на общее расписание, через сутки — `failed`. Тест — Task 5.
5. **Телефон в произвольном виде** (`8 (999) 111-22-33`, `+7 999 111 22 33`, `9991112233`): ожидание — `+79991112233`; иностранный номер уходит как есть. Тест — Task 3.

---

## Файлы

| Файл                                                                                          | Что делает                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `api/src/lib/notifications/outbox.ts`                                                         | `channelsForEvent`: статусы — только в таблицу; постановка в очередь СДЭК при `paid` |
| `api/src/lib/notifications/worker.ts`, `format.ts`                                            | убран ответ-статус в Telegram                                                        |
| `api/src/migrations/1790400000000-DropTelegramStatusReplies.ts`                               | удаляет неотправленные ответы-статусы                                                |
| `shared/src/types/order.ts`, `shared/src/types/cdek.ts`, `shared/src/index.ts`                | `DeliveryAddress.packages`, `CdekShipmentDto`, поля `OrderDto`                       |
| `api/src/routes/checkout.ts`                                                                  | сохраняет места в `delivery_address.packages`                                        |
| `api/src/lib/cdek/orders.ts`                                                                  | конфиг из env, флаг, нормализация телефона, `buildCdekOrder` (чистые функции)        |
| `api/src/lib/cdek/client.ts`                                                                  | ошибки из `requests[].errors`, экспорт `PROD_BASE_URL`                               |
| `api/src/entities/CdekShipment.ts`, `api/src/migrations/1790500000000-AddCdekShipments.ts`    | таблица очереди                                                                      |
| `api/src/lib/cdek/queue.ts`                                                                   | `enqueueCdekShipment`, `isCdekDelivery`                                              |
| `api/src/lib/cdek/orderInput.ts`                                                              | места и позиции заказа для СДЭК (из базы)                                            |
| `api/src/lib/cdek/worker.ts`                                                                  | обработчик очереди и его запуск                                                      |
| `api/src/index.ts`                                                                            | запуск обработчика                                                                   |
| `api/src/routes/admin/orders.ts`                                                              | `cdekShipment` в деталях, `POST /:id/cdek/retry`                                     |
| `web/lib/adminApi.ts`, `web/app/admin/(authed)/orders/[id]/CdekShipmentPanel.tsx`, `page.tsx` | блок «СДЭК» в карточке заказа                                                        |
| `api/.env.example`, `deploy/app.env.example`                                                  | заглушки новых переменных                                                            |
| `api/src/scripts/cdek-sandbox-order.ts`                                                       | живой прогон тела заказа в песочнице                                                 |

---

### Task 1: Telegram — только карточка нового заказа

**Files:**

- Modify: `api/src/lib/notifications/outbox.ts:7-31`
- Modify: `api/src/lib/notifications/worker.ts:7,76-99`
- Modify: `api/src/lib/notifications/format.ts:49-55,194-204` (удалить `STATUS_ICONS` и `telegramStatusLine`)
- Create: `api/src/migrations/1790400000000-DropTelegramStatusReplies.ts`
- Test: `api/src/lib/notifications/outbox.test.ts`, `api/src/lib/notifications/worker.test.ts`, `api/src/lib/notifications/format.test.ts`

**Interfaces:**

- Produces: `channelsForEvent(eventKey: OrderEventKey): NotificationChannel[]` в `outbox.ts`.

- [ ] **Step 1: Базовая проверка — тесты уведомлений зелёные до правок**

Run: `npm test -w api -- src/lib/notifications`
Expected: PASS (все файлы). Если база не поднимается — остановиться и сообщить.

- [ ] **Step 2: Написать падающие тесты**

В `outbox.test.ts` заменить тест `'ставит событие в оба канала'` на два:

```ts
it('новый заказ — в оба канала', async () => {
  const order = await seedOrder()
  await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
  expect((await rows(order.id)).map((r) => [r.channel, r.eventKey])).toEqual([
    ['sheets', 'created'],
    ['telegram', 'created'],
  ])
})

it('смена статуса — только в таблицу: ответы в чате мешают складу', async () => {
  const order = await seedOrder()
  await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'status:paid'))
  expect((await rows(order.id)).map((r) => [r.channel, r.eventKey])).toEqual([
    ['sheets', 'status:paid'],
  ])
})
```

В `worker.test.ts`:

- заменить `'смена статуса — ответ на карточку'` на:

```ts
it('смена статуса — строка таблицы обновляется, в чат ничего', async () => {
  const order = await seedOrder({ status: 'paid', telegramMessageId: 501 })
  await enqueue(order.id, 'status:paid', minutesAgo(1))
  const channels = fakeChannels()
  await processDueNotifications(channels, { now: NOW })
  expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(1)
  expect(channels.telegram.sendMessage).not.toHaveBeenCalled()
})

it('ответ-статус в Telegram от старой версии не отправляется', async () => {
  const order = await seedOrder({ status: 'paid', telegramMessageId: 501 })
  await AppDataSource.getRepository(OrderNotification).save(
    AppDataSource.getRepository(OrderNotification).create({
      orderId: order.id,
      channel: 'telegram',
      eventKey: 'status:paid',
      nextAttemptAt: minutesAgo(1),
    }),
  )
  const errorSpy = silenceConsoleError()
  const channels = fakeChannels()
  await processDueNotifications(channels, { now: NOW })
  expect(channels.telegram.sendMessage).not.toHaveBeenCalled()
  const stale = await row(order.id, 'telegram', 'status:paid')
  expect(stale.failedAt).not.toBeNull()
  expect(stale.lastError).toContain('отключены')
  errorSpy.mockRestore()
})
```

- удалить тесты `'карточка и статус в одном тике — статус отвечает на свежий id карточки'` и `'карточка не ушла совсем — статус отдельным сообщением с номером заказа'` — поведения больше нет;
- `'статус не обгоняет карточку, которую ещё не отправили'` переписать на канал таблицы (порядок внутри канала по-прежнему важен):

```ts
it('статус не обгоняет карточку, которую ещё не отправили', async () => {
  const order = await seedOrder({ status: 'paid' })
  await enqueue(order.id, 'created', minutesAgo(2))
  await enqueue(order.id, 'status:paid', minutesAgo(1))
  const channels = fakeChannels()
  channels.sheets.upsertOrderRow.mockRejectedValueOnce(new Error('socket hang up'))
  const errorSpy = silenceConsoleError()

  await processDueNotifications(channels, { now: NOW })

  expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(1)
  const status = await row(order.id, 'sheets', 'status:paid')
  expect(status.attempts).toBe(0)
  expect(status.sentAt).toBeNull()
  expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('socket hang up'))
  expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(FAKE_SECRET)
  errorSpy.mockRestore()
})
```

- `'заблокированные статусы не съедают партию — здоровая запись сверху доходит'` переписать на канал таблицы (статус теперь есть только там):

```ts
it('заблокированные статусы не съедают партию — здоровая запись сверху доходит', async () => {
  // 21 заказ: строка таблицы ('created' в sheets) в бэкоффе после неудачной
  // попытки, а смена статуса уже готова к повтору — раньше такие «зависшие»
  // строки статуса попадали в выборку (next_attempt_at уже прошёл) и съедали
  // место в партии (BATCH_SIZE=20), просто пропускаясь в цикле, — здоровая
  // запись не доходила до обработки.
  for (let i = 0; i < 21; i += 1) {
    const order = await seedOrder({ status: 'paid' })
    await enqueue(order.id, 'created', minutesAgo(120))
    // Карточка в чате этого заказа в сценарии не участвует — уже доставлена.
    await AppDataSource.query(
      `UPDATE order_notifications SET sent_at = $2
         WHERE order_id = $1 AND channel = 'telegram' AND event_key = 'created'`,
      [order.id, minutesAgo(119)],
    )
    // Строка таблицы: одна попытка уже была и ушла в бэкофф на час.
    await AppDataSource.query(
      `UPDATE order_notifications SET attempts = 1, next_attempt_at = $2
         WHERE order_id = $1 AND channel = 'sheets' AND event_key = 'created'`,
      [order.id, new Date(NOW.getTime() + 3_600_000)],
    )
    await enqueue(order.id, 'status:paid', minutesAgo(1))
  }
  const healthy = await seedOrder()
  await enqueue(healthy.id, 'created', minutesAgo(1))

  const channels = fakeChannels()
  await processDueNotifications(channels, { now: NOW })

  expect(channels.sheets.upsertOrderRow).toHaveBeenCalledWith(
    healthy.orderNumber,
    expect.any(Array),
  )
  expect(channels.telegram.sendMessage).toHaveBeenCalledWith(
    expect.stringContaining(`Новый заказ ${healthy.orderNumber}`),
  )
})
```

В `format.test.ts` удалить `describe('telegramStatusLine', …)` и `telegramStatusLine` из импорта.

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `npm test -w api -- src/lib/notifications`
Expected: FAIL — `'смена статуса — только в таблицу…'` (есть лишняя строка telegram), `'ответ-статус в Telegram от старой версии…'` (sendMessage вызван).

- [ ] **Step 4: Реализация**

`outbox.ts` — после `CHANNELS`:

```ts
// Куда уходит событие. Карточка нового заказа — в таблицу и в чат; смены
// статуса — только в таблицу: ответы на карточку заспамливали рабочий чат и
// мешали складу (решение владельца, docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §6).
export function channelsForEvent(eventKey: OrderEventKey): NotificationChannel[] {
  return eventKey === 'created' ? CHANNELS : ['sheets']
}
```

и в `enqueueOrderEvent` заменить `.values(CHANNELS.map(...))` на `.values(channelsForEvent(eventKey).map((channel) => ({ orderId, channel, eventKey })))`.

`worker.ts` — в `deliver` вместо ветки ответа на карточку:

```ts
const bot = channels.telegram!
if (row.eventKey !== 'created') {
  // Статусы в чат больше не ставятся (channelsForEvent). Такая запись могла
  // остаться только от прошлой версии — не отправляем.
  throw new TelegramConfigError('Смены статуса в Telegram отключены')
}
const telegramMessageId = await bot.sendMessage(telegramCard(order))
return { telegramMessageId }
```

Убрать `telegramStatusLine` из импорта `./format.js`; убрать `OrderEventKey` из импорта, если он больше не используется. В `format.ts` удалить `STATUS_ICONS` и `telegramStatusLine` (проверить `grep -n STATUS_ICONS api/src` — других использований нет).

Миграция `api/src/migrations/1790400000000-DropTelegramStatusReplies.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Ответы-статусы в Telegram отключены (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §6).
// Неотправленные записи удаляем, чтобы после выкатки в чат не пришёл их хвост.
export class DropTelegramStatusReplies1790400000000 implements MigrationInterface {
  name = 'DropTelegramStatusReplies1790400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "order_notifications"
       WHERE "channel" = 'telegram' AND "event_key" <> 'created' AND "sent_at" IS NULL`,
    )
  }

  // Удалены только неотправленные ответы — восстанавливать нечего.
  public async down(): Promise<void> {}
}
```

- [ ] **Step 5: Прогнать тесты**

Run: `npm test -w api -- src/lib/notifications`
Expected: PASS. Если упал другой тест, который опирался на строку `telegram`/`status:*` (например, про лимит Telegram или лимит доставок за тик), переписать его на строки `created` отдельных заказов, сохранив то, что он проверял.

Run: `npm run typecheck -w api`
Expected: без ошибок.

- [ ] **Step 6: Коммит**

```bash
npx prettier --write api/src/lib/notifications api/src/migrations/1790400000000-DropTelegramStatusReplies.ts
git add api/src/lib/notifications api/src/migrations/1790400000000-DropTelegramStatusReplies.ts
git commit -m "feat(api): в Telegram только карточка нового заказа

Ответы-статусы заспамливали рабочий чат и мешали складу. Статусы
по-прежнему обновляют строку Google Таблицы.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Места отправления сохраняются в заказе

**Files:**

- Modify: `shared/src/types/order.ts:28-45` (`DeliveryAddress`)
- Modify: `api/src/routes/checkout.ts:55-93`
- Test: `api/src/routes/checkout.test.ts:65-118`

**Interfaces:**

- Produces: `DeliveryAddress.packages?: ShippingPackage[]` — места на момент заказа.

- [ ] **Step 1: Падающий тест**

В `checkout.test.ts`, тест `'creates a pending order with DB-recomputed prices and snapshots'`: заменить `expect(order.deliveryAddress).toEqual({...})` на

```ts
const { packages, ...address } = order.deliveryAddress
expect(address).toEqual({
  address: 'Москва, ул. Ленина, 1',
  comment: 'после 18:00',
  cityCode: 44,
  deliveryPointCode: 'MSK123',
  postalCode: null,
  quote: {
    tariffCode: 136,
    cdekPriceRub: null,
    periodMin: null,
    periodMax: null,
    source: 'fallback',
  },
})
// Места, по которым считали цену, — по ним потом создаётся заказ в СДЭК.
expect(packages).toHaveLength(1)
expect(packages![0]).toMatchObject({ box: 'small', estimated: true })
expect(packages![0].items).toEqual(expect.arrayContaining([{ productId: p1.id, quantity: 2 }]))
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- src/routes/checkout.test.ts`
Expected: FAIL — `packages` undefined (и ошибка типов в тесте: поля нет в `DeliveryAddress`).

- [ ] **Step 3: Реализация**

`shared/src/types/order.ts` — вверху `import type { ShippingPackage } from './shipping.js'`, в `DeliveryAddress` после `quote`:

```ts
  // Места отправления на момент заказа (packCart) — по ним создаётся заказ в
  // СДЭК. У заказов до этапа 4 поля нет.
  packages?: ShippingPackage[]
```

`api/src/routes/checkout.ts` — перед расчётом цены `const packages = packCart(packLines)`, в `quoteDelivery` передать `packages`, в `deliveryAddress` после `quote: {...}` добавить `packages,`.

- [ ] **Step 4: Тесты**

Run: `npm test -w api -- src/routes/checkout.test.ts` → PASS.
Run: `npm run typecheck -w shared && npm run typecheck -w api && npm run typecheck -w web` → без ошибок.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write shared/src/types/order.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git add shared/src/types/order.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git commit -m "feat(api): места отправления сохраняются в заказе

Разбивка по коробкам считалась только для цены и терялась. Заказ в СДЭК
должен уйти теми же местами, по которым посчитали доставку.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Тело заказа СДЭК — `buildCdekOrder` и настройки

**Files:**

- Create: `api/src/lib/cdek/orders.ts`
- Test: `api/src/lib/cdek/orders.test.ts` (без базы)

**Interfaces:**

- Consumes: `deliveryConfigFromEnv(env)` из `api/src/lib/shipping/quote.ts` (`{ fromCityCode, tariffPvz, tariffCourier }`); `ShippingPackage`, `DeliveryAddress` из shared.
- Produces (все из `api/src/lib/cdek/orders.ts`):
  - `interface CdekOrderConfig { shipmentPoint: string; sender: { company: string; name: string; phone: string; email: string | null }; sellerName: string; tariffPvz: number; tariffCourier: number }`
  - `class CdekConfigError extends Error`, `class CdekDataError extends Error`
  - `cdekOrdersEnabled(env?: NodeJS.ProcessEnv): boolean`
  - `cdekOrderConfigFromEnv(env?: NodeJS.ProcessEnv): CdekOrderConfig` — бросает `CdekConfigError`
  - `normalizeRuPhone(raw: string): string`
  - `interface CdekOrderLine { productId: string; name: string; sku: string | null; unitPriceRub: number; unitWeightG: number }`
  - `interface CdekOrderSource { orderNumber: string; customerName: string; customerPhone: string; customerEmail: string; deliveryMethod: string; deliveryAddress: DeliveryAddress }`
  - `interface CdekOrderRequest` (тело `POST /v2/orders`)
  - `buildCdekOrder(order: CdekOrderSource, packages: ShippingPackage[], lines: CdekOrderLine[], config: CdekOrderConfig): CdekOrderRequest` — бросает `CdekDataError`

- [ ] **Step 1: Падающие тесты**

`api/src/lib/cdek/orders.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ShippingPackage } from '@ximi4ka-shop/shared'
import {
  buildCdekOrder,
  cdekOrderConfigFromEnv,
  cdekOrdersEnabled,
  CdekConfigError,
  CdekDataError,
  normalizeRuPhone,
  type CdekOrderConfig,
  type CdekOrderLine,
  type CdekOrderSource,
} from './orders.js'

const config: CdekOrderConfig = {
  shipmentPoint: 'MSK310',
  sender: {
    company: 'ИП Тестова',
    name: 'Тестова Анна',
    phone: '+79990000000',
    email: 'shop@example.com',
  },
  sellerName: 'ИП Тестова',
  tariffPvz: 136,
  tariffCourier: 137,
}

const pvzOrder: CdekOrderSource = {
  orderNumber: 'XM-2026-00042',
  customerName: 'Иван Петров',
  customerPhone: '8 (912) 345-67-89',
  customerEmail: 'ivan@example.com',
  deliveryMethod: 'cdek_pvz',
  deliveryAddress: {
    address: 'Нальчик, ул. Ленина, 1',
    comment: null,
    cityCode: 1081,
    deliveryPointCode: 'NLCH7',
    quote: { tariffCode: 136, cdekPriceRub: 345, periodMin: 2, periodMax: 4, source: 'cdek' },
  },
}

const lines: CdekOrderLine[] = [
  {
    productId: 'p-fecl3',
    name: 'Хлорид железа III',
    sku: 'FECL3',
    unitPriceRub: 99,
    unitWeightG: 50,
  },
  {
    productId: 'p-naoh',
    name: 'Гидроксид натрия',
    sku: 'NAOH',
    unitPriceRub: 119,
    unitWeightG: 100,
  },
]

const loose: ShippingPackage = {
  box: 'small',
  weightG: 400,
  lengthCm: 10,
  widthCm: 10,
  heightCm: 4,
  estimated: false,
  items: [
    { productId: 'p-fecl3', quantity: 2 },
    { productId: 'p-naoh', quantity: 1 },
  ],
}

describe('buildCdekOrder', () => {
  it('ПВЗ — в формате эталона 10325990882', () => {
    expect(buildCdekOrder(pvzOrder, [loose], lines, config)).toEqual({
      type: 1,
      number: 'XM-2026-00042',
      tariff_code: 136,
      shipment_point: 'MSK310',
      delivery_point: 'NLCH7',
      delivery_recipient_cost: { value: 0 },
      sender: {
        company: 'ИП Тестова',
        name: 'Тестова Анна',
        email: 'shop@example.com',
        phones: [{ number: '+79990000000' }],
      },
      seller: { name: 'ИП Тестова' },
      recipient: {
        name: 'Иван Петров',
        email: 'ivan@example.com',
        phones: [{ number: '+79123456789' }],
      },
      packages: [
        {
          number: 'XM-2026-00042#1',
          weight: 400,
          length: 10,
          width: 10,
          height: 4,
          comment: 'приложена опись',
          items: [
            {
              name: 'Хлорид железа III',
              ware_key: 'FECL3',
              payment: { value: 0 },
              cost: 99,
              weight: 50,
              amount: 2,
            },
            {
              name: 'Гидроксид натрия',
              ware_key: 'NAOH',
              payment: { value: 0 },
              cost: 119,
              weight: 100,
              amount: 1,
            },
          ],
        },
      ],
    })
  })

  it('курьер — to_location с кодом города, индексом и адресом', () => {
    const body = buildCdekOrder(
      {
        ...pvzOrder,
        deliveryMethod: 'cdek_courier',
        deliveryAddress: {
          address: 'Казань, ул. Баумана, 5, кв. 3',
          comment: null,
          cityCode: 424,
          postalCode: '420111',
          quote: { tariffCode: 137, cdekPriceRub: 500, periodMin: 2, periodMax: 3, source: 'cdek' },
        },
      },
      [loose],
      lines,
      config,
    )
    expect(body.delivery_point).toBeUndefined()
    expect(body.to_location).toEqual({
      code: 424,
      postal_code: '420111',
      address: 'Казань, ул. Баумана, 5, кв. 3',
    })
    expect(body.tariff_code).toBe(137)
  })

  it('без сохранённого тарифа — тариф из настроек по способу доставки', () => {
    const address = { ...pvzOrder.deliveryAddress, quote: undefined }
    expect(
      buildCdekOrder({ ...pvzOrder, deliveryAddress: address }, [loose], lines, config).tariff_code,
    ).toBe(136)
  })

  it('без email покупателя и отправителя — поля email нет', () => {
    const body = buildCdekOrder({ ...pvzOrder, customerEmail: '' }, [loose], lines, {
      ...config,
      sender: { ...config.sender, email: null },
    })
    expect(body.recipient).not.toHaveProperty('email')
    expect(body.sender).not.toHaveProperty('email')
  })

  it('набор в двух коробках — у каждого места своя позиция, цена делится', () => {
    const kit: CdekOrderLine = {
      productId: 'p-kit',
      name: 'Химичка 3.0',
      sku: '7V25',
      unitPriceRub: 3299,
      unitWeightG: 2000,
    }
    const box = (items: ShippingPackage['items']): ShippingPackage => ({
      box: 'large',
      weightG: 1000,
      lengthCm: 40,
      widthCm: 32,
      heightCm: 8,
      estimated: false,
      items,
    })
    const body = buildCdekOrder(
      pvzOrder,
      [box([{ productId: 'p-kit', quantity: 1 }]), box([])],
      [kit],
      config,
    )
    expect(body.packages.map((p) => p.items)).toEqual([
      [
        {
          name: 'Химичка 3.0 (место 1 из 2)',
          ware_key: '7V25',
          payment: { value: 0 },
          cost: 1650,
          weight: 1000,
          amount: 1,
        },
      ],
      [
        {
          name: 'Химичка 3.0 (место 2 из 2)',
          ware_key: '7V25-2',
          payment: { value: 0 },
          cost: 1649,
          weight: 1000,
          amount: 1,
        },
      ],
    ])
    expect(body.packages.map((p) => p.number)).toEqual(['XM-2026-00042#1', 'XM-2026-00042#2'])
  })

  it('два одинаковых набора в одной коробке каждый — два места по одной позиции', () => {
    const kit: CdekOrderLine = {
      productId: 'p-kit',
      name: 'Мини-Химичка',
      sku: 'MINI',
      unitPriceRub: 1990,
      unitWeightG: 900,
    }
    const box: ShippingPackage = {
      box: 'medium',
      weightG: 900,
      lengthCm: 17,
      widthCm: 15,
      heightCm: 12,
      estimated: false,
      items: [{ productId: 'p-kit', quantity: 1 }],
    }
    const body = buildCdekOrder(pvzOrder, [box, box], [kit], config)
    expect(body.packages).toHaveLength(2)
    expect(body.packages[1].items).toEqual([
      {
        name: 'Мини-Химичка',
        ware_key: 'MINI',
        payment: { value: 0 },
        cost: 1990,
        weight: 900,
        amount: 1,
      },
    ])
  })

  it('вес места не меньше суммы весов позиций', () => {
    const light = { ...loose, weightG: 100 }
    // 2 × 50 + 1 × 100 = 200 г
    expect(buildCdekOrder(pvzOrder, [light], lines, config).packages[0].weight).toBe(200)
  })

  it('товар без артикула — ware_key = id товара', () => {
    const noSku = lines.map((l) => ({ ...l, sku: null }))
    const keys = buildCdekOrder(pvzOrder, [loose], noSku, config).packages[0].items.map(
      (i) => i.ware_key,
    )
    expect(keys).toEqual(['p-fecl3', 'p-naoh'])
  })

  it('ПВЗ без кода пункта — ошибка данных', () => {
    const address = { ...pvzOrder.deliveryAddress, deliveryPointCode: null }
    expect(() =>
      buildCdekOrder({ ...pvzOrder, deliveryAddress: address }, [loose], lines, config),
    ).toThrow(CdekDataError)
  })

  it('доставка не СДЭК — ошибка данных', () => {
    expect(() =>
      buildCdekOrder({ ...pvzOrder, deliveryMethod: 'pickup' }, [loose], lines, config),
    ).toThrow(CdekDataError)
  })

  it('нет мест — ошибка данных', () => {
    expect(() => buildCdekOrder(pvzOrder, [], lines, config)).toThrow(CdekDataError)
  })

  it('место ссылается на товар, которого нет в заказе, — ошибка данных', () => {
    expect(() => buildCdekOrder(pvzOrder, [loose], lines.slice(0, 1), config)).toThrow(
      CdekDataError,
    )
  })
})

describe('normalizeRuPhone', () => {
  it.each([
    ['8 (999) 111-22-33', '+79991112233'],
    ['+7 999 111 22 33', '+79991112233'],
    ['79991112233', '+79991112233'],
    ['9991112233', '+79991112233'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeRuPhone(raw)).toBe(expected)
  })

  it('не российский номер — как есть', () => {
    expect(normalizeRuPhone(' +33 6 12 34 56 78 ')).toBe('+33 6 12 34 56 78')
  })
})

describe('настройки', () => {
  const env = {
    CDEK_SHIPMENT_POINT: 'MSK310',
    CDEK_SENDER_COMPANY: 'ИП Тестова',
    CDEK_SENDER_NAME: 'Тестова Анна',
    CDEK_SENDER_PHONE: '8 999 000-00-00',
  }

  it('флаг включён только значением true', () => {
    expect(cdekOrdersEnabled({ CDEK_ORDERS_ENABLED: 'true' })).toBe(true)
    expect(cdekOrdersEnabled({ CDEK_ORDERS_ENABLED: '1' })).toBe(false)
    expect(cdekOrdersEnabled({})).toBe(false)
  })

  it('продавец по умолчанию — компания отправителя, телефон нормализуется', () => {
    expect(cdekOrderConfigFromEnv(env)).toEqual({
      shipmentPoint: 'MSK310',
      sender: { company: 'ИП Тестова', name: 'Тестова Анна', phone: '+79990000000', email: null },
      sellerName: 'ИП Тестова',
      tariffPvz: 136,
      tariffCourier: 137,
    })
  })

  it('без обязательных переменных — ошибка со списком того, чего нет', () => {
    const partial = { ...env, CDEK_SENDER_NAME: '', CDEK_SHIPMENT_POINT: ' ' }
    expect(() => cdekOrderConfigFromEnv(partial)).toThrow(CdekConfigError)
    expect(() => cdekOrderConfigFromEnv(partial)).toThrow(/CDEK_SHIPMENT_POINT, CDEK_SENDER_NAME/)
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- src/lib/cdek/orders.test.ts`
Expected: FAIL — модуль `./orders.js` не найден.

- [ ] **Step 3: Реализация `api/src/lib/cdek/orders.ts`**

```ts
import type { DeliveryAddress, ShippingPackage } from '@ximi4ka-shop/shared'
import { deliveryConfigFromEnv } from '../shipping/quote.js'

// Заказ в СДЭК после оплаты (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md).
// Формат снят с заказа Тильды 10325990882: ИМ, предоплата, сдача в пункт
// отгрузки, отправитель — ИП, у мест комментарий «приложена опись».

export interface CdekOrderConfig {
  shipmentPoint: string
  sender: { company: string; name: string; phone: string; email: string | null }
  sellerName: string
  tariffPvz: number
  tariffCourier: number
}

// Не хватает настройки — обработчик не запускается, записи ждут.
export class CdekConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CdekConfigError'
  }
}

// Данные заказа, которые СДЭК не примет, — повтор тех же данных не поможет.
export class CdekDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CdekDataError'
  }
}

export function cdekOrdersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CDEK_ORDERS_ENABLED === 'true'
}

const REQUIRED_ENV = [
  'CDEK_SHIPMENT_POINT',
  'CDEK_SENDER_COMPANY',
  'CDEK_SENDER_NAME',
  'CDEK_SENDER_PHONE',
] as const

export function cdekOrderConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CdekOrderConfig {
  const missing = REQUIRED_ENV.filter((key) => !env[key]?.trim())
  if (missing.length > 0) throw new CdekConfigError(`Не заданы ${missing.join(', ')}`)
  const { tariffPvz, tariffCourier } = deliveryConfigFromEnv(env)
  const company = env.CDEK_SENDER_COMPANY!.trim()
  return {
    shipmentPoint: env.CDEK_SHIPMENT_POINT!.trim(),
    sender: {
      company,
      name: env.CDEK_SENDER_NAME!.trim(),
      phone: normalizeRuPhone(env.CDEK_SENDER_PHONE!),
      email: env.CDEK_SENDER_EMAIL?.trim() || null,
    },
    sellerName: env.CDEK_SELLER_NAME?.trim() || company,
    tariffPvz,
    tariffCourier,
  }
}

// СДЭК ждёт +7XXXXXXXXXX, а чекаут хранит телефон как ввёл покупатель:
// «8 (999) 111-22-33», «+7 999 111 22 33», «9991112233». Не похожее на
// российский номер отдаём как есть — СДЭК вернёт ошибку, её видно в админке.
export function normalizeRuPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    return `+7${digits.slice(1)}`
  }
  if (digits.length === 10 && digits[0] === '9') return `+7${digits}`
  return raw.trim()
}

// Позиция, как её видит СДЭК: название, артикул и цена — из снимка заказа
// (что купили), вес за штуку — из карточки товара.
export interface CdekOrderLine {
  productId: string
  name: string
  sku: string | null
  unitPriceRub: number
  unitWeightG: number
}

export interface CdekOrderSource {
  orderNumber: string
  customerName: string
  customerPhone: string
  customerEmail: string
  deliveryMethod: string
  deliveryAddress: DeliveryAddress
}

export interface CdekOrderItem {
  name: string
  ware_key: string
  payment: { value: number }
  cost: number
  weight: number
  amount: number
}

export interface CdekOrderPackage {
  number: string
  weight: number
  length: number
  width: number
  height: number
  comment: string
  items: CdekOrderItem[]
}

interface CdekContact {
  name: string
  email?: string
  phones: { number: string }[]
}

export interface CdekOrderRequest {
  type: 1
  number: string
  tariff_code: number
  shipment_point: string
  delivery_point?: string
  to_location?: { code?: number; postal_code?: string; address: string }
  delivery_recipient_cost: { value: 0 }
  sender: CdekContact & { company: string }
  seller: { name: string }
  recipient: CdekContact
  packages: CdekOrderPackage[]
}

const PACKAGE_COMMENT = 'приложена опись'
const WARE_KEY_MAX = 40

function wareKey(line: CdekOrderLine): string {
  return (line.sku?.trim() || line.productId).slice(0, WARE_KEY_MAX)
}

function item(
  name: string,
  key: string,
  cost: number,
  weightG: number,
  amount: number,
): CdekOrderItem {
  return {
    name,
    ware_key: key,
    payment: { value: 0 },
    cost,
    weight: Math.max(1, Math.round(weightG)),
    amount,
  }
}

// Вес места — не меньше суммы весов позиций: места сохранены на чекауте, а
// веса товаров с тех пор могли поменяться.
function place(
  orderNumber: string,
  index: number,
  pkg: ShippingPackage,
  items: CdekOrderItem[],
): CdekOrderPackage {
  const itemsWeight = items.reduce((sum, it) => sum + it.weight * it.amount, 0)
  return {
    number: `${orderNumber}#${index}`,
    weight: Math.max(pkg.weightG, itemsWeight),
    length: pkg.lengthCm,
    width: pkg.widthCm,
    height: pkg.heightCm,
    comment: PACKAGE_COMMENT,
    items,
  }
}

function destination(
  order: CdekOrderSource,
): Pick<CdekOrderRequest, 'delivery_point' | 'to_location'> {
  const address = order.deliveryAddress
  if (order.deliveryMethod === 'cdek_pvz') {
    if (!address.deliveryPointCode) throw new CdekDataError('Не указан код ПВЗ')
    return { delivery_point: address.deliveryPointCode }
  }
  if (order.deliveryMethod === 'cdek_courier') {
    return {
      to_location: {
        ...(address.cityCode ? { code: address.cityCode } : {}),
        ...(address.postalCode ? { postal_code: address.postalCode } : {}),
        address: address.address,
      },
    }
  }
  throw new CdekDataError(`Доставка «${order.deliveryMethod}» — не СДЭК`)
}

export function buildCdekOrder(
  order: CdekOrderSource,
  packages: ShippingPackage[],
  lines: CdekOrderLine[],
  config: CdekOrderConfig,
): CdekOrderRequest {
  if (packages.length === 0) throw new CdekDataError('В заказе нет мест для отправки')
  const lineById = new Map(lines.map((l) => [l.productId, l]))
  const lineFor = (productId: string): CdekOrderLine => {
    const found = lineById.get(productId)
    if (!found) throw new CdekDataError(`В заказе нет позиции для товара ${productId}`)
    return found
  }

  // packCart кладёт позицию набора только в первое его место, остальные места
  // набора идут следом пустыми. СДЭК пустое место не принимает (400
  // «packages[1].items is empty»), поэтому собираем места набора в группу и
  // даём каждому свою позицию.
  const groups: ShippingPackage[][] = []
  for (const pkg of packages) {
    if (pkg.items.length > 0) groups.push([pkg])
    else if (groups.length > 0) groups[groups.length - 1].push(pkg)
    else throw new CdekDataError('Первое место заказа без позиций')
  }

  const cdekPackages: CdekOrderPackage[] = []
  for (const group of groups) {
    const [first] = group
    if (group.length === 1) {
      const items = first.items.map(({ productId, quantity }) => {
        const l = lineFor(productId)
        return item(l.name, wareKey(l), l.unitPriceRub, l.unitWeightG, quantity)
      })
      cdekPackages.push(place(order.orderNumber, cdekPackages.length + 1, first, items))
      continue
    }
    if (first.items.length !== 1 || first.items[0].quantity !== 1) {
      throw new CdekDataError('Непонятная разбивка набора по местам')
    }
    // Цена набора делится между местами (остаток — в первое), чтобы страховка
    // по сумме позиций осталась равна цене.
    const l = lineFor(first.items[0].productId)
    const n = group.length
    const share = Math.floor(l.unitPriceRub / n)
    group.forEach((pkg, i) => {
      const cost = i === 0 ? l.unitPriceRub - share * (n - 1) : share
      const key = i === 0 ? wareKey(l) : `${wareKey(l)}-${i + 1}`
      const it = item(`${l.name} (место ${i + 1} из ${n})`, key, cost, pkg.weightG, 1)
      cdekPackages.push(place(order.orderNumber, cdekPackages.length + 1, pkg, [it]))
    })
  }

  const email = order.customerEmail.trim()
  return {
    type: 1,
    number: order.orderNumber,
    tariff_code:
      order.deliveryAddress.quote?.tariffCode ??
      (order.deliveryMethod === 'cdek_pvz' ? config.tariffPvz : config.tariffCourier),
    shipment_point: config.shipmentPoint,
    ...destination(order),
    delivery_recipient_cost: { value: 0 },
    sender: {
      company: config.sender.company,
      name: config.sender.name,
      ...(config.sender.email ? { email: config.sender.email } : {}),
      phones: [{ number: config.sender.phone }],
    },
    seller: { name: config.sellerName },
    recipient: {
      name: order.customerName.trim(),
      ...(email ? { email } : {}),
      phones: [{ number: normalizeRuPhone(order.customerPhone) }],
    },
    packages: cdekPackages,
  }
}
```

- [ ] **Step 4: Тесты**

Run: `npm test -w api -- src/lib/cdek/orders.test.ts` → PASS.
Run: `npm run typecheck -w api` → без ошибок.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write api/src/lib/cdek/orders.ts api/src/lib/cdek/orders.test.ts
git add api/src/lib/cdek/orders.ts api/src/lib/cdek/orders.test.ts
git commit -m "feat(api): тело заказа СДЭК в формате заказа 10325990882

Чистая функция buildCdekOrder, настройки отправителя из env, флаг
CDEK_ORDERS_ENABLED. Места набора из нескольких коробок получают свою
позицию — пустое место СДЭК не принимает.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Очередь `cdek_shipments` и постановка при оплате

**Files:**

- Create: `api/src/entities/CdekShipment.ts`
- Create: `api/src/migrations/1790500000000-AddCdekShipments.ts`
- Create: `api/src/lib/cdek/queue.ts`
- Create: `shared/src/types/cdek.ts`; Modify: `shared/src/index.ts`
- Modify: `api/src/config/dataSource.ts:13,82-97` (регистрация сущности)
- Modify: `api/src/lib/notifications/outbox.ts` (`saveOrderWithStatusEvent`)
- Test: `api/src/lib/notifications/outbox.test.ts`

**Interfaces:**

- Consumes: `cdekOrdersEnabled(env)` из Task 3.
- Produces:
  - `type CdekShipmentState = 'queued' | 'registering' | 'created' | 'failed'` и `interface CdekShipmentDto { state: CdekShipmentState; cdekNumber: string | null; attempts: number; nextAttemptAt: string; lastError: string | null; updatedAt: string }` в `shared/src/types/cdek.ts`, экспорт из `@ximi4ka-shop/shared`.
  - сущность `CdekShipment` (поля: `id`, `orderId`, `state`, `attempts`, `nextAttemptAt: Date`, `cdekUuid: string | null`, `cdekNumber: string | null`, `lastError: string | null`, `submittedAt: Date | null`, `createdAt`, `updatedAt`).
  - `isCdekDelivery(method: string): boolean`, `enqueueCdekShipment(em: EntityManager, order: Pick<Order, 'id' | 'deliveryMethod'>, env?: NodeJS.ProcessEnv): Promise<void>` в `api/src/lib/cdek/queue.ts`.

- [ ] **Step 1: Падающие тесты**

В `outbox.test.ts` — импортировать `vi`, `afterEach` из vitest и `CdekShipment` из `../../entities/CdekShipment.js`; внутри `describe('outbox', …)` добавить `afterEach(() => vi.unstubAllEnvs())` и тесты:

```ts
const shipments = (orderId: string) => AppDataSource.getRepository(CdekShipment).findBy({ orderId })

it('оплата заказа СДЭК ставит его в очередь создания в СДЭК', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  const order = await seedOrder()
  order.status = 'paid'
  await saveOrderWithStatusEvent(order, 'pending')
  expect(await shipments(order.id)).toMatchObject([{ state: 'queued', attempts: 0 }])
})

it('вебхук и сверка дважды отметили оплату — одна запись', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  const order = await seedOrder()
  order.status = 'paid'
  await Promise.all([
    saveOrderWithStatusEvent(order, 'pending'),
    saveOrderWithStatusEvent(order, 'pending'),
  ])
  expect(await shipments(order.id)).toHaveLength(1)
})

it('флаг выключен — в очередь СДЭК не ставим', async () => {
  // dotenv читает api/.env и под тестами — не полагаемся на то, что там пусто.
  vi.stubEnv('CDEK_ORDERS_ENABLED', '')
  const order = await seedOrder()
  order.status = 'paid'
  await saveOrderWithStatusEvent(order, 'pending')
  expect(await shipments(order.id)).toHaveLength(0)
})

it('доставка не СДЭК и не оплата — не ставим', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  const pickup = await seedOrder({ deliveryMethod: 'pickup' })
  pickup.status = 'paid'
  await saveOrderWithStatusEvent(pickup, 'pending')
  const cancelled = await seedOrder()
  cancelled.status = 'cancelled'
  await saveOrderWithStatusEvent(cancelled, 'pending')
  expect(await shipments(pickup.id)).toHaveLength(0)
  expect(await shipments(cancelled.id)).toHaveLength(0)
})
```

Если `seedOrder` в `outbox.test.ts` создаёт заказ не с `deliveryMethod: 'cdek_pvz'`, передать его явно в первых двух тестах.

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- src/lib/notifications/outbox.test.ts`
Expected: FAIL — нет модуля `CdekShipment`.

- [ ] **Step 3: Реализация**

`shared/src/types/cdek.ts`:

```ts
// Заказ в СДЭК после оплаты (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md).
export type CdekShipmentState = 'queued' | 'registering' | 'created' | 'failed'

export interface CdekShipmentDto {
  state: CdekShipmentState
  cdekNumber: string | null
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  updatedAt: string
}
```

`shared/src/index.ts` — добавить `export type { CdekShipmentDto, CdekShipmentState } from './types/cdek.js'`.

`api/src/entities/CdekShipment.ts`:

```ts
import 'reflect-metadata'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm'
import type { CdekShipmentState } from '@ximi4ka-shop/shared'
import { Order } from './Order.js'

// Очередь создания заказа в СДЭК: одна запись на заказ. Ставится в одной
// транзакции с оплатой (lib/cdek/queue.ts), проводится обработчиком
// (lib/cdek/worker.ts): queued → registering → created | failed.
@Entity({ name: 'cdek_shipments' })
@Index('UQ_cdek_shipments_order', ['orderId'], { unique: true })
export class CdekShipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  state!: CdekShipmentState

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'next_attempt_at', default: () => 'now()' })
  nextAttemptAt!: Date

  @Column({ type: 'uuid', name: 'cdek_uuid', nullable: true })
  cdekUuid!: string | null

  @Column({ type: 'varchar', length: 32, name: 'cdek_number', nullable: true })
  cdekNumber!: string | null

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null

  // Когда СДЭК принял POST — от него считаем 30 минут ожидания регистрации.
  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt!: Date | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date
}
```

`api/src/config/dataSource.ts` — `import { CdekShipment } from '../entities/CdekShipment.js'` и `CdekShipment` в массив `entities` рядом с `OrderNotification`.

`api/src/migrations/1790500000000-AddCdekShipments.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Очередь создания заказа в СДЭК после оплаты
// (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §4).
export class AddCdekShipments1790500000000 implements MigrationInterface {
  name = 'AddCdekShipments1790500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cdek_shipments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "state" character varying(16) NOT NULL DEFAULT 'queued',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "cdek_uuid" uuid,
        "cdek_number" character varying(32),
        "last_error" text,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cdek_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cdek_shipments_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_cdek_shipments_order" ON "cdek_shipments" ("order_id")`,
    )
    // Обработчик берёт только незавершённые записи.
    await queryRunner.query(
      `CREATE INDEX "IDX_cdek_shipments_due" ON "cdek_shipments" ("next_attempt_at")
       WHERE "state" IN ('queued', 'registering')`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cdek_shipments"`)
  }
}
```

`api/src/lib/cdek/queue.ts`:

```ts
import type { EntityManager } from 'typeorm'
import { CdekShipment } from '../../entities/CdekShipment.js'
import type { Order } from '../../entities/Order.js'
import { cdekOrdersEnabled } from './orders.js'

export function isCdekDelivery(method: string): boolean {
  return method === 'cdek_pvz' || method === 'cdek_courier'
}

// Ставит заказ в очередь создания в СДЭК. Вызывать в транзакции, которая
// переводит заказ в paid. При выключенном флаге — ничего: иначе включение
// флага отправило бы в СДЭК заказы, уже заведённые руками. Повтор — no-op
// (уникальный индекс + ON CONFLICT DO NOTHING).
export async function enqueueCdekShipment(
  em: EntityManager,
  order: Pick<Order, 'id' | 'deliveryMethod'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!cdekOrdersEnabled(env) || !isCdekDelivery(order.deliveryMethod)) return
  await em
    .createQueryBuilder()
    .insert()
    .into(CdekShipment)
    .values({ orderId: order.id })
    .orIgnore()
    .execute()
}
```

`outbox.ts` — импорт `import { enqueueCdekShipment } from '../cdek/queue.js'`; в `saveOrderWithStatusEvent` после `if (key) await enqueueOrderEvent(...)`:

```ts
// Оплаченный заказ — в очередь создания в СДЭК, той же транзакцией.
if (order.status === 'paid' && previousStatus !== 'paid') {
  await enqueueCdekShipment(em, order)
}
```

Обновить комментарий над `saveOrderWithStatusEvent`: «…ставит событие и, при оплате, заказ в очередь СДЭК — в одной транзакции».

- [ ] **Step 4: Тесты**

Run: `npm test -w api -- src/lib/notifications/outbox.test.ts` → PASS.
Run: `npm run typecheck -w shared && npm run typecheck -w api` → без ошибок.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write shared/src api/src/entities/CdekShipment.ts api/src/migrations/1790500000000-AddCdekShipments.ts api/src/lib/cdek/queue.ts api/src/lib/notifications/outbox.ts api/src/lib/notifications/outbox.test.ts api/src/config/dataSource.ts
git add shared/src api/src/entities/CdekShipment.ts api/src/migrations/1790500000000-AddCdekShipments.ts api/src/lib/cdek/queue.ts api/src/lib/notifications/outbox.ts api/src/lib/notifications/outbox.test.ts api/src/config/dataSource.ts
git commit -m "feat(api): очередь cdek_shipments — оплата ставит заказ в СДЭК

Запись создаётся в той же транзакции, что и оплата, только при
CDEK_ORDERS_ENABLED=true и доставке СДЭК. Повторная оплата — no-op.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Обработчик очереди СДЭК

**Files:**

- Modify: `api/src/lib/cdek/client.ts` (ошибки из `requests[].errors`, `export const PROD_BASE_URL`, `export const TEST_BASE_URL`)
- Test: `api/src/lib/cdek/client.test.ts`
- Create: `api/src/lib/cdek/orderInput.ts`
- Create: `api/src/lib/cdek/worker.ts`
- Test: `api/src/lib/cdek/worker.test.ts`
- Modify: `api/src/index.ts`

**Interfaces:**

- Consumes: `buildCdekOrder`, `cdekOrderConfigFromEnv`, `cdekOrdersEnabled`, `CdekDataError`, `CdekOrderConfig`, `CdekOrderLine` (Task 3); `CdekShipment` (Task 4); `nextDelayMs`, `retryWindowMs`, `GIVE_UP_AFTER_MS`, `MIN_RATE_LIMIT_PAUSE_MS` из `api/src/lib/notifications/worker.ts`; `packCart`, `DEFAULT_ITEM_WEIGHT_G`, `PackLine` из `api/src/lib/shipping/pack.ts`.
- Produces:
  - `loadShipmentInput(order: Order): Promise<{ packages: ShippingPackage[]; lines: CdekOrderLine[] }>` (`orderInput.ts`)
  - `CDEK_POLL_INTERVAL_MS = 15_000`, `CDEK_REGISTER_TIMEOUT_MS = 30 * 60_000`, `CDEK_WORKER_INTERVAL_MS = 10_000`, `MAX_SHIPMENTS_PER_TICK = 3`
  - `interface CdekShipmentDeps { cdek: Pick<CdekClient, 'get' | 'post'>; config: CdekOrderConfig }`
  - `processDueShipments(deps: CdekShipmentDeps, opts?: { now?: Date }): Promise<Record<'submitted' | 'created' | 'waiting' | 'retried' | 'failed', number>>`
  - `startCdekShipmentWorker(opts?: { env?: NodeJS.ProcessEnv; cdek?: Pick<CdekClient, 'get' | 'post'>; intervalMs?: number }): NodeJS.Timeout | null`

- [ ] **Step 1: Клиент — падающий тест на ошибки заказов**

СДЭК на `/orders` кладёт ошибки не в корень, а в `requests[0].errors` (проверено 25.09: `{"requests":[{"state":"INVALID","errors":[{"code":"v2_entity_not_found_im_number",…}]}]}`). В `client.test.ts` добавить (по образцу соседних тестов с инъекцией `fetch`; фейковый `fetch` сначала отдаёт токен, затем ответ):

```ts
it('ошибка из requests[].errors — код и текст СДЭК', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 't', expires_in: 3600 })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          requests: [
            {
              state: 'INVALID',
              errors: [{ code: 'v2_entity_not_found_im_number', message: 'Entity is not found' }],
            },
          ],
        }),
        { status: 400 },
      ),
    )
  const client = new CdekClient({
    baseUrl: 'https://api.edu.cdek.ru/v2',
    clientId: 'id',
    clientSecret: 's',
    fetch,
  })
  await expect(client.get('/orders', { im_number: 'XM-1' })).rejects.toMatchObject({
    status: 400,
    code: 'v2_entity_not_found_im_number',
    message: 'Entity is not found',
  })
})
```

Run: `npm test -w api -- src/lib/cdek/client.test.ts` → FAIL (`code: 'http_error'`).

- [ ] **Step 2: Клиент — реализация**

В `client.ts`: `const TEST_BASE_URL` и `const PROD_BASE_URL` сделать `export const`. В `request<T>` тип ответа расширить и брать первую ошибку из корня или из `requests`:

```ts
type CdekErrorItem = { code?: string; message?: string }
const data = (await res.json().catch(() => null)) as
  | (T & { errors?: CdekErrorItem[]; requests?: { errors?: CdekErrorItem[] }[] })
  | null
if (!res.ok) {
  // Калькулятор и ПВЗ кладут ошибки в корень, заказы — в requests[].errors.
  const errors = data?.errors ?? data?.requests?.flatMap((r) => r.errors ?? []) ?? []
  const first = errors[0]
  throw new CdekError(
    res.status,
    first?.code ?? 'http_error',
    first?.message ?? `СДЭК ответил ${res.status}`,
    errors,
  )
}
```

Run: `npm test -w api -- src/lib/cdek` → PASS.

- [ ] **Step 3: Обработчик — падающие тесты**

`api/src/lib/cdek/worker.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { Product } from '../../entities/Product.js'
import { CdekError } from './client.js'
import type { CdekOrderConfig } from './orders.js'
import {
  CDEK_POLL_INTERVAL_MS,
  CDEK_REGISTER_TIMEOUT_MS,
  MAX_SHIPMENTS_PER_TICK,
  processDueShipments,
  startCdekShipmentWorker,
} from './worker.js'

const NOW = new Date('2026-09-25T12:00:00Z')
const at = (ms: number) => new Date(NOW.getTime() + ms)
const UUID = '1aa05817-5e99-4bae-99af-69b3b3c16233'
const PRODUCT_ID = '00000000-0000-4000-8000-000000000001'

const config: CdekOrderConfig = {
  shipmentPoint: 'MSK310',
  sender: { company: 'ИП Тестова', name: 'Тестова Анна', phone: '+79990000000', email: null },
  sellerName: 'ИП Тестова',
  tariffPvz: 136,
  tariffCourier: 137,
}

let seq = 0
async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      orderNumber: `XM-2026-9${String(seq).padStart(4, '0')}`,
      status: 'paid',
      customerName: 'Иван Петров',
      customerPhone: '89123456789',
      customerEmail: '',
      deliveryAddress: {
        address: 'Нальчик, ул. Ленина, 1',
        comment: null,
        cityCode: 1081,
        deliveryPointCode: 'NLCH7',
        packages: [
          {
            box: 'small',
            weightG: 300,
            lengthCm: 10,
            widthCm: 10,
            heightCm: 4,
            estimated: false,
            items: [{ productId: PRODUCT_ID, quantity: 2 }],
          },
        ],
      },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 238,
      shippingRub: 0,
      totalRub: 238,
      paymentProvider: 'manual',
      statusHistory: [],
      ...overrides,
    }),
  )
  const items = AppDataSource.getRepository(OrderItem)
  await items.save(
    items.create({
      orderId: order.id,
      productId: PRODUCT_ID,
      productSnapshot: { name: 'Серная кислота 7%', sku: 'H2SO4', priceRub: 119 },
      quantity: 2,
      unitPriceRub: 119,
    }),
  )
  return order
}

async function seedShipment(
  orderId: string,
  overrides: Partial<CdekShipment> = {},
): Promise<CdekShipment> {
  const repo = AppDataSource.getRepository(CdekShipment)
  return repo.save(repo.create({ orderId, nextAttemptAt: at(-1000), ...overrides }))
}

const shipment = (id: string) => AppDataSource.getRepository(CdekShipment).findOneByOrFail({ id })

function fakeCdek() {
  return { get: vi.fn(), post: vi.fn() }
}

const accepted = (uuid = UUID) => ({
  entity: { uuid },
  requests: [{ type: 'CREATE', state: 'ACCEPTED' }],
})

describe('processDueShipments', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items, products RESTART IDENTITY CASCADE')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('queued → POST тела заказа → registering', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockResolvedValue(accepted())

    expect(await processDueShipments({ cdek, config }, { now: NOW })).toMatchObject({
      submitted: 1,
    })

    expect(cdek.get).not.toHaveBeenCalled()
    expect(cdek.post).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({
        number: order.orderNumber,
        delivery_point: 'NLCH7',
        shipment_point: 'MSK310',
        recipient: { name: 'Иван Петров', phones: [{ number: '+79123456789' }] },
      }),
    )
    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: NOW,
      nextAttemptAt: at(CDEK_POLL_INTERVAL_MS),
      attempts: 0,
    })
  })

  it('registering → SUCCESSFUL с номером → created', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-30_000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID, cdek_number: '10325990882' },
      requests: [{ type: 'CREATE', state: 'SUCCESSFUL' }],
    })

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.get).toHaveBeenCalledWith(`/orders/${UUID}`)
    expect(await shipment(s.id)).toMatchObject({
      state: 'created',
      cdekNumber: '10325990882',
      lastError: null,
    })
  })

  it('registering → INVALID → failed с текстом СДЭК', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-30_000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID },
      requests: [
        { type: 'CREATE', state: 'INVALID', errors: [{ code: 'x', message: 'Неверный телефон' }] },
      ],
    })

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({ state: 'failed', lastError: 'Неверный телефон' })
  })

  it('ACCEPTED — ждём ещё 15 с, попытка не считается', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-60_000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(accepted())

    expect(await processDueShipments({ cdek, config }, { now: NOW })).toMatchObject({ waiting: 1 })

    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      attempts: 0,
      nextAttemptAt: at(CDEK_POLL_INTERVAL_MS),
    })
  })

  it('ACCEPTED дольше 30 минут — опрос по общему расписанию, POST не повторяется', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, {
      state: 'registering',
      cdekUuid: UUID,
      submittedAt: at(-CDEK_REGISTER_TIMEOUT_MS - 1000),
    })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).not.toHaveBeenCalled()
    const row = await shipment(s.id)
    expect(row).toMatchObject({ state: 'registering', attempts: 1, nextAttemptAt: at(60_000) })
    expect(row.lastError).toContain('ACCEPTED')
  })

  it('сетевой сбой POST — повтор через минуту; следующая попытка подхватывает заказ по номеру', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockRejectedValueOnce(
      new CdekError(0, 'network_error', 'СДЭК недоступен: socket hang up'),
    )

    await processDueShipments({ cdek, config }, { now: NOW })
    expect(await shipment(s.id)).toMatchObject({
      state: 'queued',
      attempts: 1,
      nextAttemptAt: at(60_000),
    })

    // POST на самом деле дошёл — СДЭК знает заказ под нашим номером.
    cdek.get.mockResolvedValueOnce(accepted('2bb05817-5e99-4bae-99af-69b3b3c16233'))
    await processDueShipments({ cdek, config }, { now: at(61_000) })

    expect(cdek.get).toHaveBeenCalledWith('/orders', { im_number: order.orderNumber })
    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      cdekUuid: '2bb05817-5e99-4bae-99af-69b3b3c16233',
    })
  })

  it('по номеру не нашли — создаём заново', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, { attempts: 1 })
    const cdek = fakeCdek()
    cdek.get.mockRejectedValue(
      new CdekError(400, 'v2_entity_not_found_im_number', 'Entity is not found'),
    )
    cdek.post.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect((await shipment(s.id)).state).toBe('registering')
  })

  it('по номеру нашли INVALID — создаём заново', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id, { attempts: 0, cdekUuid: UUID })
    const cdek = fakeCdek()
    cdek.get.mockResolvedValue({
      entity: { uuid: UUID },
      requests: [{ type: 'CREATE', state: 'INVALID' }],
    })
    cdek.post.mockResolvedValue(accepted('3cc05817-5e99-4bae-99af-69b3b3c16233'))

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).toHaveBeenCalledTimes(1)
    expect(await shipment(s.id)).toMatchObject({
      state: 'registering',
      cdekUuid: '3cc05817-5e99-4bae-99af-69b3b3c16233',
    })
  })

  it('ошибка данных на POST (400) — сразу failed', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockRejectedValue(
      new CdekError(400, 'v2_field_is_empty', '[packages[0].items] is empty'),
    )

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: '[packages[0].items] is empty',
    })
  })

  it('429 — пауза не меньше 30 с, попытка не считается', async () => {
    const order = await seedOrder()
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockRejectedValue(new CdekError(429, 'http_error', 'СДЭК ответил 429'))

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({
      state: 'queued',
      attempts: 0,
      nextAttemptAt: at(30_000),
    })
  })

  it('заказ отменили, пока он ждал, — в СДЭК не отправляем', async () => {
    const order = await seedOrder({ status: 'cancelled' })
    const s = await seedShipment(order.id)
    const cdek = fakeCdek()

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).not.toHaveBeenCalled()
    const row = await shipment(s.id)
    expect(row.state).toBe('failed')
    expect(row.lastError).toContain('не оплачен')
  })

  it('сдаётся, когда окно повторов достигает суток', async () => {
    const order = await seedOrder()
    // retryWindowMs(8) — первые сутки (см. тесты уведомлений).
    const s = await seedShipment(order.id, { attempts: 7 })
    const cdek = fakeCdek()
    cdek.get.mockRejectedValue(new CdekError(0, 'network_error', 'СДЭК недоступен'))

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(await shipment(s.id)).toMatchObject({ state: 'failed', attempts: 8 })
  })

  it('старый заказ без сохранённых мест — места считаются по карточкам товаров', async () => {
    await AppDataSource.getRepository(Product).save(
      AppDataSource.getRepository(Product).create({
        id: PRODUCT_ID,
        slug: 'h2so4',
        name: 'Серная кислота 7%',
        sku: 'H2SO4',
        priceRub: 119,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
        weightG: 250,
      }),
    )
    const order = await seedOrder({
      deliveryAddress: {
        address: 'Нальчик, ул. Ленина, 1',
        comment: null,
        cityCode: 1081,
        deliveryPointCode: 'NLCH7',
      },
    })
    await seedShipment(order.id)
    const cdek = fakeCdek()
    cdek.post.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    const body = cdek.post.mock.calls[0][1]
    expect(body.packages).toHaveLength(1)
    expect(body.packages[0].items).toEqual([
      expect.objectContaining({ ware_key: 'H2SO4', weight: 250, amount: 2, cost: 119 }),
    ])
  })

  it(`за тик — не больше ${MAX_SHIPMENTS_PER_TICK} записей`, async () => {
    for (let i = 0; i < MAX_SHIPMENTS_PER_TICK + 2; i += 1) {
      const order = await seedOrder()
      await seedShipment(order.id)
    }
    const cdek = fakeCdek()
    cdek.post.mockResolvedValue(accepted())

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.post).toHaveBeenCalledTimes(MAX_SHIPMENTS_PER_TICK)
  })

  it('created и failed не трогаем', async () => {
    const a = await seedOrder()
    const b = await seedOrder()
    await seedShipment(a.id, { state: 'created', cdekNumber: '1' })
    await seedShipment(b.id, { state: 'failed' })
    const cdek = fakeCdek()

    await processDueShipments({ cdek, config }, { now: NOW })

    expect(cdek.get).not.toHaveBeenCalled()
    expect(cdek.post).not.toHaveBeenCalled()
  })
})

describe('startCdekShipmentWorker', () => {
  const env = {
    CDEK_ORDERS_ENABLED: 'true',
    CDEK_SHIPMENT_POINT: 'MOS4',
    CDEK_SENDER_COMPANY: 'ИП Тестова',
    CDEK_SENDER_NAME: 'Тестова Анна',
    CDEK_SENDER_PHONE: '+79990000000',
    CDEK_API_URL: 'https://api.edu.cdek.ru/v2',
    NODE_ENV: 'development',
  }
  const cdek = { get: vi.fn(), post: vi.fn() }

  it('флаг выключен — не стартует', () => {
    expect(startCdekShipmentWorker({ env: { ...env, CDEK_ORDERS_ENABLED: '' }, cdek })).toBeNull()
  })

  it('нет реквизитов — не стартует, в логе чего не хватает', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(startCdekShipmentWorker({ env: { ...env, CDEK_SENDER_NAME: '' }, cdek })).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('CDEK_SENDER_NAME'))
    spy.mockRestore()
  })

  it('вне production на боевом СДЭК — не стартует', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const prod = {
      ...env,
      CDEK_API_URL: undefined,
      CDEK_CLIENT_ID: 'id',
      CDEK_CLIENT_SECRET: 'secret',
    }
    expect(startCdekShipmentWorker({ env: prod, cdek })).toBeNull()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('api.edu.cdek.ru'))
    spy.mockRestore()
  })

  it('песочница вне production — стартует', () => {
    const timer = startCdekShipmentWorker({ env, cdek, intervalMs: 60_000 })
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })

  it('production на боевом СДЭК — стартует', () => {
    const prod = {
      ...env,
      CDEK_API_URL: undefined,
      CDEK_CLIENT_ID: 'id',
      CDEK_CLIENT_SECRET: 'secret',
      NODE_ENV: 'production',
    }
    const timer = startCdekShipmentWorker({ env: prod, cdek, intervalMs: 60_000 })
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })
})
```

Если у сущности `Product` обязательны другие поля (сверить с `seedProduct` в `api/src/routes/checkout.test.ts:12-27`), дополнить `create({...})` в тесте «старый заказ».

Run: `npm test -w api -- src/lib/cdek/worker.test.ts`
Expected: FAIL — нет модуля `./worker.js`.

- [ ] **Step 4: Реализация `api/src/lib/cdek/orderInput.ts`**

```ts
import { In } from 'typeorm'
import type { ShippingPackage } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import type { Order } from '../../entities/Order.js'
import { Product } from '../../entities/Product.js'
import { DEFAULT_ITEM_WEIGHT_G, packCart, type PackLine } from '../shipping/pack.js'
import type { CdekOrderLine } from './orders.js'

// Места и позиции заказа для СДЭК. Места — сохранённые на чекауте; у заказов
// до этапа 4 их нет, тогда раскладываем заново по текущим карточкам товаров.
// Удалённый товар — вес по умолчанию и «мелочь», как в packCart.
export async function loadShipmentInput(
  order: Order,
): Promise<{ packages: ShippingPackage[]; lines: CdekOrderLine[] }> {
  const ids = [...new Set(order.items.map((i) => i.productId))]
  const products =
    ids.length > 0 ? await AppDataSource.getRepository(Product).findBy({ id: In(ids) }) : []
  const byId = new Map(products.map((p) => [p.id, p]))

  const lines: CdekOrderLine[] = order.items.map((i) => ({
    productId: i.productId,
    name: i.productSnapshot.name,
    sku: i.productSnapshot.sku ?? null,
    unitPriceRub: i.unitPriceRub,
    unitWeightG: byId.get(i.productId)?.weightG ?? DEFAULT_ITEM_WEIGHT_G,
  }))

  const saved = order.deliveryAddress.packages
  if (saved && saved.length > 0) return { packages: saved, lines }

  const packLines: PackLine[] = order.items.map((i) => {
    const p = byId.get(i.productId)
    return {
      productId: i.productId,
      quantity: i.quantity,
      weightG: p?.weightG ?? null,
      shipBoxes: p?.shipBoxes ?? [],
      looseUnits: p?.looseUnits ?? 1,
      minBox: p?.minBox ?? null,
    }
  })
  return { packages: packCart(packLines), lines }
}
```

- [ ] **Step 5: Реализация `api/src/lib/cdek/worker.ts`**

```ts
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import {
  GIVE_UP_AFTER_MS,
  MIN_RATE_LIMIT_PAUSE_MS,
  nextDelayMs,
  retryWindowMs,
} from '../notifications/worker.js'
import { CdekClient, CdekError, PROD_BASE_URL, TEST_BASE_URL } from './client.js'
import { getCdekClient } from './index.js'
import { loadShipmentInput } from './orderInput.js'
import {
  buildCdekOrder,
  CdekDataError,
  cdekOrderConfigFromEnv,
  cdekOrdersEnabled,
  type CdekOrderConfig,
} from './orders.js'

// Создание заказа в СДЭК после оплаты
// (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §5, §7).
// queued → POST /v2/orders → registering → опрос GET /v2/orders/{uuid} →
// created | failed. Тик — раз в 10 с, одна обработка за раз внутри процесса:
// api — один контейнер, как у уведомлений, блокировки строк не нужны. От
// дублей защищает наш номер в `number` и поиск по нему перед повтором POST.

export const CDEK_WORKER_INTERVAL_MS = 10_000
export const CDEK_POLL_INTERVAL_MS = 15_000
// Дольше этого в ACCEPTED/WAITING — считаем временной ошибкой и опрашиваем
// по общему расписанию пауз (песочница 25.09 держала заказы больше 3 минут).
export const CDEK_REGISTER_TIMEOUT_MS = 30 * 60_000
export const MAX_SHIPMENTS_PER_TICK = 3

type CdekApi = Pick<CdekClient, 'get' | 'post'>

export interface CdekShipmentDeps {
  cdek: CdekApi
  config: CdekOrderConfig
}

interface CdekRequestState {
  type?: string
  state?: string
  errors?: { code?: string; message?: string }[]
}

interface CdekOrderInfo {
  entity?: { uuid?: string; cdek_number?: string | null }
  requests?: CdekRequestState[]
}

type Outcome = 'submitted' | 'created' | 'waiting' | 'retried' | 'failed'

const PAID_STATUSES = new Set(['paid', 'shipped'])

function createRequest(info: CdekOrderInfo | null): CdekRequestState | undefined {
  return info?.requests?.find((r) => r.type === 'CREATE')
}

function errorsText(request: CdekRequestState | undefined): string {
  const text = (request?.errors ?? [])
    .map((e) => e.message ?? e.code)
    .filter(Boolean)
    .join('; ')
  return text || 'СДЭК отклонил заказ без описания'
}

// Повтор тех же данных не поможет: СДЭК отверг заказ по существу.
function isPermanent(err: unknown): boolean {
  if (err instanceof CdekDataError) return true
  return (
    err instanceof CdekError &&
    err.status >= 400 &&
    err.status < 500 &&
    ![401, 403, 408, 429].includes(err.status)
  )
}

// Заказ, который СДЭК уже знает под нашим номером. «Не найдено» — не ошибка.
async function findByNumber(cdek: CdekApi, orderNumber: string): Promise<CdekOrderInfo | null> {
  try {
    return await cdek.get<CdekOrderInfo>('/orders', { im_number: orderNumber })
  } catch (err) {
    if (err instanceof CdekError && err.code === 'v2_entity_not_found_im_number') return null
    throw err
  }
}

async function submit(
  s: CdekShipment,
  order: Order,
  { cdek, config }: CdekShipmentDeps,
  now: Date,
): Promise<Outcome> {
  const repo = AppDataSource.getRepository(CdekShipment)
  if (!PAID_STATUSES.has(order.status)) {
    throw new CdekDataError(`Заказ не оплачен (статус ${order.status}) — в СДЭК не отправляем`)
  }
  // Прошлая попытка могла дойти до СДЭК, а ответ — потеряться.
  if (s.attempts > 0 || s.cdekUuid) {
    const known = await findByNumber(cdek, order.orderNumber)
    const uuid = known?.entity?.uuid
    if (uuid && createRequest(known)?.state !== 'INVALID') {
      await repo.update(s.id, {
        state: 'registering',
        cdekUuid: uuid,
        submittedAt: s.submittedAt ?? now,
        nextAttemptAt: now,
        lastError: null,
      })
      return 'submitted'
    }
  }
  const { packages, lines } = await loadShipmentInput(order)
  const res = await cdek.post<CdekOrderInfo>(
    '/orders',
    buildCdekOrder(order, packages, lines, config),
  )
  const uuid = res?.entity?.uuid
  if (!uuid) throw new CdekError(0, 'no_uuid', 'СДЭК принял заказ, но не вернул его uuid')
  await repo.update(s.id, {
    state: 'registering',
    cdekUuid: uuid,
    submittedAt: now,
    nextAttemptAt: new Date(now.getTime() + CDEK_POLL_INTERVAL_MS),
    lastError: null,
  })
  return 'submitted'
}

async function poll(s: CdekShipment, { cdek }: CdekShipmentDeps, now: Date): Promise<Outcome> {
  const repo = AppDataSource.getRepository(CdekShipment)
  if (!s.cdekUuid) {
    // Не должно случаться: без uuid опрашивать нечего — отправляем заново.
    await repo.update(s.id, { state: 'queued', nextAttemptAt: now })
    return 'retried'
  }
  const info = await cdek.get<CdekOrderInfo>(`/orders/${s.cdekUuid}`)
  const request = createRequest(info)
  if (request?.state === 'INVALID') throw new CdekDataError(errorsText(request))
  const cdekNumber = info?.entity?.cdek_number
  if (request?.state === 'SUCCESSFUL' && cdekNumber) {
    await repo.update(s.id, { state: 'created', cdekNumber, lastError: null })
    return 'created'
  }
  const since = s.submittedAt ?? s.updatedAt
  if (now.getTime() - since.getTime() > CDEK_REGISTER_TIMEOUT_MS) {
    throw new CdekError(
      0,
      'register_timeout',
      `СДЭК ещё не подтвердил заказ (${request?.state ?? 'нет ответа'})`,
    )
  }
  await repo.update(s.id, { nextAttemptAt: new Date(now.getTime() + CDEK_POLL_INTERVAL_MS) })
  return 'waiting'
}

async function processShipment(
  s: CdekShipment,
  deps: CdekShipmentDeps,
  now: Date,
): Promise<Outcome> {
  const repo = AppDataSource.getRepository(CdekShipment)
  try {
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: s.orderId },
      relations: { items: true },
    })
    if (!order) throw new CdekDataError('Заказ удалён')
    return s.state === 'queued' ? await submit(s, order, deps, now) : await poll(s, deps, now)
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000)
    if (err instanceof CdekError && err.status === 429) {
      // Лимит СДЭК — не неудачная попытка: окно повторов не тратится.
      await repo.update(s.id, {
        lastError: `лимит СДЭК, повтор через ${MIN_RATE_LIMIT_PAUSE_MS / 1000} с`,
        nextAttemptAt: new Date(now.getTime() + MIN_RATE_LIMIT_PAUSE_MS),
      })
      return 'retried'
    }
    const attempts = s.attempts + 1
    if (isPermanent(err) || retryWindowMs(attempts) >= GIVE_UP_AFTER_MS) {
      await repo.update(s.id, { state: 'failed', attempts, lastError: message })
      console.error(`cdek: заказ ${s.orderId} не создан в СДЭК — ${message}`)
      return 'failed'
    }
    await repo.update(s.id, {
      attempts,
      lastError: message,
      nextAttemptAt: new Date(now.getTime() + nextDelayMs(attempts)),
    })
    console.warn(`cdek: заказ ${s.orderId} — ${message}, повтор по расписанию`)
    return 'retried'
  }
}

export async function processDueShipments(
  deps: CdekShipmentDeps,
  { now = new Date() }: { now?: Date } = {},
): Promise<Record<Outcome, number>> {
  const due = await AppDataSource.getRepository(CdekShipment)
    .createQueryBuilder('s')
    .where(`s.state IN ('queued', 'registering')`)
    .andWhere('s.next_attempt_at <= :now', { now })
    .orderBy('s.next_attempt_at', 'ASC')
    .addOrderBy('s.id', 'ASC')
    .limit(MAX_SHIPMENTS_PER_TICK)
    .getMany()
  const result: Record<Outcome, number> = {
    submitted: 0,
    created: 0,
    waiting: 0,
    retried: 0,
    failed: 0,
  }
  for (const s of due) result[await processShipment(s, deps, now)] += 1
  return result
}

// Запускается из api/src/index.ts. null — создание заказов в СДЭК выключено
// или не настроено; причина — в лог.
export function startCdekShipmentWorker({
  env = process.env,
  cdek,
  intervalMs = CDEK_WORKER_INTERVAL_MS,
}: { env?: NodeJS.ProcessEnv; cdek?: CdekApi; intervalMs?: number } = {}): NodeJS.Timeout | null {
  if (!cdekOrdersEnabled(env)) return null
  let config: CdekOrderConfig
  let baseUrl: string
  try {
    config = cdekOrderConfigFromEnv(env)
    baseUrl = CdekClient.fromEnv(env).baseUrl
  } catch (err) {
    // Нет реквизитов (CdekConfigError) или боевая среда без ключей — не
    // стартуем; записи в очереди ждут, пока настройку не поправят.
    console.error(`cdek: создание заказов выключено — ${(err as Error).message}`)
    return null
  }
  // В api/.env лежат боевые ключи: обычный npm run dev не должен заводить
  // настоящие заказы.
  if (env.NODE_ENV !== 'production' && baseUrl === PROD_BASE_URL) {
    console.error(
      `cdek: вне production заказы в боевом СДЭК не создаём — задайте CDEK_API_URL=${TEST_BASE_URL}`,
    )
    return null
  }
  const deps: CdekShipmentDeps = { cdek: cdek ?? getCdekClient(), config }
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    processDueShipments(deps)
      .catch((err) => console.error('cdek: тик обработчика упал', err))
      .finally(() => {
        running = false
      })
  }, intervalMs)
  timer.unref()
  return timer
}
```

`api/src/index.ts` — импорт `import { startCdekShipmentWorker } from './lib/cdek/worker.js'` и после запуска обработчика уведомлений:

```ts
// Заказы в СДЭК после оплаты. No-op, пока CDEK_ORDERS_ENABLED не true.
if (startCdekShipmentWorker()) {
  logger.info('cdek shipments worker started')
}
```

- [ ] **Step 6: Тесты**

Run: `npm test -w api -- src/lib/cdek` → PASS.
Run: `npm run typecheck -w api && npm run lint -w api --if-present` → без ошибок.

- [ ] **Step 7: Коммит**

```bash
npx prettier --write api/src/lib/cdek api/src/index.ts
git add api/src/lib/cdek api/src/index.ts
git commit -m "feat(api): обработчик очереди СДЭК — POST, опрос, повторы

queued → POST /v2/orders → registering → опрос до SUCCESSFUL. Перед
повтором ищем заказ по нашему номеру, чтобы не создать дубль. Вне
production на боевом СДЭК не стартует.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API админки — статус СДЭК и повтор

**Files:**

- Modify: `shared/src/types/order.ts:56-80` (`OrderDto`)
- Modify: `api/src/routes/admin/orders.ts`
- Test: `api/src/routes/admin-orders.test.ts`

**Interfaces:**

- Consumes: `CdekShipment` (Task 4), `CdekShipmentDto` (Task 4), `cdekOrdersEnabled` (Task 3), `isCdekDelivery`, `enqueueCdekShipment` (Task 4).
- Produces: `OrderDto.cdekShipment?: CdekShipmentDto | null`, `OrderDto.cdekOrdersEnabled?: boolean`; `POST /api/admin/orders/:id/cdek/retry` → `{ data: CdekShipmentDto }`.

- [ ] **Step 1: Падающие тесты**

В `admin-orders.test.ts` импортировать `vi`, `afterEach` и `CdekShipment`; внутри `describe` — `afterEach(() => vi.unstubAllEnvs())`. Тесты:

```ts
const cdekRepo = () => AppDataSource.getRepository(CdekShipment)
const retryCdek = (id: string) =>
  request(app).post(`/api/admin/orders/${id}/cdek/retry`).set(authHeaders(auth))

it('детали заказа — статус СДЭК и флаг автосоздания', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', '')
  const order = await seedOrder({ status: 'paid' })
  await cdekRepo().save(
    cdekRepo().create({ orderId: order.id, state: 'created', cdekNumber: '10325990882' }),
  )
  const res = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(auth))
  expect(res.status).toBe(200)
  expect(res.body.data.cdekOrdersEnabled).toBe(false)
  expect(res.body.data.cdekShipment).toMatchObject({
    state: 'created',
    cdekNumber: '10325990882',
    attempts: 0,
  })
})

it('без записи СДЭК — cdekShipment: null', async () => {
  const order = await seedOrder()
  const res = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(auth))
  expect(res.body.data.cdekShipment).toBeNull()
})

it('повтор СДЭК при выключенном флаге — 409', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', '')
  const order = await seedOrder({ status: 'paid' })
  const res = await retryCdek(order.id)
  expect(res.status).toBe(409)
  expect(res.body.error.code).toBe('cdek_orders_disabled')
})

it('оплаченный заказ без записи — ставится в очередь', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  const order = await seedOrder({ status: 'paid' })
  const res = await retryCdek(order.id)
  expect(res.status).toBe(200)
  expect(res.body.data).toMatchObject({ state: 'queued', attempts: 0 })
  expect(await cdekRepo().countBy({ orderId: order.id })).toBe(1)
})

it('ошибка СДЭК — запись возвращается в очередь со свежим окном', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  const order = await seedOrder({ status: 'paid' })
  const failed = await cdekRepo().save(
    cdekRepo().create({ orderId: order.id, state: 'failed', attempts: 8, lastError: 'x' }),
  )
  const res = await retryCdek(order.id)
  expect(res.status).toBe(200)
  const row = await cdekRepo().findOneByOrFail({ id: failed.id })
  expect(row).toMatchObject({ state: 'queued', attempts: 0, lastError: null })
  expect(row.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())
})

it.each(['created', 'registering'] as const)(
  'запись в %s — 409, дубль не создаём',
  async (state) => {
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
    const order = await seedOrder({ status: 'paid' })
    await cdekRepo().save(cdekRepo().create({ orderId: order.id, state }))
    expect((await retryCdek(order.id)).status).toBe(409)
  },
)

it('неоплаченный заказ и доставка не СДЭК — 409', async () => {
  vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  const pending = await seedOrder()
  const pickup = await seedOrder({ status: 'paid', deliveryMethod: 'pickup' })
  expect((await retryCdek(pending.id)).body.error.code).toBe('order_not_paid')
  expect((await retryCdek(pickup.id)).body.error.code).toBe('not_cdek_delivery')
})

it('повтор СДЭК: 404 для неизвестного заказа, 403 без CSRF', async () => {
  const unknown = await retryCdek('00000000-0000-4000-8000-000000000999')
  expect(unknown.status).toBe(404)
  const order = await seedOrder({ status: 'paid' })
  const noCsrf = await request(app)
    .post(`/api/admin/orders/${order.id}/cdek/retry`)
    .set('Cookie', `${auth.sessionCookie}; ${auth.csrfCookie}`)
  expect(noCsrf.status).toBe(403)
})
```

Формат тела ошибки (`res.body.error.code`) сверить с `api/src/routes/errors.ts:errorHandler` и соседними тестами на 409; при другом формате поправить обращения.

Run: `npm test -w api -- src/routes/admin-orders.test.ts` → FAIL (нет `cdekShipment`, 404 на новый путь).

- [ ] **Step 2: Реализация**

`shared/src/types/order.ts` — импорт `import type { CdekShipmentDto } from './cdek.js'`, в `OrderDto` после `notifications?`:

```ts
  // Заказ в СДЭК (только в деталях админки).
  cdekShipment?: CdekShipmentDto | null
  cdekOrdersEnabled?: boolean
```

`api/src/routes/admin/orders.ts` — импорты `CdekShipment`, `type CdekShipmentDto` из shared, `cdekOrdersEnabled` из `../../lib/cdek/orders.js`, `enqueueCdekShipment, isCdekDelivery` из `../../lib/cdek/queue.js`. Хелперы рядом с `orderNotifications`:

```ts
function cdekShipmentDto(s: CdekShipment): CdekShipmentDto {
  return {
    state: s.state,
    cdekNumber: s.cdekNumber,
    attempts: s.attempts,
    nextAttemptAt: s.nextAttemptAt.toISOString(),
    lastError: s.lastError,
    updatedAt: s.updatedAt.toISOString(),
  }
}

async function cdekShipment(orderId: string): Promise<CdekShipmentDto | null> {
  const s = await AppDataSource.getRepository(CdekShipment).findOneBy({ orderId })
  return s ? cdekShipmentDto(s) : null
}
```

В `GET /:id`:

```ts
res.json({
  data: {
    ...order,
    notifications: await orderNotifications(order.id),
    cdekShipment: await cdekShipment(order.id),
    cdekOrdersEnabled: cdekOrdersEnabled(),
  },
})
```

Новый маршрут после `/:id/notifications/retry`:

```ts
// «Создать в СДЭК ещё раз»: запись возвращается в очередь со свежим окном
// повторов, у оплаченного заказа без записи — создаётся. Созданный или ещё
// регистрирующийся заказ не трогаем — иначе дубль.
adminOrdersRouter.post('/:id/cdek/retry', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const order = await AppDataSource.getRepository(Order).findOneBy({ id: id.data })
    if (!order) throw notFound('order_not_found', 'Заказ не найден')
    if (!cdekOrdersEnabled()) {
      throw conflict('cdek_orders_disabled', 'Создание заказов в СДЭК выключено')
    }
    if (order.status !== 'paid' && order.status !== 'shipped') {
      throw conflict('order_not_paid', 'Заказ не оплачен')
    }
    if (!isCdekDelivery(order.deliveryMethod)) {
      throw conflict('not_cdek_delivery', 'Доставка не СДЭК')
    }
    const repo = AppDataSource.getRepository(CdekShipment)
    const existing = await repo.findOneBy({ orderId: order.id })
    if (existing?.state === 'created') {
      throw conflict('cdek_already_created', 'Заказ уже создан в СДЭК')
    }
    if (existing?.state === 'registering') {
      throw conflict('cdek_registering', 'СДЭК ещё регистрирует заказ')
    }
    if (existing) {
      await repo.update(existing.id, {
        state: 'queued',
        attempts: 0,
        lastError: null,
        nextAttemptAt: new Date(),
      })
    } else {
      await enqueueCdekShipment(AppDataSource.manager, order)
    }
    res.json({ data: cdekShipmentDto(await repo.findOneByOrFail({ orderId: order.id })) })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 3: Тесты**

Run: `npm test -w api -- src/routes/admin-orders.test.ts` → PASS.
Run: `npm run typecheck -w shared && npm run typecheck -w api && npm run typecheck -w web` → без ошибок.

- [ ] **Step 4: Коммит**

```bash
npx prettier --write shared/src/types/order.ts api/src/routes/admin/orders.ts api/src/routes/admin-orders.test.ts
git add shared/src/types/order.ts api/src/routes/admin/orders.ts api/src/routes/admin-orders.test.ts
git commit -m "feat(api): статус заказа СДЭК в админке и повтор создания

GET /api/admin/orders/:id отдаёт cdekShipment и cdekOrdersEnabled.
POST /:id/cdek/retry возвращает запись в очередь; для созданного или
регистрирующегося заказа — 409.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Блок «СДЭК» в карточке заказа

**Files:**

- Modify: `web/lib/adminApi.ts:1-10,489-496`
- Create: `web/app/admin/(authed)/orders/[id]/CdekShipmentPanel.tsx`
- Test: `web/app/admin/(authed)/orders/[id]/CdekShipmentPanel.test.tsx`
- Modify: `web/app/admin/(authed)/orders/[id]/page.tsx:1-16,193-213`

**Interfaces:**

- Consumes: `CdekShipmentDto`, `OrderStatus` из shared; `POST /api/admin/orders/:id/cdek/retry` (Task 6); `formatDateTime` из `../orderUi`.
- Produces: `adminRetryCdekShipment(id: string): Promise<CdekShipmentDto>`; компонент `CdekShipmentPanel({ orderId, orderStatus, shipment, enabled })`; `cdekTrackingUrl(cdekNumber: string): string`.

- [ ] **Step 1: Падающий тест**

`CdekShipmentPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CdekShipmentDto } from '@ximi4ka-shop/shared'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const retry = vi.fn(async (..._args: unknown[]) => ({}) as CdekShipmentDto)
vi.mock('@/lib/adminApi', () => ({
  adminRetryCdekShipment: (...args: unknown[]) => retry(...args),
  ApiError: class ApiError extends Error {},
}))

import { CdekShipmentPanel } from './CdekShipmentPanel'

const base: CdekShipmentDto = {
  state: 'created',
  cdekNumber: '10325990882',
  attempts: 0,
  nextAttemptAt: '2026-09-25T11:10:00.000Z',
  lastError: null,
  updatedAt: '2026-09-25T11:10:05.000Z',
}

describe('<CdekShipmentPanel>', () => {
  beforeEach(() => {
    retry.mockClear()
    refresh.mockClear()
  })

  it('создан — номер со ссылкой на трекинг, кнопки нет', () => {
    render(<CdekShipmentPanel orderId="o1" orderStatus="paid" shipment={base} enabled />)
    expect(screen.getByText('создан')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '10325990882' })).toHaveAttribute(
      'href',
      'https://www.cdek.ru/ru/tracking?order_id=10325990882',
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ошибка — текст и «Создать в СДЭК ещё раз»; клик ставит в очередь и обновляет страницу', async () => {
    render(
      <CdekShipmentPanel
        orderId="o1"
        orderStatus="paid"
        shipment={{
          ...base,
          state: 'failed',
          cdekNumber: null,
          attempts: 8,
          lastError: 'Неверный телефон',
        }}
        enabled
      />,
    )
    expect(screen.getByText('ошибка')).toBeInTheDocument()
    expect(screen.getByText('Неверный телефон')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Создать в СДЭК ещё раз' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(retry).toHaveBeenCalledWith('o1')
  })

  it('оплаченный заказ без записи — «не создавался» и «Создать в СДЭК»', () => {
    render(<CdekShipmentPanel orderId="o1" orderStatus="paid" shipment={null} enabled />)
    expect(screen.getByText('не создавался')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать в СДЭК' })).toBeInTheDocument()
  })

  it('в очереди после неудач — попытки и время следующей, можно повторить сейчас', () => {
    render(
      <CdekShipmentPanel
        orderId="o1"
        orderStatus="paid"
        shipment={{
          ...base,
          state: 'queued',
          cdekNumber: null,
          attempts: 2,
          lastError: 'СДЭК недоступен',
        }}
        enabled
      />,
    )
    expect(screen.getByText(/попыток: 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Создать в СДЭК ещё раз' })).toBeInTheDocument()
  })

  it.each([
    [
      'выключено',
      { orderStatus: 'paid' as const, shipment: null, enabled: false },
      'автосоздание выключено',
    ],
    [
      'не оплачен',
      { orderStatus: 'pending' as const, shipment: null, enabled: true },
      'не создавался',
    ],
    [
      'регистрируется',
      {
        orderStatus: 'paid' as const,
        shipment: { ...base, state: 'registering' as const, cdekNumber: null },
        enabled: true,
      },
      'регистрируется',
    ],
  ])('%s — без кнопки', (_name, props, label) => {
    render(<CdekShipmentPanel orderId="o1" {...props} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

Run: `npm test -w web -- "app/admin/(authed)/orders/[id]/CdekShipmentPanel.test.tsx"`
Expected: FAIL — нет модуля `./CdekShipmentPanel`.

- [ ] **Step 2: Реализация**

`web/lib/adminApi.ts` — добавить `CdekShipmentDto` в `import type { … } from '@ximi4ka-shop/shared'` и после `adminRetryOrderNotifications`:

```ts
export async function adminRetryCdekShipment(id: string): Promise<CdekShipmentDto> {
  const body = await authedRequest<{ data: CdekShipmentDto }>(
    `/api/admin/orders/${encodeURIComponent(id)}/cdek/retry`,
    { method: 'POST' },
  )
  return body.data
}
```

`CdekShipmentPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CdekShipmentDto, CdekShipmentState, OrderStatus } from '@ximi4ka-shop/shared'
import { adminRetryCdekShipment, ApiError } from '@/lib/adminApi'
import { formatDateTime } from '../orderUi'

const STATE_LABELS: Record<CdekShipmentState, string> = {
  queued: 'в очереди',
  registering: 'регистрируется',
  created: 'создан',
  failed: 'ошибка',
}

export function cdekTrackingUrl(cdekNumber: string): string {
  return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(cdekNumber)}`
}

// Заказ в СДЭК создаётся сам после оплаты
// (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §8). Кнопка —
// для ошибки, для очереди после неудач и для оплаченного заказа без записи;
// созданный и регистрирующийся заказ не трогаем — иначе дубль.
export function CdekShipmentPanel({
  orderId,
  orderStatus,
  shipment,
  enabled,
}: {
  orderId: string
  orderStatus: OrderStatus
  shipment: CdekShipmentDto | null
  enabled: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paid = orderStatus === 'paid' || orderStatus === 'shipped'
  const canRetry =
    enabled &&
    paid &&
    (!shipment ||
      shipment.state === 'failed' ||
      (shipment.state === 'queued' && shipment.attempts > 0))
  const status = !enabled
    ? 'автосоздание выключено'
    : shipment
      ? STATE_LABELS[shipment.state]
      : 'не создавался'
  const pending = shipment && (shipment.state === 'queued' || shipment.state === 'registering')

  async function retry() {
    setBusy(true)
    setError(null)
    try {
      await adminRetryCdekShipment(orderId)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось поставить заказ в очередь СДЭК')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div>
        <p className="text-xs text-brand-text-secondary">СДЭК</p>
        <p className={shipment?.state === 'failed' ? 'text-red-600' : 'text-brand-text'}>
          {status}
        </p>
      </div>
      {shipment?.cdekNumber && (
        <div>
          <p className="text-xs text-brand-text-secondary">Номер СДЭК</p>
          <a
            href={cdekTrackingUrl(shipment.cdekNumber)}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            {shipment.cdekNumber}
          </a>
        </div>
      )}
      {shipment?.lastError && shipment.state !== 'created' && (
        <p className={shipment.state === 'failed' ? 'text-red-600' : 'text-brand-text-secondary'}>
          {shipment.lastError}
        </p>
      )}
      {pending && shipment.attempts > 0 && (
        <p className="text-brand-text-secondary">
          {`попыток: ${shipment.attempts}, следующая ${formatDateTime(shipment.nextAttemptAt)}`}
        </p>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {canRetry && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-white border border-brand-border text-brand-text font-semibold hover:bg-brand-bg-soft transition disabled:opacity-50"
        >
          {busy ? 'Ставим в очередь…' : shipment ? 'Создать в СДЭК ещё раз' : 'Создать в СДЭК'}
        </button>
      )}
    </div>
  )
}
```

`page.tsx` — импорт `import { CdekShipmentPanel } from './CdekShipmentPanel'`; в секции «Доставка» сразу после закрывающего `</dl>`:

```tsx
{
  ;(order.deliveryMethod === 'cdek_pvz' || order.deliveryMethod === 'cdek_courier') && (
    <div className="mt-3 pt-3 border-t border-brand-border">
      <CdekShipmentPanel
        orderId={order.id}
        orderStatus={order.status}
        shipment={order.cdekShipment ?? null}
        enabled={order.cdekOrdersEnabled ?? false}
      />
    </div>
  )
}
```

- [ ] **Step 3: Тесты**

Run: `npm test -w web -- "app/admin/(authed)/orders"` → PASS.
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок.

- [ ] **Step 4: Проверка в браузере**

Поднять `api` и `web` (`.claude/launch.json`, `preview_start` `api` и `web`), войти в админку, открыть оплаченный заказ с доставкой СДЭК: блок «СДЭК» виден внутри карточки «Доставка»; при выключенном флаге — «автосоздание выключено» без кнопки. Скриншот — в отчёт.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write web/lib/adminApi.ts "web/app/admin/(authed)/orders/[id]"
git add web/lib/adminApi.ts "web/app/admin/(authed)/orders/[id]"
git commit -m "feat(web): блок «СДЭК» в карточке заказа

Статус создания, номер со ссылкой на трекинг, ошибка и кнопка
«Создать в СДЭК ещё раз».

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Настройки, живой прогон в песочнице, финальная проверка

**Files:**

- Modify: `api/.env.example:45-53`, `deploy/app.env.example:18-26`
- Create: `api/src/scripts/cdek-sandbox-order.ts`

**Interfaces:**

- Consumes: `buildCdekOrder`, `CdekOrderConfig` (Task 3); `CdekClient`, `PUBLIC_TEST_CREDENTIALS`, `TEST_BASE_URL` (Task 5).

- [ ] **Step 1: Заглушки env**

В оба файла после строки `CDEK_TARIFF_COURIER=137` добавить:

```bash
# Заказ в СДЭК после оплаты (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md).
# Выключено, пока не равно true. Вне NODE_ENV=production заказы создаются только
# в песочнице (CDEK_API_URL=https://api.edu.cdek.ru/v2).
CDEK_ORDERS_ENABLED=
# Пункт СДЭК, куда магазин сдаёт посылки. Боевой — MSK310 (пр-т Мира, 108);
# в песочнице его нет — там MOS4.
CDEK_SHIPMENT_POINT=MSK310
# Отправитель — как в ЛК СДЭК (значения не коммитить).
CDEK_SENDER_COMPANY=
CDEK_SENDER_NAME=
CDEK_SENDER_PHONE=
CDEK_SENDER_EMAIL=
# Продавец в заказе; по умолчанию = CDEK_SENDER_COMPANY.
# CDEK_SELLER_NAME=
```

- [ ] **Step 2: Скрипт живого прогона `api/src/scripts/cdek-sandbox-order.ts`**

```ts
// Живой прогон тела заказа в песочнице СДЭК: собирает заказ той же
// buildCdekOrder, отправляет общей тестовой учёткой и ждёт итог регистрации.
// Проверяет, что тело проходит настоящую валидацию СДЭК. Только песочница.
//   npx tsx api/src/scripts/cdek-sandbox-order.ts
import { CdekClient, PUBLIC_TEST_CREDENTIALS, TEST_BASE_URL } from '../lib/cdek/client.js'
import { buildCdekOrder, type CdekOrderConfig } from '../lib/cdek/orders.js'

const config: CdekOrderConfig = {
  shipmentPoint: 'MOS4',
  sender: { company: 'ИП Тест', name: 'Тест Тестов', phone: '+79990000000', email: null },
  sellerName: 'ИП Тест',
  tariffPvz: 136,
  tariffCourier: 137,
}

const client = new CdekClient({ baseUrl: TEST_BASE_URL, ...PUBLIC_TEST_CREDENTIALS })
const number = `XM-SANDBOX-${Date.now()}`

const body = buildCdekOrder(
  {
    orderNumber: number,
    customerName: 'Иван Проба',
    customerPhone: '8 (999) 111-22-33',
    customerEmail: '',
    deliveryMethod: 'cdek_pvz',
    deliveryAddress: { address: 'Москва', comment: null, cityCode: 44, deliveryPointCode: 'MOS4' },
  },
  [
    {
      box: 'small',
      weightG: 300,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 4,
      estimated: false,
      items: [{ productId: 'p1', quantity: 2 }],
    },
    {
      box: 'large',
      weightG: 1000,
      lengthCm: 40,
      widthCm: 32,
      heightCm: 8,
      estimated: false,
      items: [{ productId: 'kit', quantity: 1 }],
    },
    {
      box: 'large',
      weightG: 1000,
      lengthCm: 40,
      widthCm: 32,
      heightCm: 8,
      estimated: false,
      items: [],
    },
  ],
  [
    { productId: 'p1', name: 'Хлорид железа III', sku: 'FECL3', unitPriceRub: 99, unitWeightG: 50 },
    { productId: 'kit', name: 'Химичка 3.0', sku: '7V25', unitPriceRub: 3299, unitWeightG: 2000 },
  ],
  config,
)

type Info = {
  entity?: { uuid?: string; cdek_number?: string }
  requests?: { type?: string; state?: string; errors?: unknown }[]
}
const created = await client.post<Info>('/orders', body)
const uuid = created.entity?.uuid
console.log('POST принят, uuid', uuid)
for (let i = 0; i < 60 && uuid; i += 1) {
  await new Promise((r) => setTimeout(r, 5000))
  const info = await client.get<Info>(`/orders/${uuid}`)
  const req = info.requests?.find((r) => r.type === 'CREATE')
  console.log(`${(i + 1) * 5} с: ${req?.state}`, info.entity?.cdek_number ?? '', req?.errors ?? '')
  if (req?.state === 'SUCCESSFUL' || req?.state === 'INVALID') break
}
```

Run: `cd api && npx tsx src/scripts/cdek-sandbox-order.ts`
Expected: `POST принят` (не 400); за 5 минут — не `INVALID`. `SUCCESSFUL` с номером — лучший исход; `ACCEPTED` до конца — допустимо (песочница медленная, см. спеку §10). `INVALID` или 400 — остановиться, разобрать ошибку, поправить `buildCdekOrder` через новый тест в Task 3.

- [ ] **Step 3: Полная проверка**

Run: `npm test` (все воркспейсы) → PASS.
Run: `npm run typecheck && npm run lint` → без ошибок.
Проверить диф на заглушки: `git diff origin/main --stat` и `grep -rn "TODO\|FIXME\|\.only(\|\.skip(" api/src/lib/cdek api/src/routes/admin "web/app/admin/(authed)/orders/[id]"` — пусто.

- [ ] **Step 4: Коммит**

```bash
npx prettier --write api/.env.example deploy/app.env.example api/src/scripts/cdek-sandbox-order.ts
git add api/.env.example deploy/app.env.example api/src/scripts/cdek-sandbox-order.ts
git commit -m "chore(api): настройки заказа СДЭК и прогон в песочнице

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ревью перед выкаткой**

`/code-review` по всему диффу ветки и `/security-review` (платёжно-смежная логика и данные покупателей — спека §9). Найденное — исправить отдельными коммитами с тестами.

- [ ] **Step 6: Выкатка — только после отдельного «да» владельца**

Не выполнять без явного согласия в чате. Порядок — спека §11: PR → main (автодеплой), затем на сервере в `/opt/ximishop/app/deploy/app.env` реквизиты отправителя (значения — из заказа 10325990882), `CDEK_SHIPMENT_POINT=MSK310`, `CDEK_ORDERS_ENABLED=true`, перезапуск контейнера api; первый оплаченный заказ — сверить в ЛК СДЭК с эталоном.
