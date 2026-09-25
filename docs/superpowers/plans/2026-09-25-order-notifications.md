# Заказы в Google Таблицу и Telegram — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый заказ витрины попадает строкой в Google Таблицу и карточкой в рабочий Telegram-чат, смены статуса обновляют строку и приходят ответом на карточку, а сбой Google или Telegram не мешает оформить заказ.

**Architecture:** Любое изменение заказа, о котором надо сообщить, в той же транзакции кладёт две записи в таблицу-очередь `order_notifications` (каналы `sheets` и `telegram`). Фоновый обработчик в процессе api раз в 10 с отправляет созревшие записи через тонкие клиенты Google Sheets API v4 и Telegram Bot API, повторяет временные ошибки по расписанию и сразу помечает ошибки настройки. Форматы строки и сообщений — чистые функции.

**Tech Stack:** Node 22 + Express 4 + TypeORM 0.3 (Postgres), zod 4, vitest + supertest; Next.js 16 (админка и чекаут); без новых npm-зависимостей — JWT подписывается `node:crypto`, HTTP через `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-25-order-notifications-design.md`

## Global Constraints

- Ветка — `feat/cdek-delivery` (новая функция трогает те же файлы чекаута и заказов, что и СДЭК).
- api — ESM: относительные импорты с суффиксом `.js`.
- Из `@ximi4ka-shop/shared` в api — только `import type`: в рантайм-образе api нет зависимости от shared.
- Новых npm-зависимостей нет: JWT — `node:crypto` (RS256), HTTP — глобальный `fetch`, внедряемый параметром для тестов.
- В тестах нет сети: Google и Telegram — только через подменённый `fetch` или фейковые клиенты.
- Схема базы — только миграциями с ручным SQL (`synchronize: false`), файл `api/src/migrations/<timestamp>-<Name>.ts`, класс `<Name><timestamp>`.
- Тексты интерфейса и комментарии — по-русски, как во всём проекте.
- Форматирование — prettier репозитория (`npx prettier --write <файлы>` перед коммитом).
- Коммиты — conventional commits по-русски, в конце `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Статусы для людей, дословно: `создан`, `оплачен`, `отправлен`, `отменён`, `оплата не прошла`.
- Колонки листа, дословно и по порядку: `№ заказа`, `Дата оформления`, `ФИО`, `Телефон`, `Почта`, `Telegram`, `Доставка`, `Состав`, `Товары, ₽`, `Доставка, ₽`, `Итого, ₽`, `Статус`.
- Повторы временных ошибок: 1 мин, 5 мин, 15 мин, 1 ч, 6 ч, дальше каждые 6 ч; через 24 ч от постановки — сдаёмся (`failed_at`).
- Тик обработчика — 10 с, одна обработка за раз внутри процесса (api — один контейнер).
- Ник Telegram покупателя: `^[A-Za-z0-9_]{5,32}$`, хранится с `@`.
- Переменные окружения: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_TAB` (по умолчанию `Заказы`).
- Запись в таблицу — только `valueInputOption=RAW`; в Telegram — `parse_mode: HTML` с экранированием всего пользовательского ввода.

## Review Focus

1. **Очень длинный заказ** (десятки позиций, длинные названия) — карточка в Telegram не должна отклоняться лимитом в 4096 символов: список позиций урезается строкой «…и ещё N позиций». Тест — Task 5.
2. **Пользовательский ввод с `<`, `&` или формулой** (`=IMPORTXML(…)`) в имени, адресе, комментарии — в Telegram экранируется, в таблице остаётся текстом. Тесты — Task 5 (экранирование) и Task 6 (`RAW`).
3. **JSON сервисного аккаунта вставлен в env «как получилось»** — base64 или `private_key` с буквальными `\n` — должен приниматься. Тест — Task 6.
4. **Менеджер отсортировал или продублировал строки в таблице** — строка заказа находится в любой позиции (первое совпадение), заголовки не трогаются. Тест — Task 6.
5. **Оплата пришла раньше, чем ушла карточка** (быстрый вебхук или ручная отметка) — строка статуса ждёт карточку и отвечает на неё. Если карточку отправить не удалось совсем, статус уходит отдельным сообщением. Тесты — Task 8.

---

## Карта файлов

**Создаём:**

- `api/src/migrations/1790300000000-AddOrderNotifications.ts` — поля заказа и таблица очереди.
- `api/src/entities/OrderNotification.ts` — сущность записи очереди.
- `api/src/lib/telegramHandle.ts` — нормализация ника Telegram покупателя.
- `api/src/lib/notifications/outbox.ts` — постановка событий в очередь, сохранение заказа вместе с событием.
- `api/src/lib/notifications/format.ts` — строка таблицы, карточка и строка статуса для Telegram.
- `api/src/lib/google/sheets.ts` — клиент Google Sheets (сервисный аккаунт, upsert строки).
- `api/src/lib/telegram/bot.ts` — клиент Telegram Bot API (`sendMessage`).
- `api/src/lib/notifications/worker.ts` — обработчик очереди и его запуск.
- `shared/src/types/notifications.ts` — типы каналов, событий и DTO очереди.
- `web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx` — блок «Уведомления» в карточке заказа.
- Тесты рядом с каждым модулем (`*.test.ts(x)`).

**Меняем:**

- `api/src/entities/Order.ts`, `api/src/config/dataSource.ts`, `shared/src/types/order.ts`, `shared/src/index.ts` — поля и статус `shipped`.
- `api/src/routes/checkout.schemas.ts`, `api/src/routes/checkout.ts` — Telegram покупателя, событие `created`.
- `api/src/routes/webhooks/tbank.ts`, `api/src/lib/payments/reconcile.ts` — событие смены статуса.
- `api/src/routes/admin/orders.ts`, `api/src/routes/admin/orders.schemas.ts` — `paid → shipped`, уведомления в карточке, повтор.
- `api/src/index.ts` — запуск обработчика.
- `web/lib/checkout.ts`, `web/app/[locale]/(public)/checkout/page.tsx` — поле Telegram.
- `web/lib/orderStatus.ts`, `web/app/admin/(authed)/orders/orderUi.ts`, `web/lib/adminApi.ts`, `web/app/admin/(authed)/orders/[id]/OrderStatusActions.tsx`, `web/app/admin/(authed)/orders/[id]/page.tsx` — статус «отправлен», кнопки, уведомления.
- `deploy/app.env.example`, `api/.env.example`, `deploy/README.md` — ключи и настройка.

---

### Task 1: Модель данных — статус `shipped`, поля заказа, очередь

**Files:**

- Create: `api/src/migrations/1790300000000-AddOrderNotifications.ts`
- Create: `api/src/entities/OrderNotification.ts`
- Create: `shared/src/types/notifications.ts`
- Modify: `api/src/entities/Order.ts` (после колонки `customerEmail`)
- Modify: `api/src/config/dataSource.ts` (список `entities`)
- Modify: `shared/src/types/order.ts` (`OrderStatus`, `OrderDto`), `shared/src/index.ts`
- Modify: `web/lib/orderStatus.ts`, `web/app/admin/(authed)/orders/orderUi.ts`
- Test: `api/src/entities/OrderNotification.test.ts`, `web/lib/orderStatus.test.ts`

**Interfaces:**

- Produces: `OrderStatus` включает `'shipped'`; `NotificationChannel = 'sheets' | 'telegram'`; `OrderEventKey = 'created' | 'status:paid' | 'status:shipped' | 'status:cancelled' | 'status:failed'`; `OrderNotificationDto { channel; eventKey; attempts: number; nextAttemptAt: string; sentAt: string | null; failedAt: string | null; lastError: string | null }`; сущность `OrderNotification` (поля `id, orderId, channel, eventKey, attempts, nextAttemptAt, sentAt, failedAt, lastError, createdAt`); `Order.customerTelegram: string | null`, `Order.telegramMessageId: number | null`; `OrderDto.customerTelegram: string | null`, `OrderDto.notifications?: OrderNotificationDto[]`.

- [ ] **Step 1: Типы в shared**

Создать `shared/src/types/notifications.ts`:

```ts
// Очередь уведомлений о заказах (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
export type NotificationChannel = 'sheets' | 'telegram'

export type OrderEventKey =
  | 'created'
  | 'status:paid'
  | 'status:shipped'
  | 'status:cancelled'
  | 'status:failed'

export interface OrderNotificationDto {
  channel: NotificationChannel
  eventKey: OrderEventKey
  attempts: number
  nextAttemptAt: string
  sentAt: string | null
  failedAt: string | null
  lastError: string | null
}
```

В `shared/src/types/order.ts`:

- строку `export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled'` заменить на `export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'failed' | 'cancelled'`;
- в начало файла добавить `import type { OrderNotificationDto } from './notifications.js'`;
- в `interface OrderDto` после `customerEmail: string` добавить `customerTelegram: string | null`, а после `items: OrderItem[]` — `notifications?: OrderNotificationDto[]`.

В `shared/src/index.ts` добавить:

```ts
export type {
  NotificationChannel,
  OrderEventKey,
  OrderNotificationDto,
} from './types/notifications.js'
```

- [ ] **Step 2: Падающий тест сущности**

Создать `api/src/entities/OrderNotification.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from './Order.js'
import { OrderNotification } from './OrderNotification.js'

async function seedOrder(): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: 'pending',
      customerName: 'Мария',
      customerPhone: '+79123456789',
      customerEmail: '',
      deliveryAddress: { address: 'Москва', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 100,
      shippingRub: 0,
      totalRub: 100,
      paymentProvider: 'manual',
      statusHistory: [],
    }),
  )
}

describe('OrderNotification entity', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders RESTART IDENTITY CASCADE')
  })

  it('хранит запись очереди с умолчаниями', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    const saved = await repo.save(
      repo.create({ orderId: order.id, channel: 'telegram', eventKey: 'created' }),
    )
    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found).toMatchObject({
      channel: 'telegram',
      eventKey: 'created',
      attempts: 0,
      sentAt: null,
      failedAt: null,
      lastError: null,
    })
    expect(found.nextAttemptAt).toBeInstanceOf(Date)
    expect(found.createdAt).toBeInstanceOf(Date)
  })

  it('не даёт поставить одно событие канала дважды', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    await repo.save(repo.create({ orderId: order.id, channel: 'sheets', eventKey: 'created' }))
    await expect(
      repo.save(repo.create({ orderId: order.id, channel: 'sheets', eventKey: 'created' })),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('удаляется вместе с заказом', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    await repo.save(repo.create({ orderId: order.id, channel: 'sheets', eventKey: 'created' }))
    await AppDataSource.getRepository(Order).delete(order.id)
    expect(await repo.count()).toBe(0)
  })

  it('заказ хранит ник Telegram и id карточки числом', async () => {
    const order = await seedOrder()
    await AppDataSource.getRepository(Order).update(order.id, {
      customerTelegram: '@maria',
      telegramMessageId: 4242,
    })
    const found = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(found.customerTelegram).toBe('@maria')
    expect(found.telegramMessageId).toBe(4242)
  })
})
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npm run test -w api -- src/entities/OrderNotification.test.ts`
Expected: FAIL — `Failed to load url ./OrderNotification.js`.

- [ ] **Step 4: Миграция**

Создать `api/src/migrations/1790300000000-AddOrderNotifications.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Уведомления о заказах в Google Таблицу и Telegram: поля заказа и очередь
// (docs/superpowers/specs/2026-09-25-order-notifications-design.md). Статус
// «отправлен» миграции не требует — status хранится строкой varchar(32).
export class AddOrderNotifications1790300000000 implements MigrationInterface {
  name = 'AddOrderNotifications1790300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "customer_telegram" character varying(33)`)
    await queryRunner.query(`ALTER TABLE "orders" ADD "telegram_message_id" bigint`)
    await queryRunner.query(
      `CREATE TABLE "order_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "channel" character varying(16) NOT NULL,
        "event_key" character varying(32) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "failed_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_notifications_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_order_notifications_event" ON "order_notifications" ("order_id", "channel", "event_key")`,
    )
    // Обработчик ищет только недоставленные и несданные записи.
    await queryRunner.query(
      `CREATE INDEX "IDX_order_notifications_due" ON "order_notifications" ("next_attempt_at")
       WHERE "sent_at" IS NULL AND "failed_at" IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_notifications"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "telegram_message_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_telegram"`)
  }
}
```

- [ ] **Step 5: Сущности**

Создать `api/src/entities/OrderNotification.ts`:

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
  type Relation,
} from 'typeorm'
import type { NotificationChannel, OrderEventKey } from '@ximi4ka-shop/shared'
import { Order } from './Order.js'

// Запись очереди «событие заказа × канал». Ставится в одной транзакции с
// изменением заказа (lib/notifications/outbox.ts), доставляется
// обработчиком (lib/notifications/worker.ts).
@Entity({ name: 'order_notifications' })
@Index('UQ_order_notifications_event', ['orderId', 'channel', 'eventKey'], { unique: true })
export class OrderNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>

  @Column({ type: 'varchar', length: 16 })
  channel!: NotificationChannel

  @Column({ type: 'varchar', length: 32, name: 'event_key' })
  eventKey!: OrderEventKey

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'next_attempt_at', default: () => 'now()' })
  nextAttemptAt!: Date

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt!: Date | null

  @Column({ type: 'timestamptz', name: 'failed_at', nullable: true })
  failedAt!: Date | null

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
```

В `api/src/entities/Order.ts` сразу после колонки `customerEmail` добавить:

```ts
  // Ник покупателя в виде «@username» (lib/telegramHandle.ts). Необязателен.
  @Column({ type: 'varchar', length: 33, name: 'customer_telegram', nullable: true })
  customerTelegram!: string | null

  // id карточки заказа в рабочем чате: на неё бот отвечает сменами статуса.
  // bigint pg отдаёт строкой — приводим к числу, id сообщений Telegram
  // укладываются в Number.MAX_SAFE_INTEGER.
  @Column({
    type: 'bigint',
    name: 'telegram_message_id',
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value == null ? null : Number(value)),
    },
  })
  telegramMessageId!: number | null
```

В `api/src/config/dataSource.ts` добавить `import { OrderNotification } from '../entities/OrderNotification.js'` рядом с `import { OrderItem } …` и дописать `OrderNotification` в массив `entities` после `OrderItem`.

- [ ] **Step 6: Прогнать тест сущности**

Run: `npm run test -w api -- src/entities/OrderNotification.test.ts`
Expected: PASS, 4 теста. Тестовая база мигрирует сама (`src/test/globalSetup.ts`).

- [ ] **Step 7: Статус «отправлен» на витрине и в админке — тест**

В `web/lib/orderStatus.test.ts` дописать (импорты `orderStatusLabel`, `orderTimelineSteps` из `./orderStatus` — добавить, если их нет):

```ts
describe('статус shipped', () => {
  it('подпись «Отправлен» и последний шаг таймлайна', () => {
    expect(orderStatusLabel('shipped', 'manual')).toBe('Отправлен')
    expect(orderTimelineSteps('shipped', 'tbank')).toEqual([
      { label: 'Создан', state: 'done', tone: 'default' },
      { label: 'Оплачен', state: 'done', tone: 'default' },
      { label: 'Отправлен', state: 'active', tone: 'success' },
    ])
  })
})
```

Run: `npm run test -w web -- lib/orderStatus.test.ts`
Expected: FAIL — `orderStatusLabel('shipped', …)` возвращает `undefined`.

- [ ] **Step 8: Подписи статуса**

В `web/lib/orderStatus.ts`:

- в `orderStatusLabel` после `case 'paid': return 'Оплачен'` добавить `case 'shipped': return 'Отправлен'`;
- в `orderTimelineSteps` после ветки `case 'paid'` добавить:

```ts
    case 'shipped':
      return [
        { label: 'Создан', state: 'done', tone: 'default' },
        { label: 'Оплачен', state: 'done', tone: 'default' },
        { label: 'Отправлен', state: 'active', tone: 'success' },
      ]
```

В `web/app/admin/(authed)/orders/orderUi.ts`: в `ORDER_STATUS_LABELS` после `paid: 'Оплачен',` добавить `shipped: 'Отправлен',`, в `ORDER_STATUS_BADGE_CLASSES` после `paid: …` — `shipped: 'bg-blue-100 text-blue-700',`.

- [ ] **Step 9: Проверка**

Run: `npm run test -w web -- lib/orderStatus.test.ts && npm run typecheck -ws --if-present && npm run migration:run -w api`
Expected: тесты PASS, typecheck без ошибок, миграция `AddOrderNotifications1790300000000` применена к локальной базе.

- [ ] **Step 10: Commit**

```bash
npx prettier --write shared/src api/src/entities api/src/migrations api/src/config/dataSource.ts web/lib/orderStatus.ts web/lib/orderStatus.test.ts "web/app/admin/(authed)/orders/orderUi.ts"
git add shared/src api/src/entities api/src/migrations/1790300000000-AddOrderNotifications.ts api/src/config/dataSource.ts web/lib/orderStatus.ts web/lib/orderStatus.test.ts "web/app/admin/(authed)/orders/orderUi.ts"
git commit -m "$(printf 'feat(api): статус «отправлен», Telegram покупателя и очередь уведомлений\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 2: Поле Telegram на чекауте

**Files:**

- Create: `api/src/lib/telegramHandle.ts`, `api/src/lib/telegramHandle.test.ts`
- Modify: `api/src/routes/checkout.schemas.ts` (объект `customer`), `api/src/routes/checkout.ts` (создание заказа)
- Modify: `shared/src/types/order.ts` (`CheckoutRequest.customer`)
- Modify: `web/lib/checkout.ts`, `web/app/[locale]/(public)/checkout/page.tsx`
- Test: `api/src/routes/checkout.test.ts`, `web/lib/checkout.test.ts`, `web/app/[locale]/(public)/checkout/page.test.tsx`

**Interfaces:**

- Consumes: `Order.customerTelegram` (Task 1).
- Produces: `normalizeTelegramHandle(raw: string): string | null` — в api и в `web/lib/checkout.ts` (одинаковая логика; shared для рантайма api недоступен); `CheckoutRequest.customer.telegram?: string`; `CheckoutFormFields.telegram: string`; ключ ошибки формы `'telegram'`.

- [ ] **Step 1: Падающий тест нормализации (api)**

Создать `api/src/lib/telegramHandle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeTelegramHandle } from './telegramHandle.js'

describe('normalizeTelegramHandle', () => {
  it.each([
    ['maria_ivanova', '@maria_ivanova'],
    ['@maria_ivanova', '@maria_ivanova'],
    ['  @Maria_Ivanova  ', '@Maria_Ivanova'],
    ['https://t.me/maria_ivanova', '@maria_ivanova'],
    ['t.me/maria_ivanova/', '@maria_ivanova'],
    ['telegram.me/maria_ivanova', '@maria_ivanova'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTelegramHandle(input)).toBe(expected)
  })

  it.each(['mar', 'мария', 'maria ivanova', '@', 'a'.repeat(33), '+79123456789'])(
    'невалидный: %s',
    (input) => {
      expect(normalizeTelegramHandle(input)).toBeNull()
    },
  )
})
```

Run: `npm run test -w api -- src/lib/telegramHandle.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Нормализация (api)**

Создать `api/src/lib/telegramHandle.ts`:

```ts
// Ник Telegram покупателя: принимаем так, как пишут люди — «maria»,
// «@maria», «t.me/maria», — храним одинаково: «@maria». Правила ника у
// Telegram: латиница, цифры и _, от 5 до 32 символов. null — не ник.
const HANDLE_RE = /^[A-Za-z0-9_]{5,32}$/

export function normalizeTelegramHandle(raw: string): string | null {
  const bare = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
  return HANDLE_RE.test(bare) ? `@${bare}` : null
}
```

Run: `npm run test -w api -- src/lib/telegramHandle.test.ts`
Expected: PASS.

- [ ] **Step 3: Падающие тесты чекаута (api)**

В `api/src/routes/checkout.test.ts` перед тестом `'increments the order number sequence between orders'` добавить:

```ts
it('сохраняет ник Telegram покупателя в едином виде', async () => {
  const p = await seedProduct()
  const base = checkoutBody([{ productId: p.id, quantity: 1 }])
  const body = { ...base, customer: { ...base.customer, telegram: 't.me/maria_ivanova' } }
  const res = await request(app).post('/api/checkout').send(body)
  expect(res.status).toBe(201)
  const order = await AppDataSource.getRepository(Order).findOneByOrFail({
    orderNumber: res.body.data.orderNumber,
  })
  expect(order.customerTelegram).toBe('@maria_ivanova')
})

it('без Telegram — поле пустое', async () => {
  const p = await seedProduct()
  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
  const order = await AppDataSource.getRepository(Order).findOneByOrFail({
    orderNumber: res.body.data.orderNumber,
  })
  expect(order.customerTelegram).toBeNull()
})

it('400 на ник, который не может быть ником Telegram', async () => {
  const p = await seedProduct()
  const base = checkoutBody([{ productId: p.id, quantity: 1 }])
  const res = await request(app)
    .post('/api/checkout')
    .send({ ...base, customer: { ...base.customer, telegram: 'мария' } })
  expect(res.status).toBe(400)
})
```

Run: `npm run test -w api -- src/routes/checkout.test.ts`
Expected: FAIL — `customerTelegram` равен `undefined`/`null`, невалидный ник проходит.

- [ ] **Step 4: Схема и сохранение (api)**

В `api/src/routes/checkout.schemas.ts` добавить `import { normalizeTelegramHandle } from '../lib/telegramHandle.js'` и в объект `customer` после `email` дописать:

```ts
    telegram: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((value, ctx) => {
        if (!value) return undefined
        const handle = normalizeTelegramHandle(value)
        if (!handle) {
          ctx.addIssue({ code: 'custom', message: 'Telegram: 5–32 латинских букв, цифр или _' })
          return z.NEVER
        }
        return handle
      }),
```

В `api/src/routes/checkout.ts` в `create({ … })` заказа после строки `customerEmail: parsed.customer.email ?? '',` добавить `customerTelegram: parsed.customer.telegram ?? null,`.

В `shared/src/types/order.ts` в `CheckoutRequest` заменить `customer: { name: string; phone: string; email?: string }` на `customer: { name: string; phone: string; email?: string; telegram?: string }`.

Run: `npm run test -w api -- src/routes/checkout.test.ts`
Expected: PASS.

- [ ] **Step 5: Падающие тесты формы (web)**

В `web/lib/checkout.test.ts`:

- в `validFields` добавить `telegram: '',`;
- в импорт добавить `normalizeTelegramHandle`;
- дописать:

```ts
describe('normalizeTelegramHandle (форма)', () => {
  it('приводит ник к виду @username', () => {
    expect(normalizeTelegramHandle('t.me/maria_ivanova')).toBe('@maria_ivanova')
    expect(normalizeTelegramHandle('@maria_ivanova')).toBe('@maria_ivanova')
  })
  it('null для невалидного', () => {
    expect(normalizeTelegramHandle('мария')).toBeNull()
  })
})

describe('validateCheckoutForm — Telegram', () => {
  it('пустой Telegram — не ошибка', () => {
    expect(validateCheckoutForm({ ...validFields, telegram: '' }, true)).toEqual({})
  })
  it('невалидный ник — ошибка', () => {
    const errors = validateCheckoutForm({ ...validFields, telegram: 'мария' }, true)
    expect(errors.telegram).toMatch(/латинских/)
  })
})
```

Run: `npm run test -w web -- lib/checkout.test.ts`
Expected: FAIL — нет `normalizeTelegramHandle`, у полей нет `telegram`.

- [ ] **Step 6: Логика формы (web)**

В `web/lib/checkout.ts`:

- в `CheckoutFormFields` после `email: string` добавить `telegram: string`;
- `CheckoutFormErrors` — ключи `'name' | 'phone' | 'email' | 'telegram' | 'delivery'`;
- в `validateCheckoutForm` после проверки email добавить:

```ts
if (fields.telegram.trim() !== '' && !normalizeTelegramHandle(fields.telegram)) {
  errors.telegram = 'Проверьте ник: 5–32 латинских букв, цифр или _'
}
```

- добавить функцию (копия api/src/lib/telegramHandle.ts — shared в рантайме api недоступен, поэтому логика живёт в двух местах; при правке менять обе):

```ts
// Ник Telegram покупателя → «@username»; null — не ник. Зеркало
// api/src/lib/telegramHandle.ts.
const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{5,32}$/

export function normalizeTelegramHandle(raw: string): string | null {
  const bare = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
  return TELEGRAM_HANDLE_RE.test(bare) ? `@${bare}` : null
}
```

Run: `npm run test -w web -- lib/checkout.test.ts`
Expected: PASS.

- [ ] **Step 7: Падающий тест страницы**

В `web/app/[locale]/(public)/checkout/page.test.tsx` перед тестом `'reuses the same Idempotency-Key when retrying after a network failure'` добавить:

```tsx
it('передаёт ник Telegram покупателя в едином виде', async () => {
  const fetchMock = vi.fn(async () => okCheckoutResponse())
  vi.stubGlobal('fetch', fetchMock)
  seedCart(seed)
  render(<CheckoutPage />)
  await fillValidForm()
  fireEvent.change(screen.getByLabelText(/telegram/i), { target: { value: 'maria_ivanova' } })

  fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(JSON.parse(init.body as string).customer).toEqual({
    name: 'Мария',
    phone: '+79123456789',
    telegram: '@maria_ivanova',
  })
})
```

Run: `cd web && npx vitest run "app/[locale]/(public)/checkout/page.test.tsx"`
Expected: FAIL — поля «Telegram» нет.

- [ ] **Step 8: Поле на странице**

В `web/app/[locale]/(public)/checkout/page.tsx`:

- импортировать `normalizeTelegramHandle` из `@/lib/checkout`;
- в `INITIAL_FIELDS` добавить `telegram: '',`;
- в `handleSubmit` после `const email = fields.email.trim()` добавить `const telegram = normalizeTelegramHandle(fields.telegram)`, а в `customer` payload после `email` — `...(telegram ? { telegram } : {}),`;
- после блока поля email (закрывающий `</div>` после `{errors.email && …}`) вставить:

```tsx
<div className="flex flex-col gap-2">
  <label htmlFor="checkout-telegram" className={LABEL_CLASS}>
    Telegram
  </label>
  <input
    id="checkout-telegram"
    type="text"
    autoComplete="off"
    placeholder="@username — если удобнее написать туда"
    value={fields.telegram}
    onChange={(e) => setField('telegram', e.target.value)}
    aria-invalid={errors.telegram ? true : undefined}
    className={FIELD_CLASS}
  />
  {errors.telegram && <p className={ERROR_CLASS}>{errors.telegram}</p>}
</div>
```

