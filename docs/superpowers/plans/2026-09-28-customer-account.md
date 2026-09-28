# Личный кабинет покупателя — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** покупатель входит по коду из письма или через Telegram-бота, видит свои заказы и личные данные, получает автозаполнение чекаута и кнопку поддержки @ximi4ka_support.

**Architecture:** авторизация живёт в Express api по образцу админки: сессия в таблице `customer_sessions`, HttpOnly-cookie, CSRF double-submit. Письма уходят через nodemailer (SMTP домена), вход через Telegram идёт по deep link на нового бота, подтверждение приходит на webhook. Web (Next 16, App Router) получает страницы `/account/login`, `/account` (заказы), `/account/profile` и ходит в `/api/account/*` с `credentials: 'include'`.

**Tech Stack:** Express 4, TypeORM 0.3 + Postgres, zod 4, nodemailer, Vitest + supertest (api), Next.js 16.2 + React 19 + Tailwind v4, Vitest + Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-09-28-customer-account-design.md`. Исполнитель читает спек и план вместе.

**Отступления от спека (упрощения, смысл тот же):**

- В `customer_email_codes` нет `link_customer_id`. Код доказывает владение почтой одинаково для входа и для привязки, а что делать с результатом, решает эндпоинт (`/auth/email/verify` или `/link/email/verify`).
- Код вводится в одно поле `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength=6`, с широким трекингом, а не в 6 отдельных. Вставка и автоподстановка из почты работают сами.
- Email хранится уже в нижнем регистре, поэтому уникальный индекс простой, по `email`, а не по `lower(email)`.

## Global Constraints

- Имена cookie: `ximi4ka_customer_session` (HttpOnly), `ximi4ka_customer_csrf` (читаемая), `ximi4ka_customer_tg_poll` (HttpOnly, 10 минут). Все с `SameSite=lax`, `Secure` в проде, `path: '/'`.
- Сессия покупателя живёт 60 дней. Код из письма живёт 10 минут, на него 5 попыток ввода. Письма: 1 на адрес в 60 с, не больше 5 в час; по IP — 20 стартов в час. Запрос входа через Telegram живёт 10 минут, статус опрашивается раз в 2 с.
- В базе хранятся только sha256-хэши токенов сессий, кодов, nonce и `poll_secret`. Сравнение хэшей идёт через `timingSafeEqual`.
- Коды не пишутся в логи нигде, кроме log-транспорта почты вне прода. Email в логах маскируется (`a***@mail.ru`).
- Env api: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `TELEGRAM_LOGIN_BOT_TOKEN`, `TELEGRAM_LOGIN_BOT_USERNAME`, `TELEGRAM_LOGIN_WEBHOOK_SECRET`. Новых env в web нет.
- Поддержка — `https://t.me/ximi4ka_support`.
- Старые заказы подтягиваются к аккаунту только по подтверждённому email. Пустой `customer_email = ''` не совпадает ни с чем. По телефону и @нику не подтягиваем.
- Next 16: перед кодом web прочитать `web/AGENTS.md` и нужные разделы `node_modules/next/dist/docs/`. `cookies()` и `searchParams` асинхронные.
- Тексты интерфейса на русском, стиль комментариев в коде как в соседних файлах.
- Тесты api идут на настоящей Postgres (`TEST_DATABASE_URL`, по умолчанию `ximi4ka_shop_test`), файлы по одному. Команда: `npm test -w api -- <файл>`.

## Review Focus

1. **Два браузера и одна ссылка на бота.** Злоумышленник начал вход и прислал жертве свою ссылку. Жертва жмёт «Старт», но без «Подтвердить» никто не входит. Нажатие «Подтвердить» с другого Telegram-аккаунта, чем «Старт», отклоняется. Тест в Task 6.
2. **Двойной опрос статуса.** Две вкладки опрашивают один подтверждённый запрос. Сессию создаёт ровно один ответ, второй получает `expired`. Тест в Task 6.
3. **Заказ со своим email, но без входа**, и заказ на чужой, не подтверждённый email. Первый привязывается к существующему аккаунту с этим email, а для второго аккаунт не создаётся. Тест в Task 9.
4. **Письмо не ушло (SMTP упал).** Ответ 502, а повторный запрос через 60 с снова шлёт код. Код, созданный при неудачной отправке, не считается «отправленным» для интервала 60 с. Тест в Task 4.
5. **`?next=` с внешним адресом** (`//evil.ru`, `https://evil.ru`, `/\evil.ru`). После входа такой адрес всегда даёт `/account`. Тест в Task 10.

---

## File Structure

**api (новые):**

- `api/src/entities/Customer.ts`, `CustomerSession.ts`, `CustomerEmailCode.ts`, `TelegramLoginRequest.ts` — сущности.
- `api/src/migrations/1790700000000-AddCustomerAccounts.ts` — все таблицы и `orders.customer_id`.
- `api/src/lib/mail/mailer.ts` — интерфейс `Mailer`, SMTP, память и фабрика `getMailer()`.
- `api/src/lib/telegram/loginBot.ts` — клиент покупательского бота.
- `api/src/lib/account/session.ts` — выдача, поиск и сброс сессии покупателя.
- `api/src/lib/account/customers.ts` — поиск и создание покупателя, подтяжка заказов, слияние, привязка способов входа.
- `api/src/lib/account/emailCodes.ts` — выпуск и проверка кодов.
- `api/src/lib/account/telegramLogin.ts` — запросы входа через Telegram и обработка update.
- `api/src/lib/account/orders.ts` — список заказов покупателя и `lastDelivery`.
- `api/src/routes/account/constants.ts`, `schemas.ts`, `auth.ts`, `link.ts`, `profile.ts`, `index.ts` — роуты `/api/account/*`.
- `api/src/routes/telegram/loginWebhook.ts` — `POST /api/telegram/login-webhook`.
- `api/src/routes/middleware/requireCustomerAuth.ts` — `requireCustomerAuth` и `requireCustomerCsrf`.
- `api/src/scripts/telegram-set-webhook.ts` — установка webhook.
- Тесты: `api/src/entities/customer.test.ts`, `api/src/lib/mail/mailer.test.ts`, `api/src/lib/telegram/loginBot.test.ts`, `api/src/routes/account-session.test.ts`, `account-email.test.ts`, `account-telegram.test.ts`, `account-link.test.ts`, `account-profile.test.ts`.

**api (изменения):** `api/src/entities/Order.ts` (поле `customerId`), `api/src/config/dataSource.ts` (сущности), `api/src/app.ts` (роуты), `api/src/routes/checkout.ts` (привязка заказа), `api/src/routes/testUtils.ts` (хелперы), `api/package.json` (nodemailer, скрипт), `api/.env.example`, `deploy/app.env.example`, `deploy/README.md`.

**shared:** `shared/src/types/account.ts` (новый), `shared/src/index.ts`.

**web (новые):**

- `web/lib/accountApi.ts` — клиент для браузера.
- `web/lib/accountServer.ts` — серверная проверка сессии.
- `web/lib/safeNext.ts` — проверка `?next=`.
- `web/app/[locale]/(public)/account/login/page.tsx`.
- `web/app/[locale]/(public)/account/(authed)/layout.tsx`, `page.tsx`, `profile/page.tsx`.
- `web/app/[locale]/(public)/account/_components/`:
  - `LoginPanel.tsx`;
  - `EmailCodeForm.tsx`;
  - `TelegramConnect.tsx`;
  - `AccountNav.tsx`;
  - `SupportButton.tsx`;
  - `OrdersList.tsx`;
  - `ProfilePanel.tsx`;
  - тесты рядом.
- `web/components/AccountLink.tsx`.

**web (изменения):** `web/components/Header.tsx`, `web/components/MobileMenuOverlay.tsx`, `web/lib/api.ts` (`submitCheckout` с cookie), `web/components/checkout/useCdekDelivery.ts` (`applyLastDelivery`), `web/app/[locale]/(public)/checkout/page.tsx` и `page.test.tsx`.

---

### Task 1: Таблицы, сущности, миграция

**Files:**

- Create: `api/src/entities/Customer.ts`, `api/src/entities/CustomerSession.ts`, `api/src/entities/CustomerEmailCode.ts`, `api/src/entities/TelegramLoginRequest.ts`, `api/src/migrations/1790700000000-AddCustomerAccounts.ts`
- Modify: `api/src/entities/Order.ts`, `api/src/config/dataSource.ts:6-20,83-99`, `api/src/routes/testUtils.ts`
- Test: `api/src/entities/customer.test.ts`

**Interfaces:**

- Produces: сущности `Customer { id, email: string|null, telegramId: number|null, telegramUsername: string|null, name: string|null, phone: string|null, createdAt: Date, lastLoginAt: Date|null }`, `CustomerSession { id, tokenHash, customerId, customer, createdAt, expiresAt, revokedAt, createdIp, userAgent }`, `CustomerEmailCode { id, email, codeHash, attempts, expiresAt, consumedAt, createdAt }`, `TelegramLoginRequest { id, nonceHash, pollSecretHash, status: 'pending'|'confirmed'|'consumed', telegramId, telegramUsername, telegramFirstName, linkCustomerId, expiresAt, createdAt }`, `Order.customerId: string|null`. В `testUtils.ts`: `seedOrder(overrides?: Partial<Order>): Promise<Order>` и `resetAccountTables(): Promise<void>`.

- [ ] **Step 1: Написать падающий тест**

`api/src/entities/customer.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Customer } from './Customer.js'
import { Order } from './Order.js'
import { resetAccountTables, seedOrder } from '../routes/testUtils.js'

describe('customers', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(resetAccountTables)

  it('покупатель без email и без Telegram не сохраняется', async () => {
    const repo = AppDataSource.getRepository(Customer)
    await expect(repo.save(repo.create({ name: 'Иван' }))).rejects.toThrow(
      /CHK_customers_login_method/,
    )
  })

  it('email и telegram_id уникальны', async () => {
    const repo = AppDataSource.getRepository(Customer)
    await repo.save(repo.create({ email: 'a@b.ru' }))
    await expect(repo.save(repo.create({ email: 'a@b.ru' }))).rejects.toThrow()
    await repo.save(repo.create({ telegramId: 42 }))
    await expect(repo.save(repo.create({ telegramId: 42 }))).rejects.toThrow()
  })

  it('telegram_id читается числом', async () => {
    const repo = AppDataSource.getRepository(Customer)
    const saved = await repo.save(repo.create({ telegramId: 7_000_000_001 }))
    const loaded = await repo.findOneByOrFail({ id: saved.id })
    expect(loaded.telegramId).toBe(7_000_000_001)
  })

  it('удаление покупателя отвязывает заказ, но не удаляет его', async () => {
    const repo = AppDataSource.getRepository(Customer)
    const c = await repo.save(repo.create({ email: 'a@b.ru' }))
    const order = await seedOrder({ customerId: c.id })
    await repo.delete({ id: c.id })
    const reloaded = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(reloaded.customerId).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/entities/customer.test.ts`
Expected: FAIL: `Cannot find module './Customer.js'`

- [ ] **Step 3: Сущности**

`api/src/entities/Customer.ts`:

```ts
import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

// bigint pg отдаёт строкой; id пользователей Telegram укладываются в
// Number.MAX_SAFE_INTEGER — приводим к числу, как telegramMessageId в Order.
export const bigintNumber = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
}

// Покупатель витрины (спека 2026-09-28-customer-account-design.md §3).
// email пишется только после подтверждения кодом и хранится в нижнем
// регистре. Хотя бы один способ входа есть всегда (CHECK в миграции).
@Entity({ name: 'customers' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null

  @Column({ type: 'bigint', name: 'telegram_id', nullable: true, transformer: bigintNumber })
  telegramId!: number | null

  @Column({ type: 'varchar', length: 32, name: 'telegram_username', nullable: true })
  telegramUsername!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone!: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null
}
```

`api/src/entities/CustomerSession.ts`:

```ts
import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm'
import { Customer } from './Customer.js'

// Как admin_sessions: в базе только sha256 токена из cookie.
@Entity({ name: 'customer_sessions' })
export class CustomerSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash!: string

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Relation<Customer>

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null

  @Column({ type: 'varchar', length: 45, name: 'created_ip', nullable: true })
  createdIp!: string | null

  @Column({ type: 'varchar', length: 500, name: 'user_agent', nullable: true })
  userAgent!: string | null
}
```

`api/src/entities/CustomerEmailCode.ts`:

```ts
import 'reflect-metadata'
import { Entity, PrimaryColumn, Column } from 'typeorm'

// Код входа по почте. id задаёт код приложения (randomUUID) — он входит в
// хэш кода. created_at тоже пишет приложение: по нему считаются лимиты
// отправки, и тесты подставляют своё «сейчас».
@Entity({ name: 'customer_email_codes' })
export class CustomerEmailCode {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  email!: string

  @Column({ type: 'varchar', length: 64, name: 'code_hash' })
  codeHash!: string

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
```

`api/src/entities/TelegramLoginRequest.ts`:

```ts
import 'reflect-metadata'
import { Entity, PrimaryColumn, Column } from 'typeorm'
import { bigintNumber } from './Customer.js'

export type TelegramLoginStatus = 'pending' | 'confirmed' | 'consumed'

// Вход (или привязка) через бота: nonce уходит в t.me/<бот>?start=, секрет
// опроса живёт в HttpOnly-cookie начавшего браузера. telegramId пишется на
// «/start» и проверяется на «Подтвердить».
@Entity({ name: 'telegram_login_requests' })
export class TelegramLoginRequest {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'nonce_hash' })
  nonceHash!: string

  @Column({ type: 'varchar', length: 64, name: 'poll_secret_hash' })
  pollSecretHash!: string

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: TelegramLoginStatus

  @Column({ type: 'bigint', name: 'telegram_id', nullable: true, transformer: bigintNumber })
  telegramId!: number | null

  @Column({ type: 'varchar', length: 32, name: 'telegram_username', nullable: true })
  telegramUsername!: string | null

  @Column({ type: 'varchar', length: 255, name: 'telegram_first_name', nullable: true })
  telegramFirstName!: string | null

  @Column({ type: 'uuid', name: 'link_customer_id', nullable: true })
  linkCustomerId!: string | null

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
```

- [ ] **Step 4: Поле в Order**

В `api/src/entities/Order.ts` после `customerTelegram` добавить:

```ts
  // Покупатель из личного кабинета; null — гостевой заказ (спека кабинета §3).
  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId!: string | null
```

- [ ] **Step 5: Миграция**

`api/src/migrations/1790700000000-AddCustomerAccounts.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Личный кабинет покупателя (docs/superpowers/specs/2026-09-28-customer-account-design.md §3).
export class AddCustomerAccounts1790700000000 implements MigrationInterface {
  name = 'AddCustomerAccounts1790700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NULL,
        "telegram_id" bigint NULL,
        "telegram_username" varchar(32) NULL,
        "name" varchar(255) NULL,
        "phone" varchar(64) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_login_at" timestamptz NULL,
        CONSTRAINT "CHK_customers_login_method" CHECK ("email" IS NOT NULL OR "telegram_id" IS NOT NULL)
      )`)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customers_email" ON "customers" ("email")`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customers_telegram_id" ON "customers" ("telegram_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE "customer_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_hash" varchar(64) NOT NULL,
        "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "created_ip" varchar(45) NULL,
        "user_agent" varchar(500) NULL
      )`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_sessions_token_hash" ON "customer_sessions" ("token_hash")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_sessions_customer_id" ON "customer_sessions" ("customer_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE "customer_email_codes" (
        "id" uuid PRIMARY KEY,
        "email" varchar(255) NOT NULL,
        "code_hash" varchar(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL
      )`)
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_email_codes_email_created" ON "customer_email_codes" ("email", "created_at")`,
    )

    await queryRunner.query(`
      CREATE TABLE "telegram_login_requests" (
        "id" uuid PRIMARY KEY,
        "nonce_hash" varchar(64) NOT NULL,
        "poll_secret_hash" varchar(64) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "telegram_id" bigint NULL,
        "telegram_username" varchar(32) NULL,
        "telegram_first_name" varchar(255) NULL,
        "link_customer_id" uuid NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL
      )`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_telegram_login_requests_nonce" ON "telegram_login_requests" ("nonce_hash")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_telegram_login_requests_poll" ON "telegram_login_requests" ("poll_secret_hash")`,
    )

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "customer_id" uuid NULL REFERENCES "customers"("id") ON DELETE SET NULL`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_orders_customer_id" ON "orders" ("customer_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_customer_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_id"`)
    await queryRunner.query(`DROP TABLE "telegram_login_requests"`)
    await queryRunner.query(`DROP TABLE "customer_email_codes"`)
    await queryRunner.query(`DROP TABLE "customer_sessions"`)
    await queryRunner.query(`DROP TABLE "customers"`)
  }
}
```

- [ ] **Step 6: Регистрация сущностей**

В `api/src/config/dataSource.ts` добавить импорты рядом с `AdminSession`:

```ts
import { Customer } from '../entities/Customer.js'
import { CustomerSession } from '../entities/CustomerSession.js'
import { CustomerEmailCode } from '../entities/CustomerEmailCode.js'
import { TelegramLoginRequest } from '../entities/TelegramLoginRequest.js'
```

и в массив `entities` после `AdminSession`: `Customer, CustomerSession, CustomerEmailCode, TelegramLoginRequest,`.

- [ ] **Step 7: Хелперы тестов**

В конец `api/src/routes/testUtils.ts` добавить (с импортом `Order` из `../entities/Order.js`):

```ts
// Гостевой заказ с минимальными полями — для тестов кабинета.
export async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-TEST-${Math.random().toString(36).slice(2, 10)}`,
      status: 'pending',
      customerName: 'Иван Иванов',
      customerPhone: '+79001234567',
      customerEmail: '',
      customerTelegram: null,
      deliveryAddress: {
        address: 'Москва, ул. Ленина, 1',
        comment: null,
        cityCode: 44,
        deliveryPointCode: 'MSK123',
      },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 1500,
      discountRub: 0,
      shippingRub: 0,
      totalRub: 1500,
      paymentProvider: 'manual',
      statusHistory: [],
      ...overrides,
    }),
  )
}

export async function resetAccountTables(): Promise<void> {
  await AppDataSource.query(
    'TRUNCATE customer_sessions, customer_email_codes, telegram_login_requests, order_items, orders, customers RESTART IDENTITY CASCADE',
  )
}
```

- [ ] **Step 8: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/entities/customer.test.ts`
Expected: PASS, 4 теста. `globalSetup` накатит новую миграцию на тестовую базу.

- [ ] **Step 9: Прогнать все тесты api**

Run: `npm test -w api`
Expected: PASS. Новое nullable-поле заказа ничего не ломает.

- [ ] **Step 10: Commit**

```bash
git add api/src/entities api/src/migrations/1790700000000-AddCustomerAccounts.ts api/src/config/dataSource.ts api/src/routes/testUtils.ts
git commit -m "feat(api): таблицы покупателей, сессий и кодов входа"
```

---

### Task 2: Почтовый транспорт

**Files:**

- Create: `api/src/lib/mail/mailer.ts`
- Modify: `api/package.json` (зависимость `nodemailer`, dev-зависимость `@types/nodemailer`), `api/.env.example`, `deploy/app.env.example`
- Test: `api/src/lib/mail/mailer.test.ts`

**Interfaces:**

- Produces:
  - `interface MailMessage { to: string; subject: string; text: string; html?: string }`;
  - `interface Mailer { send(msg: MailMessage): Promise<void> }`;
  - `class MemoryMailer implements Mailer { sent: MailMessage[]; lastCodeFor(email: string): string | null }`;
  - `getMailer(env?: NodeJS.ProcessEnv): Mailer | null`;
  - `setMailerForTests(m: Mailer | null): void`;
  - `maskEmail(email: string): string`.

- [ ] **Step 1: Установить nodemailer**

Run: `npm install nodemailer -w api && npm install -D @types/nodemailer -w api`
Expected: пакет в `api/package.json`, `package-lock.json` обновлён.

- [ ] **Step 2: Написать падающий тест**

`api/src/lib/mail/mailer.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { MemoryMailer, getMailer, maskEmail, setMailerForTests } from './mailer.js'