Run: `cd web && npx vitest run "app/[locale]/(public)/checkout/page.test.tsx" && cd .. && npm run typecheck -ws --if-present`
Expected: PASS, typecheck без ошибок.

- [ ] **Step 9: Commit**

```bash
npx prettier --write api/src/lib/telegramHandle.ts api/src/lib/telegramHandle.test.ts api/src/routes/checkout.schemas.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts shared/src/types/order.ts web/lib/checkout.ts web/lib/checkout.test.ts "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx"
git add api/src/lib/telegramHandle.ts api/src/lib/telegramHandle.test.ts api/src/routes/checkout.schemas.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts shared/src/types/order.ts web/lib/checkout.ts web/lib/checkout.test.ts "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx"
git commit -m "$(printf 'feat: поле Telegram покупателя на чекауте\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 3: Очередь — постановка событий из чекаута, оплаты и админки

**Files:**

- Create: `api/src/lib/notifications/outbox.ts`, `api/src/lib/notifications/outbox.test.ts`
- Modify: `api/src/routes/checkout.ts` (транзакция создания заказа)
- Modify: `api/src/routes/webhooks/tbank.ts:47-55`
- Modify: `api/src/lib/payments/reconcile.ts:40-47`
- Modify: `api/src/routes/admin/orders.ts` (PATCH `/:id/status`, строка `const saved = await repo.save(order)`)
- Test: `api/src/routes/checkout.test.ts`, `api/src/routes/tbank-webhook.test.ts`, `api/src/lib/payments/reconcile.test.ts`, `api/src/routes/admin-orders.test.ts`

**Interfaces:**

- Consumes: `OrderNotification`, `OrderEventKey`, `NotificationChannel` (Task 1).
- Produces: `CHANNELS: NotificationChannel[]`; `statusEventKey(status: OrderStatus): OrderEventKey | null`; `enqueueOrderEvent(em: EntityManager, orderId: string, eventKey: OrderEventKey): Promise<void>`; `saveOrderWithStatusEvent(order: Order, previousStatus: OrderStatus): Promise<Order>`.

- [ ] **Step 1: Падающие тесты очереди**

Создать `api/src/lib/notifications/outbox.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { enqueueOrderEvent, saveOrderWithStatusEvent, statusEventKey } from './outbox.js'

async function seedOrder(): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: 'pending',
      customerName: 'Мария',
      customerPhone: '+79123456789',
      customerEmail: '',
      deliveryAddress: { address: 'Москва', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 100,
      shippingRub: 0,
      totalRub: 100,
      paymentProvider: 'manual',
      statusHistory: [],
    }),
  )
}

function rows(orderId: string) {
  return AppDataSource.getRepository(OrderNotification).find({
    where: { orderId },
    order: { channel: 'ASC' },
  })
}

describe('statusEventKey', () => {
  it('pending — не событие, остальные статусы — status:*', () => {
    expect(statusEventKey('pending')).toBeNull()
    expect(statusEventKey('paid')).toBe('status:paid')
    expect(statusEventKey('shipped')).toBe('status:shipped')
    expect(statusEventKey('cancelled')).toBe('status:cancelled')
    expect(statusEventKey('failed')).toBe('status:failed')
  })
})

describe('outbox', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders RESTART IDENTITY CASCADE')
  })

  it('ставит событие в оба канала', async () => {
    const order = await seedOrder()
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    expect((await rows(order.id)).map((r) => [r.channel, r.eventKey])).toEqual([
      ['sheets', 'created'],
      ['telegram', 'created'],
    ])
  })

  it('повторная постановка не дублирует записи', async () => {
    const order = await seedOrder()
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    await AppDataSource.transaction((em) => enqueueOrderEvent(em, order.id, 'created'))
    expect(await rows(order.id)).toHaveLength(2)
  })

  it('откатывается вместе с транзакцией заказа', async () => {
    const order = await seedOrder()
    await expect(
      AppDataSource.transaction(async (em) => {
        await enqueueOrderEvent(em, order.id, 'created')
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await rows(order.id)).toHaveLength(0)
  })

  it('saveOrderWithStatusEvent сохраняет статус и ставит событие', async () => {
    const order = await seedOrder()
    order.status = 'paid'
    await saveOrderWithStatusEvent(order, 'pending')
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.status).toBe('paid')
    expect((await rows(order.id)).map((r) => r.eventKey)).toEqual(['status:paid', 'status:paid'])
  })

  it('без смены статуса событие не ставится', async () => {
    const order = await seedOrder()
    order.customerName = 'Мария Иванова'
    await saveOrderWithStatusEvent(order, 'pending')
    expect(await rows(order.id)).toHaveLength(0)
  })
})
```

Run: `npm run test -w api -- src/lib/notifications/outbox.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Очередь**

Создать `api/src/lib/notifications/outbox.ts`:

```ts
import type { EntityManager } from 'typeorm'
import type { NotificationChannel, OrderEventKey, OrderStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'

// Куда сообщаем о каждом событии заказа.
export const CHANNELS: NotificationChannel[] = ['sheets', 'telegram']

// pending — стартовое состояние, отдельным событием не считается: о нём
// сообщает `created`.
export function statusEventKey(status: OrderStatus): OrderEventKey | null {
  return status === 'pending' ? null : (`status:${status}` as OrderEventKey)
}

// Единственная точка постановки в очередь. Вызывать внутри транзакции,
// которая меняет заказ: событие и заказ сохраняются или откатываются вместе.
// Повтор того же события — no-op (уникальный индекс + ON CONFLICT DO NOTHING).
export async function enqueueOrderEvent(
  em: EntityManager,
  orderId: string,
  eventKey: OrderEventKey,
): Promise<void> {
  await em
    .createQueryBuilder()
    .insert()
    .into(OrderNotification)
    .values(CHANNELS.map((channel) => ({ orderId, channel, eventKey })))
    .orIgnore()
    .execute()
}

// Сохраняет заказ и, если статус изменился, ставит событие — в одной
// транзакции. Для вебхука Т-Кассы, сверки и ручной смены статуса в админке.
export async function saveOrderWithStatusEvent(
  order: Order,
  previousStatus: OrderStatus,
): Promise<Order> {
  return AppDataSource.transaction(async (em) => {
    const saved = await em.getRepository(Order).save(order)
    const key = order.status === previousStatus ? null : statusEventKey(order.status)
    if (key) await enqueueOrderEvent(em, order.id, key)
    return saved
  })
}
```

Run: `npm run test -w api -- src/lib/notifications/outbox.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 3: Падающие тесты подключения**

В `api/src/routes/checkout.test.ts` добавить импорт `import { OrderNotification } from '../entities/OrderNotification.js'` и тест:

```ts
it('ставит «создан» в очередь уведомлений вместе с заказом', async () => {
  const p = await seedProduct()
  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
  const order = await AppDataSource.getRepository(Order).findOneByOrFail({
    orderNumber: res.body.data.orderNumber,
  })
  const events = await AppDataSource.getRepository(OrderNotification).find({
    where: { orderId: order.id },
    order: { channel: 'ASC' },
  })
  expect(events.map((e) => [e.channel, e.eventKey])).toEqual([
    ['sheets', 'created'],
    ['telegram', 'created'],
  ])
})
```

В `api/src/routes/tbank-webhook.test.ts` добавить тот же импорт `OrderNotification` (путь `../entities/OrderNotification.js`), а в конец теста `'marks a pending order paid on CONFIRMED and answers OK'` — строки:

```ts
const events = await AppDataSource.getRepository(OrderNotification).find({
  where: { orderId: order.id },
})
expect(events.map((e) => e.eventKey)).toEqual(['status:paid', 'status:paid'])
```

В `api/src/lib/payments/reconcile.test.ts` добавить импорт `import { OrderNotification } from '../../entities/OrderNotification.js'` и в конец теста `'settles stale pending orders with an external id to paid'`:

```ts
const events = await AppDataSource.getRepository(OrderNotification).find({
  where: { orderId: stale.id },
})
expect(events.map((e) => e.eventKey)).toEqual(['status:paid', 'status:paid'])
```

В `api/src/routes/admin-orders.test.ts` добавить импорт `import { OrderNotification } from '../entities/OrderNotification.js'` и в конец теста `'cancels a pending order'`:

```ts
const events = await AppDataSource.getRepository(OrderNotification).find({
  where: { orderId: order.id },
})
expect(events.map((e) => e.eventKey)).toEqual(['status:cancelled', 'status:cancelled'])
```

Run: `npm run test -w api -- src/routes/checkout.test.ts src/routes/tbank-webhook.test.ts src/lib/payments/reconcile.test.ts src/routes/admin-orders.test.ts`
Expected: FAIL в четырёх добавленных проверках — событий нет.

- [ ] **Step 4: Подключение**

`api/src/routes/checkout.ts`: добавить `import { enqueueOrderEvent } from '../lib/notifications/outbox.js'`; внутри `AppDataSource.transaction(async (em) => { … })` после `await itemRepo.save(…)` и перед `return created` вставить `await enqueueOrderEvent(em, created.id, 'created')`.

`api/src/routes/webhooks/tbank.ts`: добавить `import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'`; заменить

```ts
if (applyPaymentStatus(order, event.status, 'tbank')) changed = true
if (changed) await repo.save(order)
```

на

```ts
const previousStatus = order.status
if (applyPaymentStatus(order, event.status, 'tbank')) changed = true
if (changed) await saveOrderWithStatusEvent(order, previousStatus)
```

`api/src/lib/payments/reconcile.ts`: добавить `import { saveOrderWithStatusEvent } from '../notifications/outbox.js'`; заменить

```ts
if (applyPaymentStatus(order, status, 'reconcile')) {
  await repo.save(order)
  updated += 1
}
```

на

```ts
const previousStatus = order.status
if (applyPaymentStatus(order, status, 'reconcile')) {
  await saveOrderWithStatusEvent(order, previousStatus)
  updated += 1
}
```

`api/src/routes/admin/orders.ts`: добавить `import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'`; в PATCH `/:id/status` заменить `const saved = await repo.save(order)` на `const saved = await saveOrderWithStatusEvent(order, from)`.

Run: `npm run test -w api`
Expected: PASS весь сьют api.

- [ ] **Step 5: Commit**

```bash
npx prettier --write api/src/lib/notifications api/src/routes/checkout.ts api/src/routes/checkout.test.ts api/src/routes/webhooks/tbank.ts api/src/routes/tbank-webhook.test.ts api/src/lib/payments/reconcile.ts api/src/lib/payments/reconcile.test.ts api/src/routes/admin/orders.ts api/src/routes/admin-orders.test.ts
git add api/src/lib/notifications api/src/routes/checkout.ts api/src/routes/checkout.test.ts api/src/routes/webhooks/tbank.ts api/src/routes/tbank-webhook.test.ts api/src/lib/payments/reconcile.ts api/src/lib/payments/reconcile.test.ts api/src/routes/admin/orders.ts api/src/routes/admin-orders.test.ts
git commit -m "$(printf 'feat(api): события заказа в очередь уведомлений в одной транзакции\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 4: «Отправлен» в админке

**Files:**

- Modify: `api/src/routes/admin/orders.schemas.ts` (`OrderStatusPatchSchema`)
- Modify: `api/src/routes/admin/orders.ts` (проверки в PATCH `/:id/status`)
- Modify: `web/lib/adminApi.ts` (`adminSetOrderStatus`)
- Modify: `web/app/admin/(authed)/orders/[id]/OrderStatusActions.tsx`, `web/app/admin/(authed)/orders/[id]/page.tsx` (секция «Действия»)
- Test: `api/src/routes/admin-orders.test.ts`, `web/app/admin/(authed)/orders/[id]/OrderStatusActions.test.tsx`

**Interfaces:**

- Consumes: `saveOrderWithStatusEvent` (Task 3), статус `shipped` (Task 1).
- Produces: PATCH `/api/admin/orders/:id/status` принимает `status: 'paid' | 'cancelled' | 'shipped'`; коды ошибок `order_not_paid`, `order_already_shipped`; `adminSetOrderStatus(id, { status: 'paid' | 'cancelled' | 'shipped'; comment?: string })`.

- [ ] **Step 1: Падающие тесты api**

В `api/src/routes/admin-orders.test.ts` перед `'rejects invalid status values with 400'` добавить (`OrderNotification` импортирован в Task 3):

```ts
it('отмечает оплаченный заказ отправленным и ставит событие', async () => {
  const paid = await seedOrder({ status: 'paid', paidAt: new Date() })
  const res = await request(app)
    .patch(`/api/admin/orders/${paid.id}/status`)
    .set(authHeaders(auth))
    .send({ status: 'shipped', comment: 'сдали в ПВЗ' })
  expect(res.status).toBe(200)
  expect(res.body.data.status).toBe('shipped')
  const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: paid.id })
  expect(saved.statusHistory.at(-1)).toMatchObject({
    from: 'paid',
    to: 'shipped',
    by: 'admin',
    comment: 'сдали в ПВЗ',
  })
  const events = await AppDataSource.getRepository(OrderNotification).find({
    where: { orderId: paid.id },
  })
  expect(events.map((e) => e.eventKey)).toEqual(['status:shipped', 'status:shipped'])
})

it('409, если отправить неоплаченный заказ', async () => {
  const pending = await seedOrder()
  const res = await request(app)
    .patch(`/api/admin/orders/${pending.id}/status`)
    .set(authHeaders(auth))
    .send({ status: 'shipped' })
  expect(res.status).toBe(409)
  expect(res.body.error.code).toBe('order_not_paid')
})

it('409 на изменение отправленного заказа', async () => {
  const shipped = await seedOrder({ status: 'shipped', paidAt: new Date() })
  const res = await request(app)
    .patch(`/api/admin/orders/${shipped.id}/status`)
    .set(authHeaders(auth))
    .send({ status: 'cancelled' })
  expect(res.status).toBe(409)
  expect(res.body.error.code).toBe('order_already_shipped')
})
```

Run: `npm run test -w api -- src/routes/admin-orders.test.ts`
Expected: FAIL — `shipped` отклоняется схемой (400).

- [ ] **Step 2: Правила в api**

`api/src/routes/admin/orders.schemas.ts`: `status: z.enum(['paid', 'cancelled'])` → `status: z.enum(['paid', 'cancelled', 'shipped'])`.

`api/src/routes/admin/orders.ts`, PATCH `/:id/status`: заменить блок

```ts
// A paid order is settled money — refunds are a separate future flow,
// not a status PATCH.
if (order.status === 'paid') {
  throw conflict('order_already_paid', 'Оплаченный заказ нельзя изменить вручную')
}
```

на

```ts
// «Отправлен» ставится только оплаченному заказу. Оплаченный заказ — это
// деньги: вернуть его в другое состояние можно только отправкой (возвраты —
// отдельная будущая история). Отправленный заказ вручную не меняется.
if (status === 'shipped' && order.status !== 'paid') {
  throw conflict('order_not_paid', 'Отправить можно только оплаченный заказ')
}
if (order.status === 'paid' && status !== 'shipped') {
  throw conflict('order_already_paid', 'Оплаченный заказ нельзя изменить вручную')
}
if (order.status === 'shipped') {
  throw conflict('order_already_shipped', 'Отправленный заказ нельзя изменить вручную')
}
```

Run: `npm run test -w api -- src/routes/admin-orders.test.ts`
Expected: PASS, включая старый `'409s on a no-op transition and on changing a paid order'`.

- [ ] **Step 3: Падающий тест кнопок (web)**

Создать `web/app/admin/(authed)/orders/[id]/OrderStatusActions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const setStatus = vi.fn(async () => ({}))
vi.mock('@/lib/adminApi', () => ({
  adminSetOrderStatus: (...args: unknown[]) => setStatus(...args),
  ApiError: class ApiError extends Error {},
}))

import { OrderStatusActions } from './OrderStatusActions'