describe('mailer', () => {
  afterEach(() => setMailerForTests(null))

  it('без SMTP вне прода — почта в памяти', () => {
    const m = getMailer({ NODE_ENV: 'development' })
    expect(m).toBeInstanceOf(MemoryMailer)
  })

  it('без SMTP в проде — почты нет', () => {
    expect(getMailer({ NODE_ENV: 'production' })).toBeNull()
  })

  it('с SMTP_HOST — SMTP-транспорт, не память', () => {
    const m = getMailer({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.ru',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'noreply@ximi4ka.ru',
      SMTP_PASS: 'x',
      MAIL_FROM: 'Химичка <noreply@ximi4ka.ru>',
    })
    expect(m).not.toBeNull()
    expect(m).not.toBeInstanceOf(MemoryMailer)
  })

  it('подмена для тестов важнее env', () => {
    const fake = new MemoryMailer()
    setMailerForTests(fake)
    expect(getMailer({ NODE_ENV: 'production' })).toBe(fake)
  })

  it('MemoryMailer находит последний код для адреса', async () => {
    const m = new MemoryMailer()
    await m.send({ to: 'a@b.ru', subject: 'x', text: 'Код для входа: 111111' })
    await m.send({ to: 'a@b.ru', subject: 'x', text: 'Код для входа: 222222' })
    expect(m.lastCodeFor('a@b.ru')).toBe('222222')
    expect(m.lastCodeFor('c@d.ru')).toBeNull()
  })

  it('маскирует email', () => {
    expect(maskEmail('ivan@mail.ru')).toBe('i***@mail.ru')
    expect(maskEmail('broken')).toBe('***')
  })
})
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/lib/mail/mailer.test.ts`
Expected: FAIL: `Cannot find module './mailer.js'`

- [ ] **Step 4: Реализация**

`api/src/lib/mail/mailer.ts`:

```ts
import nodemailer, { type Transporter } from 'nodemailer'

// Почта витрины: коды входа в кабинет (спека кабинета §7). SMTP ящика домена;
// без SMTP_HOST вне прода письма копятся в памяти и печатаются в лог — так
// работают dev и тесты. В проде без SMTP почты нет: вход по email выключен.

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = []

  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg)
    if (process.env.NODE_ENV !== 'test') {
      // Только вне прода: сюда не попадаем, если SMTP настроен или NODE_ENV=production.
      console.log(`mail (dev): ${msg.to} — ${msg.subject}\n${msg.text}`)
    }
  }

  lastCodeFor(email: string): string | null {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]
      if (m.to !== email) continue
      const match = m.text.match(/\b(\d{6})\b/)
      if (match) return match[1]
    }
    return null
  }
}

class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...msg })
  }
}

let override: Mailer | null = null
let devMailer: MemoryMailer | null = null
let smtpCache: { key: string; mailer: SmtpMailer } | null = null

export function setMailerForTests(m: Mailer | null): void {
  override = m
}

// Читает env на каждый вызов (как getPaymentProvider): тест или перезапуск
// с другим env не требуют пересборки модуля. Транспорт кешируется по конфигу.
export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  if (override) return override
  const host = env.SMTP_HOST?.trim()
  if (!host) {
    if (env.NODE_ENV === 'production') return null
    devMailer ??= new MemoryMailer()
    return devMailer
  }
  const port = Number(env.SMTP_PORT ?? 465)
  const secure = (env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')) === 'true'
  const user = env.SMTP_USER ?? ''
  const from = env.MAIL_FROM ?? user
  const key = [host, port, secure, user, env.SMTP_PASS ?? '', from].join('|')
  if (smtpCache?.key !== key) {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    smtpCache = { key, mailer: new SmtpMailer(transport, from) }
  }
  return smtpCache.mailer
}
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/lib/mail/mailer.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 6: Env-примеры**

В конец `api/.env.example` и `deploy/app.env.example` добавить:

```bash
# Почта: коды входа в личный кабинет. Без SMTP_HOST в проде вход по email выключен,
# вне прода письма печатаются в лог api.
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@ximi4ka.ru
SMTP_PASS=
MAIL_FROM="Химичка <noreply@ximi4ka.ru>"
```

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/mail api/package.json package-lock.json api/.env.example deploy/app.env.example
git commit -m "feat(api): почтовый транспорт для кодов входа"
```

---

### Task 3: Сессия покупателя, общие типы, выход, конфиг входа

**Files:**

- Create: `shared/src/types/account.ts`, `api/src/routes/account/constants.ts`, `api/src/lib/account/session.ts`, `api/src/routes/middleware/requireCustomerAuth.ts`, `api/src/routes/account/auth.ts`, `api/src/routes/account/index.ts`
- Modify: `shared/src/index.ts`, `api/src/app.ts`, `api/src/routes/testUtils.ts`
- Test: `api/src/routes/account-session.test.ts`

**Interfaces:**

- Consumes: сущности Task 1, `getMailer()` из Task 2, `hashSessionToken` из `api/src/routes/middleware/requireAdminAuth.ts`.
- Produces:
  - shared-типы (код ниже): `AuthConfig`, `CustomerProfile`, `LastDelivery`, `AccountOrderSummary`, `AccountOrdersPage`, `TelegramLoginStart`, `TelegramLoginPoll`;
  - `startCustomerSession(req, res, customerId): Promise<void>`;
  - `clearCustomerSessionCookies(res): void`;
  - `findCustomerSession(req): Promise<{ session: CustomerSession; customer: Customer } | null>`;
  - middleware `requireCustomerAuth` (ставит `req.customer`, `req.customerSession`) и `requireCustomerCsrf`;
  - `createAccountAuthRouter(): Router` — сюда Task 4 и Task 6 добавляют маршруты;
  - `createAccountRouter(): Router`, смонтирован на `/api/account`;
  - `getLoginBotConfig(env?)` — временная заглушка, в Task 5 её заменит `getLoginBot()`;
  - в testUtils: `CustomerAuth` и `customerHeaders(auth)`.

- [ ] **Step 1: Общие типы**

`shared/src/types/account.ts`:

```ts
import type { DeliveryMethod, OrderStatus, PaymentProvider, PublicOrderShipment } from './order.js'

/** Какие способы входа включены на сервере (GET /api/account/auth/config). */
export interface AuthConfig {
  email: boolean
  telegram: boolean
  telegramBot: string | null
}

/** Доставка из последнего заказа — для автозаполнения чекаута. */
export interface LastDelivery {
  method: DeliveryMethod
  cityCode: number | null
  /** Первая часть адреса заказа («Москва»). */
  cityName: string | null
  deliveryPointCode: string | null
  postalCode: string | null
  /** Для курьера — адрес без города («ул. Ленина, 1, кв. 5»). */
  courierStreet: string | null
}

export interface CustomerProfile {
  id: string
  email: string | null
  telegramUsername: string | null
  hasTelegram: boolean
  name: string | null
  phone: string | null
  lastDelivery: LastDelivery | null
}

export interface AccountOrderSummary {
  orderNumber: string
  /** Секрет заказа: ссылка на страницу заказа `/order/<номер>#t=<токен>`. */
  publicToken: string
  createdAt: string
  status: OrderStatus
  paymentProvider: PaymentProvider
  totalRub: number
  /** Сколько штук всего в заказе. */
  itemCount: number
  /** Первые три позиции. */
  items: Array<{ name: string; quantity: number; imageUrl: string | null }>
  shipment: PublicOrderShipment | null
}

export interface AccountOrdersPage {
  orders: AccountOrderSummary[]
  nextCursor: string | null
}

export interface TelegramLoginStart {
  deepLink: string
}

export interface TelegramLoginPoll {
  status: 'pending' | 'ok' | 'expired'
}
```

В `shared/src/index.ts` добавить:

```ts
export type {
  AuthConfig,
  CustomerProfile,
  LastDelivery,
  AccountOrderSummary,
  AccountOrdersPage,
  TelegramLoginStart,
  TelegramLoginPoll,
} from './types/account.js'
```

- [ ] **Step 2: Написать падающий тест**

`api/src/routes/account-session.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CustomerSession } from '../entities/CustomerSession.js'
import { hashSessionToken } from './middleware/requireAdminAuth.js'
import { resetAccountTables } from './testUtils.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'

async function sessionFor(customerId: string, overrides: Partial<CustomerSession> = {}) {
  const raw = `tok-${Math.random()}`
  const repo = AppDataSource.getRepository(CustomerSession)
  await repo.save(
    repo.create({
      tokenHash: hashSessionToken(raw),
      customerId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      ...overrides,
    }),
  )
  return `ximi4ka_customer_session=${raw}; ximi4ka_customer_csrf=csrf1`
}

describe('сессия покупателя', () => {
  let app: ReturnType<typeof createApp>
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  it('GET /auth/config: почта вне прода включена, бот без токена выключен', async () => {
    setMailerForTests(new MemoryMailer())
    const res = await request(app).get('/api/account/auth/config')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ email: true, telegram: false, telegramBot: null })
  })

  it('logout без сессии — 401', async () => {
    const res = await request(app).post('/api/account/auth/logout')
    expect(res.status).toBe(401)
  })

  it('logout без CSRF — 403', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const cookie = await sessionFor(c.id)
    const res = await request(app).post('/api/account/auth/logout').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('logout отзывает сессию и чистит cookie', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const cookie = await sessionFor(c.id)
    const res = await request(app)
      .post('/api/account/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', 'csrf1')
    expect(res.status).toBe(204)
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(setCookie.some((v) => v.startsWith('ximi4ka_customer_session=;'))).toBe(true)
    const s = await AppDataSource.getRepository(CustomerSession).findOneByOrFail({
      customerId: c.id,
    })
    expect(s.revokedAt).not.toBeNull()
  })

  it('истёкшая и отозванная сессии не работают, админская cookie — тоже', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const expired = await sessionFor(c.id, { expiresAt: new Date(Date.now() - 1000) })
    const revoked = await sessionFor(c.id, { revokedAt: new Date() })
    for (const cookie of [expired, revoked, 'ximi4ka_shop_session=whatever']) {
      const res = await request(app)
        .post('/api/account/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'csrf1')
      expect(res.status).toBe(401)
    }
  })
})
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/routes/account-session.test.ts`
Expected: FAIL: 404 на `/api/account/auth/config`

- [ ] **Step 4: Константы**

`api/src/routes/account/constants.ts`:

```ts
// Личный кабинет покупателя (спека 2026-09-28-customer-account-design.md).
// Имена cookie не пересекаются с админскими: это независимые сессии.
export const CUSTOMER_SESSION_COOKIE = 'ximi4ka_customer_session'
export const CUSTOMER_CSRF_COOKIE = 'ximi4ka_customer_csrf'
export const TG_POLL_COOKIE = 'ximi4ka_customer_tg_poll'

export const CUSTOMER_SESSION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000
export const EMAIL_CODE_MAX_ATTEMPTS = 5
export const EMAIL_RESEND_INTERVAL_MS = 60 * 1000
export const EMAIL_MAX_PER_HOUR = 5

export const TG_LOGIN_TTL_MS = 10 * 60 * 1000

export const SUPPORT_TELEGRAM_URL = 'https://t.me/ximi4ka_support'
```

- [ ] **Step 5: Сессия**

`api/src/lib/account/session.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import type { Customer } from '../../entities/Customer.js'
import { CustomerSession } from '../../entities/CustomerSession.js'
import { hashSessionToken } from '../../routes/middleware/requireAdminAuth.js'
import {
  CUSTOMER_CSRF_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_MAX_AGE_MS,
} from '../../routes/account/constants.js'

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function cookieBase() {
  return { sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }
}

export async function startCustomerSession(
  req: Request,
  res: Response,
  customerId: string,
): Promise<void> {
  const raw = newToken()
  const csrf = newToken()
  const repo = AppDataSource.getRepository(CustomerSession)
  await repo.save(
    repo.create({
      tokenHash: hashSessionToken(raw),
      customerId,
      expiresAt: new Date(Date.now() + CUSTOMER_SESSION_MAX_AGE_MS),
      revokedAt: null,
      createdIp: req.ip ?? null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 500) || null,
    }),
  )
  res.cookie(CUSTOMER_SESSION_COOKIE, raw, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: CUSTOMER_SESSION_MAX_AGE_MS,
  })
  // Читаемая: клиент повторяет её в X-CSRF-Token.
  res.cookie(CUSTOMER_CSRF_COOKIE, csrf, {
    ...cookieBase(),
    httpOnly: false,
    maxAge: CUSTOMER_SESSION_MAX_AGE_MS,
  })
}

export function clearCustomerSessionCookies(res: Response): void {
  res.clearCookie(CUSTOMER_SESSION_COOKIE, { ...cookieBase(), httpOnly: true })
  res.clearCookie(CUSTOMER_CSRF_COOKIE, { ...cookieBase(), httpOnly: false })
}

// Не бросает: чекауту и опросу Telegram сессия нужна «если есть».
export async function findCustomerSession(
  req: Request,
): Promise<{ session: CustomerSession; customer: Customer } | null> {
  const raw = req.cookies?.[CUSTOMER_SESSION_COOKIE]
  if (!raw || typeof raw !== 'string') return null
  const session = await AppDataSource.getRepository(CustomerSession).findOne({
    where: { tokenHash: hashSessionToken(raw), revokedAt: IsNull() },
    relations: { customer: true },
  })
  if (!session || session.expiresAt.getTime() < Date.now()) return null
  return { session, customer: session.customer }
}
```

- [ ] **Step 6: Middleware**

`api/src/routes/middleware/requireCustomerAuth.ts`:

```ts
import type { Request, Response, NextFunction } from 'express'
import type { Customer } from '../../entities/Customer.js'
import type { CustomerSession } from '../../entities/CustomerSession.js'
import { findCustomerSession } from '../../lib/account/session.js'
import { ApiError } from '../errors.js'
import { CUSTOMER_CSRF_COOKIE } from '../account/constants.js'

declare module 'express-serve-static-core' {
  interface Request {
    customer?: Customer
    customerSession?: CustomerSession
  }
}

export async function requireCustomerAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const found = await findCustomerSession(req)
    if (!found) return next(new ApiError(401, 'auth_required', 'Войдите в личный кабинет'))
    req.customer = found.customer
    req.customerSession = found.session
    next()
  } catch (err) {
    next(err)
  }
}

export function requireCustomerCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const cookie = req.cookies?.[CUSTOMER_CSRF_COOKIE]
  const header = req.headers['x-csrf-token']
  if (typeof cookie !== 'string' || typeof header !== 'string' || !cookie || cookie !== header) {
    return next(new ApiError(403, 'csrf_failed', 'CSRF token invalid or missing'))
  }
  next()
}
```

- [ ] **Step 7: Роутер авторизации (config, logout)**

`api/src/routes/account/auth.ts`:

```ts
import { Router } from 'express'
import type { AuthConfig } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { CustomerSession } from '../../entities/CustomerSession.js'
import { getMailer } from '../../lib/mail/mailer.js'
import { clearCustomerSessionCookies } from '../../lib/account/session.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'

// Бот появится в Task 5; до тех пор Telegram выключен.
function getLoginBotConfig(env: NodeJS.ProcessEnv = process.env): { username: string } | null {
  const token = env.TELEGRAM_LOGIN_BOT_TOKEN
  const username = env.TELEGRAM_LOGIN_BOT_USERNAME
  return token && username ? { username } : null
}

// Фабрика, а не модульный роутер: у каждого createApp() свои счётчики
// rateLimit — тесты создают приложение заново и не упираются в лимиты.
export function createAccountAuthRouter(): Router {
  const router = Router()

  router.get('/config', (_req, res) => {
    const bot = getLoginBotConfig()
    const data: AuthConfig = {
      email: getMailer() !== null,
      telegram: bot !== null,
      telegramBot: bot?.username ?? null,
    }
    res.json({ data })
  })

  router.post('/logout', requireCustomerAuth, requireCustomerCsrf, async (req, res, next) => {
    try {
      await AppDataSource.getRepository(CustomerSession).update(
        { id: req.customerSession!.id },
        { revokedAt: new Date() },
      )
      clearCustomerSessionCookies(res)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}
```

`api/src/routes/account/index.ts`:

```ts
import { Router } from 'express'
import { createAccountAuthRouter } from './auth.js'

export function createAccountRouter(): Router {
  const router = Router()
  router.use('/auth', createAccountAuthRouter())
  return router
}
```

В `api/src/app.ts` импортировать `createAccountRouter` из `./routes/account/index.js` и после `app.use('/api/auth', authRouter)` добавить:

```ts
app.use('/api/account', createAccountRouter())
```

- [ ] **Step 8: Хелпер тестов для cookie покупателя**

В `api/src/routes/testUtils.ts` добавить:

```ts
export interface CustomerAuth {
  cookie: string
  csrfToken: string
}

// Разбирает Set-Cookie ответа входа в «Cookie: …» для следующих запросов.
export function customerAuthFrom(setCookie: string[] | string | undefined): CustomerAuth {
  const list = ([] as string[]).concat(setCookie ?? [])
  const pick = (name: string) => list.find((c) => c.startsWith(`${name}=`))?.split(';')[0]
  const session = pick('ximi4ka_customer_session')
  const csrf = pick('ximi4ka_customer_csrf')
  if (!session || !csrf) throw new Error('customerAuthFrom: нет cookie сессии покупателя')
  return { cookie: `${session}; ${csrf}`, csrfToken: csrf.split('=')[1] }
}

export function customerHeaders(auth: CustomerAuth): Record<string, string> {
  return { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrfToken }
}
```

- [ ] **Step 9: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/routes/account-session.test.ts && npm run typecheck -w api`
Expected: PASS, 5 тестов; typecheck без ошибок.

- [ ] **Step 10: Commit**

```bash
git add shared/src api/src/routes/account api/src/lib/account/session.ts api/src/routes/middleware/requireCustomerAuth.ts api/src/app.ts api/src/routes/testUtils.ts api/src/routes/account-session.test.ts
git commit -m "feat(api): сессия покупателя, выход и конфиг способов входа"
```

---

### Task 4: Вход по коду из письма и подтяжка заказов

**Files:**

- Create: `api/src/lib/account/emailCodes.ts`, `api/src/lib/account/customers.ts`, `api/src/routes/account/schemas.ts`
- Modify: `api/src/routes/account/auth.ts`, `api/src/routes/testUtils.ts`
- Test: `api/src/routes/account-email.test.ts`

**Interfaces:**

- Consumes: `startCustomerSession`, `getMailer`, `maskEmail`, константы Task 3.
- Produces:
  - `normalizeEmail(email: string): string`;
  - `issueEmailCode(email: string, now?: Date): Promise<IssueCodeResult>`;
  - `discardEmailCode(id: string): Promise<void>`;
  - `verifyEmailCode(email: string, code: string, now?: Date): Promise<VerifyCodeResult>`;
  - `sendLoginCode(email: string): Promise<void>` — выпуск, письмо и ошибки 429/502/503; его переиспользует Task 7;
  - `findOrCreateByEmail(em: EntityManager, email: string): Promise<Customer>`;
  - `claimOrdersByEmail(em: EntityManager, customerId: string, email: string): Promise<void>`;
  - `EmailStartSchema` и `EmailVerifySchema` в `schemas.ts`;
  - в testUtils: `loginAsCustomer(app, email?, mailer?): Promise<CustomerAuth>`.

- [ ] **Step 1: Написать падающий тест**

`api/src/routes/account-email.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CustomerEmailCode } from '../entities/CustomerEmailCode.js'
import { Order } from '../entities/Order.js'
import { MemoryMailer, setMailerForTests, type Mailer } from '../lib/mail/mailer.js'
import { issueEmailCode } from '../lib/account/emailCodes.js'
import { customerAuthFrom, resetAccountTables, seedOrder } from './testUtils.js'

const EMAIL = 'ivan@example.com'

describe('вход по email', () => {
  let app: ReturnType<typeof createApp>
  let mailer: MemoryMailer
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    mailer = new MemoryMailer()
    setMailerForTests(mailer)
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  const start = (email = EMAIL) =>
    request(app).post('/api/account/auth/email/start').send({ email })
  const verify = (code: string, email = EMAIL) =>
    request(app).post('/api/account/auth/email/verify').send({ email, code })

  it('код приходит на почту, вход создаёт покупателя и сессию', async () => {
    expect((await start(' Ivan@Example.com ')).status).toBe(204)
    const code = mailer.lastCodeFor(EMAIL)!
    expect(code).toMatch(/^\d{6}$/)
    const res = await verify(code, 'IVAN@example.com')
    expect(res.status).toBe(200)
    customerAuthFrom(res.headers['set-cookie'])
    const c = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: EMAIL })
    expect(c.lastLoginAt).not.toBeNull()
  })

  it('повторный вход — тот же покупатель', async () => {
    await start()
    await verify(mailer.lastCodeFor(EMAIL)!)
    // Второй код раньше 60 с не дадут — выпускаем его в обход лимита.
    const issued = await issueEmailCode(EMAIL, new Date(Date.now() + 61_000))
    if (!issued.ok) throw new Error('не выпустился')
    await verify(issued.code)
    expect(await AppDataSource.getRepository(Customer).count()).toBe(1)
  })

  it('чаще раза в минуту — 429 с Retry-After', async () => {
    await start()
    const res = await start()
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('code_too_soon')
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('больше 5 писем в час — 429', async () => {
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) {
      const r = await issueEmailCode(EMAIL, new Date(t0 + i * 61_000))
      expect(r.ok).toBe(true)
    }
    const sixth = await issueEmailCode(EMAIL, new Date(t0 + 5 * 61_000))
    expect(sixth).toMatchObject({ ok: false, reason: 'hourly_limit' })
  })

  it('неверный код — оставшиеся попытки; после 5 ошибок верный уже не принимается', async () => {
    await start()
    const code = mailer.lastCodeFor(EMAIL)!
    const wrong = code === '000000' ? '111111' : '000000'
    const first = await verify(wrong)
    expect(first.status).toBe(400)
    expect(first.body.error).toMatchObject({ code: 'invalid_code', details: { attemptsLeft: 4 } })
    for (let i = 0; i < 4; i++) await verify(wrong)
    const late = await verify(code)
    expect(late.status).toBe(400)
    expect(late.body.error.code).toBe('code_expired')
  })

  it('истёкший и использованный код не работают', async () => {
    await start()
    const code = mailer.lastCodeFor(EMAIL)!
    expect((await verify(code)).status).toBe(200)
    expect((await verify(code)).body.error.code).toBe('code_expired')

    await AppDataSource.getRepository(CustomerEmailCode).clear()
    const issued = await issueEmailCode(EMAIL, new Date(Date.now() - 11 * 60_000))
    if (!issued.ok) throw new Error('не выпустился')
    expect((await verify(issued.code)).body.error.code).toBe('code_expired')
  })

  it('подтягивает старые заказы с тем же email, пустой email и чужие не трогает', async () => {
    const mine = await seedOrder({ customerEmail: 'Ivan@Example.com' })
    const guestEmpty = await seedOrder({ customerEmail: '' })
    const other = await seedOrder({ customerEmail: 'petr@example.com' })
    const alreadyOwned = AppDataSource.getRepository(Customer).create({ email: 'x@y.ru' })
    await AppDataSource.getRepository(Customer).save(alreadyOwned)
    const taken = await seedOrder({ customerEmail: EMAIL, customerId: alreadyOwned.id })

    await start()
    await verify(mailer.lastCodeFor(EMAIL)!)
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: EMAIL })
    const orders = AppDataSource.getRepository(Order)
    expect((await orders.findOneByOrFail({ id: mine.id })).customerId).toBe(me.id)
    expect((await orders.findOneByOrFail({ id: guestEmpty.id })).customerId).toBeNull()
    expect((await orders.findOneByOrFail({ id: other.id })).customerId).toBeNull()
    expect((await orders.findOneByOrFail({ id: taken.id })).customerId).toBe(alreadyOwned.id)
  })

  it('SMTP упал — 502, неудачный код не блокирует повторную отправку', async () => {
    const broken: Mailer = { send: async () => Promise.reject(new Error('ECONNREFUSED')) }
    setMailerForTests(broken)
    expect((await start()).status).toBe(502)
    setMailerForTests(mailer)
    expect((await start()).status).toBe(204)
    expect(mailer.lastCodeFor(EMAIL)).toMatch(/^\d{6}$/)
  })

  it('почта не настроена — 503', async () => {
    setMailerForTests(null)
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await start()
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('email_login_unavailable')
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('битый email — 400', async () => {
    expect((await start('not-an-email')).status).toBe(400)
  })
})
```

Тест «SMTP упал» закрывает пункт 4 из Review Focus. Если письмо не ушло, код удаляется, и интервал в 60 секунд не срабатывает.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/routes/account-email.test.ts`
Expected: FAIL: `Cannot find module '../lib/account/emailCodes.js'`

- [ ] **Step 3: Коды**

`api/src/lib/account/emailCodes.ts`:

```ts
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { IsNull, MoreThan } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { CustomerEmailCode } from '../../entities/CustomerEmailCode.js'
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  EMAIL_MAX_PER_HOUR,
  EMAIL_RESEND_INTERVAL_MS,
} from '../../routes/account/constants.js'

export type IssueCodeResult =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: 'too_soon' | 'hourly_limit'; retryAfterSec: number }

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_code'; attemptsLeft: number }
  | { ok: false; reason: 'code_expired' }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(`${id}:${code}`).digest('hex')
}