describe('<OrderStatusActions>', () => {
  beforeEach(() => {
    setStatus.mockClear()
    refresh.mockClear()
  })

  it('у оплаченного заказа — только «Отметить отправленным»', async () => {
    render(<OrderStatusActions orderId="o1" status="paid" />)
    expect(screen.queryByRole('button', { name: /оплаченным/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /отменить/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /отметить отправленным/i }))
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('o1', { status: 'shipped' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('у ожидающего — «оплачен» и «отменить», без «отправлен»', () => {
    render(<OrderStatusActions orderId="o1" status="pending" />)
    expect(screen.getByRole('button', { name: /оплаченным/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /отменить/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /отправленным/i })).toBeNull()
  })

  it('у отправленного — кнопок нет', () => {
    const { container } = render(<OrderStatusActions orderId="o1" status="shipped" />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

Run: `cd web && npx vitest run "app/admin/(authed)/orders/[id]/OrderStatusActions.test.tsx"`
Expected: FAIL — у оплаченного заказа компонент ничего не рисует.

- [ ] **Step 4: Кнопки и секция «Действия» (web)**

`web/lib/adminApi.ts`, `adminSetOrderStatus`: тип `input` → `{ status: 'paid' | 'cancelled' | 'shipped'; comment?: string }`, комментарий над функцией → `// Ручные переходы: «Оплачен», «Отменить», «Отправлен» (только из оплаченного).`

`web/app/admin/(authed)/orders/[id]/OrderStatusActions.tsx`:

- комментарий над компонентом → `// Ручные переходы статуса. pending/failed/cancelled — «оплачен» и «отменить»; paid — только «отправлен»; shipped — ничего.`;
- `useState<'paid' | 'cancelled' | null>` → `useState<'paid' | 'cancelled' | 'shipped' | null>`;
- `if (status === 'paid') return null` → `if (status === 'shipped') return null`;
- `async function transition(target: 'paid' | 'cancelled')` → `async function transition(target: 'paid' | 'cancelled' | 'shipped')`;
- содержимое `<div className="flex flex-wrap gap-2">…</div>` заменить на:

```tsx
<div className="flex flex-wrap gap-2">
  {status === 'paid' ? (
    <button
      type="button"
      onClick={() => transition('shipped')}
      disabled={busy !== null}
      className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
    >
      {busy === 'shipped' ? 'Сохраняем…' : 'Отметить отправленным'}
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={() => transition('paid')}
        disabled={busy !== null}
        className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
      >
        {busy === 'paid' ? 'Сохраняем…' : 'Отметить оплаченным'}
      </button>
      {status !== 'cancelled' && (
        <button
          type="button"
          onClick={() => transition('cancelled')}
          disabled={busy !== null}
          className="px-4 py-2 rounded-full bg-white border border-red-200 text-red-600 font-semibold hover:bg-red-50 transition disabled:opacity-50"
        >
          {busy === 'cancelled' ? 'Отменяем…' : 'Отменить заказ'}
        </button>
      )}
    </>
  )}
</div>
```

`web/app/admin/(authed)/orders/[id]/page.tsx`, секция «Действия»: заменить

```tsx
              {order.status === 'paid' ? (
                <p className="text-sm text-brand-text-secondary">
                  Заказ оплачен — ручное изменение статуса недоступно.
                </p>
              ) : (
```

на

```tsx
              {order.status === 'shipped' ? (
                <p className="text-sm text-brand-text-secondary">
                  Заказ отправлен — ручное изменение статуса недоступно.
                </p>
              ) : (
```

Run: `cd web && npx vitest run "app/admin/(authed)/orders" && cd .. && npm run typecheck -w web`
Expected: PASS, typecheck без ошибок.

- [ ] **Step 5: Commit**

```bash
npx prettier --write api/src/routes/admin/orders.ts api/src/routes/admin/orders.schemas.ts api/src/routes/admin-orders.test.ts web/lib/adminApi.ts "web/app/admin/(authed)/orders/[id]"
git add api/src/routes/admin/orders.ts api/src/routes/admin/orders.schemas.ts api/src/routes/admin-orders.test.ts web/lib/adminApi.ts "web/app/admin/(authed)/orders/[id]"
git commit -m "$(printf 'feat: статус «отправлен» в админке — только из оплаченного\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 5: Форматы — строка таблицы и сообщения Telegram

**Files:**

- Create: `api/src/lib/notifications/format.ts`, `api/src/lib/notifications/format.test.ts`

**Interfaces:**

- Consumes: `OrderStatus`, `OrderEventKey`, `DeliveryAddress` (shared).
- Produces:
  - `interface NotifiableOrder { orderNumber: string; status: OrderStatus; createdAt: Date; customerName: string; customerPhone: string; customerEmail: string; customerTelegram: string | null; deliveryMethod: string; deliveryAddress: DeliveryAddress; subtotalRub: number; shippingRub: number; totalRub: number; items: { productSnapshot: { name: string; sku: string | null; priceRub: number }; quantity: number; unitPriceRub: number }[] }` — сущность `Order` с загруженными `items` ему соответствует;
  - `SHEET_HEADER: string[]` (12 колонок из Global Constraints);
  - `STATUS_LABELS: Record<OrderStatus, string>`;
  - `sheetRow(order: NotifiableOrder): (string | number)[]`;
  - `telegramCard(order: NotifiableOrder): string`;
  - `telegramStatusLine(orderNumber: string, eventKey: Exclude<OrderEventKey, 'created'>, standalone: boolean): string`;
  - `TELEGRAM_TEXT_LIMIT = 4096`.

- [ ] **Step 1: Падающие тесты**

Создать `api/src/lib/notifications/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  SHEET_HEADER,
  TELEGRAM_TEXT_LIMIT,
  sheetRow,
  telegramCard,
  telegramStatusLine,
  type NotifiableOrder,
} from './format.js'

const order: NotifiableOrder = {
  orderNumber: 'XM-2026-00042',
  status: 'pending',
  // 14:10 по Москве
  createdAt: new Date('2026-09-25T11:10:00Z'),
  customerName: 'Мария Иванова',
  customerPhone: '+79123456789',
  customerEmail: 'maria@example.com',
  customerTelegram: '@maria',
  deliveryMethod: 'cdek_pvz',
  deliveryAddress: {
    address: 'Новосибирск, ул. Кривощековская, 15',
    comment: 'после 18:00',
    cityCode: 270,
    deliveryPointCode: 'NSK1',
  },
  subtotalRub: 587,
  shippingRub: 504,
  totalRub: 1091,
  items: [
    {
      productSnapshot: { name: 'Серная кислота 7%', sku: 'H2SO4', priceRub: 119 },
      quantity: 2,
      unitPriceRub: 119,
    },
    {
      productSnapshot: { name: 'Нитрат серебра 1%', sku: 'AGNO3', priceRub: 349 },
      quantity: 1,
      unitPriceRub: 349,
    },
  ],
}

describe('sheetRow', () => {
  it('строка заказа по колонкам листа', () => {
    expect(sheetRow(order)).toEqual([
      'XM-2026-00042',
      '25.09.2026 14:10',
      'Мария Иванова',
      '+79123456789',
      'maria@example.com',
      '@maria',
      'ПВЗ NSK1 · Новосибирск, ул. Кривощековская, 15',
      'Серная кислота 7% · H2SO4 · 2 × 119 ₽\nНитрат серебра 1% · AGNO3 · 1 × 349 ₽',
      587,
      504,
      1091,
      'создан',
    ])
    expect(SHEET_HEADER).toHaveLength(12)
    expect(sheetRow(order)).toHaveLength(SHEET_HEADER.length)
  })

  it('курьер, пустые почта и Telegram, товар без артикула', () => {
    const row = sheetRow({
      ...order,
      status: 'shipped',
      customerEmail: '',
      customerTelegram: null,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: { address: 'Москва, Тверская улица, 1, кв. 12', comment: null },
      items: [
        {
          productSnapshot: { name: 'Химичка 3.0', sku: null, priceRub: 3299 },
          quantity: 1,
          unitPriceRub: 3299,
        },
      ],
    })
    expect(row[4]).toBe('')
    expect(row[5]).toBe('')
    expect(row[6]).toBe('Курьер · Москва, Тверская улица, 1, кв. 12')
    expect(row[7]).toBe('Химичка 3.0 · 1 × 3 299 ₽')
    expect(row[11]).toBe('отправлен')
  })

  it('пользовательский текст идёт как есть — формулу не выполнит режим RAW', () => {
    const row = sheetRow({ ...order, customerName: '=IMPORTXML("http://x","//a")' })
    expect(row[2]).toBe('=IMPORTXML("http://x","//a")')
  })
})

describe('telegramCard', () => {
  it('карточка нового заказа', () => {
    expect(telegramCard(order)).toBe(
      [
        '🧪 <b>Новый заказ XM-2026-00042</b> · 25.09 14:10',
        'Мария Иванова · +7 912 345-67-89 · @maria',
        'ПВЗ NSK1: Новосибирск, ул. Кривощековская, 15',
        '— Серная кислота 7% · H2SO4 · 2 × 119 ₽',
        '— Нитрат серебра 1% · AGNO3 · 1 × 349 ₽',
        'Товары 587 ₽ · доставка 504 ₽ · итого 1 091 ₽',
        'Комментарий: после 18:00',
        'Статус: создан',
      ].join('\n'),
    )
  })

  it('бесплатная доставка, курьер, без почты и Telegram, без комментария', () => {
    const card = telegramCard({
      ...order,
      customerTelegram: null,
      shippingRub: 0,
      totalRub: 587,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: { address: 'Москва, Тверская улица, 1', comment: null },
    })
    expect(card).toContain('Мария Иванова · +7 912 345-67-89\n')
    expect(card).toContain('Курьер: Москва, Тверская улица, 1')
    expect(card).toContain('доставка бесплатно')
    expect(card).not.toContain('Комментарий')
  })

  it('экранирует пользовательский ввод для HTML', () => {
    const card = telegramCard({
      ...order,
      customerName: '<b>Хак</b> & Co',
      deliveryAddress: { ...order.deliveryAddress, comment: '<script>' },
    })
    expect(card).toContain('&lt;b&gt;Хак&lt;/b&gt; &amp; Co')
    expect(card).toContain('Комментарий: &lt;script&gt;')
    expect(card).not.toContain('<script>')
  })

  it('длинный заказ укладывается в лимит Telegram и говорит, сколько позиций скрыто', () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      productSnapshot: {
        name: `Реактив с очень длинным названием номер ${i}`,
        sku: `SKU${i}`,
        priceRub: 99,
      },
      quantity: 1,
      unitPriceRub: 99,
    }))
    const card = telegramCard({ ...order, items })
    expect(card.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT)
    expect(card).toMatch(/— …и ещё \d+ позици(я|и|й)/)
    expect(card).toContain('Статус: создан')
  })
})

describe('telegramStatusLine', () => {
  it('ответ на карточку — коротко', () => {
    expect(telegramStatusLine('XM-2026-00042', 'status:paid', false)).toBe('✅ оплачен')
    expect(telegramStatusLine('XM-2026-00042', 'status:shipped', false)).toBe('📦 отправлен')
    expect(telegramStatusLine('XM-2026-00042', 'status:cancelled', false)).toBe('✖️ отменён')
    expect(telegramStatusLine('XM-2026-00042', 'status:failed', false)).toBe('⚠️ оплата не прошла')
  })

  it('без карточки — с номером заказа', () => {
    expect(telegramStatusLine('XM-2026-00042', 'status:paid', true)).toBe(
      '✅ Заказ XM-2026-00042: оплачен',
    )
  })
})
```

Run: `npm run test -w api -- src/lib/notifications/format.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Форматы**

Создать `api/src/lib/notifications/format.ts`:

```ts
import type { DeliveryAddress, OrderEventKey, OrderStatus } from '@ximi4ka-shop/shared'

// Что показываем людям в таблице и в чате. Чистые функции без сети — вся
// логика вида уведомлений тестируется здесь.

export interface NotifiableOrder {
  orderNumber: string
  status: OrderStatus
  createdAt: Date
  customerName: string
  customerPhone: string
  customerEmail: string
  customerTelegram: string | null
  deliveryMethod: string
  deliveryAddress: DeliveryAddress
  subtotalRub: number
  shippingRub: number
  totalRub: number
  items: {
    productSnapshot: { name: string; sku: string | null; priceRub: number }
    quantity: number
    unitPriceRub: number
  }[]
}

export const SHEET_HEADER = [
  '№ заказа',
  'Дата оформления',
  'ФИО',
  'Телефон',
  'Почта',
  'Telegram',
  'Доставка',
  'Состав',
  'Товары, ₽',
  'Доставка, ₽',
  'Итого, ₽',
  'Статус',
]

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'создан',
  paid: 'оплачен',
  shipped: 'отправлен',
  cancelled: 'отменён',
  failed: 'оплата не прошла',
}

const STATUS_ICONS: Record<Exclude<OrderStatus, 'pending'>, string> = {
  paid: '✅',
  shipped: '📦',
  cancelled: '✖️',
  failed: '⚠️',
}

export const TELEGRAM_TEXT_LIMIT = 4096

// Дата и время по Москве. Собираем из частей сами: у Intl в ru-RU между
// датой и временем запятая, а нам нужен пробел.
function moscowParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

function formatDateTime(d: Date): string {
  const p = moscowParts(d)
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`
}

function formatShortDateTime(d: Date): string {
  const p = moscowParts(d)
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`
}

// Разряды обычным пробелом: у Intl.NumberFormat тонкий неразрывный, и
// результат зависит от версии ICU.
function rub(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
}

function formatPhone(phone: string): string {
  const m = phone.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/)
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pluralPositions(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'позиция'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'позиции'
  return 'позиций'
}

function itemLine(item: NotifiableOrder['items'][number]): string {
  const parts = [item.productSnapshot.name]
  if (item.productSnapshot.sku) parts.push(item.productSnapshot.sku)
  parts.push(`${item.quantity} × ${rub(item.unitPriceRub)}`)
  return parts.join(' · ')
}

function isPickupPoint(order: NotifiableOrder): boolean {
  return order.deliveryMethod === 'cdek_pvz'
}

function deliveryCell(order: NotifiableOrder): string {
  const { address, deliveryPointCode } = order.deliveryAddress
  if (isPickupPoint(order)) {
    return deliveryPointCode ? `ПВЗ ${deliveryPointCode} · ${address}` : `ПВЗ · ${address}`
  }
  return `Курьер · ${address}`
}

export function sheetRow(order: NotifiableOrder): (string | number)[] {
  return [
    order.orderNumber,
    formatDateTime(order.createdAt),
    order.customerName,
    order.customerPhone,
    order.customerEmail,
    order.customerTelegram ?? '',
    deliveryCell(order),
    order.items.map(itemLine).join('\n'),
    order.subtotalRub,
    order.shippingRub,
    order.totalRub,
    STATUS_LABELS[order.status],
  ]
}

export function telegramCard(order: NotifiableOrder): string {
  const contacts = [order.customerName, formatPhone(order.customerPhone)]
  if (order.customerTelegram) contacts.push(order.customerTelegram)
  const { address, deliveryPointCode, comment } = order.deliveryAddress
  const where = isPickupPoint(order)
    ? `ПВЗ${deliveryPointCode ? ` ${deliveryPointCode}` : ''}: ${address}`
    : `Курьер: ${address}`
  const shipping =
    order.shippingRub === 0 ? 'доставка бесплатно' : `доставка ${rub(order.shippingRub)}`

  const head = [
    `🧪 <b>Новый заказ ${escapeHtml(order.orderNumber)}</b> · ${formatShortDateTime(order.createdAt)}`,
    escapeHtml(contacts.join(' · ')),
    escapeHtml(where),
  ]
  const tail = [`Товары ${rub(order.subtotalRub)} · ${shipping} · итого ${rub(order.totalRub)}`]
  if (comment) tail.push(`Комментарий: ${escapeHtml(comment)}`)
  tail.push(`Статус: ${STATUS_LABELS[order.status]}`)

  // Позиции добавляем, пока влезает в лимит, оставляя место на хвост и на
  // строку «…и ещё N позиций».
  const reserve = 40
  let length = [...head, ...tail].join('\n').length + reserve
  const lines: string[] = []
  for (const item of order.items) {
    const line = `— ${escapeHtml(itemLine(item))}`
    if (length + line.length + 1 > TELEGRAM_TEXT_LIMIT) break
    lines.push(line)
    length += line.length + 1
  }
  const hidden = order.items.length - lines.length
  if (hidden > 0) lines.push(`— …и ещё ${hidden} ${pluralPositions(hidden)}`)

  return [...head, ...lines, ...tail].join('\n')
}

export function telegramStatusLine(
  orderNumber: string,
  eventKey: Exclude<OrderEventKey, 'created'>,
  standalone: boolean,
): string {
  const status = eventKey.slice('status:'.length) as Exclude<OrderStatus, 'pending'>
  const label = STATUS_LABELS[status]
  return standalone
    ? `${STATUS_ICONS[status]} Заказ ${escapeHtml(orderNumber)}: ${label}`
    : `${STATUS_ICONS[status]} ${label}`
}
```

Run: `npm run test -w api -- src/lib/notifications/format.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write api/src/lib/notifications/format.ts api/src/lib/notifications/format.test.ts
git add api/src/lib/notifications/format.ts api/src/lib/notifications/format.test.ts
git commit -m "$(printf 'feat(api): строка таблицы и сообщения Telegram для заказа\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 6: Клиент Google Sheets

**Files:**

- Create: `api/src/lib/google/sheets.ts`, `api/src/lib/google/sheets.test.ts`

**Interfaces:**

- Consumes: `SHEET_HEADER` (Task 5).
- Produces: `SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'`; `interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }`; `parseServiceAccount(raw: string): ServiceAccount`; `class SheetsConfigError extends Error`; `class GoogleSheetsClient { constructor(opts: { serviceAccount: ServiceAccount; spreadsheetId: string; sheetName: string; fetch?: Fetch; now?: () => number }); static fromEnv(env?: NodeJS.ProcessEnv): GoogleSheetsClient | null; upsertOrderRow(orderNumber: string, row: (string | number)[]): Promise<void> }`.

- [ ] **Step 1: Падающие тесты**

Создать `api/src/lib/google/sheets.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import {
  GoogleSheetsClient,
  SHEETS_SCOPE,
  SheetsConfigError,
  parseServiceAccount,
} from './sheets.js'
import { SHEET_HEADER } from '../notifications/format.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const account = {
  client_email: 'shop@project.iam.gserviceaccount.com',
  private_key: privateKey,
  token_uri: 'https://oauth2.googleapis.com/token',
}
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/SHEET123/values/'
const range = (r: string) => encodeURIComponent(`'Заказы'!${r}`)

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
const tokenOk = () => json(200, { access_token: 'ya29.token', expires_in: 3599 })

function client(fetchMock: ReturnType<typeof vi.fn>, now = () => 1_790_000_000_000) {
  return new GoogleSheetsClient({
    serviceAccount: account,
    spreadsheetId: 'SHEET123',
    sheetName: 'Заказы',
    fetch: fetchMock,
    now,
  })
}

describe('parseServiceAccount', () => {
  it('принимает JSON как есть', () => {
    expect(parseServiceAccount(JSON.stringify(account)).client_email).toBe(account.client_email)
  })

  it('принимает base64', () => {
    const b64 = Buffer.from(JSON.stringify(account)).toString('base64')
    expect(parseServiceAccount(b64).private_key).toBe(privateKey)
  })

  it('чинит буквальные \\n в private_key', () => {
    const raw = JSON.stringify({ ...account, private_key: privateKey.replace(/\n/g, '\\n') })
    expect(parseServiceAccount(raw).private_key).toBe(privateKey)
  })

  it('без client_email или private_key — SheetsConfigError', () => {
    expect(() => parseServiceAccount('{"client_email":"x"}')).toThrow(SheetsConfigError)
    expect(() => parseServiceAccount('не json')).toThrow(SheetsConfigError)
  })
})

describe('GoogleSheetsClient', () => {
  it('подписывает JWT сервисного аккаунта RS256', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json(200, { values: [SHEET_HEADER.slice(0, 1)] }))
      .mockResolvedValueOnce(json(200, {}))
    await client(f).upsertOrderRow('XM-1', ['XM-1'])

    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(String(init.body))
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [h, p, s] = form.get('assertion')!.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: account.client_email,
      scope: SHEETS_SCOPE,
      aud: account.token_uri,
      iat: 1_790_000_000,
      exp: 1_790_003_600,
    })
    const verify = createVerify('RSA-SHA256')
    verify.update(`${h}.${p}`)
    expect(verify.verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true)
  })

  it('на пустом листе пишет заголовки и добавляет строку', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, {}))
    await client(f).upsertOrderRow('XM-1', ['XM-1', 'Мария'])

    expect(f.mock.calls[1][0]).toBe(`${BASE}${range('A:A')}`)
    expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer ya29.token')
    expect(f.mock.calls[2][0]).toBe(`${BASE}${range('A1:L1')}?valueInputOption=RAW`)
    expect(f.mock.calls[2][1].method).toBe('PUT')
    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({ values: [SHEET_HEADER] })
    expect(f.mock.calls[3][0]).toBe(
      `${BASE}${range('A:L')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    )
    expect(f.mock.calls[3][1].method).toBe('POST')
    expect(JSON.parse(f.mock.calls[3][1].body)).toEqual({ values: [['XM-1', 'Мария']] })
  })

  it('находит заказ в любой строке и перезаписывает её целиком', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(
        json(200, { values: [['№ заказа'], ['XM-5'], [], ['XM-3'], ['XM-1'], ['XM-9'], ['XM-1']] }),
      )
      .mockResolvedValueOnce(json(200, {}))
    await client(f).upsertOrderRow('XM-1', ['XM-1', '=IMPORTXML("x","y")'])

    expect(f).toHaveBeenCalledTimes(3)
    expect(f.mock.calls[2][0]).toBe(`${BASE}${range('A5:L5')}?valueInputOption=RAW`)
    expect(f.mock.calls[2][1].method).toBe('PUT')
    // RAW: формула остаётся текстом.
    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({
      values: [['XM-1', '=IMPORTXML("x","y")']],
    })
  })

  it('переиспользует токен до истечения', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('oauth2') ? tokenOk() : json(200, { values: [['№ заказа'], ['XM-1']] }),
    )
    const c = client(f as unknown as ReturnType<typeof vi.fn>)
    await c.upsertOrderRow('XM-1', ['XM-1'])
    await c.upsertOrderRow('XM-1', ['XM-1'])
    expect(f.mock.calls.filter(([u]) => String(u).includes('oauth2'))).toHaveLength(1)
  })

  it('403/404/400 — ошибка настройки (SheetsConfigError)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(
        json(403, { error: { message: 'The caller does not have permission' } }),
      )
    const err = await client(f)
      .upsertOrderRow('XM-1', ['XM-1'])
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SheetsConfigError)
    expect((err as Error).message).toMatch(/permission/)
  })

  it('429/5xx — временная ошибка, не SheetsConfigError', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json(503, { error: { message: 'backend error' } }))
    const err = await client(f)
      .upsertOrderRow('XM-1', ['XM-1'])
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(SheetsConfigError)
  })

  it('fromEnv без ключей — null', () => {
    expect(GoogleSheetsClient.fromEnv({})).toBeNull()
  })
})
```

Run: `npm run test -w api -- src/lib/google/sheets.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Клиент**

Создать `api/src/lib/google/sheets.ts`:

```ts
import { createSign } from 'node:crypto'
import { SHEET_HEADER } from '../notifications/format.js'

// Google Sheets API v4 от имени сервисного аккаунта. JWT подписываем сами
// (RS256, node:crypto) — ради одного токена тянуть googleapis незачем.
// Строка заказа ищется по номеру в столбце A и перезаписывается целиком:
// номер строки не храним, менеджер может сортировать таблицу.

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const API = 'https://sheets.googleapis.com/v4/spreadsheets'
const LAST_COLUMN = 'L' // 12 колонок SHEET_HEADER
const TOKEN_MARGIN_MS = 60_000

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

// Ошибка настройки (нет доступа, нет листа, битый ключ) — повторять бессмысленно.
export class SheetsConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetsConfigError'
  }
}

// JSON ключа кладут в env по-разному: как есть, в base64, с буквальными \n
// в private_key. Принимаем все три.
export function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim()
  const text = trimmed.startsWith('{') ? trimmed : Buffer.from(trimmed, 'base64').toString('utf8')
  let data: Partial<ServiceAccount>
  try {
    data = JSON.parse(text) as Partial<ServiceAccount>
  } catch {
    throw new SheetsConfigError('GOOGLE_SERVICE_ACCOUNT_JSON: не JSON и не base64 от JSON')
  }
  if (!data.client_email || !data.private_key) {
    throw new SheetsConfigError('GOOGLE_SERVICE_ACCOUNT_JSON: нет client_email или private_key')
  }
  return {
    client_email: data.client_email,
    private_key: data.private_key.replace(/\\n/g, '\n'),
    token_uri: data.token_uri,
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

export class GoogleSheetsClient {
  private readonly account: ServiceAccount
  private readonly spreadsheetId: string
  private readonly sheetName: string
  private readonly fetchImpl: Fetch
  private readonly now: () => number
  private token: { value: string; expiresAt: number } | null = null

  constructor(opts: {
    serviceAccount: ServiceAccount
    spreadsheetId: string
    sheetName: string
    fetch?: Fetch
    now?: () => number
  }) {
    this.account = opts.serviceAccount
    this.spreadsheetId = opts.spreadsheetId
    this.sheetName = opts.sheetName
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
    this.now = opts.now ?? Date.now
  }

  // null — канал не настроен. Битый JSON ключа — SheetsConfigError: пусть
  // это увидит тот, кто собирает каналы (worker.channelsFromEnv).
  static fromEnv(env: NodeJS.ProcessEnv = process.env): GoogleSheetsClient | null {
    const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON
    const spreadsheetId = env.GOOGLE_SHEETS_ID
    if (!raw || !spreadsheetId) return null
    return new GoogleSheetsClient({
      serviceAccount: parseServiceAccount(raw),
      spreadsheetId,
      sheetName: env.GOOGLE_SHEETS_TAB || 'Заказы',
    })
  }

  async upsertOrderRow(orderNumber: string, row: (string | number)[]): Promise<void> {
    const column = await this.request<{ values?: string[][] }>(
      'GET',
      this.valuesPath(this.range('A:A')),
    )
    const values = column.values ?? []
    if (values.length === 0) {
      await this.request(
        'PUT',
        `${this.valuesPath(this.range(`A1:${LAST_COLUMN}1`))}?valueInputOption=RAW`,
        {
          values: [SHEET_HEADER],
        },
      )
    }
    // Первая строка — заголовки; ищем со второй, первое совпадение.
    const index = values.findIndex((cells, i) => i > 0 && cells?.[0] === orderNumber)
    if (index > 0) {
      const r = index + 1
      await this.request(
        'PUT',
        `${this.valuesPath(this.range(`A${r}:${LAST_COLUMN}${r}`))}?valueInputOption=RAW`,
        { values: [row] },
      )
      return
    }
    await this.request(
      'POST',
      `${this.valuesPath(this.range(`A:${LAST_COLUMN}`))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [row] },
    )
  }

  private range(cells: string): string {
    return `'${this.sheetName.replace(/'/g, "''")}'!${cells}`
  }

  private valuesPath(range: string): string {
    return `${API}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > this.now()) return this.token.value
    const tokenUri = this.account.token_uri ?? DEFAULT_TOKEN_URI
    const iat = Math.floor(this.now() / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = base64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: SHEETS_SCOPE,
        aud: tokenUri,
        iat,
        exp: iat + 3600,
      }),
    )
    let signature: string
    try {
      signature = createSign('RSA-SHA256')
        .update(`${header}.${claims}`)
        .sign(this.account.private_key, 'base64url')
    } catch {
      throw new SheetsConfigError(
        'Не удалось подписать токен: проверьте private_key сервисного аккаунта',
      )
    }
    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }).toString(),
    })
    const data = (await res.json().catch(() => null)) as {
      access_token?: string
      expires_in?: number
      error_description?: string
    } | null
    if (!res.ok || !data?.access_token) {
      const reason = data?.error_description ?? `код ${res.status}`
      if (res.status >= 400 && res.status < 500)
        throw new SheetsConfigError(`Google не выдал токен: ${reason}`)
      throw new Error(`Google не выдал токен: ${reason}`)
    }
    this.token = {
      value: data.access_token,
      expiresAt: this.now() + (data.expires_in ?? 3600) * 1000,
    }
    return data.access_token
  }

  private async request<T = unknown>(
    method: 'GET' | 'PUT' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.accessToken()
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null
    if (!res.ok) {
      const message = `Google Sheets ${res.status}: ${data?.error?.message ?? 'без описания'}`
      // 400 — чаще всего нет такого листа, 403 — нет доступа, 404 — нет таблицы.
      if (res.status === 400 || res.status === 403 || res.status === 404)
        throw new SheetsConfigError(message)
      throw new Error(message)
    }
    return (data ?? {}) as T
  }
}
```

Run: `npm run test -w api -- src/lib/google/sheets.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write api/src/lib/google
git add api/src/lib/google
git commit -m "$(printf 'feat(api): клиент Google Sheets от имени сервисного аккаунта\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 7: Клиент Telegram Bot API

**Files:**

- Create: `api/src/lib/telegram/bot.ts`, `api/src/lib/telegram/bot.test.ts`

**Interfaces:**

- Produces: `class TelegramConfigError extends Error`; `class TelegramBot { constructor(opts: { token: string; chatId: string; fetch?: Fetch }); static fromEnv(env?: NodeJS.ProcessEnv): TelegramBot | null; sendMessage(html: string, replyTo?: number | null): Promise<number> }` — возвращает `message_id`.

- [ ] **Step 1: Падающие тесты**

Создать `api/src/lib/telegram/bot.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { TelegramBot, TelegramConfigError } from './bot.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function bot(fetchMock: ReturnType<typeof vi.fn>) {
  return new TelegramBot({ token: 'TOKEN', chatId: '-1001234', fetch: fetchMock })
}

describe('TelegramBot', () => {
  it('шлёт HTML в рабочий чат и возвращает message_id', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ok: true, result: { message_id: 77 } }))
    expect(await bot(f).sendMessage('<b>Новый заказ</b>')).toBe(77)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: '-1001234',
      text: '<b>Новый заказ</b>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  })

  it('ответ на карточку — reply_parameters, даже если карточку удалили', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ok: true, result: { message_id: 78 } }))
    await bot(f).sendMessage('✅ оплачен', 77)
    expect(JSON.parse(f.mock.calls[0][1].body).reply_parameters).toEqual({
      message_id: 77,
      allow_sending_without_reply: true,
    })
  })

  it('400/401/403 — ошибка настройки с описанием Telegram', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        json(403, {
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was kicked from the group chat',
        }),
      )
    const err = await bot(f)
      .sendMessage('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TelegramConfigError)
    expect((err as Error).message).toMatch(/kicked/)
  })

  it('429 и 5xx — временная ошибка', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        json(429, { ok: false, error_code: 429, description: 'Too Many Requests: retry after 5' }),
      )
    const err = await bot(f)
      .sendMessage('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(TelegramConfigError)
  })

  it('fromEnv без токена или чата — null', () => {
    expect(TelegramBot.fromEnv({})).toBeNull()
    expect(TelegramBot.fromEnv({ TELEGRAM_BOT_TOKEN: 't' })).toBeNull()
    expect(TelegramBot.fromEnv({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '-1' })).toBeInstanceOf(
      TelegramBot,
    )
  })
})
```

Run: `npm run test -w api -- src/lib/telegram/bot.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Клиент**

Создать `api/src/lib/telegram/bot.ts`:

```ts
// Бот магазина пишет в рабочий чат (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
// Отдельный от бота ERP: если ERP лежит, заказы всё равно приходят.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

// Бот не в чате, неверный токен, битая разметка — повторять бессмысленно.
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramConfigError'
  }
}

export class TelegramBot {
  private readonly token: string
  private readonly chatId: string
  private readonly fetchImpl: Fetch

  constructor(opts: { token: string; chatId: string; fetch?: Fetch }) {
    this.token = opts.token
    this.chatId = opts.chatId
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): TelegramBot | null {
    const token = env.TELEGRAM_BOT_TOKEN
    const chatId = env.TELEGRAM_CHAT_ID
    if (!token || !chatId) return null
    return new TelegramBot({ token, chatId })
  }

  async sendMessage(html: string, replyTo?: number | null): Promise<number> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(replyTo
          ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }
          : {}),
      }),
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      result?: { message_id?: number }
      description?: string
    } | null
    if (res.ok && data?.ok && typeof data.result?.message_id === 'number')
      return data.result.message_id
    const message = `Telegram ${res.status}: ${data?.description ?? 'без описания'}`
    if (res.status === 400 || res.status === 401 || res.status === 403)
      throw new TelegramConfigError(message)
    throw new Error(message)
  }
}
```

Run: `npm run test -w api -- src/lib/telegram/bot.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write api/src/lib/telegram
git add api/src/lib/telegram
git commit -m "$(printf 'feat(api): клиент Telegram Bot API для рабочего чата\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 8: Обработчик очереди и запуск

**Files:**

- Create: `api/src/lib/notifications/worker.ts`, `api/src/lib/notifications/worker.test.ts`
- Modify: `api/src/index.ts` (после запуска сверки)
- Modify: `deploy/app.env.example`, `api/.env.example`

**Interfaces:**

- Consumes: `OrderNotification` (Task 1), `CHANNELS` (Task 3), `sheetRow`, `telegramCard`, `telegramStatusLine` (Task 5), `GoogleSheetsClient`, `SheetsConfigError` (Task 6), `TelegramBot`, `TelegramConfigError` (Task 7).
- Produces: `RETRY_DELAYS_MS`, `GIVE_UP_AFTER_MS`, `WORKER_INTERVAL_MS`; `nextDelayMs(attempts: number): number`; `interface NotificationChannels { sheets: Pick<GoogleSheetsClient, 'upsertOrderRow'> | null; telegram: Pick<TelegramBot, 'sendMessage'> | null }`; `channelsFromEnv(env?): NotificationChannels`; `processDueNotifications(channels: NotificationChannels, opts?: { now?: Date }): Promise<{ sent: number; retried: number; failed: number }>`; `startNotificationWorker(channels?, intervalMs?): NodeJS.Timeout | null`.

- [ ] **Step 1: Падающие тесты**

Создать `api/src/lib/notifications/worker.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { SheetsConfigError } from '../google/sheets.js'
import { enqueueOrderEvent } from './outbox.js'
import { nextDelayMs, processDueNotifications, type NotificationChannels } from './worker.js'

const NOW = new Date('2026-09-25T12:00:00Z')