export async function issueEmailCode(email: string, now = new Date()): Promise<IssueCodeResult> {
  const repo = AppDataSource.getRepository(CustomerEmailCode)
  const last = await repo.findOne({ where: { email }, order: { createdAt: 'DESC' } })
  if (last) {
    const wait = last.createdAt.getTime() + EMAIL_RESEND_INTERVAL_MS - now.getTime()
    if (wait > 0) return { ok: false, reason: 'too_soon', retryAfterSec: Math.ceil(wait / 1000) }
  }
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const lastHour = await repo.count({ where: { email, createdAt: MoreThan(hourAgo) } })
  if (lastHour >= EMAIL_MAX_PER_HOUR)
    return { ok: false, reason: 'hourly_limit', retryAfterSec: 3600 }

  const id = randomUUID()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await repo.insert({
    id,
    email,
    codeHash: hashCode(id, code),
    attempts: 0,
    expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
    consumedAt: null,
    createdAt: now,
  })
  return { ok: true, id, code }
}

// Письмо не ушло — код не должен считаться отправленным (интервал 60 с).
export async function discardEmailCode(id: string): Promise<void> {
  await AppDataSource.getRepository(CustomerEmailCode).delete({ id })
}

// Проверяется только последний неиспользованный код адреса. Попытка
// списывается атомарно ДО сравнения: параллельные подборы не обойдут лимит.
export async function verifyEmailCode(
  email: string,
  code: string,
  now = new Date(),
): Promise<VerifyCodeResult> {
  const repo = AppDataSource.getRepository(CustomerEmailCode)
  const row = await repo.findOne({
    where: { email, consumedAt: IsNull() },
    order: { createdAt: 'DESC' },
  })
  if (!row) return { ok: false, reason: 'code_expired' }

  const bumped = await repo
    .createQueryBuilder()
    .update(CustomerEmailCode)
    .set({ attempts: () => 'attempts + 1' })
    .where('id = :id AND attempts < :max AND consumed_at IS NULL AND expires_at > :now', {
      id: row.id,
      max: EMAIL_CODE_MAX_ATTEMPTS,
      now,
    })
    .returning(['attempts'])
    .execute()
  const rows = bumped.raw as Array<{ attempts: number }>
  if (rows.length !== 1) return { ok: false, reason: 'code_expired' }

  const a = Buffer.from(hashCode(row.id, code))
  const b = Buffer.from(row.codeHash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const left = EMAIL_CODE_MAX_ATTEMPTS - rows[0].attempts
    return left > 0
      ? { ok: false, reason: 'invalid_code', attemptsLeft: left }
      : { ok: false, reason: 'code_expired' }
  }

  const consumed = await repo
    .createQueryBuilder()
    .update(CustomerEmailCode)
    .set({ consumedAt: now })
    .where('id = :id AND consumed_at IS NULL', { id: row.id })
    .execute()
  return consumed.affected === 1 ? { ok: true } : { ok: false, reason: 'code_expired' }
}
```

- [ ] **Step 4: Покупатели и подтяжка заказов**

`api/src/lib/account/customers.ts`:

```ts
import type { EntityManager } from 'typeorm'
import { Customer } from '../../entities/Customer.js'

export async function findOrCreateByEmail(em: EntityManager, email: string): Promise<Customer> {
  const repo = em.getRepository(Customer)
  const existing = await repo.findOneBy({ email })
  if (existing) return existing
  // Гонка двух входов на один адрес: проигравший получит 23505 — тогда читаем снова.
  try {
    return await repo.save(repo.create({ email }))
  } catch (err) {
    const again = await repo.findOneBy({ email })
    if (again) return again
    throw err
  }
}

// Прошлые гостевые заказы с тем же подтверждённым email (спека §4.4). Чужие
// (уже привязанные) не перехватываем, пустой email ('') ни с чем не совпадает.
export async function claimOrdersByEmail(
  em: EntityManager,
  customerId: string,
  email: string,
): Promise<void> {
  await em.query(
    `UPDATE orders SET customer_id = $1
     WHERE customer_id IS NULL AND customer_email <> '' AND lower(customer_email) = $2`,
    [customerId, email],
  )
}
```

- [ ] **Step 5: Схемы и роуты**

`api/src/routes/account/schemas.ts`:

```ts
import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email().max(255))