async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      orderNumber: `XM-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: 'pending',
      customerName: 'Мария',
      customerPhone: '+79123456789',
      customerEmail: '',
      deliveryAddress: {
        address: 'Новосибирск, ул. Кривощековская, 15',
        comment: null,
        deliveryPointCode: 'NSK1',
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
      productId: '00000000-0000-4000-8000-000000000001',
      productSnapshot: { name: 'Серная кислота 7%', sku: 'H2SO4', priceRub: 119 },
      quantity: 2,
      unitPriceRub: 119,
    }),
  )
  return order
}

async function enqueue(
  orderId: string,
  key: Parameters<typeof enqueueOrderEvent>[2],
  createdAt: Date,
) {
  await AppDataSource.transaction((em) => enqueueOrderEvent(em, orderId, key))
  await AppDataSource.query(
    `UPDATE order_notifications SET created_at = $3, next_attempt_at = $3 WHERE order_id = $1 AND event_key = $2`,
    [orderId, key, createdAt],
  )
}

function row(orderId: string, channel: 'sheets' | 'telegram', eventKey: string) {
  return AppDataSource.getRepository(OrderNotification).findOneByOrFail({
    orderId,
    channel,
    eventKey: eventKey as never,
  })
}

function fakeChannels(): NotificationChannels & {
  sheets: { upsertOrderRow: ReturnType<typeof vi.fn> }
  telegram: { sendMessage: ReturnType<typeof vi.fn> }
} {
  return {
    sheets: { upsertOrderRow: vi.fn().mockResolvedValue(undefined) },
    telegram: { sendMessage: vi.fn().mockResolvedValue(501) },
  }
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

describe('processDueNotifications', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
  })

  it('created: строка в таблицу, карточка в чат, id карточки сохраняется', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result).toEqual({ sent: 2, retried: 0, failed: 0 })
    const [number, sheet] = channels.sheets.upsertOrderRow.mock.calls[0]
    expect(number).toBe(order.orderNumber)
    expect(sheet[0]).toBe(order.orderNumber)
    expect(sheet[7]).toBe('Серная кислота 7% · H2SO4 · 2 × 119 ₽')
    const [card, replyTo] = channels.telegram.sendMessage.mock.calls[0]
    expect(card).toContain(`Новый заказ ${order.orderNumber}`)
    expect(replyTo).toBeUndefined()
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(saved.telegramMessageId).toBe(501)
    expect((await row(order.id, 'telegram', 'created')).sentAt).not.toBeNull()
    expect((await row(order.id, 'sheets', 'created')).attempts).toBe(1)
  })

  it('смена статуса — ответ на карточку', async () => {
    const order = await seedOrder({ status: 'paid', telegramMessageId: 501 })
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })
    expect(channels.telegram.sendMessage).toHaveBeenCalledWith('✅ оплачен', 501)
  })

  it('строка таблицы собирается из текущего состояния заказа', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(2))
    await AppDataSource.getRepository(Order).update(order.id, { status: 'paid' })
    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })
    expect(channels.sheets.upsertOrderRow.mock.calls[0][1][11]).toBe('оплачен')
  })

  it('статус не обгоняет карточку, которую ещё не отправили', async () => {
    const order = await seedOrder({ status: 'paid' })
    await enqueue(order.id, 'created', minutesAgo(2))
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    const channels = fakeChannels()
    channels.telegram.sendMessage.mockRejectedValueOnce(new Error('socket hang up'))

    await processDueNotifications(channels, { now: NOW })

    expect(channels.telegram.sendMessage).toHaveBeenCalledTimes(1)
    const status = await row(order.id, 'telegram', 'status:paid')
    expect(status.attempts).toBe(0)
    expect(status.sentAt).toBeNull()
  })

  it('карточка не ушла совсем — статус отдельным сообщением с номером заказа', async () => {
    const order = await seedOrder({ status: 'paid' })
    await enqueue(order.id, 'created', minutesAgo(2))
    await enqueue(order.id, 'status:paid', minutesAgo(1))
    await AppDataSource.query(
      `UPDATE order_notifications SET failed_at = $2 WHERE order_id = $1 AND channel = 'telegram' AND event_key = 'created'`,
      [order.id, minutesAgo(1)],
    )
    const channels = fakeChannels()
    await processDueNotifications(channels, { now: NOW })
    expect(channels.telegram.sendMessage).toHaveBeenCalledWith(
      `✅ Заказ ${order.orderNumber}: оплачен`,
      null,
    )
  })

  it('временная ошибка — повтор по расписанию', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(new Error('socket hang up'))

    await processDueNotifications(channels, { now: NOW })
    let sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(1)
    expect(sheets.failedAt).toBeNull()
    expect(sheets.lastError).toContain('socket hang up')
    expect(sheets.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000)

    await processDueNotifications(channels, { now: new Date(NOW.getTime() + 30_000) })
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(1)

    await processDueNotifications(channels, { now: new Date(NOW.getTime() + 61_000) })
    expect(channels.sheets.upsertOrderRow).toHaveBeenCalledTimes(2)
    sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(2)
  })

  it('ошибка настройки — сразу сдаёмся, без повторов', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(
      new SheetsConfigError('Google Sheets 400: Unable to parse range'),
    )

    const result = await processDueNotifications(channels, { now: NOW })

    expect(result.failed).toBe(1)
    const sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.failedAt).not.toBeNull()
    expect(sheets.lastError).toContain('Unable to parse range')
  })

  it('через сутки временные ошибки тоже сдаются', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', new Date(NOW.getTime() - 25 * 3600_000))
    const channels = fakeChannels()
    channels.sheets.upsertOrderRow.mockRejectedValue(new Error('503'))
    await processDueNotifications(channels, { now: NOW })
    expect((await row(order.id, 'sheets', 'created')).failedAt).not.toBeNull()
  })

  it('ненастроенный канал не трогается — его записи ждут', async () => {
    const order = await seedOrder()
    await enqueue(order.id, 'created', minutesAgo(1))
    const channels = { sheets: null, telegram: fakeChannels().telegram }
    await processDueNotifications(channels, { now: NOW })
    const sheets = await row(order.id, 'sheets', 'created')
    expect(sheets.attempts).toBe(0)
    expect(sheets.sentAt).toBeNull()
    expect((await row(order.id, 'telegram', 'created')).sentAt).not.toBeNull()
  })
})

describe('nextDelayMs', () => {
  it('1 мин, 5 мин, 15 мин, 1 ч, 6 ч, дальше 6 ч', () => {
    expect([1, 2, 3, 4, 5, 9].map(nextDelayMs)).toEqual([
      60_000, 300_000, 900_000, 3_600_000, 21_600_000, 21_600_000,
    ])
  })
})
```

Run: `npm run test -w api -- src/lib/notifications/worker.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Обработчик**

Создать `api/src/lib/notifications/worker.ts`:

```ts
import type { OrderEventKey } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { GoogleSheetsClient, SheetsConfigError } from '../google/sheets.js'
import { TelegramBot, TelegramConfigError } from '../telegram/bot.js'
import { sheetRow, telegramCard, telegramStatusLine } from './format.js'
import { CHANNELS } from './outbox.js'

// Доставка очереди order_notifications в Google Таблицу и Telegram. Тик —
// раз в 10 с, одна обработка за раз внутри процесса: api — один контейнер,
// поэтому блокировки строк не нужны. Доставка «хотя бы один раз»: если
// процесс упал между отправкой и отметкой, запись уйдёт повторно — строка
// таблицы перезапишется тем же, в чате будет дубль. Это лучше потери.

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
export const GIVE_UP_AFTER_MS = 24 * 60 * 60_000
export const WORKER_INTERVAL_MS = 10_000
const BATCH_SIZE = 20

export function nextDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1]
}

export interface NotificationChannels {
  sheets: Pick<GoogleSheetsClient, 'upsertOrderRow'> | null
  telegram: Pick<TelegramBot, 'sendMessage'> | null
}

// Битый ключ Google не должен ронять api: канал выключается, причина — в лог.
export function channelsFromEnv(env: NodeJS.ProcessEnv = process.env): NotificationChannels {
  let sheets: NotificationChannels['sheets'] = null
  try {
    sheets = GoogleSheetsClient.fromEnv(env)
  } catch (err) {
    console.error(`notifications: Google Таблица выключена — ${(err as Error).message}`)
  }
  return { sheets, telegram: TelegramBot.fromEnv(env) }
}

function isConfigError(err: unknown): boolean {
  return err instanceof SheetsConfigError || err instanceof TelegramConfigError
}

async function deliver(
  row: OrderNotification,
  order: Order,
  channels: NotificationChannels,
): Promise<void> {
  if (row.channel === 'sheets') {
    await channels.sheets!.upsertOrderRow(order.orderNumber, sheetRow(order))
    return
  }
  const bot = channels.telegram!
  if (row.eventKey === 'created') {
    const messageId = await bot.sendMessage(telegramCard(order))
    await AppDataSource.getRepository(Order).update(order.id, { telegramMessageId: messageId })
    return
  }
  const replyTo = order.telegramMessageId
  await bot.sendMessage(
    telegramStatusLine(
      order.orderNumber,
      row.eventKey as Exclude<OrderEventKey, 'created'>,
      replyTo == null,
    ),
    replyTo,
  )
}

export async function processDueNotifications(
  channels: NotificationChannels,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ sent: number; retried: number; failed: number }> {
  const result = { sent: 0, retried: 0, failed: 0 }
  const enabled = CHANNELS.filter((c) => channels[c] !== null)
  if (enabled.length === 0) return result

  const repo = AppDataSource.getRepository(OrderNotification)
  const due = await repo
    .createQueryBuilder('n')
    .where('n.sent_at IS NULL AND n.failed_at IS NULL')
    .andWhere('n.next_attempt_at <= :now', { now })
    .andWhere('n.channel IN (:...enabled)', { enabled })
    .orderBy('n.created_at', 'ASC')
    .addOrderBy('n.id', 'ASC')
    .limit(BATCH_SIZE)
    .getMany()

  for (const row of due) {
    // Порядок внутри «заказ × канал»: пока более ранняя запись не доставлена
    // и не сдалась, эта ждёт — смена статуса не обгонит карточку.
    const blocked = await repo
      .createQueryBuilder('p')
      .where('p.order_id = :orderId AND p.channel = :channel', {
        orderId: row.orderId,
        channel: row.channel,
      })
      .andWhere('p.sent_at IS NULL AND p.failed_at IS NULL')
      .andWhere('p.created_at < :createdAt', { createdAt: row.createdAt })
      .getExists()
    if (blocked) continue

    const attempts = row.attempts + 1
    try {
      const order = await AppDataSource.getRepository(Order).findOne({
        where: { id: row.orderId },
        relations: { items: true },
      })
      if (!order) throw new SheetsConfigError('Заказ удалён')
      await deliver(row, order, channels)
      await repo.update(row.id, { sentAt: now, attempts, lastError: null })
      result.sent += 1
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000)
      const expired = now.getTime() - row.createdAt.getTime() >= GIVE_UP_AFTER_MS
      if (isConfigError(err) || expired) {
        await repo.update(row.id, { attempts, lastError: message, failedAt: now })
        result.failed += 1
      } else {
        await repo.update(row.id, {
          attempts,
          lastError: message,
          nextAttemptAt: new Date(now.getTime() + nextDelayMs(attempts)),
        })
        result.retried += 1
      }
      console.error(
        `notifications: ${row.channel}/${row.eventKey} заказа ${row.orderId} — ${message}`,
      )
    }
  }
  return result
}

// Запускается из api/src/index.ts. null — ни один канал не настроен.
export function startNotificationWorker(
  channels: NotificationChannels = channelsFromEnv(),
  intervalMs: number = WORKER_INTERVAL_MS,
): NodeJS.Timeout | null {
  if (!channels.sheets && !channels.telegram) return null
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    processDueNotifications(channels)
      .catch((err) => console.error('notifications: тик обработчика упал', err))
      .finally(() => {
        running = false
      })
  }, intervalMs)
  timer.unref()
  return timer
}
```

Run: `npm run test -w api -- src/lib/notifications/worker.test.ts`
Expected: PASS.

- [ ] **Step 3: Запуск и шаблоны окружения**

`api/src/index.ts`: добавить `import { startNotificationWorker } from './lib/notifications/worker.js'` и после блока `if (startReconciliationJob()) { … }`:

```ts
// Очередь уведомлений о заказах → Google Таблица и Telegram.
// No-op, если ни один канал не настроен.
if (startNotificationWorker()) {
  logger.info('order notifications worker started')
}
```

В `deploy/app.env.example` и `api/.env.example` перед блоком оплаты (`PAYMENT_PROVIDER`) добавить:

```
# Уведомления о заказах (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
# Пустые значения — канал выключен, записи копятся в очереди и уйдут, когда
# ключи появятся. Настройка по шагам — deploy/README.md, «Уведомления о заказах».
# Бот магазина: токен от @BotFather и id рабочего чата (у групп отрицательный).
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Сервисный аккаунт Google: JSON-ключ целиком — одной строкой или в base64.
GOOGLE_SERVICE_ACCOUNT_JSON=
# id таблицы — часть адреса между /d/ и /edit. Лист — «Заказы».
GOOGLE_SHEETS_ID=
GOOGLE_SHEETS_TAB=Заказы
```

- [ ] **Step 4: Полная проверка api**

Run: `npm run test -w api && npm run typecheck -w api`
Expected: весь сьют PASS, typecheck без ошибок.

- [ ] **Step 5: Commit**

```bash
npx prettier --write api/src/lib/notifications api/src/index.ts
git add api/src/lib/notifications api/src/index.ts deploy/app.env.example api/.env.example
git commit -m "$(printf 'feat(api): обработчик очереди уведомлений с повторами\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 9: Уведомления в карточке заказа в админке

**Files:**

- Modify: `api/src/routes/admin/orders.ts` (GET `/:id`, новый POST `/:id/notifications/retry`)
- Modify: `web/lib/adminApi.ts`
- Create: `web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx`, `web/app/admin/(authed)/orders/[id]/OrderNotifications.test.tsx`
- Modify: `web/app/admin/(authed)/orders/[id]/page.tsx` (секция «Клиент» и новая секция после «Действий»)
- Test: `api/src/routes/admin-orders.test.ts`

**Interfaces:**

- Consumes: `OrderNotification`, `OrderNotificationDto` (Task 1).
- Produces: GET `/api/admin/orders/:id` → `data.notifications: OrderNotificationDto[]` (по `createdAt`, затем `channel`); POST `/api/admin/orders/:id/notifications/retry` → `{ data: OrderNotificationDto[] }`; `adminRetryOrderNotifications(id: string): Promise<OrderNotificationDto[]>`; компонент `<OrderNotifications orderId notifications />`.

- [ ] **Step 1: Падающие тесты api**

В `api/src/routes/admin-orders.test.ts` перед `'rejects missing auth (401) and missing CSRF (403)'` добавить:

```ts
it('карточка заказа отдаёт состояние уведомлений', async () => {
  const order = await seedOrder()
  const repo = AppDataSource.getRepository(OrderNotification)
  await repo.save([
    repo.create({
      orderId: order.id,
      channel: 'sheets',
      eventKey: 'created',
      sentAt: new Date(),
      attempts: 1,
    }),
    repo.create({
      orderId: order.id,
      channel: 'telegram',
      eventKey: 'created',
      failedAt: new Date(),
      attempts: 1,
      lastError: 'Telegram 403: Forbidden: bot was kicked from the group chat',
    }),
  ])
  const res = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(auth))
  expect(res.status).toBe(200)
  expect(res.body.data.notifications).toHaveLength(2)
  expect(res.body.data.notifications[1]).toMatchObject({
    channel: 'telegram',
    eventKey: 'created',
    attempts: 1,
    lastError: expect.stringContaining('kicked'),
  })
  expect(res.body.data.notifications[1].failedAt).not.toBeNull()
})

it('«Отправить ещё раз» возвращает несданные записи в очередь', async () => {
  const order = await seedOrder()
  const repo = AppDataSource.getRepository(OrderNotification)
  const sent = await repo.save(
    repo.create({
      orderId: order.id,
      channel: 'sheets',
      eventKey: 'created',
      sentAt: new Date(),
      attempts: 1,
    }),
  )
  const failed = await repo.save(
    repo.create({
      orderId: order.id,
      channel: 'telegram',
      eventKey: 'created',
      failedAt: new Date(),
      attempts: 3,
      lastError: 'x',
    }),
  )
  const res = await request(app)
    .post(`/api/admin/orders/${order.id}/notifications/retry`)
    .set(authHeaders(auth))
  expect(res.status).toBe(200)
  const retried = await repo.findOneByOrFail({ id: failed.id })
  expect(retried).toMatchObject({ failedAt: null, attempts: 0, lastError: null })
  expect(retried.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())
  expect((await repo.findOneByOrFail({ id: sent.id })).sentAt).not.toBeNull()
})

it('404 на повтор для неизвестного заказа', async () => {
  const res = await request(app)
    .post('/api/admin/orders/00000000-0000-4000-8000-000000000999/notifications/retry')
    .set(authHeaders(auth))
  expect(res.status).toBe(404)
})
```