export const EmailStartSchema = z.object({ email })
export const EmailVerifySchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Код — 6 цифр'),
})
```

Если в zod 4 `z.email()` недоступен, используй `z.string().email()`. `checkout.schemas.ts` использует `z.string().trim().email()`.

В `api/src/routes/account/auth.ts` добавить импорты:

```ts
import { ApiError, badRequest } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { EmailStartSchema, EmailVerifySchema } from './schemas.js'
import { discardEmailCode, issueEmailCode, verifyEmailCode } from '../../lib/account/emailCodes.js'
import { claimOrdersByEmail, findOrCreateByEmail } from '../../lib/account/customers.js'
import { maskEmail } from '../../lib/mail/mailer.js'
import { startCustomerSession } from '../../lib/account/session.js'
import { Customer } from '../../entities/Customer.js'
```

и экспортируемую функцию на уровне модуля (её использует и привязка email в Task 7):

```ts
// Выпуск кода и письмо. Бросает ApiError: 503 — почта не настроена, 429 —
// лимит, 502 — SMTP не принял письмо (код удалён, повтор сразу возможен).
export async function sendLoginCode(email: string): Promise<void> {
  const mailer = getMailer()
  if (!mailer) {
    throw new ApiError(503, 'email_login_unavailable', 'Вход по почте временно недоступен')
  }
  const issued = await issueEmailCode(email)
  if (!issued.ok) {
    throw new ApiError(
      429,
      issued.reason === 'too_soon' ? 'code_too_soon' : 'code_hourly_limit',
      issued.reason === 'too_soon'
        ? 'Код уже отправлен — новый можно запросить через минуту'
        : 'Слишком много писем на этот адрес — попробуйте через час',
      { retryAfterSec: issued.retryAfterSec },
    )
  }
  try {
    await mailer.send({
      to: email,
      subject: `Код для входа: ${issued.code}`,
      text: `Код для входа на ximi4ka.ru: ${issued.code}\n\nОн действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.`,
      html: `<p>Код для входа на ximi4ka.ru:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${issued.code}</p><p>Он действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.</p>`,
    })
  } catch (err) {
    await discardEmailCode(issued.id)
    console.error(
      `account: письмо с кодом на ${maskEmail(email)} не ушло — ${(err as Error).message}`,
    )
    throw new ApiError(502, 'email_send_failed', 'Не удалось отправить письмо — попробуйте ещё раз')
  }
}
```

Внутри `createAccountAuthRouter()` перед `return router` добавить:

```ts
router.post(
  '/email/start',
  rateLimit({ limit: 20, windowMs: 60 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const { email } = EmailStartSchema.parse(req.body)
      try {
        await sendLoginCode(email)
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          const sec = (err.details as { retryAfterSec: number }).retryAfterSec
          res.setHeader('Retry-After', String(sec))
        }
        throw err
      }
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/email/verify',
  rateLimit({ limit: 60, windowMs: 15 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const { email, code } = EmailVerifySchema.parse(req.body)
      const result = await verifyEmailCode(email, code)
      if (!result.ok) {
        throw result.reason === 'invalid_code'
          ? badRequest('invalid_code', 'Неверный код', { attemptsLeft: result.attemptsLeft })
          : badRequest('code_expired', 'Код устарел — запросите новый')
      }
      const customer = await AppDataSource.transaction(async (em) => {
        const c = await findOrCreateByEmail(em, email)
        await claimOrdersByEmail(em, c.id, email)
        await em.getRepository(Customer).update({ id: c.id }, { lastLoginAt: new Date() })
        return c
      })
      await startCustomerSession(req, res, customer.id)
      res.json({ data: { ok: true } })
    } catch (err) {
      next(err)
    }
  },
)
```

- [ ] **Step 6: Хелпер входа для тестов**

В `api/src/routes/testUtils.ts` добавить (импорты: `MemoryMailer`, `setMailerForTests` из `../lib/mail/mailer.js`):

```ts
// Настоящий вход по коду: почта в памяти, код из письма.
export async function loginAsCustomer(
  app: Express,
  email = 'buyer@test.local',
  mailer = new MemoryMailer(),
): Promise<CustomerAuth> {
  setMailerForTests(mailer)
  const start = await request(app).post('/api/account/auth/email/start').send({ email })
  if (start.status !== 204) throw new Error(`loginAsCustomer: start ${start.status}`)
  const code = mailer.lastCodeFor(email)
  const res = await request(app).post('/api/account/auth/email/verify').send({ email, code })
  if (res.status !== 200) throw new Error(`loginAsCustomer: verify ${res.status}`)
  return customerAuthFrom(res.headers['set-cookie'])
}
```

- [ ] **Step 7: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/routes/account-email.test.ts && npm run typecheck -w api`
Expected: PASS, 10 тестов.

- [ ] **Step 8: Commit**

```bash
git add api/src/lib/account api/src/routes/account api/src/routes/testUtils.ts api/src/routes/account-email.test.ts
git commit -m "feat(api): вход в кабинет по коду из письма и подтяжка прошлых заказов"
```

---

### Task 5: Клиент покупательского бота и установка webhook

**Files:**

- Create: `api/src/lib/telegram/loginBot.ts`, `api/src/scripts/telegram-set-webhook.ts`
- Modify: `api/src/routes/account/auth.ts` (заглушку `getLoginBotConfig` заменить на `getLoginBot`), `api/package.json` (скрипт), `api/.env.example`, `deploy/app.env.example`
- Test: `api/src/lib/telegram/loginBot.test.ts`

**Interfaces:**

- Produces:
  - `class TelegramLoginBot` с полями `username` и `webhookSecret: string | null` и методами:
    - `sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<void>`;
    - `answerCallbackQuery(id: string, text?: string): Promise<void>`;
    - `editMessageText(chatId: number, messageId: number, text: string): Promise<void>`;
    - `setWebhook(url: string, secret: string): Promise<void>`;
  - `type InlineButton = { text: string; callback_data: string } | { text: string; url: string }`;
  - `getLoginBot(env?): TelegramLoginBot | null`;
  - `setLoginBotForTests(bot: TelegramLoginBot | null)`.

- [ ] **Step 1: Написать падающий тест**

`api/src/lib/telegram/loginBot.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { TelegramLoginBot, getLoginBot, setLoginBotForTests } from './loginBot.js'

function ok() {
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
}

describe('TelegramLoginBot', () => {
  afterEach(() => setLoginBotForTests(null))

  it('sendMessage шлёт inline-кнопки', async () => {
    const f = vi.fn().mockResolvedValue(ok())
    const bot = new TelegramLoginBot({ token: 'T', username: 'ximi4ka_bot', fetch: f })
    await bot.sendMessage(5, 'Войти?', [[{ text: 'Подтвердить вход', callback_data: 'login:1' }]])
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botT/sendMessage')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: 5,
      text: 'Войти?',
      reply_markup: { inline_keyboard: [[{ text: 'Подтвердить вход', callback_data: 'login:1' }]] },
    })
  })

  it('ошибка Telegram — исключение с описанием', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), { status: 400 }),
      )
    const bot = new TelegramLoginBot({ token: 'T', username: 'b', fetch: f })
    await expect(bot.answerCallbackQuery('q1')).rejects.toThrow(/Bad Request/)
  })

  it('setWebhook передаёт секрет и нужные типы update', async () => {
    const f = vi.fn().mockResolvedValue(ok())
    const bot = new TelegramLoginBot({ token: 'T', username: 'b', fetch: f })
    await bot.setWebhook('https://new.ximi4ka.ru/api/telegram/login-webhook', 's3cret')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      url: 'https://new.ximi4ka.ru/api/telegram/login-webhook',
      secret_token: 's3cret',
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
  })

  it('getLoginBot: без токена или имени — null; с ними — бот', () => {
    expect(getLoginBot({})).toBeNull()
    expect(getLoginBot({ TELEGRAM_LOGIN_BOT_TOKEN: 'T' })).toBeNull()
    const bot = getLoginBot({
      TELEGRAM_LOGIN_BOT_TOKEN: 'T',
      TELEGRAM_LOGIN_BOT_USERNAME: '@ximi4ka_bot',
      TELEGRAM_LOGIN_WEBHOOK_SECRET: 's',
    })
    expect(bot?.username).toBe('ximi4ka_bot')
    expect(bot?.webhookSecret).toBe('s')
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/lib/telegram/loginBot.test.ts`
Expected: FAIL: `Cannot find module './loginBot.js'`

- [ ] **Step 3: Реализация**

`api/src/lib/telegram/loginBot.ts`:

```ts
// Покупательский бот (вход в кабинет, спека 2026-09-28 §4.3). Отдельный от
// служебного бота заказов (bot.ts): другой токен, пишет покупателям в личку.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const REQUEST_TIMEOUT_MS = 10_000

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string }

export class TelegramLoginBot {
  readonly username: string
  readonly webhookSecret: string | null
  private readonly token: string
  private readonly fetchImpl: Fetch

  constructor(opts: {
    token: string
    username: string
    webhookSecret?: string | null
    fetch?: Fetch
  }) {
    this.token = opts.token
    this.username = opts.username.replace(/^@/, '')
    this.webhookSecret = opts.webhookSecret ?? null
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<void> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      description?: string
    } | null
    if (!res.ok || !data?.ok) {
      throw new Error(`Telegram ${method} ${res.status}: ${data?.description ?? 'без описания'}`)
    }
  }

  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<void> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    })
  }

  answerCallbackQuery(id: string, text?: string): Promise<void> {
    return this.call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
  }

  editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text })
  }

  setWebhook(url: string, secret: string): Promise<void> {
    return this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
  }
}

let override: TelegramLoginBot | null = null

export function setLoginBotForTests(bot: TelegramLoginBot | null): void {
  override = bot
}

export function getLoginBot(env: NodeJS.ProcessEnv = process.env): TelegramLoginBot | null {
  if (override) return override
  const token = env.TELEGRAM_LOGIN_BOT_TOKEN?.trim()
  const username = env.TELEGRAM_LOGIN_BOT_USERNAME?.trim()
  if (!token || !username) return null
  return new TelegramLoginBot({
    token,
    username,
    webhookSecret: env.TELEGRAM_LOGIN_WEBHOOK_SECRET?.trim() || null,
  })
}
```

- [ ] **Step 4: Конфиг входа из настоящего бота**

В `api/src/routes/account/auth.ts` удалить функцию `getLoginBotConfig`, импортировать `getLoginBot` из `../../lib/telegram/loginBot.js` и в `/config` заменить `const bot = getLoginBotConfig()` на `const bot = getLoginBot()`.

- [ ] **Step 5: Скрипт установки webhook**

`api/src/scripts/telegram-set-webhook.ts`:

```ts
// Регистрирует webhook покупательского бота. Локально:
//   npm run telegram:set-webhook -w api -- https://new.ximi4ka.ru
// В контейнере:
//   docker compose exec ximishop-api node api/dist/scripts/telegram-set-webhook.js
// Адрес по умолчанию — WEB_ORIGIN (Caddy отдаёт /api/* в api).
import 'dotenv/config'
import { getLoginBot } from '../lib/telegram/loginBot.js'

async function main() {
  const bot = getLoginBot()
  if (!bot) throw new Error('TELEGRAM_LOGIN_BOT_TOKEN / TELEGRAM_LOGIN_BOT_USERNAME не заданы')
  if (!bot.webhookSecret) throw new Error('TELEGRAM_LOGIN_WEBHOOK_SECRET не задан')
  const origin = (process.argv[2] ?? process.env.WEB_ORIGIN ?? '').replace(/\/$/, '')
  if (!origin.startsWith('https://'))
    throw new Error(`нужен https-адрес сайта, получено: "${origin}"`)
  const url = `${origin}/api/telegram/login-webhook`
  await bot.setWebhook(url, bot.webhookSecret)
  console.log(`webhook @${bot.username} → ${url}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

В `api/package.json` в `scripts` добавить `"telegram:set-webhook": "tsx src/scripts/telegram-set-webhook.ts"`.

В `api/.env.example` и `deploy/app.env.example` добавить:

```bash
# Покупательский бот для входа в кабинет (не служебный @ximsite_bot).
# Секрет — любая случайная строка A-Za-z0-9_- (openssl rand -hex 32).
TELEGRAM_LOGIN_BOT_TOKEN=
TELEGRAM_LOGIN_BOT_USERNAME=
TELEGRAM_LOGIN_WEBHOOK_SECRET=
```

- [ ] **Step 6: Запустить тесты и убедиться, что они проходят**

Run: `npm test -w api -- src/lib/telegram/loginBot.test.ts src/routes/account-session.test.ts && npm run typecheck -w api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/telegram/loginBot.ts api/src/lib/telegram/loginBot.test.ts api/src/scripts/telegram-set-webhook.ts api/src/routes/account/auth.ts api/package.json api/.env.example deploy/app.env.example
git commit -m "feat(api): клиент покупательского бота и установка webhook"
```

---

### Task 6: Вход через Telegram (старт, webhook, опрос)

**Files:**

- Create: `api/src/lib/account/telegramLogin.ts`, `api/src/routes/telegram/loginWebhook.ts`
- Modify: `api/src/lib/account/customers.ts`, `api/src/routes/account/auth.ts`, `api/src/app.ts`
- Test: `api/src/routes/account-telegram.test.ts`

**Interfaces:**

- Consumes: `getLoginBot`, `TelegramLoginBot`, `startCustomerSession`, `findCustomerSession`, `newToken`, `cookieBase`, `TG_POLL_COOKIE`, `TG_LOGIN_TTL_MS`.
- Produces:
  - `createTelegramLoginRequest(linkCustomerId: string | null): Promise<{ nonce: string; pollSecret: string }>`;
  - `handleTelegramUpdate(bot: TelegramLoginBot, update: TelegramUpdate): Promise<void>`;
  - `consumeConfirmedRequest(pollSecret: string): Promise<{ status: 'pending' | 'expired' } | { status: 'confirmed'; request: TelegramLoginRequest }>`;
  - `findOrCreateByTelegram(em, tg: TelegramIdentity): Promise<Customer>`;
  - `type TelegramIdentity = { id: number; username: string | null; firstName: string | null }`;
  - `createTelegramWebhookRouter(): Router`, смонтирован на `/api/telegram`.

Опрос статуса для привязки (`linkCustomerId`) Task 7 обрабатывает в этом же эндпоинте. Здесь ветка привязки отвечает `expired`.

- [ ] **Step 1: Написать падающий тест**

`api/src/routes/account-telegram.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { TelegramLoginRequest } from '../entities/TelegramLoginRequest.js'
import { TelegramLoginBot, setLoginBotForTests } from '../lib/telegram/loginBot.js'
import { customerAuthFrom, resetAccountTables } from './testUtils.js'

const SECRET = 'hook-secret'

function fakeBot() {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: url.split('/').pop()!, body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
  })
  const bot = new TelegramLoginBot({
    token: 'T',
    username: 'ximi4ka_bot',
    webhookSecret: SECRET,
    fetch: f,
  })
  return { bot, calls }
}

describe('вход через Telegram', () => {
  let app: ReturnType<typeof createApp>
  let calls: ReturnType<typeof fakeBot>['calls']
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    const fake = fakeBot()
    calls = fake.calls
    setLoginBotForTests(fake.bot)
    app = createApp()
  })
  afterEach(() => setLoginBotForTests(null))

  async function startLogin() {
    const agent = request.agent(app)
    const res = await agent.post('/api/account/auth/telegram/start')
    expect(res.status).toBe(200)
    const nonce = new URL(res.body.data.deepLink).searchParams.get('start')!
    expect(res.body.data.deepLink).toMatch(/^https:\/\/t\.me\/ximi4ka_bot\?start=/)
    return { agent, nonce }
  }

  const hook = (update: unknown, secret = SECRET) =>
    request(app)
      .post('/api/telegram/login-webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', secret)
      .send(update)

  const startMsg = (nonce: string, fromId = 1001) => ({
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: fromId, type: 'private' },
      from: { id: fromId, username: 'ivan_tg', first_name: 'Иван' },
      text: `/start ${nonce}`,
    },
  })

  const confirm = (requestId: string, fromId = 1001) => ({
    update_id: 2,
    callback_query: {
      id: 'cb1',
      from: { id: fromId, username: 'ivan_tg', first_name: 'Иван' },
      message: { message_id: 11, chat: { id: fromId, type: 'private' } },
      data: `login:${requestId}`,
    },
  })

  function lastButtonData(): string {
    const send = calls.filter((c) => c.method === 'sendMessage').pop()!
    const markup = send.body.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>
    }
    return markup.inline_keyboard[0][0].callback_data
  }

  it('полный поток: start → /start → Подтвердить → status ok → сессия', async () => {
    const { agent, nonce } = await startLogin()
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')

    expect((await hook(startMsg(nonce))).status).toBe(200)
    // «Старт» ещё никого не логинит.
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')

    const data = lastButtonData()
    expect(data).toMatch(/^login:/)
    await hook(confirm(data.slice('login:'.length)))
    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true)
    expect(calls.some((c) => c.method === 'editMessageText')).toBe(true)

    const done = await agent.get('/api/account/auth/telegram/status')
    expect(done.body.data.status).toBe('ok')
    customerAuthFrom(done.headers['set-cookie'])
    const c = await AppDataSource.getRepository(Customer).findOneByOrFail({ telegramId: 1001 })
    expect(c.telegramUsername).toBe('ivan_tg')
    expect(c.name).toBe('Иван')
  })

  it('повторный вход тем же Telegram — тот же покупатель, username обновлён', async () => {
    await AppDataSource.getRepository(Customer).save({ telegramId: 1001, telegramUsername: 'old' })
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce))
    await hook(confirm(lastButtonData().slice(6)))
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('ok')
    const all = await AppDataSource.getRepository(Customer).find()
    expect(all).toHaveLength(1)
    expect(all[0].telegramUsername).toBe('ivan_tg')
  })

  it('«Подтвердить» от другого Telegram-аккаунта не подтверждает вход', async () => {
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce, 1001))
    await hook(confirm(lastButtonData().slice(6), 2002))
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')
  })

  it('два опроса подтверждённого запроса — сессию получает только один', async () => {
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce))
    await hook(confirm(lastButtonData().slice(6)))
    const [a, b] = await Promise.all([
      agent.get('/api/account/auth/telegram/status'),
      agent.get('/api/account/auth/telegram/status'),
    ])
    const statuses = [a.body.data.status, b.body.data.status].sort()
    expect(statuses).toEqual(['expired', 'ok'])
  })

  it('неверный секрет webhook — 401', async () => {
    const res = await hook(startMsg('x'), 'wrong')
    expect(res.status).toBe(401)
  })

  it('неизвестный nonce — бот пишет, что ссылка устарела; статус без cookie — expired', async () => {
    expect((await hook(startMsg('nope'))).status).toBe(200)
    const sent = calls.find((c) => c.method === 'sendMessage')!
    expect(String(sent.body.text)).toMatch(/устарела/)
    expect((await request(app).get('/api/account/auth/telegram/status')).body.data.status).toBe(
      'expired',
    )
  })

  it('истёкший запрос — expired', async () => {
    const { agent, nonce } = await startLogin()
    await AppDataSource.getRepository(TelegramLoginRequest).update(
      {},
      { expiresAt: new Date(Date.now() - 1000) },
    )
    await hook(startMsg(nonce))
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('expired')
  })

  it('бот не настроен — start 503', async () => {
    setLoginBotForTests(null)
    const res = await request(app).post('/api/account/auth/telegram/start')
    expect(res.status).toBe(503)
  })

  it('сбой Telegram при ответе — webhook всё равно 200', async () => {
    const broken = new TelegramLoginBot({
      token: 'T',
      username: 'ximi4ka_bot',
      webhookSecret: SECRET,
      fetch: async () => new Response('{"ok":false}', { status: 500 }),
    })
    setLoginBotForTests(broken)
    const { nonce } = await startLogin()
    expect((await hook(startMsg(nonce))).status).toBe(200)
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/routes/account-telegram.test.ts`
Expected: FAIL: 404 на `/api/account/auth/telegram/start`

- [ ] **Step 3: Покупатель по Telegram**

В `api/src/lib/account/customers.ts` добавить:

```ts
export interface TelegramIdentity {
  id: number
  username: string | null
  firstName: string | null
}

export async function findOrCreateByTelegram(
  em: EntityManager,
  tg: TelegramIdentity,
): Promise<Customer> {
  const repo = em.getRepository(Customer)
  const existing = await repo.findOneBy({ telegramId: tg.id })
  if (existing) {
    existing.telegramUsername = tg.username
    existing.lastLoginAt = new Date()
    return repo.save(existing)
  }
  try {
    return await repo.save(
      repo.create({
        telegramId: tg.id,
        telegramUsername: tg.username,
        name: tg.firstName,
        lastLoginAt: new Date(),
      }),
    )
  } catch (err) {
    const again = await repo.findOneBy({ telegramId: tg.id })
    if (again) return again
    throw err
  }
}
```

- [ ] **Step 4: Логика запросов и update**

`api/src/lib/account/telegramLogin.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../../config/dataSource.js'
import { TelegramLoginRequest } from '../../entities/TelegramLoginRequest.js'
import type { TelegramLoginBot } from '../telegram/loginBot.js'
import { hashSessionToken } from '../../routes/middleware/requireAdminAuth.js'
import { SUPPORT_TELEGRAM_URL, TG_LOGIN_TTL_MS } from '../../routes/account/constants.js'
import { newToken } from './session.js'

// Минимум полей update, которые мы читаем.
export interface TelegramUser {
  id: number
  username?: string
  first_name?: string
}
export interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: TelegramUser
    text?: string
  }
  callback_query?: {
    id: string
    from: TelegramUser
    message?: { message_id: number; chat: { id: number } }
    data?: string
  }
}

const SITE = 'ximi4ka.ru'

export async function createTelegramLoginRequest(
  linkCustomerId: string | null,
): Promise<{ nonce: string; pollSecret: string }> {
  const nonce = newToken() // 43 символа base64url — в лимит 64 параметра start
  const pollSecret = newToken()
  const now = new Date()
  await AppDataSource.getRepository(TelegramLoginRequest).insert({
    id: randomUUID(),
    nonceHash: hashSessionToken(nonce),
    pollSecretHash: hashSessionToken(pollSecret),
    status: 'pending',
    telegramId: null,
    telegramUsername: null,
    telegramFirstName: null,
    linkCustomerId,
    expiresAt: new Date(now.getTime() + TG_LOGIN_TTL_MS),
    createdAt: now,
  })
  return { nonce, pollSecret }
}

function isLive(r: TelegramLoginRequest | null): r is TelegramLoginRequest {
  return !!r && r.status === 'pending' && r.expiresAt.getTime() > Date.now()
}

// Ошибки Telegram не пробрасываем: webhook отвечает 200 всегда, иначе
// Telegram будет повторять тот же update.
async function safe(what: string, p: Promise<void>): Promise<void> {
  try {
    await p
  } catch (err) {
    console.error(`telegram login: ${what} — ${(err as Error).message}`)
  }
}

export async function handleTelegramUpdate(
  bot: TelegramLoginBot,
  update: TelegramUpdate,
): Promise<void> {
  const repo = AppDataSource.getRepository(TelegramLoginRequest)

  const msg = update.message
  if (msg?.from && msg.chat.type === 'private') {
    const start = msg.text?.match(/^\/start(?:\s+(\S+))?\s*$/)
    const nonce = start?.[1]
    if (!nonce) {
      await safe(
        'подсказка',
        bot.sendMessage(
          msg.chat.id,
          `Это бот для входа на ${SITE}. Чтобы войти, нажмите «Войти через Telegram» на сайте. Вопросы — в поддержку.`,
          [[{ text: 'Написать в поддержку', url: SUPPORT_TELEGRAM_URL }]],
        ),
      )
      return
    }
    const req = await repo.findOneBy({ nonceHash: hashSessionToken(nonce) })
    if (!isLive(req)) {
      await safe(
        'ссылка устарела',
        bot.sendMessage(msg.chat.id, `Ссылка устарела — начните вход на сайте ${SITE} заново.`),
      )
      return
    }
    // Запоминаем, кто нажал «Старт»: подтвердить сможет только он.
    await repo.update({ id: req.id }, { telegramId: msg.from.id })
    const linking = req.linkCustomerId !== null
    await safe(
      'запрос подтверждения',
      bot.sendMessage(
        msg.chat.id,
        linking
          ? `Привязать этот Telegram к вашему аккаунту на ${SITE}?`
          : `Войти на сайт ${SITE}? Если вы не начинали вход, просто проигнорируйте это сообщение.`,
        [[{ text: linking ? 'Привязать' : 'Подтвердить вход', callback_data: `login:${req.id}` }]],
      ),
    )
    return
  }

  const cb = update.callback_query
  if (cb?.data?.startsWith('login:')) {
    const id = cb.data.slice('login:'.length)
    const req = /^[0-9a-f-]{36}$/.test(id) ? await repo.findOneBy({ id }) : null
    if (!isLive(req) || req.telegramId !== cb.from.id) {
      await safe(
        'ответ на кнопку',
        bot.answerCallbackQuery(cb.id, 'Ссылка устарела — начните заново на сайте'),
      )
      return
    }
    await repo.update(
      { id: req.id, status: 'pending' },
      {
        status: 'confirmed',
        telegramUsername: cb.from.username ?? null,
        telegramFirstName: cb.from.first_name ?? null,
      },
    )
    await safe('ответ на кнопку', bot.answerCallbackQuery(cb.id, 'Готово'))
    if (cb.message) {
      await safe(
        'правка сообщения',
        bot.editMessageText(
          cb.message.chat.id,
          cb.message.message_id,
          'Готово — вернитесь на сайт.',
        ),
      )
    }
  }
}

// Атомарно переводит confirmed → consumed: из двух параллельных опросов
// сессию получит только один (второй увидит expired).
export async function consumeConfirmedRequest(
  pollSecret: string,
): Promise<
  { status: 'pending' | 'expired' } | { status: 'confirmed'; request: TelegramLoginRequest }
> {
  const repo = AppDataSource.getRepository(TelegramLoginRequest)
  const req = await repo.findOneBy({ pollSecretHash: hashSessionToken(pollSecret) })
  if (!req || req.expiresAt.getTime() <= Date.now() || req.status === 'consumed') {
    return { status: 'expired' }
  }
  if (req.status === 'pending') return { status: 'pending' }
  const result = await repo
    .createQueryBuilder()
    .update(TelegramLoginRequest)
    .set({ status: 'consumed' })
    .where("id = :id AND status = 'confirmed'", { id: req.id })
    .execute()
  if (result.affected !== 1) return { status: 'expired' }
  return { status: 'confirmed', request: req }
}
```

- [ ] **Step 5: Роуты старта и опроса**

В `api/src/routes/account/auth.ts` добавить импорты:

```ts
import {
  consumeConfirmedRequest,
  createTelegramLoginRequest,
} from '../../lib/account/telegramLogin.js'
import { findOrCreateByTelegram } from '../../lib/account/customers.js'
import { cookieBase } from '../../lib/account/session.js'
import { TG_LOGIN_TTL_MS, TG_POLL_COOKIE } from './constants.js'
import type { Response } from 'express'
```

На уровне модуля:

```ts
export function setTelegramPollCookie(res: Response, pollSecret: string): void {
  res.cookie(TG_POLL_COOKIE, pollSecret, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: TG_LOGIN_TTL_MS,
  })
}
```

Внутри `createAccountAuthRouter()`:

```ts
router.post(
  '/telegram/start',
  rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 }),
  async (_req, res, next) => {
    try {
      const bot = getLoginBot()
      if (!bot)
        throw new ApiError(503, 'telegram_login_unavailable', 'Вход через Telegram недоступен')
      const { nonce, pollSecret } = await createTelegramLoginRequest(null)
      setTelegramPollCookie(res, pollSecret)
      res.json({ data: { deepLink: `https://t.me/${bot.username}?start=${nonce}` } })
    } catch (err) {
      next(err)
    }
  },
)

// 300 запросов за 10 минут: опрос раз в 2 с — это 300 за весь срок запроса.
router.get(
  '/telegram/status',
  rateLimit({ limit: 600, windowMs: 10 * 60 * 1000 }),
  async (req, res, next) => {
    try {
      const pollSecret = req.cookies?.[TG_POLL_COOKIE]
      if (typeof pollSecret !== 'string' || !pollSecret) {
        res.json({ data: { status: 'expired' } })
        return
      }
      const result = await consumeConfirmedRequest(pollSecret)
      if (result.status !== 'confirmed') {
        res.json({ data: { status: result.status } })
        return
      }
      res.clearCookie(TG_POLL_COOKIE, { ...cookieBase(), httpOnly: true })
      const r = result.request
      if (r.linkCustomerId) {
        // Привязка к аккаунту — Task 7. До неё такой запрос не логинит.
        res.json({ data: { status: 'expired' } })
        return
      }
      const customer = await AppDataSource.transaction((em) =>
        findOrCreateByTelegram(em, {
          id: r.telegramId!,
          username: r.telegramUsername,
          firstName: r.telegramFirstName,
        }),
      )
      await startCustomerSession(req, res, customer.id)
      res.json({ data: { status: 'ok' } })
    } catch (err) {
      next(err)
    }
  },
)
```

- [ ] **Step 6: Роут webhook**

`api/src/routes/telegram/loginWebhook.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { getLoginBot } from '../../lib/telegram/loginBot.js'
import { handleTelegramUpdate, type TelegramUpdate } from '../../lib/account/telegramLogin.js'

function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// POST /api/telegram/login-webhook — update покупательского бота. Подлинность —
// по заголовку X-Telegram-Bot-Api-Secret-Token (задаётся в setWebhook).
export function createTelegramWebhookRouter(): Router {
  const router = Router()
  router.post('/login-webhook', async (req, res) => {
    const bot = getLoginBot()
    if (!bot || !bot.webhookSecret) {
      res.status(404).end()
      return
    }
    if (!secretMatches(req.header('X-Telegram-Bot-Api-Secret-Token'), bot.webhookSecret)) {
      res.status(401).end()
      return
    }
    try {
      await handleTelegramUpdate(bot, (req.body ?? {}) as TelegramUpdate)
    } catch (err) {
      console.error('telegram login: update упал', err)
    }
    // Всегда 200 — иначе Telegram повторяет тот же update.
    res.json({ ok: true })
  })
  return router
}
```

В `api/src/app.ts` импортировать `createTelegramWebhookRouter` из `./routes/telegram/loginWebhook.js` и рядом с `/api/account` добавить `app.use('/api/telegram', createTelegramWebhookRouter())`.

- [ ] **Step 7: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/routes/account-telegram.test.ts && npm run typecheck -w api`
Expected: PASS, 9 тестов.

- [ ] **Step 8: Commit**

```bash
git add api/src/lib/account api/src/routes/account/auth.ts api/src/routes/telegram api/src/app.ts api/src/routes/account-telegram.test.ts
git commit -m "feat(api): вход в кабинет через Telegram-бота с подтверждением"
```

---

### Task 7: Привязка второго способа, слияние аккаунтов, отвязка

**Files:**

- Create: `api/src/routes/account/link.ts`
- Modify: `api/src/lib/account/customers.ts`, `api/src/routes/account/index.ts`
- Test: `api/src/routes/account-link.test.ts`

**Interfaces:**

- Consumes:
  - из Task 4: `sendLoginCode`, `verifyEmailCode`, `EmailStartSchema`, `EmailVerifySchema`, `claimOrdersByEmail`;
  - из Task 6: `createTelegramLoginRequest`, `setTelegramPollCookie`, роут `GET /auth/telegram/status` (здесь дописывается его ветка привязки), `findCustomerSession`.
- Produces:
  - `mergeCustomers(em, keepId: string, dropId: string): Promise<void>`;
  - `attachEmail(em, customerId: string, email: string): Promise<void>`;
  - `attachTelegram(em, customerId: string, tg: TelegramIdentity): Promise<void>`;
  - роуты под `/api/account`: `POST /link/email/start`, `POST /link/email/verify`, `POST /link/telegram/start`, `POST /email/unlink`, `POST /telegram/unlink`.

- [ ] **Step 1: Написать падающий тест**

`api/src/routes/account-link.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CustomerSession } from '../entities/CustomerSession.js'
import { Order } from '../entities/Order.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'
import { issueEmailCode } from '../lib/account/emailCodes.js'
import { TelegramLoginBot, setLoginBotForTests } from '../lib/telegram/loginBot.js'
import {
  customerHeaders,
  loginAsCustomer,
  resetAccountTables,
  seedOrder,
  type CustomerAuth,
} from './testUtils.js'

describe('привязка способов входа', () => {
  let app: ReturnType<typeof createApp>
  let mailer: MemoryMailer
  const sent: Array<Record<string, unknown>> = []

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    mailer = new MemoryMailer()
    sent.length = 0
    setLoginBotForTests(
      new TelegramLoginBot({
        token: 'T',
        username: 'ximi4ka_bot',
        webhookSecret: 'S',
        fetch: async (_u, init) => {
          sent.push(JSON.parse(String(init?.body)))
          return new Response('{"ok":true,"result":true}', { status: 200 })
        },
      }),
    )
    app = createApp()
  })
  afterEach(() => {
    setMailerForTests(null)
    setLoginBotForTests(null)
  })

  const hook = (body: unknown) =>
    request(app)
      .post('/api/telegram/login-webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'S')
      .send(body)

  // Начинает привязку Telegram, проходит «Старт» и «Привязать» от пользователя 9.
  // Возвращает cookie опроса — её браузер шлёт вместе с cookie сессии.
  async function confirmTelegramLink(auth: CustomerAuth): Promise<string> {
    const start = await request(app)
      .post('/api/account/link/telegram/start')
      .set(customerHeaders(auth))
    expect(start.status).toBe(200)
    const nonce = new URL(start.body.data.deepLink).searchParams.get('start')!
    const poll = ([] as string[])
      .concat(start.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('ximi4ka_customer_tg_poll='))!
      .split(';')[0]
    await hook({
      message: {
        message_id: 1,
        chat: { id: 9, type: 'private' },
        from: { id: 9, username: 'me_tg' },
        text: `/start ${nonce}`,
      },
    })
    const markup = sent.at(-1)!.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
    }
    expect(markup.inline_keyboard[0][0].text).toBe('Привязать')
    await hook({
      callback_query: {
        id: 'c',
        from: { id: 9, username: 'me_tg' },
        data: markup.inline_keyboard[0][0].callback_data,
      },
    })
    return poll
  }

  it('смена email через код: email записан, заказы на новый адрес подтянуты', async () => {
    const order = await seedOrder({ customerEmail: 'new@b.ru' })
    const auth = await loginAsCustomer(app, 'old@b.ru', mailer)
    await request(app)
      .post('/api/account/link/email/start')
      .set(customerHeaders(auth))
      .send({ email: 'new@b.ru' })
      .expect(204)
    await request(app)
      .post('/api/account/link/email/verify')
      .set(customerHeaders(auth))
      .send({ email: 'new@b.ru', code: mailer.lastCodeFor('new@b.ru') })
      .expect(200)
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'new@b.ru' })
    expect(await AppDataSource.getRepository(Customer).count()).toBe(1)
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })).customerId,
    ).toBe(me.id)
  })

  it('email другого аккаунта — слияние: заказы переезжают, второй удалён, его сессии мертвы', async () => {
    const otherAuth = await loginAsCustomer(app, 'other@b.ru', mailer)
    const repo = AppDataSource.getRepository(Customer)
    const other = await repo.findOneByOrFail({ email: 'other@b.ru' })
    await repo.update({ id: other.id }, { telegramId: 77, phone: '+7900' })
    const otherOrder = await seedOrder({ customerId: other.id })

    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const me = await repo.findOneByOrFail({ email: 'me@b.ru' })
    // На other@b.ru код выдавался меньше минуты назад — /link/email/start
    // ответил бы 429. Выпускаем код напрямую «через минуту».
    const issued = await issueEmailCode('other@b.ru', new Date(Date.now() + 61_000))
    if (!issued.ok) throw new Error('код не выпустился')
    await request(app)
      .post('/api/account/link/email/verify')
      .set(customerHeaders(auth))
      .send({ email: 'other@b.ru', code: issued.code })
      .expect(200)

    expect(await repo.findOneBy({ id: other.id })).toBeNull()
    const merged = await repo.findOneByOrFail({ id: me.id })
    expect(merged.email).toBe('other@b.ru')
    expect(merged.telegramId).toBe(77)
    expect(merged.phone).toBe('+7900')
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: otherOrder.id })).customerId,
    ).toBe(me.id)
    expect(
      await AppDataSource.getRepository(CustomerSession).countBy({ customerId: other.id }),
    ).toBe(0)
    const dead = await request(app).post('/api/account/auth/logout').set(customerHeaders(otherAuth))
    expect(dead.status).toBe(401)
  })

  it('привязка Telegram: опрос из той же сессии — ok, telegram_id у текущего', async () => {
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const poll = await confirmTelegramLink(auth)
    const status = await request(app)
      .get('/api/account/auth/telegram/status')
      .set('Cookie', `${auth.cookie}; ${poll}`)
    expect(status.body.data.status).toBe('ok')
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'me@b.ru' })
    expect(me.telegramId).toBe(9)
    expect(me.telegramUsername).toBe('me_tg')
  })

  it('Telegram уже у другого аккаунта — слияние', async () => {
    const tgOnly = await AppDataSource.getRepository(Customer).save({ telegramId: 9, name: 'Иван' })
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const poll = await confirmTelegramLink(auth)
    await request(app)
      .get('/api/account/auth/telegram/status')
      .set('Cookie', `${auth.cookie}; ${poll}`)
      .expect(200)
    const repo = AppDataSource.getRepository(Customer)
    expect(await repo.findOneBy({ id: tgOnly.id })).toBeNull()
    const me = await repo.findOneByOrFail({ email: 'me@b.ru' })
    expect(me).toMatchObject({ telegramId: 9, name: 'Иван' })
  })

  it('опрос привязки без сессии (или из чужой) не привязывает', async () => {
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const poll = await confirmTelegramLink(auth)
    const status = await request(app).get('/api/account/auth/telegram/status').set('Cookie', poll)
    expect(status.body.data.status).toBe('expired')
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'me@b.ru' })
    expect(me.telegramId).toBeNull()
  })

  it('отвязать единственный способ входа нельзя — 409; второй можно', async () => {
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const r1 = await request(app).post('/api/account/email/unlink').set(customerHeaders(auth))
    expect(r1.status).toBe(409)
    expect(r1.body.error.code).toBe('last_login_method')
    await AppDataSource.getRepository(Customer).update({ email: 'me@b.ru' }, { telegramId: 1 })
    const r2 = await request(app).post('/api/account/telegram/unlink').set(customerHeaders(auth))
    expect(r2.status).toBe(204)
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'me@b.ru' })
    expect(me.telegramId).toBeNull()
  })

  it('привязка без сессии — 401', async () => {
    const res = await request(app).post('/api/account/link/email/start').send({ email: 'a@b.ru' })
    expect(res.status).toBe(401)
  })
})
```

`loginAsCustomer` вызывается в одном тесте дважды на разные адреса. Каждый вызов делает `setMailerForTests(mailer)` с тем же `mailer`, поэтому коды обоих адресов лежат в одном ящике.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/routes/account-link.test.ts`
Expected: FAIL: 404 на `/api/account/link/email/start`

- [ ] **Step 3: Слияние и привязка**

В `api/src/lib/account/customers.ts` добавить:

```ts
// Слияние аккаунтов (спека §4.5): пользователь только что доказал владение
// обоими. Вызывать внутри транзакции. Сессии удаляемого уходят каскадом.
export async function mergeCustomers(
  em: EntityManager,
  keepId: string,
  dropId: string,
): Promise<void> {
  if (keepId === dropId) return
  const repo = em.getRepository(Customer)
  const keep = await repo.findOneByOrFail({ id: keepId })
  const drop = await repo.findOneByOrFail({ id: dropId })
  await em.query('UPDATE orders SET customer_id = $1 WHERE customer_id = $2', [keepId, dropId])
  // Сначала удаляем, потом заполняем keep — иначе уникальные email/telegram_id столкнутся.
  await repo.delete({ id: dropId })
  keep.email ??= drop.email
  keep.telegramId ??= drop.telegramId
  keep.telegramUsername ??= drop.telegramUsername
  keep.name ??= drop.name
  keep.phone ??= drop.phone
  await repo.save(keep)
}

export async function attachEmail(
  em: EntityManager,
  customerId: string,
  email: string,
): Promise<void> {
  const repo = em.getRepository(Customer)
  const owner = await repo.findOneBy({ email })
  if (owner && owner.id !== customerId) await mergeCustomers(em, customerId, owner.id)
  await repo.update({ id: customerId }, { email })
  await claimOrdersByEmail(em, customerId, email)
}

export async function attachTelegram(
  em: EntityManager,
  customerId: string,
  tg: TelegramIdentity,
): Promise<void> {
  const repo = em.getRepository(Customer)
  const owner = await repo.findOneBy({ telegramId: tg.id })
  if (owner && owner.id !== customerId) await mergeCustomers(em, customerId, owner.id)
  await repo.update({ id: customerId }, { telegramId: tg.id, telegramUsername: tg.username })
}
```

- [ ] **Step 4: Роуты привязки**

`api/src/routes/account/link.ts`:

```ts
import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { conflict, badRequest } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'
import { EmailStartSchema, EmailVerifySchema } from './schemas.js'
import { sendLoginCode, setTelegramPollCookie } from './auth.js'
import { verifyEmailCode } from '../../lib/account/emailCodes.js'
import { attachEmail } from '../../lib/account/customers.js'
import { createTelegramLoginRequest } from '../../lib/account/telegramLogin.js'
import { getLoginBot } from '../../lib/telegram/loginBot.js'
import { ApiError } from '../errors.js'