Run: `npm run test -w api -- src/routes/admin-orders.test.ts`
Expected: FAIL — `notifications` нет, маршрут повтора 404.

- [ ] **Step 2: Маршруты**

В `api/src/routes/admin/orders.ts` добавить импорты `import { IsNull, Not } from 'typeorm'` и `import { OrderNotification } from '../../entities/OrderNotification.js'`, а перед `// Detail — items included…` — хелпер:

```ts
async function orderNotifications(orderId: string) {
  const rows = await AppDataSource.getRepository(OrderNotification).find({
    where: { orderId },
    order: { createdAt: 'ASC', channel: 'ASC' },
  })
  return rows.map((n) => ({
    channel: n.channel,
    eventKey: n.eventKey,
    attempts: n.attempts,
    nextAttemptAt: n.nextAttemptAt.toISOString(),
    sentAt: n.sentAt?.toISOString() ?? null,
    failedAt: n.failedAt?.toISOString() ?? null,
    lastError: n.lastError,
  }))
}
```

В GET `/:id` заменить `res.json({ data: order })` на `res.json({ data: { ...order, notifications: await orderNotifications(order.id) } })`.

После PATCH `/:id/status` добавить маршрут:

```ts
// «Отправить ещё раз»: несданные записи возвращаются в очередь как новые.
adminOrdersRouter.post('/:id/notifications/retry', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) throw notFound('order_not_found', 'Заказ не найден')
    const exists = await AppDataSource.getRepository(Order).exists({ where: { id: id.data } })
    if (!exists) throw notFound('order_not_found', 'Заказ не найден')
    await AppDataSource.getRepository(OrderNotification).update(
      { orderId: id.data, failedAt: Not(IsNull()) },
      { failedAt: null, attempts: 0, lastError: null, nextAttemptAt: new Date() },
    )
    res.json({ data: await orderNotifications(id.data) })
  } catch (err) {
    next(err)
  }
})
```

Run: `npm run test -w api -- src/routes/admin-orders.test.ts`
Expected: PASS.

- [ ] **Step 3: Падающий тест компонента**

Создать `web/app/admin/(authed)/orders/[id]/OrderNotifications.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { OrderNotificationDto } from '@ximi4ka-shop/shared'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const retry = vi.fn(async () => [])
vi.mock('@/lib/adminApi', () => ({
  adminRetryOrderNotifications: (...args: unknown[]) => retry(...args),
  ApiError: class ApiError extends Error {},
}))

import { OrderNotifications } from './OrderNotifications'

const base: OrderNotificationDto = {
  channel: 'sheets',
  eventKey: 'created',
  attempts: 1,
  nextAttemptAt: '2026-09-25T11:10:00.000Z',
  sentAt: '2026-09-25T11:10:05.000Z',
  failedAt: null,
  lastError: null,
}

describe('<OrderNotifications>', () => {
  beforeEach(() => {
    retry.mockClear()
    refresh.mockClear()
  })

  it('показывает канал, событие и состояние', () => {
    render(
      <OrderNotifications
        orderId="o1"
        notifications={[
          base,
          {
            ...base,
            channel: 'telegram',
            sentAt: null,
            failedAt: '2026-09-25T11:11:00.000Z',
            lastError: 'bot was kicked',
          },
          { ...base, eventKey: 'status:paid', sentAt: null, attempts: 2 },
        ]}
      />,
    )
    expect(screen.getByText('Google Таблица · новый заказ')).toBeInTheDocument()
    expect(screen.getByText(/^доставлено/)).toBeInTheDocument()
    expect(screen.getByText(/не доставлено: bot was kicked/)).toBeInTheDocument()
    expect(screen.getByText(/повтор .*, попыток: 2/)).toBeInTheDocument()
  })

  it('кнопка повтора — только если есть несданные', async () => {
    const { rerender } = render(<OrderNotifications orderId="o1" notifications={[base]} />)
    expect(screen.queryByRole('button', { name: /ещё раз/i })).toBeNull()

    rerender(
      <OrderNotifications
        orderId="o1"
        notifications={[{ ...base, sentAt: null, failedAt: '2026-09-25T11:11:00.000Z' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /отправить ещё раз/i }))
    await vi.waitFor(() => expect(retry).toHaveBeenCalledWith('o1'))
    expect(refresh).toHaveBeenCalled()
  })

  it('пусто — объясняет, что уведомлений ещё не было', () => {
    render(<OrderNotifications orderId="o1" notifications={[]} />)
    expect(screen.getByText(/уведомлений по заказу ещё не было/i)).toBeInTheDocument()
  })
})
```

Run: `cd web && npx vitest run "app/admin/(authed)/orders/[id]/OrderNotifications.test.tsx"`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Компонент, клиент и страница**

В `web/lib/adminApi.ts` добавить в импорт типов `OrderNotificationDto` и после `adminSetOrderStatus`:

```ts
// «Отправить ещё раз» для уведомлений заказа, которые не дошли.
export async function adminRetryOrderNotifications(id: string): Promise<OrderNotificationDto[]> {
  const body = await authedRequest<{ data: OrderNotificationDto[] }>(
    `/api/admin/orders/${encodeURIComponent(id)}/notifications/retry`,
    { method: 'POST' },
  )
  return body.data
}
```

Создать `web/app/admin/(authed)/orders/[id]/OrderNotifications.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationChannel, OrderEventKey, OrderNotificationDto } from '@ximi4ka-shop/shared'
import { adminRetryOrderNotifications, ApiError } from '@/lib/adminApi'
import { formatDateTime } from '../orderUi'

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  sheets: 'Google Таблица',
  telegram: 'Telegram',
}

const EVENT_LABELS: Record<OrderEventKey, string> = {
  created: 'новый заказ',
  'status:paid': 'оплачен',
  'status:shipped': 'отправлен',
  'status:cancelled': 'отменён',
  'status:failed': 'оплата не прошла',
}

function stateLabel(n: OrderNotificationDto): string {
  if (n.sentAt) return `доставлено ${formatDateTime(n.sentAt)}`
  if (n.failedAt) return `не доставлено: ${n.lastError ?? 'без описания'}`
  if (n.attempts > 0) return `повтор ${formatDateTime(n.nextAttemptAt)}, попыток: ${n.attempts}`
  return 'в очереди'
}

// Куда и что ушло по заказу: таблица и рабочий чат. Кнопка возвращает
// несданные записи в очередь (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
export function OrderNotifications({
  orderId,
  notifications,
}: {
  orderId: string
  notifications: OrderNotificationDto[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFailed = notifications.some((n) => n.failedAt)

  async function retry() {
    setBusy(true)
    setError(null)
    try {
      await adminRetryOrderNotifications(orderId)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось поставить уведомления в очередь')
    } finally {
      setBusy(false)
    }
  }

  if (notifications.length === 0) {
    return <p className="text-sm text-brand-text-secondary">Уведомлений по заказу ещё не было.</p>
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm">
        {notifications.map((n) => (
          <li key={`${n.channel}:${n.eventKey}`} className="flex flex-col">
            <span className="text-brand-text">{`${CHANNEL_LABELS[n.channel]} · ${EVENT_LABELS[n.eventKey]}`}</span>
            <span className={n.failedAt ? 'text-red-600' : 'text-brand-text-secondary'}>
              {stateLabel(n)}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {hasFailed && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-white border border-brand-border text-brand-text font-semibold hover:bg-brand-bg-soft transition disabled:opacity-50"
        >
          {busy ? 'Ставим в очередь…' : 'Отправить ещё раз'}
        </button>
      )}
    </div>
  )
}
```

В `web/app/admin/(authed)/orders/[id]/page.tsx`:

- импорт `import { OrderNotifications } from './OrderNotifications'`;
- в секции «Клиент» после блока E-mail (`<div>…E-mail…</div>`) добавить:

```tsx
<div>
  <dt className="text-xs text-brand-text-secondary">Telegram</dt>
  <dd className="text-brand-text">{order.customerTelegram || '—'}</dd>
</div>
```

- после закрывающего `</section>` секции «Действия» добавить:

```tsx
{
  /* Уведомления */
}
;<section className="bg-white rounded-2xl border border-brand-border p-4">
  <h2 className="text-lg font-semibold text-brand-text">Уведомления</h2>
  <div className="mt-3">
    <OrderNotifications orderId={order.id} notifications={order.notifications ?? []} />
  </div>
</section>
```

Run: `cd web && npx vitest run "app/admin/(authed)/orders" && cd .. && npm run typecheck -ws --if-present && npm run lint -w web`
Expected: PASS, typecheck и lint без ошибок.

- [ ] **Step 5: Commit**

```bash
npx prettier --write api/src/routes/admin/orders.ts api/src/routes/admin-orders.test.ts web/lib/adminApi.ts "web/app/admin/(authed)/orders/[id]"
git add api/src/routes/admin/orders.ts api/src/routes/admin-orders.test.ts web/lib/adminApi.ts "web/app/admin/(authed)/orders/[id]"
git commit -m "$(printf 'feat: уведомления заказа в админке и повтор недоставленных\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 10: Ранбук, живая проверка, security review

**Files:**

- Modify: `deploy/README.md` (новый раздел)

**Interfaces:**

- Consumes: всё из Task 1–9.

- [ ] **Step 1: Раздел ранбука**

В `deploy/README.md` перед разделом `## Хвосты` добавить:

```markdown
## Уведомления о заказах

Каждый заказ уходит строкой в Google Таблицу и карточкой в рабочий Telegram-чат
(дизайн — `docs/superpowers/specs/2026-09-25-order-notifications-design.md`).
Ключи — в `deploy/app.env`, после правки — `bash deploy/deploy.sh --no-pull`.
Пока ключей нет, канал выключен, записи копятся в очереди и уйдут потом.

**Бот:**

1. @BotFather → `/newbot` → токен в `TELEGRAM_BOT_TOKEN`.
2. Добавить бота в рабочую группу и написать в ней любое сообщение.
3. Открыть `https://api.telegram.org/bot<токен>/getUpdates`, взять
   `message.chat.id` (у групп отрицательный) → `TELEGRAM_CHAT_ID`.

**Таблица:**

1. Google Cloud Console → проект → включить Google Sheets API.
2. «IAM и администрирование» → «Сервисные аккаунты» → создать → «Ключи» → JSON.
3. JSON целиком, одной строкой или в base64 → `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. Создать таблицу, открыть доступ «Редактор» для почты сервисного аккаунта
   (`…@….iam.gserviceaccount.com`). Кроме него — только команда: в таблице
   персональные данные покупателей.
5. id таблицы — часть адреса между `/d/` и `/edit` → `GOOGLE_SHEETS_ID`.
   Лист — `Заказы` (иначе задать `GOOGLE_SHEETS_TAB`).

**Если не доходит:** карточка заказа в админке → «Уведомления»: там видна
причина. Исправить настройку → «Отправить ещё раз».
```

- [ ] **Step 2: Полная проверка**

Run: `npm run test -ws --if-present && npm run typecheck -ws --if-present && npm run lint -ws --if-present`
Expected: все сьюты PASS, typecheck и lint без ошибок.

- [ ] **Step 3: Живая проверка (нужны ключи от владельца)**

1. Владелец заполняет в `api/.env` ключи Telegram и Google (тестовый чат, тестовая таблица).
2. Перезапустить api (`preview_start api`), в логе — `order notifications worker started`.
3. Оформить заказ на `http://localhost:3020/checkout` с ником Telegram.
4. В течение 10–20 с: в таблице строка с 12 колонками и статусом `создан`, в чате карточка.
5. В админке «Отметить оплаченным» → строка `оплачен`, в чате ответ `✅ оплачен`; затем «Отметить отправленным» → `отправлен`, `📦 отправлен`.
6. Выгнать бота из чата или закрыть доступ к таблице → в админке «Уведомления» показывают причину; вернуть доступ → «Отправить ещё раз» → доходит.

Expected: все шаги проходят; расхождения — в баг-лист до выкатки.

- [ ] **Step 4: Security review**

Запустить `/security-review` на ветке: персональные данные уходят во внешние сервисы, новый админский маршрут, парсинг ключа из env.
Expected: замечаний уровня high/medium нет или они исправлены отдельными коммитами.

- [ ] **Step 5: Commit**

```bash
npx prettier --write deploy/README.md
git add deploy/README.md
git commit -m "$(printf 'docs(deploy): настройка уведомлений о заказах\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

## Вне плана

- Мини-CRM — следующий этап, отдельная спека.
- Автоматический «отправлен» по статусам СДЭК — этапы 4–5 интеграции СДЭК.
- Уведомления покупателю и обратная синхронизация из таблицы.