export function createAccountLinkRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.post(
    '/link/email/start',
    rateLimit({ limit: 20, windowMs: 60 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const { email } = EmailStartSchema.parse(req.body)
        await sendLoginCode(email)
        res.status(204).end()
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    '/link/email/verify',
    rateLimit({ limit: 60, windowMs: 15 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const { email, code } = EmailVerifySchema.parse(req.body)
        const result = await verifyEmailCode(email, code)
        if (!result.ok) {
          throw result.reason === 'invalid_code'
            ? badRequest('invalid_code', 'Неверный код', { attemptsLeft: result.attemptsLeft })
            : badRequest('code_expired', 'Код устарел — запросите новый')
        }
        await AppDataSource.transaction((em) => attachEmail(em, req.customer!.id, email))
        res.json({ data: { ok: true } })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    '/link/telegram/start',
    rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const bot = getLoginBot()
        if (!bot)
          throw new ApiError(503, 'telegram_login_unavailable', 'Вход через Telegram недоступен')
        const { nonce, pollSecret } = await createTelegramLoginRequest(req.customer!.id)
        setTelegramPollCookie(res, pollSecret)
        res.json({ data: { deepLink: `https://t.me/${bot.username}?start=${nonce}` } })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post('/email/unlink', async (req, res, next) => {
    try {
      if (req.customer!.telegramId === null)
        throw conflict('last_login_method', 'Это единственный способ входа')
      await AppDataSource.getRepository(Customer).update({ id: req.customer!.id }, { email: null })
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  router.post('/telegram/unlink', async (req, res, next) => {
    try {
      if (req.customer!.email === null)
        throw conflict('last_login_method', 'Это единственный способ входа')
      await AppDataSource.getRepository(Customer).update(
        { id: req.customer!.id },
        { telegramId: null, telegramUsername: null },
      )
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}
```

Объедини два импорта из `../errors.js` в один. Если `sendLoginCode` при 429 должен ставить `Retry-After`, перенеси установку заголовка внутрь `sendLoginCode`: передай туда `res` вторым необязательным аргументом и убери дублирование из `/email/start`.

В `api/src/routes/account/index.ts` добавить `router.use(createAccountLinkRouter())` после `/auth` (импорт из `./link.js`).

- [ ] **Step 4b: Ветка привязки в опросе статуса**

В `api/src/routes/account/auth.ts` добавить импорты `attachTelegram` (из `../../lib/account/customers.js`) и `findCustomerSession` (из `../../lib/account/session.js`). В обработчике `GET /telegram/status` заменить заглушку привязки из Task 6:

```ts
if (r.linkCustomerId) {
  // Привязываем, только если опрашивает та же сессия, что начинала
  // привязку: cookie опроса без сессии (или с чужой) ничего не даёт.
  const found = await findCustomerSession(req)
  if (!found || found.customer.id !== r.linkCustomerId) {
    res.json({ data: { status: 'expired' } })
    return
  }
  await AppDataSource.transaction((em) =>
    attachTelegram(em, found.customer.id, {
      id: r.telegramId!,
      username: r.telegramUsername,
      firstName: r.telegramFirstName,
    }),
  )
  res.json({ data: { status: 'ok' } })
  return
}
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/routes/account-link.test.ts src/routes/account-telegram.test.ts src/routes/account-email.test.ts && npm run typecheck -w api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/account/customers.ts api/src/routes/account api/src/routes/account-link.test.ts
git commit -m "feat(api): привязка email и Telegram к аккаунту, слияние аккаунтов"
```

---

### Task 8: Профиль и история заказов

**Files:**

- Create: `api/src/lib/account/orders.ts`, `api/src/routes/account/profile.ts`
- Modify: `api/src/routes/account/index.ts`, `api/src/routes/account/schemas.ts`
- Test: `api/src/routes/account-profile.test.ts`

**Interfaces:**

- Consumes: `requireCustomerAuth`, `requireCustomerCsrf`, `cdekTrackingUrl` из `api/src/routes/public/orders.ts`, shared-типы Task 3.
- Produces:
  - `listCustomerOrders(customerId: string, cursor: string | null, limit?: number): Promise<AccountOrdersPage>`;
  - `lastDeliveryFor(customerId: string): Promise<LastDelivery | null>`;
  - `toProfile(c: Customer, last: LastDelivery | null): CustomerProfile`;
  - роуты `GET /api/account/me`, `PATCH /api/account/me`, `GET /api/account/orders?cursor=`.

- [ ] **Step 1: Написать падающий тест**

`api/src/routes/account-profile.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CdekShipment } from '../entities/CdekShipment.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { Product } from '../entities/Product.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'
import { customerHeaders, loginAsCustomer, resetAccountTables, seedOrder } from './testUtils.js'

describe('профиль и заказы', () => {
  let app: ReturnType<typeof createApp>
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await AppDataSource.query('TRUNCATE products RESTART IDENTITY CASCADE')
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  async function me() {
    return AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'buyer@test.local' })
  }

  it('GET /me без сессии — 401; с сессией — профиль без lastDelivery', async () => {
    expect((await request(app).get('/api/account/me')).status).toBe(401)
    const auth = await loginAsCustomer(app)
    const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      email: 'buyer@test.local',
      hasTelegram: false,
      telegramUsername: null,
      name: null,
      phone: null,
      lastDelivery: null,
    })
  })

  it('lastDelivery из последнего заказа: ПВЗ и курьер', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    // Первый — ПВЗ (по умолчанию в seedOrder), второй, более новый, — курьер.
    await seedOrder({ customerId: c.id })
    await seedOrder({
      customerId: c.id,
      deliveryMethod: 'cdek_courier',
      deliveryAddress: {
        address: 'Казань, ул. Баумана, 5, кв. 12',
        comment: null,
        cityCode: 424,
        postalCode: '420111',
      },
    })
    const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
    expect(res.body.data.lastDelivery).toEqual({
      method: 'cdek_courier',
      cityCode: 424,
      cityName: 'Казань',
      deliveryPointCode: null,
      postalCode: '420111',
      courierStreet: 'ул. Баумана, 5, кв. 12',
    })
  })

  it('PATCH /me меняет имя и телефон, требует CSRF, валидирует', async () => {
    const auth = await loginAsCustomer(app)
    const noCsrf = await request(app)
      .patch('/api/account/me')
      .set('Cookie', auth.cookie)
      .send({ name: 'Иван' })
    expect(noCsrf.status).toBe(403)
    const ok = await request(app)
      .patch('/api/account/me')
      .set(customerHeaders(auth))
      .send({ name: '  Иван  ', phone: '+79001234567' })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ name: 'Иван', phone: '+79001234567' })
    const bad = await request(app)
      .patch('/api/account/me')
      .set(customerHeaders(auth))
      .send({ phone: '1' })
    expect(bad.status).toBe(400)
  })

  it('GET /orders: только свои, новые сверху, позиции с картинкой, трек, курсор', async () => {
    const auth = await loginAsCustomer(app)
    const c = await me()
    const stranger = await AppDataSource.getRepository(Customer).save({ email: 'x@y.ru' })
    await seedOrder({ customerId: stranger.id })

    const product = await AppDataSource.getRepository(Product).save(
      AppDataSource.getRepository(Product).create({
        slug: 'kit',
        name: 'Набор',
        priceRub: 1500,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )
    await AppDataSource.query(
      `INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1, '/uploads/kit.webp', 'Набор', 0)`,
      [product.id],
    )

    const created: Order[] = []
    for (let i = 0; i < 22; i++) {
      const o = await seedOrder({ customerId: c.id })
      await AppDataSource.query(`UPDATE orders SET created_at = $1 WHERE id = $2`, [
        new Date(Date.UTC(2026, 8, 1, 0, i)),
        o.id,
      ])
      created.push(o)
    }
    const newest = created[21]
    await AppDataSource.getRepository(OrderItem).save({
      orderId: newest.id,
      productId: product.id,
      productSnapshot: { name: 'Набор', sku: null, priceRub: 1500 },
      quantity: 2,
      unitPriceRub: 1500,
    })
    await AppDataSource.getRepository(CdekShipment).save({
      orderId: newest.id,
      state: 'created',
      cdekNumber: '1234567890',
    })

    const page1 = await request(app).get('/api/account/orders').set(customerHeaders(auth))
    expect(page1.status).toBe(200)
    expect(page1.body.data.orders).toHaveLength(20)
    const first = page1.body.data.orders[0]
    expect(first).toMatchObject({
      orderNumber: newest.orderNumber,
      publicToken: newest.publicToken,
      itemCount: 2,
      items: [{ name: 'Набор', quantity: 2, imageUrl: '/uploads/kit.webp' }],
      shipment: { state: 'created', trackingNumber: '1234567890' },
    })
    expect(page1.body.data.nextCursor).toBeTruthy()

    const page2 = await request(app)
      .get(`/api/account/orders?cursor=${encodeURIComponent(page1.body.data.nextCursor)}`)
      .set(customerHeaders(auth))
    expect(page2.body.data.orders).toHaveLength(2)
    expect(page2.body.data.nextCursor).toBeNull()
    const all = [...page1.body.data.orders, ...page2.body.data.orders].map(
      (o: { orderNumber: string }) => o.orderNumber,
    )
    expect(new Set(all).size).toBe(22)
  })

  it('битый курсор — 400', async () => {
    const auth = await loginAsCustomer(app, 'buyer@test.local', new MemoryMailer())
    const res = await request(app).get('/api/account/orders?cursor=junk').set(customerHeaders(auth))
    expect(res.status).toBe(400)
  })
})
```

Названия колонок `product_images` сверь с `api/src/entities/ProductImage.ts`: `product_id`, `url`, `alt`, `sort_order`. Если у `CdekShipment` есть другие обязательные поля без default, добавь их в `save`.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/routes/account-profile.test.ts`
Expected: FAIL: 404 на `/api/account/me`

- [ ] **Step 3: Заказы и lastDelivery**

`api/src/lib/account/orders.ts`:

```ts
import { In } from 'typeorm'
import type {
  AccountOrderSummary,
  AccountOrdersPage,
  CustomerProfile,
  DeliveryMethod,
  LastDelivery,
  PublicOrderShipment,
} from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import type { Customer } from '../../entities/Customer.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { ProductImage } from '../../entities/ProductImage.js'
import { cdekTrackingUrl } from '../../routes/public/orders.js'
import { badRequest } from '../../routes/errors.js'

const PREVIEW_ITEMS = 3

export function toProfile(c: Customer, last: LastDelivery | null): CustomerProfile {
  return {
    id: c.id,
    email: c.email,
    telegramUsername: c.telegramUsername,
    hasTelegram: c.telegramId !== null,
    name: c.name,
    phone: c.phone,
    lastDelivery: last,
  }
}

// Адрес заказа — «<город>, <остальное>» (web/lib/shipping.ts).
export async function lastDeliveryFor(customerId: string): Promise<LastDelivery | null> {
  const o = await AppDataSource.getRepository(Order).findOne({
    where: { customerId },
    order: { createdAt: 'DESC' },
  })
  if (!o) return null
  const a = o.deliveryAddress
  const comma = a.address.indexOf(',')
  const cityName = comma > 0 ? a.address.slice(0, comma).trim() : null
  const rest = comma > 0 ? a.address.slice(comma + 1).trim() : a.address
  const method = o.deliveryMethod as DeliveryMethod
  return {
    method,
    cityCode: a.cityCode ?? null,
    cityName,
    deliveryPointCode: method === 'cdek_pvz' ? (a.deliveryPointCode ?? null) : null,
    postalCode: method === 'cdek_courier' ? (a.postalCode ?? null) : null,
    courierStreet: method === 'cdek_courier' ? rest || null : null,
  }
}

function shipmentView(s: CdekShipment | undefined): PublicOrderShipment | null {
  if (!s) return null
  if (s.state === 'created' && s.cdekNumber) {
    return {
      state: 'created',
      trackingNumber: s.cdekNumber,
      trackingUrl: cdekTrackingUrl(s.cdekNumber),
    }
  }
  return {
    state: s.state === 'failed' ? 'failed' : 'pending',
    trackingNumber: null,
    trackingUrl: null,
  }
}

// Курсор — «<ISO created_at>_<id>» последнего заказа страницы.
function parseCursor(cursor: string): { at: Date; id: string } {
  const sep = cursor.lastIndexOf('_')
  const at = new Date(cursor.slice(0, sep))
  const id = cursor.slice(sep + 1)
  if (sep < 1 || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw badRequest('invalid_cursor', 'Неверный курсор')
  }
  return { at, id }
}

export async function listCustomerOrders(
  customerId: string,
  cursor: string | null,
  limit = 20,
): Promise<AccountOrdersPage> {
  const qb = AppDataSource.getRepository(Order)
    .createQueryBuilder('o')
    .where('o.customer_id = :customerId', { customerId })
    .orderBy('o.created_at', 'DESC')
    .addOrderBy('o.id', 'DESC')
    .limit(limit + 1)
  if (cursor) {
    const c = parseCursor(cursor)
    qb.andWhere('(o.created_at, o.id) < (:at, :id)', { at: c.at, id: c.id })
  }
  const rows = await qb.getMany()
  const page = rows.slice(0, limit)
  const ids = page.map((o) => o.id)
  if (ids.length === 0) return { orders: [], nextCursor: null }

  const [items, shipments] = await Promise.all([
    AppDataSource.getRepository(OrderItem).find({
      where: { orderId: In(ids) },
      order: { id: 'ASC' },
    }),
    AppDataSource.getRepository(CdekShipment).find({ where: { orderId: In(ids) } }),
  ])
  const productIds = [...new Set(items.map((i) => i.productId))]
  const images = productIds.length
    ? await AppDataSource.getRepository(ProductImage).find({
        where: { productId: In(productIds) },
        order: { sortOrder: 'ASC' },
      })
    : []
  const imageOf = new Map<string, string>()
  for (const img of images) if (!imageOf.has(img.productId)) imageOf.set(img.productId, img.url)

  const orders: AccountOrderSummary[] = page.map((o) => {
    const mine = items.filter((i) => i.orderId === o.id)
    return {
      orderNumber: o.orderNumber,
      publicToken: o.publicToken,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      paymentProvider: o.paymentProvider,
      totalRub: o.totalRub,
      itemCount: mine.reduce((n, i) => n + i.quantity, 0),
      items: mine.slice(0, PREVIEW_ITEMS).map((i) => ({
        name: i.productSnapshot.name,
        quantity: i.quantity,
        imageUrl: imageOf.get(i.productId) ?? null,
      })),
      shipment: shipmentView(shipments.find((s) => s.orderId === o.id)),
    }
  })
  const last = page[page.length - 1]
  return {
    orders,
    nextCursor: rows.length > limit ? `${last.createdAt.toISOString()}_${last.id}` : null,
  }
}
```

- [ ] **Step 4: Схема и роуты профиля**

В `api/src/routes/account/schemas.ts` добавить:

```ts
// Те же правила, что у чекаута (checkout.schemas.ts): имя 1–255, телефон 5–64.
export const ProfilePatchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().min(5).max(64).optional(),
})
```

`api/src/routes/account/profile.ts`:

```ts
import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'
import { ProfilePatchSchema } from './schemas.js'
import { lastDeliveryFor, listCustomerOrders, toProfile } from '../../lib/account/orders.js'

export function createAccountProfileRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.get('/me', async (req, res, next) => {
    try {
      res.json({ data: toProfile(req.customer!, await lastDeliveryFor(req.customer!.id)) })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/me', async (req, res, next) => {
    try {
      const patch = ProfilePatchSchema.parse(req.body)
      const repo = AppDataSource.getRepository(Customer)
      await repo.update({ id: req.customer!.id }, patch)
      const fresh = await repo.findOneByOrFail({ id: req.customer!.id })
      res.json({ data: toProfile(fresh, await lastDeliveryFor(fresh.id)) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/orders', async (req, res, next) => {
    try {
      const cursor =
        typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null
      res.json({ data: await listCustomerOrders(req.customer!.id, cursor) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
```

Если `patch` пустой, `repo.update` с пустым объектом TypeORM не выполнит и бросит ошибку. Добавь перед ним `if (Object.keys(patch).length > 0)`.

В `api/src/routes/account/index.ts` подключить `router.use(createAccountProfileRouter())`.

Важно: `createAccountLinkRouter` и `createAccountProfileRouter` вешают `requireCustomerAuth` через `router.use`. Раз они смонтированы без префикса, middleware сработает на любой путь, который дошёл до роутера, в том числе на несуществующие (вместо 404 будет 401). Это приемлемо. Главное, чтобы `/auth` был смонтирован **раньше** них.

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/routes/account-profile.test.ts && npm run typecheck -w api`
Expected: PASS, 5 тестов.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/account/orders.ts api/src/routes/account api/src/routes/account-profile.test.ts
git commit -m "feat(api): профиль покупателя и история заказов с курсором"
```

---

### Task 9: Чекаут привязывает заказ к покупателю

**Files:**

- Modify: `api/src/routes/checkout.ts:44-141`
- Test: `api/src/routes/checkout.test.ts` (новый `describe` в конце файла)

**Interfaces:**

- Consumes: `findCustomerSession(req)` из Task 3, `normalizeEmail` из Task 4, `Customer`.
- Produces: `Order.customerId` заполняется при оформлении.

- [ ] **Step 1: Написать падающий тест**

В конец `api/src/routes/checkout.test.ts` добавить отдельный `describe`. Хелперы `seedProduct`, `checkoutBody` и `stubCityPoints` уже есть в файле на верхнем уровне. `beforeAll` и `afterAll` верхнего `describe` к новому не относятся, поэтому у него свои.

```ts
describe('checkout и личный кабинет', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await AppDataSource.query('TRUNCATE products RESTART IDENTITY CASCADE')
    stubCityPoints(['MSK123'])
  })
  afterEach(() => {
    setMailerForTests(null)
    setCdekClientForTests(null)
    clearCdekLocationCache()
  })

  it('с сессией — заказ привязан, пустые имя и телефон профиля заполнены', async () => {
    const app = createApp()
    const auth = await loginAsCustomer(app, 'buyer@test.local')
    const product = await seedProduct()
    const res = await request(app)
      .post('/api/checkout')
      .set('Cookie', auth.cookie)
      .send(checkoutBody([{ productId: product.id, quantity: 1 }]))
    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    const c = await AppDataSource.getRepository(Customer).findOneByOrFail({
      email: 'buyer@test.local',
    })
    expect(order.customerId).toBe(c.id)
    expect(c.name).toBe('Иван Иванов')
    expect(c.phone).toBe('+79001234567')
  })

  it('без сессии, но email совпадает с подтверждённым аккаунтом — привязан', async () => {
    const app = createApp()
    const c = await AppDataSource.getRepository(Customer).save({ email: 'ivan@example.com' })
    const product = await seedProduct()
    const body = checkoutBody([{ productId: product.id, quantity: 1 }])
    body.customer.email = 'IVAN@example.com'
    const res = await request(app).post('/api/checkout').send(body)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.customerId).toBe(c.id)
  })

  it('без сессии и с незнакомым email — гостевой заказ, аккаунт не создаётся', async () => {
    const app = createApp()
    const product = await seedProduct()
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: product.id, quantity: 1 }]))
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.customerId).toBeNull()
    expect(await AppDataSource.getRepository(Customer).count()).toBe(0)
  })

  it('с сессией профиль с уже заполненным именем не перетирается', async () => {
    const app = createApp()
    const auth = await loginAsCustomer(app, 'buyer@test.local')
    await AppDataSource.getRepository(Customer).update(
      { email: 'buyer@test.local' },
      { name: 'Пётр' },
    )
    const product = await seedProduct()
    await request(app)
      .post('/api/checkout')
      .set('Cookie', auth.cookie)
      .send(checkoutBody([{ productId: product.id, quantity: 1 }]))
    const c = await AppDataSource.getRepository(Customer).findOneByOrFail({
      email: 'buyer@test.local',
    })
    expect(c.name).toBe('Пётр')
  })
})
```

Добавить импорты: `Customer`, `loginAsCustomer` и `resetAccountTables` из `./testUtils.js`, `setMailerForTests`.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -w api -- src/routes/checkout.test.ts`
Expected: FAIL на `order.customerId`: `expected null to be '<uuid>'`

- [ ] **Step 3: Реализация**

В `api/src/routes/checkout.ts` добавить импорты:

```ts
import { Customer } from '../entities/Customer.js'
import { findCustomerSession } from '../lib/account/session.js'
import { normalizeEmail } from '../lib/account/emailCodes.js'
```

После расчёта `totalRub` и до `const provider = …` вставить:

```ts
// Личный кабинет (спека кабинета §6): заказ идёт в аккаунт вошедшего
// покупателя или владельца подтверждённого email из заказа. Аккаунтов
// чекаут не создаёт. CSRF не нужен — SameSite=lax не отправит cookie
// сессии в кросс-сайтовом POST.
const session = await findCustomerSession(req)
let customerId = session?.customer.id ?? null
if (!customerId && parsed.customer.email) {
  const owner = await AppDataSource.getRepository(Customer).findOneBy({
    email: normalizeEmail(parsed.customer.email),
  })
  customerId = owner?.id ?? null
}
```

В `create({...})` заказа добавить `customerId,`. Внутри транзакции, после `enqueueOrderEvent`, добавить:

```ts
if (session) {
  const c = session.customer
  const fill: Partial<Customer> = {}
  if (!c.name) fill.name = parsed.customer.name
  if (!c.phone) fill.phone = parsed.customer.phone
  if (Object.keys(fill).length > 0) await em.getRepository(Customer).update({ id: c.id }, fill)
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npm test -w api -- src/routes/checkout.test.ts && npm test -w api`
Expected: PASS, весь пакет api.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git commit -m "feat(api): чекаут привязывает заказ к аккаунту покупателя"
```

---

### Task 10: Web — клиент кабинета, серверная проверка, safeNext

**Files:**

- Create: `web/lib/accountApi.ts`, `web/lib/accountServer.ts`, `web/lib/safeNext.ts`
- Modify: `web/lib/api.ts` (`submitCheckout`: `credentials: 'include'`)
- Test: `web/lib/safeNext.test.ts`, `web/lib/accountApi.test.ts`

**Interfaces:**

- Consumes: shared-типы Task 3, `ApiError` из `web/lib/api.ts`.
- Produces:
  - `safeNext(raw: unknown, fallback?: string): string`;
  - функции `web/lib/accountApi.ts`:
    - `getAuthConfig()`;
    - `startEmailLogin(email)` и `verifyEmailLogin(email, code)`;
    - `startTelegramLogin()` и `pollTelegramLogin()`;
    - `logout()`;
    - `getMe()` и `getMeOrNull()`;
    - `updateMe(patch)`;
    - `getOrders(cursor?)`;
    - `startLinkEmail(email)` и `verifyLinkEmail(email, code)`;
    - `startLinkTelegram()`;
    - `unlinkEmail()` и `unlinkTelegram()`;
  - в `web/lib/accountServer.ts`: `fetchCurrentCustomer(): Promise<CustomerProfile | null>` и `fetchAuthConfigServer(): Promise<AuthConfig>`.

- [ ] **Step 1: Написать падающие тесты**

`web/lib/safeNext.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { safeNext } from './safeNext'

describe('safeNext', () => {
  it.each([
    ['/checkout', '/checkout'],
    ['/account/profile?x=1', '/account/profile?x=1'],
    ['//evil.ru', '/account'],
    ['https://evil.ru', '/account'],
    ['/\\evil.ru', '/account'],
    ['javascript:alert(1)', '/account'],
    ['', '/account'],
    [undefined, '/account'],
    [['/a', '/b'], '/account'],
  ])('%s → %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected)
  })
})
```

`web/lib/accountApi.test.ts`:

```ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { ApiError } from './api'
import { getMeOrNull, updateMe, verifyEmailLogin } from './accountApi'

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'ximi4ka_customer_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('accountApi', () => {
  it('изменения шлют cookie и X-CSRF-Token', async () => {
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    const f = vi.fn(async () => json(200, { data: { id: '1' } }))
    vi.stubGlobal('fetch', f)
    await updateMe({ name: 'Иван' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/account\/me$/)
    expect(init.method).toBe('PATCH')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('abc')
  })

  it('ошибка api — ApiError с кодом и деталями', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(400, {
          error: { code: 'invalid_code', message: 'Неверный код', details: { attemptsLeft: 3 } },
        }),
      ),
    )
    const err = await verifyEmailLogin('a@b.ru', '000000').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, code: 'invalid_code', details: { attemptsLeft: 3 } })
  })

  it('getMeOrNull: 401 и сетевая ошибка — null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'auth_required' } })),
    )
    expect(await getMeOrNull()).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    expect(await getMeOrNull()).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -w web -- lib/safeNext.test.ts lib/accountApi.test.ts`
Expected: FAIL: модули не найдены.

- [ ] **Step 3: Реализация**

`web/lib/safeNext.ts`:

```ts
// Куда вернуть после входа (?next=): только путь на этом же сайте. «//host»,
// «/\host» и схемы браузер понял бы как другой сайт — открытый редирект.
export function safeNext(raw: unknown, fallback = '/account'): string {
  if (typeof raw !== 'string' || raw === '') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
```

`web/lib/accountApi.ts`:

```ts
import type {
  AccountOrdersPage,
  AuthConfig,
  CustomerProfile,
  TelegramLoginPoll,
  TelegramLoginStart,
} from '@ximi4ka-shop/shared'
import { ApiError } from './api'

// Клиент личного кабинета для браузера. Как adminApi.ts: cookie сессии
// покупателя (credentials: 'include') и X-CSRF-Token на изменениях.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function readCsrf(): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)ximi4ka_customer_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (method !== 'GET') {
    const csrf = readCsrf()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown }
    } | null
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `Request failed with status ${res.status}`,
      body?.error?.details,
    )
  }
  if (res.status === 204) return undefined as T
  return ((await res.json()) as { data: T }).data
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const getAuthConfig = () => call<AuthConfig>('/api/account/auth/config')
export const startEmailLogin = (email: string) =>
  post<void>('/api/account/auth/email/start', { email })
export const verifyEmailLogin = (email: string, code: string) =>
  post<{ ok: true }>('/api/account/auth/email/verify', { email, code })
export const startTelegramLogin = () => post<TelegramLoginStart>('/api/account/auth/telegram/start')
export const pollTelegramLogin = () => call<TelegramLoginPoll>('/api/account/auth/telegram/status')
export const logout = () => post<void>('/api/account/auth/logout')

export const getMe = () => call<CustomerProfile>('/api/account/me')
export async function getMeOrNull(): Promise<CustomerProfile | null> {
  try {
    return await getMe()
  } catch {
    return null
  }
}
export const updateMe = (patch: { name?: string; phone?: string }) =>
  call<CustomerProfile>('/api/account/me', { method: 'PATCH', body: JSON.stringify(patch) })
export const getOrders = (cursor?: string | null) =>
  call<AccountOrdersPage>(
    `/api/account/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  )

export const startLinkEmail = (email: string) =>
  post<void>('/api/account/link/email/start', { email })
export const verifyLinkEmail = (email: string, code: string) =>
  post<{ ok: true }>('/api/account/link/email/verify', { email, code })
export const startLinkTelegram = () => post<TelegramLoginStart>('/api/account/link/telegram/start')
export const unlinkEmail = () => post<void>('/api/account/email/unlink')
export const unlinkTelegram = () => post<void>('/api/account/telegram/unlink')
```

`web/lib/accountServer.ts`:

```ts
import 'server-only'
import { cookies } from 'next/headers'
import type { AuthConfig, CustomerProfile } from '@ximi4ka-shop/shared'

// Серверная проверка сессии для страниц кабинета (как admin layout).
// cache: 'no-store' обязателен — закешированный 401 выкидывал бы только что вошедшего.
const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function fetchCurrentCustomer(): Promise<CustomerProfile | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader.includes('ximi4ka_customer_session=')) return null
  try {
    const res = await fetch(`${API}/api/account/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return ((await res.json()) as { data: CustomerProfile }).data
  } catch {
    return null
  }
}

export async function fetchAuthConfigServer(): Promise<AuthConfig> {
  try {
    const res = await fetch(`${API}/api/account/auth/config`, { cache: 'no-store' })
    if (res.ok) return ((await res.json()) as { data: AuthConfig }).data
  } catch {
    // api недоступен — покажем почту, ошибка всплывёт при отправке.
  }
  return { email: true, telegram: false, telegramBot: null }
}
```

Если пакета `server-only` нет в `web/package.json`, строку `import 'server-only'` убери.

В `web/lib/api.ts` в `submitCheckout` добавить `credentials: 'include',` в объект `init`. Функция `request()` распространяет `...init` в `fetch`.

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -w web -- lib/safeNext.test.ts lib/accountApi.test.ts && npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/accountApi.ts web/lib/accountServer.ts web/lib/safeNext.ts web/lib/*.test.ts web/lib/api.ts
git commit -m "feat(web): клиент личного кабинета и безопасный ?next="
```

---

### Task 11: Web — страница входа

**Files:**

- Create: `web/app/[locale]/(public)/account/login/page.tsx`, `web/app/[locale]/(public)/account/_components/LoginPanel.tsx`, `EmailCodeForm.tsx`, `TelegramConnect.tsx`
- Test: `web/app/[locale]/(public)/account/_components/EmailCodeForm.test.tsx`, `TelegramConnect.test.tsx`, `LoginPanel.test.tsx`

**Interfaces:**

- Consumes: `accountApi`, `safeNext`, `fetchCurrentCustomer`, `fetchAuthConfigServer`, `redirectTo` из `@/lib/checkout`.
- Produces:
  - `EmailCodeForm({ start, verify, onDone, submitLabel? })`, где `start: (email: string) => Promise<void>`, `verify: (email: string, code: string) => Promise<unknown>`, `onDone: () => void`;
  - `TelegramConnect({ start, onDone, label, pollIntervalMs? })`, где `start: () => Promise<{ deepLink: string }>`;
  - `LoginPanel({ next, config }: { next: string; config: AuthConfig })`.

- [ ] **Step 1: Прочитать документацию Next**

Прочитай `web/AGENTS.md` и раздел про `page.tsx` (props `params` и `searchParams` в Next 16 приходят как Promise) в `node_modules/next/dist/docs/`.

- [ ] **Step 2: Написать падающие тесты**

`EmailCodeForm.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApiError } from '@/lib/api'
import { EmailCodeForm } from './EmailCodeForm'

afterEach(cleanup)

describe('EmailCodeForm', () => {
  it('email → код → onDone', async () => {
    const start = vi.fn(async () => {})
    const verify = vi.fn(async () => ({}))
    const onDone = vi.fn()
    render(<EmailCodeForm start={start} verify={verify} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ivan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
    const codeInput = await screen.findByLabelText('Код из письма')
    expect(start).toHaveBeenCalledWith('ivan@example.com')
    fireEvent.change(codeInput, { target: { value: '12 34 56' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(verify).toHaveBeenCalledWith('ivan@example.com', '123456')
  })

  it('неверный код — показывает оставшиеся попытки', async () => {
    const verify = vi.fn(async () => {
      throw new ApiError(400, 'invalid_code', 'Неверный код', { attemptsLeft: 2 })
    })
    render(<EmailCodeForm start={async () => {}} verify={verify} onDone={() => {}} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.ru' } })
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
    fireEvent.change(await screen.findByLabelText('Код из письма'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Неверный код. Осталось попыток: 2')).toBeInTheDocument()
  })

  it('повторная отправка доступна через 60 секунд, «Изменить email» возвращает к шагу 1', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<EmailCodeForm start={async () => {}} verify={async () => ({})} onDone={() => {}} />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.ru' } })
      fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
      const resend = await screen.findByRole('button', { name: /Отправить ещё раз/ })
      expect(resend).toBeDisabled()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: 'Изменить email' }))
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
```

`TelegramConnect.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TelegramConnect } from './TelegramConnect'

const poll = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ pollTelegramLogin: poll }))

afterEach(() => {
  cleanup()
  poll.mockReset()
})

describe('TelegramConnect', () => {
  it('открывает бота и ждёт подтверждения', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    poll.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'ok' })
    const onDone = vi.fn()
    render(
      <TelegramConnect
        label="Войти через Telegram"
        start={async () => ({ deepLink: 'https://t.me/ximi4ka_bot?start=abc' })}
        onDone={onDone}
        pollIntervalMs={10}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }))
    expect(await screen.findByText(/Ждём подтверждения в Telegram/)).toBeInTheDocument()
    expect(open).toHaveBeenCalledWith('https://t.me/ximi4ka_bot?start=abc', '_blank', 'noopener')
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('истёк — предлагает начать заново', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    poll.mockResolvedValue({ status: 'expired' })
    render(
      <TelegramConnect
        label="Войти через Telegram"
        start={async () => ({ deepLink: 'https://t.me/b?start=x' })}
        onDone={() => {}}
        pollIntervalMs={10}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }))
    expect(await screen.findByRole('button', { name: 'Начать заново' })).toBeInTheDocument()
  })
})
```

`LoginPanel.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LoginPanel } from './LoginPanel'

vi.mock('@/lib/accountApi', () => ({
  startEmailLogin: vi.fn(),
  verifyEmailLogin: vi.fn(),
  startTelegramLogin: vi.fn(),
  pollTelegramLogin: vi.fn(),
}))

afterEach(cleanup)

describe('LoginPanel', () => {
  it('оба способа и ссылка на политику', () => {
    render(
      <LoginPanel
        next="/account"
        config={{ email: true, telegram: true, telegramBot: 'ximi4ka_bot' }}
      />,
    )
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /политикой обработки персональных данных/ }),
    ).toBeInTheDocument()
  })

  it('бот выключен — кнопки Telegram нет; почта выключена — пояснение', () => {
    render(
      <LoginPanel next="/account" config={{ email: false, telegram: false, telegramBot: null }} />,
    )
    expect(screen.queryByRole('button', { name: 'Войти через Telegram' })).toBeNull()
    expect(screen.getByText('Вход по почте временно недоступен')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `npm test -w web -- "app/[locale]/(public)/account"`
Expected: FAIL: компоненты не найдены.

- [ ] **Step 4: EmailCodeForm**

`web/app/[locale]/(public)/account/_components/EmailCodeForm.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'

const RESEND_SECONDS = 60

interface Props {
  start: (email: string) => Promise<void>
  verify: (email: string, code: string) => Promise<unknown>
  onDone: () => void
  submitLabel?: string
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_code') {
      const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft
      return left ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код'
    }
    return err.message
  }
  return 'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.'
}

// Шаги «email → код». Общая для входа и привязки email в профиле.
export function EmailCodeForm({ start, verify, onDone, submitLabel = 'Войти' }: Props) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await start(email.trim())
      setStep('code')
      setCode('')
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verify(email.trim(), code)
      onDone()
    } catch (err) {
      setError(messageFor(err))
      setBusy(false)
    }
  }

  if (step === 'email') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="account-email" className={LABEL_CLASS}>
          Email
        </label>
        <input
          id="account-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
        />
        {error && <p className={ERROR_CLASS}>{error}</p>}
        <Button type="submit" loading={busy} disabled={busy || email.trim() === ''}>
          Получить код
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} className="flex flex-col gap-3">
      <p className="text-[var(--color-lj-ink)] opacity-80">
        Отправили код на <b>{email}</b>. Письмо может идти пару минут — загляните и в «Спам».
      </p>
      <label htmlFor="account-code" className={LABEL_CLASS}>
        Код из письма
      </label>
      <input
        id="account-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className={`${FIELD_CLASS} font-lj-mono tracking-[0.5em] text-center text-2xl`}
        autoFocus
      />
      {error && <p className={ERROR_CLASS}>{error}</p>}
      <Button type="submit" loading={busy} disabled={busy || code.length !== 6}>
        {submitLabel}
      </Button>
      <div className="flex flex-wrap gap-4">
        <Button
          type="button"
          variant="link"
          disabled={busy || resendIn > 0}
          onClick={() => void send()}
        >
          {resendIn > 0 ? `Отправить ещё раз через ${resendIn} с` : 'Отправить ещё раз'}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setStep('email')
            setError(null)
          }}
        >
          Изменить email
        </Button>
      </div>
    </form>
  )
}
```

Сверь props `Button` с `web/components/ui/Button.tsx` (`type`, `onClick`, `loading`, `disabled`, `variant`). Если `type` не поддерживается, прокинь его в `ButtonAsButton`. `input` кода получает `onChange` с `'12 34 56'` и сам вычищает пробелы.

- [ ] **Step 5: TelegramConnect**

`web/app/[locale]/(public)/account/_components/TelegramConnect.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import { pollTelegramLogin } from '@/lib/accountApi'
import { Button } from '@/components/ui'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

interface Props {
  label: string
  start: () => Promise<{ deepLink: string }>
  onDone: () => void
  pollIntervalMs?: number
}

type State = 'idle' | 'waiting' | 'expired'

// Вход/привязка через бота: открываем t.me/<бот>?start=…, ждём «Подтвердить»
// в чате, опрашивая статус (спека кабинета §4.3).
export function TelegramConnect({ label, start, onDone, pollIntervalMs = 2000 }: Props) {
  const [state, setState] = useState<State>('idle')
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (state !== 'waiting') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const { status } = await pollTelegramLogin()
        if (cancelled) return
        if (status === 'ok') return doneRef.current()
        if (status === 'expired') return setState('expired')
      } catch {
        // Сеть мигнула — попробуем на следующем тике.
      }
      if (!cancelled) timer = setTimeout(tick, pollIntervalMs)
    }
    timer = setTimeout(tick, pollIntervalMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state, pollIntervalMs])

  async function begin() {
    setError(null)
    try {
      const { deepLink } = await start()
      setLink(deepLink)
      window.open(deepLink, '_blank', 'noopener')
      setState('waiting')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось связаться с сервером')
    }
  }

  if (state === 'waiting') {
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-[var(--color-lj-ink)]">
          Ждём подтверждения в Telegram… Нажмите «Старт», затем «Подтвердить» в чате с ботом.
        </p>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--color-lj-brand)]"
          >
            Открыть бота ещё раз
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {state === 'expired' && <p className={ERROR_CLASS}>Время на подтверждение вышло.</p>}
      {error && <p className={ERROR_CLASS}>{error}</p>}
      <Button type="button" variant="secondary" onClick={() => void begin()}>
        {state === 'expired' ? 'Начать заново' : label}
      </Button>
    </div>
  )
}
```

`window.open` вызывается после `await`, и на iOS Safari его может заблокировать блокировщик всплывающих окон. Поэтому в состоянии `waiting` всегда видна ссылка «Открыть бота ещё раз». Нажатие на ссылку — прямой жест пользователя, его блокировщик не трогает. Проверь это вручную на телефоне в Task 14.

- [ ] **Step 6: LoginPanel и страница**

`web/app/[locale]/(public)/account/_components/LoginPanel.tsx`:

```tsx
'use client'

import Link from 'next/link'
import type { AuthConfig } from '@ximi4ka-shop/shared'
import { startEmailLogin, startTelegramLogin, verifyEmailLogin } from '@/lib/accountApi'
import { redirectTo } from '@/lib/checkout'
import { EmailCodeForm } from './EmailCodeForm'
import { TelegramConnect } from './TelegramConnect'

// Полная перезагрузка, а не router.push: серверный layout кабинета должен
// увидеть только что выставленную cookie сессии.
export function LoginPanel({ next, config }: { next: string; config: AuthConfig }) {
  const done = () => redirectTo(next)
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="font-lj-mono uppercase tracking-[0.08em] text-[length:var(--text-lj-mono-sm)] opacity-70 m-0">
          По почте
        </h2>
        {config.email ? (
          <EmailCodeForm start={startEmailLogin} verify={verifyEmailLogin} onDone={done} />
        ) : (
          <p className="opacity-70">Вход по почте временно недоступен</p>
        )}
      </section>

      {config.telegram && (
        <section className="flex flex-col gap-4">
          <h2 className="font-lj-mono uppercase tracking-[0.08em] text-[length:var(--text-lj-mono-sm)] opacity-70 m-0">
            Через Telegram
          </h2>
          <TelegramConnect label="Войти через Telegram" start={startTelegramLogin} onDone={done} />
        </section>
      )}

      <p className="text-sm opacity-60">
        Регистрироваться отдельно не нужно — аккаунт появится при первом входе. Продолжая, вы
        соглашаетесь с{' '}
        <Link href="/politika-konfidencialnosti" className="underline">
          политикой обработки персональных данных
        </Link>
        .
      </p>
    </div>
  )
}
```

В коде витрины страницы политики нет. Страницы сайта живут в CMS (таблица `pages`, catch-all `[slug]`), поэтому slug политики найди в базе: `SELECT slug, title FROM pages WHERE title ILIKE '%олитик%'`. Подставь его вместо `/politika-konfidencialnosti`. Если такой страницы нет, оставь ссылку как есть и напиши в отчёте, что страницу нужно завести в админке: ссылку требует 152-ФЗ.

`web/app/[locale]/(public)/account/login/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { fetchAuthConfigServer, fetchCurrentCustomer } from '@/lib/accountServer'
import { safeNext } from '@/lib/safeNext'
import { LoginPanel } from '../_components/LoginPanel'

export const metadata: Metadata = {
  title: 'Вход в личный кабинет — Ximi4ka',
  robots: { index: false },
}

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const next = safeNext((await searchParams).next)
  if (await fetchCurrentCustomer()) redirect(next)
  const config = await fetchAuthConfigServer()
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[480px] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-10 text-[var(--color-lj-ink)]">
          Вход в личный кабинет
        </h1>
        <LoginPanel next={next} config={config} />
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Запустить тесты и убедиться, что они проходят**

Run: `npm test -w web -- "app/[locale]/(public)/account" && npm run typecheck -w web && npm run lint -w web`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "web/app/[locale]/(public)/account"
git commit -m "feat(web): страница входа в личный кабинет — почта и Telegram"
```

---

### Task 12: Web — кабинет: заказы, личные данные, поддержка

**Files:**

- Create:
  - `web/app/[locale]/(public)/account/(authed)/layout.tsx`, `page.tsx`, `profile/page.tsx`;
  - в `web/app/[locale]/(public)/account/_components/`: `AccountNav.tsx`, `SupportButton.tsx`, `OrdersList.tsx`, `ProfilePanel.tsx`.
- Test: `OrdersList.test.tsx`, `ProfilePanel.test.tsx`, `SupportButton.test.tsx` в `_components/`.

**Interfaces:**

- Consumes: `fetchCurrentCustomer`, `getOrders`, `getMe`, `updateMe`, `logout`, `startLinkEmail`, `verifyLinkEmail`, `startLinkTelegram`, `unlinkEmail`, `unlinkTelegram`, `EmailCodeForm`, `TelegramConnect`, `orderStatusLabel` из `@/lib/orderStatus`, `formatRub` из `@/lib/stockLabel`, `redirectTo`.
- Produces: страницы `/account` и `/account/profile`, `SupportButton`, `SUPPORT_URL = 'https://t.me/ximi4ka_support'`.

- [ ] **Step 1: Написать падающие тесты**

`SupportButton.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SupportButton } from './SupportButton'

describe('SupportButton', () => {
  it('ведёт в @ximi4ka_support в новой вкладке', () => {
    render(<SupportButton />)
    const link = screen.getByRole('link', { name: /Написать в поддержку/ })
    expect(link).toHaveAttribute('href', 'https://t.me/ximi4ka_support')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
```

`OrdersList.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AccountOrderSummary } from '@ximi4ka-shop/shared'
import { OrdersList } from './OrdersList'

const getOrders = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ getOrders }))
afterEach(() => {
  cleanup()
  getOrders.mockReset()
})

const order = (n: number, extra: Partial<AccountOrderSummary> = {}): AccountOrderSummary => ({
  orderNumber: `XM-2026-0000${n}`,
  publicToken: `tok${n}`,
  createdAt: '2026-09-20T10:00:00.000Z',
  status: 'paid',
  paymentProvider: 'tbank',
  totalRub: 2990,
  itemCount: 2,
  items: [{ name: 'Набор юного химика', quantity: 2, imageUrl: null }],
  shipment: null,
  ...extra,
})

describe('OrdersList', () => {
  it('пусто — приглашение в каталог', async () => {
    getOrders.mockResolvedValue({ orders: [], nextCursor: null })
    render(<OrdersList />)
    expect(await screen.findByText('Здесь появятся ваши заказы')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /каталог/i })).toHaveAttribute('href', '/catalog')
  })

  it('карточка ведёт на страницу заказа с секретом, есть статус, сумма, трек', async () => {
    getOrders.mockResolvedValue({
      orders: [
        order(1, {
          shipment: { state: 'created', trackingNumber: '123', trackingUrl: 'https://cdek/123' },
        }),
      ],
      nextCursor: null,
    })
    render(<OrdersList />)
    const link = await screen.findByRole('link', { name: /XM-2026-00001/ })
    expect(link).toHaveAttribute('href', '/order/XM-2026-00001#t=tok1')
    expect(screen.getByText('Оплачен')).toBeInTheDocument()
    expect(screen.getByText(/2\s?990/)).toBeInTheDocument()
    expect(screen.getByText(/Трек СДЭК: 123/)).toBeInTheDocument()
  })

  it('«Показать ещё» догружает по курсору', async () => {
    getOrders
      .mockResolvedValueOnce({ orders: [order(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ orders: [order(2)], nextCursor: null })
    render(<OrdersList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }))
    expect(await screen.findByRole('link', { name: /XM-2026-00002/ })).toBeInTheDocument()
    expect(getOrders).toHaveBeenLastCalledWith('c1')
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })
})
```

`ProfilePanel.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CustomerProfile } from '@ximi4ka-shop/shared'
import { ProfilePanel } from './ProfilePanel'

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  updateMe: vi.fn(),
  logout: vi.fn(),
  startLinkEmail: vi.fn(),
  verifyLinkEmail: vi.fn(),
  startLinkTelegram: vi.fn(),
  unlinkEmail: vi.fn(),
  unlinkTelegram: vi.fn(),
  pollTelegramLogin: vi.fn(),
}))
vi.mock('@/lib/accountApi', () => api)
const redirect = vi.hoisted(() => vi.fn())
vi.mock('@/lib/checkout', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/checkout')>()),
  redirectTo: redirect,
}))

afterEach(() => {
  cleanup()
  Object.values(api).forEach((f) => f.mockReset())
})

const profile: CustomerProfile = {
  id: '1',
  email: 'ivan@example.com',
  telegramUsername: null,
  hasTelegram: false,
  name: 'Иван',
  phone: '+79001234567',
  lastDelivery: null,
}

describe('ProfilePanel', () => {
  it('сохраняет имя и телефон', async () => {
    api.getMe.mockResolvedValue(profile)
    api.updateMe.mockResolvedValue({ ...profile, name: 'Пётр' })
    render(<ProfilePanel />)
    const name = await screen.findByLabelText('Имя')
    fireEvent.change(name, { target: { value: 'Пётр' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({ name: 'Пётр', phone: '+79001234567' }),
    )
    expect(await screen.findByText('Сохранено')).toBeInTheDocument()
  })

  it('без Telegram — «Привязать Telegram»; отвязать единственный email нельзя', async () => {
    api.getMe.mockResolvedValue(profile)
    render(<ProfilePanel />)
    expect(await screen.findByRole('button', { name: 'Привязать Telegram' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отвязать email' })).toBeNull()
  })

  it('с Telegram и email — можно отвязать Telegram', async () => {
    api.getMe.mockResolvedValue({ ...profile, hasTelegram: true, telegramUsername: 'ivan_tg' })
    api.unlinkTelegram.mockResolvedValue(undefined)
    render(<ProfilePanel />)
    expect(await screen.findByText('@ivan_tg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Отвязать Telegram' }))
    await vi.waitFor(() => expect(api.unlinkTelegram).toHaveBeenCalled())
  })

  it('выход ведёт на главную', async () => {
    api.getMe.mockResolvedValue(profile)
    api.logout.mockResolvedValue(undefined)
    render(<ProfilePanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }))
    await vi.waitFor(() => expect(redirect).toHaveBeenCalledWith('/'))
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -w web -- "app/[locale]/(public)/account/_components"`
Expected: FAIL: новые компоненты не найдены.

- [ ] **Step 3: SupportButton и AccountNav**

`SupportButton.tsx`:

```tsx
export const SUPPORT_URL = 'https://t.me/ximi4ka_support'

// Кнопка поддержки кабинета (спека §6): чат @ximi4ka_support.
export function SupportButton() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-lj-ink)] px-5 py-3 font-lj-mono uppercase tracking-[0.06em] text-[length:var(--text-lj-mono-sm)] text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-cream)] transition-colors"
    >
      Написать в поддержку →
    </a>
  )
}
```

`AccountNav.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/account', label: 'Заказы' },
  { href: '/account/profile', label: 'Личные данные' },
]

// usePathname может прийти с префиксом локали (/en/account) — снимаем его.
function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/^\/en(?=\/|$)/, '') || '/'
  return href === '/account' ? path === '/account' : path.startsWith(href)
}

// Вкладки: слева на десктопе, строкой сверху на мобильном.
export function AccountNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label="Разделы кабинета" className="flex lg:flex-col gap-2">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-4 py-2 font-lj-mono uppercase tracking-[0.06em] text-[length:var(--text-lj-mono-sm)] ${
              active
                ? 'bg-[var(--color-lj-ink)] text-[var(--color-lj-cream)]'
                : 'text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)]'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

Префикс локали сверь с `web/lib/i18n.ts`. Если кроме `en` есть другие локали, построй регулярку из их списка.

- [ ] **Step 4: Layout и страницы**

`web/app/[locale]/(public)/account/(authed)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { fetchCurrentCustomer } from '@/lib/accountServer'
import { AccountNav } from '../_components/AccountNav'
import { SupportButton } from '../_components/SupportButton'

export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const customer = await fetchCurrentCustomer()
  if (!customer) redirect('/account/login?next=/account')
  const hello =
    customer.name ??
    customer.email ??
    (customer.telegramUsername ? `@${customer.telegramUsername}` : '')
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-2 text-[var(--color-lj-ink)]">
          Личный кабинет
        </h1>
        {hello && <p className="mb-10 opacity-70">{hello}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 items-start">
          <aside className="flex flex-col gap-6">
            <AccountNav />
            <div className="hidden lg:block">
              <SupportButton />
            </div>
          </aside>
          <div className="flex flex-col gap-8">
            {children}
            <div className="lg:hidden">
              <SupportButton />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

`web/app/[locale]/(public)/account/(authed)/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { OrdersList } from '../_components/OrdersList'

export const metadata: Metadata = { title: 'Мои заказы — Ximi4ka', robots: { index: false } }

export default function AccountOrdersPage() {
  return <OrdersList />
}
```

`web/app/[locale]/(public)/account/(authed)/profile/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { ProfilePanel } from '../../_components/ProfilePanel'

export const metadata: Metadata = { title: 'Личные данные — Ximi4ka', robots: { index: false } }

export default function AccountProfilePage() {
  return <ProfilePanel />
}
```

- [ ] **Step 5: OrdersList**

`OrdersList.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { AccountOrderSummary } from '@ximi4ka-shop/shared'
import { getOrders } from '@/lib/accountApi'
import { orderStatusLabel } from '@/lib/orderStatus'
import { formatRub } from '@/lib/stockLabel'
import { Button } from '@/components/ui'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function OrdersList() {
  const [orders, setOrders] = useState<AccountOrderSummary[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (from: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const page = await getOrders(from)
      setOrders((prev) => [...(from ? (prev ?? []) : []), ...page.orders])
      setCursor(page.nextCursor)
    } catch {
      setError('Не удалось загрузить заказы. Обновите страницу.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(null)
  }, [load])

  if (orders === null)
    return error ? <p className={ERROR_CLASS}>{error}</p> : <div className="min-h-[30vh]" />

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-xl">Здесь появятся ваши заказы</p>
        <Button href="/catalog">Открыть каталог →</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4 list-none p-0 m-0">
        {orders.map((o) => (
          <li key={o.orderNumber}>
            <Link
              href={`/order/${o.orderNumber}#t=${encodeURIComponent(o.publicToken)}`}
              className="block rounded-[24px] border border-[var(--color-lj-rule)] bg-white/60 p-5 hover:border-[var(--color-lj-ink)] transition-colors"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-lj-mono">{o.orderNumber}</span>
                <span className="rounded-full bg-[var(--color-lj-ink)] px-3 py-1 text-xs text-[var(--color-lj-cream)]">
                  {orderStatusLabel(o.status, o.paymentProvider)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 opacity-80">
                <span>{DATE.format(new Date(o.createdAt))}</span>
                <span className="font-[700]">{formatRub(o.totalRub)}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                {o.items.map((i, idx) =>
                  i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={idx}
                      src={i.imageUrl}
                      alt={i.name}
                      className="h-12 w-12 rounded-xl object-cover"
                    />
                  ) : (
                    <span key={idx} className="text-sm opacity-70">
                      {i.name} × {i.quantity}
                    </span>
                  ),
                )}
                {o.itemCount > o.items.reduce((n, i) => n + i.quantity, 0) && (
                  <span className="text-sm opacity-60">и ещё…</span>
                )}
              </div>
              {o.shipment?.trackingNumber && (
                <p className="mt-3 text-sm">Трек СДЭК: {o.shipment.trackingNumber}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {error && <p className={ERROR_CLASS}>{error}</p>}
      {cursor && (
        <Button
          type="button"
          variant="secondary"
          loading={loading}
          onClick={() => void load(cursor)}
        >
          Показать ещё
        </Button>
      )}
    </div>
  )
}
```

Как другие страницы показывают картинки товаров (`next/image` и адреса `/uploads/...`), подсмотри в `web/components`. Если там `next/image` с `unoptimized` для `/uploads`, сделай так же и убери комментарий eslint. Сверь, что `formatRub(2990)` даёт строку, которую ловит регулярка теста.

- [ ] **Step 6: ProfilePanel**

`ProfilePanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { CustomerProfile } from '@ximi4ka-shop/shared'
import {
  getMe,
  logout,
  startLinkEmail,
  startLinkTelegram,
  unlinkEmail,
  unlinkTelegram,
  updateMe,
  verifyLinkEmail,
} from '@/lib/accountApi'
import { ApiError } from '@/lib/api'
import { formatPhoneInput, phoneDigits, redirectTo } from '@/lib/checkout'
import { Button } from '@/components/ui'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'
import { EmailCodeForm } from './EmailCodeForm'
import { TelegramConnect } from './TelegramConnect'

export function ProfilePanel() {
  const [me, setMe] = useState<CustomerProfile | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState(false)

  async function refresh() {
    const p = await getMe()
    setMe(p)
    setName(p.name ?? '')
    setPhone(p.phone ? formatPhoneInput(p.phone) : '')
  }

  useEffect(() => {
    refresh().catch(() => setError('Не удалось загрузить данные. Обновите страницу.'))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      const digits = phoneDigits(phone)
      const updated = await updateMe({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(digits ? { phone: `+${digits}` } : {}),
      })
      setMe(updated)
      setNotice('Сохранено')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие')
    }
  }

  if (!me) return error ? <p className={ERROR_CLASS}>{error}</p> : <div className="min-h-[30vh]" />
  const canUnlinkEmail = me.email !== null && me.hasTelegram
  const canUnlinkTelegram = me.hasTelegram && me.email !== null

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={save} className="flex flex-col gap-4 max-w-[480px]">
        <label htmlFor="profile-name" className={LABEL_CLASS}>
          Имя
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={FIELD_CLASS}
        />
        <label htmlFor="profile-phone" className={LABEL_CLASS}>
          Телефон
        </label>
        <input
          id="profile-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+7 (___) ___-__-__"
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          className={FIELD_CLASS}
        />
        <p className="text-sm opacity-60">
          Подставим их в оформление заказа, чтобы не вводить заново.
        </p>
        {notice && <p className="text-[var(--color-lj-brand)]">{notice}</p>}
        <Button type="submit" loading={saving}>
          Сохранить
        </Button>
      </form>

      <section className="flex flex-col gap-3 max-w-[480px]">
        <h2 className={LABEL_CLASS}>Email</h2>
        {me.email && !editEmail && <p>{me.email}</p>}
        {editEmail ? (
          <EmailCodeForm
            start={startLinkEmail}
            verify={verifyLinkEmail}
            submitLabel="Подтвердить"
            onDone={() => {
              setEditEmail(false)
              void refresh()
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-4">
            <Button type="button" variant="link" onClick={() => setEditEmail(true)}>
              {me.email ? 'Изменить email' : 'Привязать email'}
            </Button>
            {canUnlinkEmail && (
              <Button type="button" variant="link" onClick={() => void run(unlinkEmail)}>
                Отвязать email
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 max-w-[480px]">
        <h2 className={LABEL_CLASS}>Telegram</h2>
        {me.hasTelegram ? (
          <>
            <p>{me.telegramUsername ? `@${me.telegramUsername}` : 'привязан'}</p>
            {canUnlinkTelegram && (
              <Button type="button" variant="link" onClick={() => void run(unlinkTelegram)}>
                Отвязать Telegram
              </Button>
            )}
          </>
        ) : (
          <TelegramConnect
            label="Привязать Telegram"
            start={startLinkTelegram}
            onDone={() => void refresh()}
          />
        )}
      </section>

      {error && <p className={ERROR_CLASS}>{error}</p>}

      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void logout()
              .catch(() => {})
              .then(() => redirectTo('/'))
          }
        >
          Выйти
        </Button>
      </div>
    </div>
  )
}
```

`formatPhoneInput` и `phoneDigits` уже экспортируются из `@/lib/checkout`, их использует чекаут. Если `Telegram`-привязка вернула 503, текст ошибки покажет `TelegramConnect`.

- [ ] **Step 7: Запустить тесты и убедиться, что они проходят**

Run: `npm test -w web -- "app/[locale]/(public)/account" && npm run typecheck -w web && npm run lint -w web`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "web/app/[locale]/(public)/account"
git commit -m "feat(web): кабинет — заказы, личные данные, поддержка"
```

---

### Task 13: Web — иконка в шапке, пункт меню, автозаполнение чекаута

**Files:**

- Create: `web/components/AccountLink.tsx`
- Modify: `web/components/Header.tsx:166-169`, `web/components/MobileMenuOverlay.tsx:103-110`, `web/components/checkout/useCdekDelivery.ts`, `web/app/[locale]/(public)/checkout/page.tsx`
- Test: `web/components/Header.test.tsx`, `web/app/[locale]/(public)/checkout/page.test.tsx`

**Interfaces:**

- Consumes: `getMeOrNull` из `@/lib/accountApi`, `LastDelivery`, `CustomerProfile`.
- Produces: `useCdekDelivery(...).applyLastDelivery(last: LastDelivery): void` (новое поле `CdekDeliveryModel`), компонент `AccountLink`.

- [ ] **Step 1: Написать падающие тесты**

В `web/components/Header.test.tsx` внутри `describe('Header v3')` добавить:

```tsx
it('иконка личного кабинета ведёт на /account', () => {
  render(<Header />)
  expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/account')
})
```

В `web/app/[locale]/(public)/checkout/page.test.tsx` сразу после `vi.mock('@/lib/checkout', …)` добавить мок, чтобы запрос профиля не ломал существующие проверки `fetchMock`:

```tsx
const accountMock = vi.hoisted(() => ({
  me: null as import('@ximi4ka-shop/shared').CustomerProfile | null,
}))
vi.mock('@/lib/accountApi', () => ({ getMeOrNull: async () => accountMock.me }))
```

В существующий `beforeEach` файла добавить строку `accountMock.me = null`. В конец файла добавить (хелперы `seedCart`, `seed`, `mockGetPoints` уже есть в файле):

```tsx
describe('чекаут для вошедшего покупателя', () => {
  const profile = {
    id: '1',
    email: 'ivan@example.com',
    telegramUsername: 'ivan_tg',
    hasTelegram: true,
    name: 'Иван',
    phone: '+79001234567',
    lastDelivery: null,
  }

  it('подставляет контакты из профиля и не показывает подсказку входа', async () => {
    accountMock.me = profile
    seedCart(seed)
    render(<CheckoutPage />)
    expect(await screen.findByDisplayValue('Иван')).toBeInTheDocument()
    expect(screen.getByLabelText(/телефон/i)).toHaveValue('+7 (900) 123-45-67')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ivan@example.com')
    expect(screen.getByLabelText(/^telegram/i)).toHaveValue('@ivan_tg')
    expect(screen.queryByText(/чтобы заказ сохранился/)).toBeNull()
  })

  it('гостю — подсказка войти со ссылкой назад на чекаут', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    const link = await screen.findByRole('link', { name: 'Войдите' })
    expect(link).toHaveAttribute('href', '/account/login?next=/checkout')
  })

  it('пункт выдачи из прошлого заказа выбирается, когда загрузится список города', async () => {
    accountMock.me = {
      ...profile,
      lastDelivery: {
        method: 'cdek_pvz',
        cityCode: 44,
        cityName: 'Москва',
        deliveryPointCode: 'MSK65',
        postalCode: null,
        courierStreet: null,
      },
    }
    seedCart(seed)
    render(<CheckoutPage />)
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledWith(44))
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: /пункт получения/i })).toHaveValue(
        'MSK65 · ул. Динамовская, 1А, 110а',
      ),
    )
  })

  it('город из localStorage другой — доставку из прошлого заказа не трогаем', async () => {
    window.localStorage.setItem(
      'ximi4ka-checkout-city',
      JSON.stringify({ code: 137, name: 'Санкт-Петербург', fullName: 'Санкт-Петербург, Россия' }),
    )
    accountMock.me = {
      ...profile,
      lastDelivery: {
        method: 'cdek_courier',
        cityCode: 44,
        cityName: 'Москва',
        deliveryPointCode: null,
        postalCode: '101000',
        courierStreet: 'ул. Ленина, 1',
      },
    }
    seedCart(seed)
    render(<CheckoutPage />)
    expect(await screen.findByDisplayValue('Иван')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('ул. Ленина, 1')).toBeNull()
  })
})
```

Формат значения в localStorage сверь с `loadSavedCity` в `useCdekDelivery.ts:75-110`. Если там другой ключ или форма, используй `CITY_STORAGE_KEY` и ту же форму, что пишет `saveCity`.

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -w web -- components/Header.test.tsx "app/[locale]/(public)/checkout/page.test.tsx"`
Expected: FAIL: нет ссылки «Личный кабинет», поля не заполнены.

- [ ] **Step 3: Иконка и пункт меню**

`web/components/AccountLink.tsx`:

```tsx
import Link from 'next/link'

// Иконка кабинета в шапке: всегда /account — вошёл ли покупатель, решает
// серверный layout кабинета, шапке это знать не нужно.
export function AccountLink() {
  return (
    <Link
      href="/account"
      aria-label="Личный кабинет"
      className="text-[var(--color-lj-ink)] hover:text-[var(--color-lj-brand)] transition-colors"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="8" cy="5.5" r="3" />
        <path d="M2.5 14c.8-2.6 3-4 5.5-4s4.7 1.4 5.5 4" strokeLinecap="round" />
      </svg>
    </Link>
  )
}
```

В `web/components/Header.tsx` импортировать `AccountLink` из `./AccountLink` и вставить `<AccountLink />` прямо перед `<CartButton />`.

В `web/components/MobileMenuOverlay.tsx` перед ссылкой `/cart` добавить:

```tsx
<Link
  href="/account"
  onClick={onClose}
  className="block mt-12 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]"
>
  ЛИЧНЫЙ КАБИНЕТ →
</Link>
```

и в ссылке корзины заменить `mt-12 mb-6` на `mt-6 mb-6`.

- [ ] **Step 4: applyLastDelivery в useCdekDelivery**

В `web/components/checkout/useCdekDelivery.ts`:

1. В импорт типов из `@ximi4ka-shop/shared` добавить `LastDelivery`.
2. В `interface CdekDeliveryModel` добавить:

```ts
  // Доставка из прошлого заказа вошедшего покупателя (спека кабинета §6).
  applyLastDelivery: (last: LastDelivery) => void
```

3. В теле хука после объявления `courierQuote` добавить состояние:

```ts
const [pendingPointCode, setPendingPointCode] = useState<string | null>(null)
```

4. После вычисления `points` и `pointsStatus` (там, где они уже объявлены) добавить эффект:

```ts
// Пункт из прошлого заказа выбираем, когда загрузится список города; если
// пункт закрылся — покупатель просто выберет другой.
useEffect(() => {
  if (!pendingPointCode || pointsStatus !== 'ready') return
  const found = points.find((p) => p.code === pendingPointCode)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if (found && !point) setPointState(found)
  setPendingPointCode(null)
}, [pendingPointCode, pointsStatus, points, point])
```

5. Рядом с `rejectPoint` добавить функцию:

```ts
function applyLastDelivery(last: LastDelivery) {
  if (!last.cityCode) return
  // Город из localStorage приоритетнее: покупатель мог выбрать новый.
  if (!city && last.cityName) {
    setCity({ code: last.cityCode, name: last.cityName, fullName: last.cityName })
  } else if (city && city.code !== last.cityCode) {
    return
  }
  setMethod(last.method)
  if (last.method === 'cdek_pvz' && last.deliveryPointCode)
    setPendingPointCode(last.deliveryPointCode)
  if (last.method === 'cdek_courier' && last.courierStreet && courier.street.trim() === '') {
    setCourier({ street: last.courierStreet, apartment: '', postalCode: last.postalCode ?? '' })
  }
}
```

6. В возвращаемый объект добавить `applyLastDelivery,`.

Функция `setCity` из шага 5 — внутренняя функция хука. Она сбрасывает пункт и сохраняет город в localStorage, и это нам подходит.

- [ ] **Step 5: Чекаут**

В `web/app/[locale]/(public)/checkout/page.tsx`:

1. Импорт: `import { getMeOrNull } from '@/lib/accountApi'`.
2. После `const delivery = useCdekDelivery(items)` добавить:

```tsx
// Вошедшему покупателю — контакты и доставка из профиля; гостю — подсказка
// войти. undefined — ещё не знаем (подсказку не мигаем).
const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined)
const applyLastDelivery = delivery.applyLastDelivery
useEffect(() => {
  if (!hydrated) return
  let cancelled = false
  getMeOrNull().then((me) => {
    if (cancelled) return
    setSignedIn(me !== null)
    if (!me) return
    setFields((prev) => ({
      ...prev,
      name: prev.name || me.name || '',
      phone: prev.phone || (me.phone ? formatPhoneInput(me.phone) : ''),
      email: prev.email || me.email || '',
      telegram: prev.telegram || (me.telegramUsername ? `@${me.telegramUsername}` : ''),
    }))
    if (me.lastDelivery) applyLastDelivery(me.lastDelivery)
  })
  return () => {
    cancelled = true
  }
  // Один раз после гидратации; applyLastDelivery меняется каждый рендер.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [hydrated])
```

3. Внутри левой колонки формы, перед блоком поля «Имя _» (после `{/_ ---- Левая колонка … ---- \*/}`и`<div className="flex flex-col gap-8">`), добавить:

```tsx
{
  signedIn === false && (
    <p className="text-sm opacity-70">
      <Link href="/account/login?next=/checkout" className="underline">
        Войдите
      </Link>
      , чтобы заказ сохранился в личном кабинете.
    </p>
  )
}
```

- [ ] **Step 6: Запустить тесты и убедиться, что они проходят**

Run: `npm test -w web && npm run typecheck -w web && npm run lint -w web`
Expected: PASS, весь пакет web.

- [ ] **Step 7: Commit**

```bash
git add web/components web/app/[locale]/\(public\)/checkout
git commit -m "feat(web): вход в кабинет из шапки и автозаполнение чекаута"
```

---

### Task 14: Документация деплоя, полная проверка, ревью безопасности

**Files:**

- Modify: `deploy/README.md`
- Проверка: весь репозиторий

- [ ] **Step 1: Раздел в deploy/README.md**

Добавить раздел «Личный кабинет: почта и бот входа» со следующим содержанием:

1. **Почта.** Завести ящик `noreply@ximi4ka.ru` у почтового провайдера домена. Прописать в DNS SPF и DKIM, записи даёт провайдер. Заполнить `SMTP_*` и `MAIL_FROM` в `deploy/app.env`. Проверка: войти на сайте по своей почте, письмо должно прийти не в «Спам».
2. **Бот.** В @BotFather выполнить `/newbot`, задать имя «Химичка» и username вида `ximi4ka_bot`. Там же `/setuserpic` (логотип), `/setdescription` («Вход в личный кабинет ximi4ka.ru») и `/setabouttext`. Токен записать в `TELEGRAM_LOGIN_BOT_TOKEN`, username без `@` — в `TELEGRAM_LOGIN_BOT_USERNAME`. Секрет получить командой `openssl rand -hex 32` и записать в `TELEGRAM_LOGIN_WEBHOOK_SECRET`.
3. **Webhook.** После деплоя выполнить `docker compose exec ximishop-api node api/dist/scripts/telegram-set-webhook.js`. Команда берёт `WEB_ORIGIN`, адрес должен быть https. Проверка: `curl -s https://api.telegram.org/bot<TOKEN>/getWebhookInfo` показывает URL и `pending_update_count: 0`. Не вызывать `getUpdates` для этого бота: при активном webhook он вернёт ошибку.
4. **Миграция.** `docker compose exec ximishop-api node api/dist/scripts/migrate.js` накатывает `AddCustomerAccounts`. Если `ALTER TABLE orders` упадёт на правах доступа, см. заметку о владельце таблиц прод-базы.

- [ ] **Step 2: Полная проверка**

Run: `npm run typecheck && npm run lint && npm test && npm run format:check`
Expected: всё зелёное. Если `format:check` падает, выполнить `npx prettier --write` по изменённым файлам и повторить.

- [ ] **Step 3: Ручная проверка в браузере (dev)**

1. Поднять api и web через `preview_start` (конфиг в `.claude/launch.json`, создать при отсутствии). Открыть `/account`: должен быть редирект на `/account/login?next=/account`.
2. Ввести почту, взять код из лога api (`mail (dev): …`), войти и попасть на `/account`. Пустой список показывает «Здесь появятся ваши заказы».
3. Оформить заказ залогиненным. Контакты подставились. Заказ появился в кабинете, клик по нему открывает `/order/N`, трек показывается как раньше.
4. В «Личных данных» поменять имя и нажать «Сохранить». Нажать «Выйти», проверить, что сессия сброшена.
5. Проверить `/account/login?next=//evil.ru`: после входа должен быть переход на `/account`.
6. Проверить на ширине телефона (`resize_window` mobile): вкладки идут сверху, кнопка поддержки внизу, в шапке есть иконка.
7. Сделать скриншоты входа, кабинета и профиля и отправить их пользователю.

Вход через Telegram локально не проверить: бот до localhost не достучится. Проверка после деплоя: установить webhook, войти с телефона, убедиться, что ссылка «Открыть бота ещё раз» работает в iOS Safari.

- [ ] **Step 4: Ревью безопасности**

Запустить `/security-review` на ветке: здесь авторизация, персональные данные и webhook. Найденное исправить отдельными коммитами с регрессионными тестами.

- [ ] **Step 5: Commit**

```bash
git add deploy/README.md
git commit -m "docs(deploy): почта и бот входа для личного кабинета"
```
