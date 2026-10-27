# CloudPayments для карт банков стран ЕАЭС: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** покупатель с доставкой в Беларусь, Казахстан, Армению или Киргизию выбирает на чекауте «Visa / Mastercard банка другой страны» и платит через платёжную ссылку CloudPayments; надбавка за способ оплаты — настраиваемый процент, по умолчанию 0.

**Architecture:** CloudPayments встаёт третьим способом оплаты по образцу Яндекс Пэй (`api/src/lib/payments/yandexPay/*`): ключи в env, рубильник, режим и процент надбавки в `SiteSettings`, ссылка на оплату через Orders API (`POST /orders/create`), оплата засчитывается вебхуком Pay с проверкой HMAC и суммы, вебхук Check отклоняет неверную сумму до списания, сверка зависших платежей — через `POST /payments/find`. Надбавку считает только сервер одной функцией из `shared`; витрина зовёт ту же функцию для показа.

**Tech Stack:** Express + TypeORM + Postgres (api), Next.js (web, см. `web/AGENTS.md`), zod, vitest + supertest, общий пакет `@ximi4ka-shop/shared`.

**Spec:** `docs/superpowers/specs/2026-10-17-cloudpayments-card-payments-design.md` + решения владельца от 27.10.2026 (ниже). Справка по API CloudPayments — https://developers.cloudpayments.ru (разделы «Создание счёта для оплаты», «Уведомления», «Проверка уведомлений», «Поиск платежа»).

### Решения владельца 27.10.2026 (поверх спеки)

| #   | Вопрос из спеки | Решение                                                                                                                |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| B1  | Договор и ключи | Заявку одобрили, ключей ещё нет: код и тесты — на моках; сквозная проверка — когда придут тестовые ключи               |
| B3  | Надбавка 8%     | Механика есть, процент — в админке, **по умолчанию 0%**; включать ненулевой процент — только после ответа юриста       |
| B4  | Чек 54-ФЗ       | Пока не известно; в этом плане чек **не передаётся**. Боевой запуск — только после решения по чеку (стоп-правило ниже) |
| B6  | База надбавки   | Рекомендация спеки: от суммы к оплате без самой надбавки = товары − оптовая скидка − промокод + доставка               |
| B7  | Кому показывать | Только доставке в страны ЕАЭС (`cdek_manual_cis`)                                                                      |

## Global Constraints

- Мёрж в `main` = выкатка в прод. Мёрж, прод-сервер, прод-БД, ключи в `app.env` — только по команде владельца в чате.
- Ключи `CLOUDPAYMENTS_PUBLIC_ID`, `CLOUDPAYMENTS_API_SECRET` — только в env (`deploy/app.env` на сервере); в репозиторий, логи и чат не попадают. В логах секреты вычёркиваются (`clip`).
- Рубильник `cloudpaymentsEnabled` по умолчанию `false`, режим `cloudpaymentsMode` по умолчанию `'test'`, процент `cloudpaymentsSurchargePercent` по умолчанию `0`, максимум `15`.
- Режим `test` никогда не доступен покупателям при `NODE_ENV=production`; уведомления и платежи с `TestMode=1` на проде заказ не оплачивают.
- Сумма платежа сверяется с `orders.total_rub` в копейках целыми числами (без float-сравнения).
- Формула итога: `totalRub = subtotalRub − discountRub − promoDiscountRub + shippingRub + paymentSurchargeRub`.
- Надбавка 0 ₽ нигде не показывается строкой (ни на чекауте, ни в админке, ни в Telegram).
- UnionPay на витрине не упоминается: в документации CloudPayments его нет.
- **Стоп-правило боевого запуска:** режим `live` включается только после трёх ответов: CloudPayments подключил иностранные карты (иначе отказ 5113), решён вопрос с чеком 54-ФЗ (B4), сквозная проверка на тестовом терминале прошла.
- Тексты на русском, комментарии в коде — по-русски, в стиле соседнего кода (`yandexPay/*`).
- `shared`: без runtime-импортов `./x.js` в новых файлах (Turbopack их не резолвит) — только `import type`.
- Перед PR: `npm run lint`, `npm run typecheck`, `npm test -w shared`, `npm test -w api` (на своей одноразовой БД через `TEST_DATABASE_URL`), `npm test -w web`, `npx prettier --check .` в корне.

## Review Focus

1. **Повтор Pay (до 100 раз) и Pay после Check-отказа** → заказ оплачивается ровно один раз, лишних событий в очереди уведомлений нет; Pay с несовпавшей суммой заказ не оплачивает. Тест — Task 5.
2. **Покупатель сменил регион с ЕАЭС на Россию после выбора CloudPayments** → способ сбрасывается на Т-Банк, надбавка исчезает из итога, в запрос `paymentMethod: 'cloudpayments'` не уходит. Тест — Task 9.
3. **Админ отменил неоплаченный заказ, а покупатель открыл старую ссылку** → Check отвечает 13, платёж не проходит. Тест — Task 5.
4. **Процент поменяли в админке, пока покупатель на чекауте** → сервер берёт текущий процент; сумма в CloudPayments = `orders.total_rub`, покупатель видит её на форме оплаты. Проверка: Task 6 (сервер не доверяет клиенту), риск описан в `deploy/README.md` (Task 11).
5. **Отказ из-за иностранной карты (ReasonCode 5113)** → заказ остаётся `pending`, ссылка «Оплатить» на странице заказа работает, в логе видно `ReasonCode=5113`. Тест — Task 5 (fail), Task 8 (ссылка).

Известный риск, который тестами не закрыть: сохраняет ли CloudPayments фрагмент `#t=…` в `SuccessRedirectUrl`. Проверяется на тестовом терминале (Task 12); если фрагмент теряется, страница заказа откроется без секрета, и покупатель увидит её урезанный вариант (так же, как при потере ссылки).

---

## Карта файлов

| Файл                                                                                                                                   | Что                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `shared/src/types/payment.ts` (новый)                                                                                                  | `paymentSurchargeRub`, `MAX_PAYMENT_SURCHARGE_PERCENT`               |
| `shared/src/types/order.ts`, `shared/src/index.ts`, `shared/package.json`                                                              | новые значения союзов, `PublicCloudPayments`, поле надбавки, subpath |
| `api/src/migrations/1790860000000-AddCloudPayments.ts` (новый)                                                                         | колонки заказа и настроек                                            |
| `api/src/entities/Order.ts`, `api/src/entities/SiteSettings.ts`                                                                        | колонки                                                              |
| `api/src/lib/payments/cloudpayments/config.ts` (новый)                                                                                 | конфигурация из env + настроек, доступность                          |
| `api/src/lib/payments/cloudpayments/webhook.ts` (новый)                                                                                | подпись HMAC, разбор тела, сумма в копейках                          |
| `api/src/lib/payments/cloudpayments/client.ts` (новый)                                                                                 | `createCloudPaymentsOrder`, `getCloudPaymentsStatus`                 |
| `api/src/lib/payments/logText.ts` (новый)                                                                                              | `clip`, `errMessage` — вынесены из `yandexPay/client.ts`             |
| `api/src/routes/webhooks/cloudpayments.ts` (новый), `api/src/app.ts`                                                                   | вебхуки check / pay / fail                                           |
| `api/src/lib/payments/orderStatus.ts`                                                                                                  | `by: 'cloudpayments'`                                                |
| `api/src/routes/checkout.ts`, `checkout.schemas.ts`                                                                                    | способ, надбавка, провайдер по заказу                                |
| `api/src/lib/payments/reconcile.ts`                                                                                                    | ветка CloudPayments                                                  |
| `api/src/routes/admin/settings.ts`, `api/src/routes/public/settings.ts`                                                                | поля настроек, публичное `cloudPayments`                             |
| `api/src/routes/public/orders.ts`, `api/src/lib/notifications/format.ts`                                                               | «Оплатить» для CloudPayments, надбавка и способ в Telegram           |
| `web/lib/cloudPayments.ts` (новый), `web/lib/api.ts`, `web/lib/yandexPay.ts`                                                           | публичные настройки, подпись способа                                 |
| `web/components/checkout/CisPaymentMethodField.tsx` (новый)                                                                            | выбор оплаты в блоке ЕАЭС                                            |
| `web/app/[locale]/(public)/checkout/page.tsx`, `web/components/checkout/CisDelivery.tsx`, `web/lib/orderProcess.ts`                    | подключение выбора, строка надбавки, текст плашки                    |
| `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx`                                                             | опрос статуса для CloudPayments                                      |
| `web/app/admin/(authed)/orders/orderUi.ts`, `.../orders/[id]/page.tsx`, `web/lib/adminApi.ts`, `web/components/admin/SettingsForm.tsx` | админка                                                              |
| `deploy/app.env.example`, `api/.env.example`, `deploy/README.md`                                                                       | переменные и инструкция владельцу                                    |

---

### Task 1: Общие типы и расчёт надбавки (`shared`)

**Files:**

- Create: `shared/src/types/payment.ts`
- Create: `shared/src/types/payment.test.ts`
- Modify: `shared/src/types/order.ts:15,21,24-28,90,150-168`
- Modify: `shared/src/index.ts` (экспорт `PublicCloudPayments`)
- Modify: `shared/package.json` (`exports`)

**Interfaces:**

- Produces: `paymentSurchargeRub(baseRub: number, percent: number): number`, `MAX_PAYMENT_SURCHARGE_PERCENT = 15` из `@ximi4ka-shop/shared/types/payment`; `PaymentProvider` включает `'cloudpayments'`; `CheckoutPaymentMethod` включает `'cloudpayments'`; `OrderStatusHistoryEntry['by']` включает `'cloudpayments'`; `interface PublicCloudPayments { surchargePercent: number }`; поле `paymentSurchargeRub: number` в DTO заказа.

- [ ] **Step 1: Написать падающий тест**

`shared/src/types/payment.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_PAYMENT_SURCHARGE_PERCENT, paymentSurchargeRub } from './payment'

describe('paymentSurchargeRub', () => {
  it('процент от базы, округление до рубля', () => {
    expect(paymentSurchargeRub(2700, 8)).toBe(216)
    expect(paymentSurchargeRub(1234, 8)).toBe(99) // 98.72
    expect(paymentSurchargeRub(25, 2)).toBe(1) // 0.5 → вверх
  })

  it('0% и отрицательный процент — без надбавки', () => {
    expect(paymentSurchargeRub(2700, 0)).toBe(0)
    expect(paymentSurchargeRub(2700, -5)).toBe(0)
  })

  it('дробный процент и не-число — без надбавки', () => {
    expect(paymentSurchargeRub(2700, 7.5)).toBe(0)
    expect(paymentSurchargeRub(2700, Number.NaN)).toBe(0)
    expect(paymentSurchargeRub(Number.NaN, 8)).toBe(0)
  })

  it('нулевая и отрицательная база — без надбавки', () => {
    expect(paymentSurchargeRub(0, 8)).toBe(0)
    expect(paymentSurchargeRub(-100, 8)).toBe(0)
  })

  it('процент выше потолка режется до потолка', () => {
    expect(paymentSurchargeRub(1000, 50)).toBe((1000 * MAX_PAYMENT_SURCHARGE_PERCENT) / 100)
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -w shared -- payment`
Expected: FAIL — `Cannot find module './payment'` (или ошибка tsc о модуле).

- [ ] **Step 3: Реализация**

`shared/src/types/payment.ts`:

```ts
// Надбавка за оплату через CloudPayments (Visa / Mastercard банков стран ЕАЭС).
// Процент задаёт админка (SiteSettings.cloudpaymentsSurchargePercent, по умолчанию 0),
// считает сервер; витрина зовёт ту же функцию только для показа.
// База — сумма к оплате без самой надбавки: товары − скидки − промокод + доставка.
// Без runtime-импортов: Turbopack не резолвит ./x.js внутри shared.

export const MAX_PAYMENT_SURCHARGE_PERCENT = 15

export function paymentSurchargeRub(baseRub: number, percent: number): number {
  if (!Number.isFinite(baseRub) || baseRub <= 0) return 0
  if (!Number.isInteger(percent) || percent <= 0) return 0
  return Math.round((baseRub * Math.min(percent, MAX_PAYMENT_SURCHARGE_PERCENT)) / 100)
}
```

`shared/package.json` → в `exports` после `"./types/promo"`:

```json
    "./types/payment": "./src/types/payment.ts",
```

`shared/src/types/order.ts`:

```ts
// :15 — добавить значение и строку в комментарий над типом:
//   cloudpayments — платёжная ссылка CloudPayments (Visa / Mastercard банков стран ЕАЭС).
export type PaymentProvider = 'manual' | 'tbank' | 'ycp' | 'yandex_pay' | 'cloudpayments'

// :21
export type CheckoutPaymentMethod = 'tbank' | 'yandex_pay' | 'yandex_split' | 'cloudpayments'

// рядом с PublicYandexPay (:24-28)
/** CloudPayments для витрины: null в публичных настройках — способ недоступен. */
export interface PublicCloudPayments {
  /** Надбавка за способ оплаты, целые проценты; 0 — без надбавки. */
  surchargePercent: number
}

// :90
by: 'tbank' | 'admin' | 'reconcile' | 'ycp' | 'yandex_pay' | 'cloudpayments'
```

В DTO заказа (`:150-168`) после `shippingRub: number` добавить:

```ts
/** Надбавка за оплату через CloudPayments; 0 — у остальных способов и при проценте 0. */
paymentSurchargeRub: number
```

и поправить комментарий формулы итога на `totalRub = subtotalRub − discountRub − promoDiscountRub + shippingRub + paymentSurchargeRub`.

`shared/src/index.ts` — в существующий `export type { … } from './types/order.js'` добавить `PublicCloudPayments`.

- [ ] **Step 4: Тесты и типы**

Run: `npm test -w shared && npm run typecheck -w shared`
Expected: PASS.

Run: `npm run typecheck -w api; npm run typecheck -w web`
Expected: ошибки только там, где `Record<PaymentProvider, …>` / `Record<CheckoutPaymentMethod, …>` и DTO заказа без `paymentSurchargeRub` — их закрывают Tasks 2, 8, 9, 10. Список ошибок сохранить в описание коммита не нужно, но перечень файлов сверить с картой файлов выше; файл вне карты — добавить в соответствующую задачу.

- [ ] **Step 5: Commit**

```bash
git add shared/
git commit -m "feat(shared): способ оплаты cloudpayments и расчёт надбавки"
```

---

### Task 2: Колонки, настройки и конфигурация CloudPayments (api)

**Files:**

- Create: `api/src/migrations/1790860000000-AddCloudPayments.ts`
- Modify: `api/src/entities/Order.ts` (после `shippingRub`, `:104`)
- Modify: `api/src/entities/SiteSettings.ts:79-91`
- Create: `api/src/lib/payments/cloudpayments/config.ts`
- Create: `api/src/lib/payments/cloudpayments/config.test.ts`
- Modify: `api/src/routes/admin/settings.ts:36-37`
- Modify: `api/src/routes/public/settings.ts:41`
- Test: `api/src/routes/settings.test.ts`

**Interfaces:**

- Consumes: `MAX_PAYMENT_SURCHARGE_PERCENT` (Task 1), `PublicCloudPayments` (Task 1).
- Produces:
  - `Order.paymentSurchargeRub: number` (колонка `payment_surcharge_rub`).
  - `SiteSettings.cloudpaymentsEnabled: boolean`, `cloudpaymentsMode: 'test' | 'live'`, `cloudpaymentsSurchargePercent: number`.
  - `type CloudPaymentsMode = 'test' | 'live'`; `CLOUDPAYMENTS_API_URL = 'https://api.cloudpayments.ru'`.
  - `interface CloudPaymentsConfig { publicId: string; apiSecret: string; mode: CloudPaymentsMode; enabled: boolean; surchargePercent: number }`.
  - `hasCloudPaymentsKeys(env?): boolean`, `cloudPaymentsConfigFrom(settings, env?): CloudPaymentsConfig | null`, `getCloudPaymentsConfig(env?): Promise<CloudPaymentsConfig | null>`, `isCloudPaymentsCheckoutAvailable(cfg, env?): cfg is CloudPaymentsConfig`, `acceptsTestPayments(env?): boolean`, `publicCloudPayments(cfg, env?): PublicCloudPayments | null`.
  - `GET /api/public/settings` → `data.cloudPayments: { surchargePercent } | null`.

- [ ] **Step 1: Падающий тест конфигурации**

`api/src/lib/payments/cloudpayments/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  acceptsTestPayments,
  cloudPaymentsConfigFrom,
  hasCloudPaymentsKeys,
  isCloudPaymentsCheckoutAvailable,
  publicCloudPayments,
} from './config.js'

const KEYS = { CLOUDPAYMENTS_PUBLIC_ID: 'pk_test', CLOUDPAYMENTS_API_SECRET: 'secret_test' }
const settings = (over: Partial<Record<string, unknown>> = {}) => ({
  cloudpaymentsEnabled: true,
  cloudpaymentsMode: 'live',
  cloudpaymentsSurchargePercent: 8,
  ...over,
})

describe('cloudpayments config', () => {
  it('без обоих ключей конфигурации нет', () => {
    expect(hasCloudPaymentsKeys({ CLOUDPAYMENTS_PUBLIC_ID: 'pk' })).toBe(false)
    expect(cloudPaymentsConfigFrom(settings(), { CLOUDPAYMENTS_API_SECRET: 's' })).toBeNull()
  })

  it('ключи обрезаются, режим и процент — из настроек', () => {
    const cfg = cloudPaymentsConfigFrom(settings(), {
      CLOUDPAYMENTS_PUBLIC_ID: ' pk_test ',
      CLOUDPAYMENTS_API_SECRET: ' secret_test ',
    })
    expect(cfg).toEqual({
      publicId: 'pk_test',
      apiSecret: 'secret_test',
      mode: 'live',
      enabled: true,
      surchargePercent: 8,
    })
  })

  it('неизвестный режим — test; процент вне 0…15 или дробный — 0 или потолок', () => {
    expect(cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'prod' }), KEYS)?.mode).toBe(
      'test',
    )
    expect(
      cloudPaymentsConfigFrom(settings({ cloudpaymentsSurchargePercent: -1 }), KEYS)
        ?.surchargePercent,
    ).toBe(0)
    expect(
      cloudPaymentsConfigFrom(settings({ cloudpaymentsSurchargePercent: 7.5 }), KEYS)
        ?.surchargePercent,
    ).toBe(0)
    expect(
      cloudPaymentsConfigFrom(settings({ cloudpaymentsSurchargePercent: 40 }), KEYS)
        ?.surchargePercent,
    ).toBe(15)
  })

  it('чекаут: нужен рубильник; test-режим — только вне production', () => {
    const live = cloudPaymentsConfigFrom(settings(), KEYS)
    const test = cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'test' }), KEYS)
    const off = cloudPaymentsConfigFrom(settings({ cloudpaymentsEnabled: false }), KEYS)
    const prod = { NODE_ENV: 'production' }
    expect(isCloudPaymentsCheckoutAvailable(live, prod)).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(test, prod)).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(test, { NODE_ENV: 'test' })).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(off, prod)).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(null, prod)).toBe(false)
  })

  it('тестовые платежи не принимаются на production', () => {
    expect(acceptsTestPayments({ NODE_ENV: 'production' })).toBe(false)
    expect(acceptsTestPayments({ NODE_ENV: 'development' })).toBe(true)
  })

  it('публичное значение: только процент, null — если недоступен', () => {
    const prod = { NODE_ENV: 'production' }
    expect(publicCloudPayments(cloudPaymentsConfigFrom(settings(), KEYS), prod)).toEqual({
      surchargePercent: 8,
    })
    expect(
      publicCloudPayments(
        cloudPaymentsConfigFrom(settings({ cloudpaymentsEnabled: false }), KEYS),
        prod,
      ),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- cloudpayments/config`
Expected: FAIL — модуль `./config.js` не найден.

- [ ] **Step 3: Миграция и колонки**

`api/src/migrations/1790860000000-AddCloudPayments.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// CloudPayments (docs/superpowers/plans/2026-10-27-cloudpayments-integration.md):
// payment_surcharge_rub — надбавка за оплату через CloudPayments, входит в total_rub;
// у старых заказов и остальных способов 0. В настройках — рубильник, режим и процент
// надбавки; ключи живут только в env.
// IF NOT EXISTS: колонки можно добавить на проде заранее, повторный запуск не упадёт.
export class AddCloudPayments1790860000000 implements MigrationInterface {
  name = 'AddCloudPayments1790860000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_surcharge_rub" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "cloudpayments_enabled" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "cloudpayments_mode" varchar(16) NOT NULL DEFAULT 'test'`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "cloudpayments_surcharge_percent" integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "cloudpayments_surcharge_percent"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "cloudpayments_mode"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "cloudpayments_enabled"`,
    )
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_surcharge_rub"`)
  }
}
```

`api/src/entities/Order.ts` — после `shippingRub`:

```ts
  // Надбавка за оплату через CloudPayments; уже входит в total_rub.
  @Column({ type: 'integer', name: 'payment_surcharge_rub', default: 0 })
  paymentSurchargeRub!: number
```

`api/src/entities/SiteSettings.ts` — после `yandexPayMode`:

```ts
  // CloudPayments: ключи — в env (CLOUDPAYMENTS_PUBLIC_ID, CLOUDPAYMENTS_API_SECRET),
  // здесь рубильник, режим и надбавка за способ оплаты в целых процентах.
  @Column({ type: 'boolean', name: 'cloudpayments_enabled', default: false })
  cloudpaymentsEnabled!: boolean

  @Column({ type: 'varchar', length: 16, name: 'cloudpayments_mode', default: 'test' })
  cloudpaymentsMode!: 'test' | 'live'

  @Column({ type: 'integer', name: 'cloudpayments_surcharge_percent', default: 0 })
  cloudpaymentsSurchargePercent!: number
```

- [ ] **Step 4: Конфигурация**

`api/src/lib/payments/cloudpayments/config.ts`:

```ts
import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { MAX_PAYMENT_SURCHARGE_PERCENT } from '@ximi4ka-shop/shared/types/payment'
import { getSettings } from '../../settings.js'

// CloudPayments: ключи — в env (CLOUDPAYMENTS_PUBLIC_ID — логин, CLOUDPAYMENTS_API_SECRET —
// пароль Basic-авторизации и ключ HMAC вебхуков), рубильник, режим и процент надбавки —
// в админке. Вебхук и сверка работают, пока заданы ключи, независимо от рубильника:
// оплату по уже выданной ссылке нужно засчитать и после выключения.

export type CloudPaymentsMode = 'test' | 'live'

export const CLOUDPAYMENTS_API_URL = 'https://api.cloudpayments.ru'

export interface CloudPaymentsConfig {
  publicId: string
  apiSecret: string
  mode: CloudPaymentsMode
  enabled: boolean
  surchargePercent: number
}

interface CloudPaymentsSettings {
  cloudpaymentsEnabled: boolean
  cloudpaymentsMode: string
  cloudpaymentsSurchargePercent: number
}

export function hasCloudPaymentsKeys(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    (env.CLOUDPAYMENTS_PUBLIC_ID ?? '').trim().length > 0 &&
    (env.CLOUDPAYMENTS_API_SECRET ?? '').trim().length > 0
  )
}

export function cloudPaymentsConfigFrom(
  settings: CloudPaymentsSettings,
  env: NodeJS.ProcessEnv = process.env,
): CloudPaymentsConfig | null {
  if (!hasCloudPaymentsKeys(env)) return null
  const percent = settings.cloudpaymentsSurchargePercent
  return {
    publicId: (env.CLOUDPAYMENTS_PUBLIC_ID ?? '').trim(),
    apiSecret: (env.CLOUDPAYMENTS_API_SECRET ?? '').trim(),
    mode: settings.cloudpaymentsMode === 'live' ? 'live' : 'test',
    enabled: settings.cloudpaymentsEnabled,
    surchargePercent:
      Number.isInteger(percent) && percent > 0
        ? Math.min(percent, MAX_PAYMENT_SURCHARGE_PERCENT)
        : 0,
  }
}

export async function getCloudPaymentsConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CloudPaymentsConfig | null> {
  return cloudPaymentsConfigFrom(await getSettings(), env)
}

// Платежи тестового терминала (TestMode=1) засчитываются только вне production.
export function acceptsTestPayments(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production'
}

// Доступен на чекауте: рубильник включён; тестовый режим — только вне production,
// чтобы покупатели на проде никогда не попали на тестовый терминал.
export function isCloudPaymentsCheckoutAvailable(
  cfg: CloudPaymentsConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): cfg is CloudPaymentsConfig {
  if (!cfg || !cfg.enabled) return false
  return cfg.mode === 'live' || acceptsTestPayments(env)
}

// Для GET /api/public/settings: null — недоступен; наружу — только процент надбавки.
export function publicCloudPayments(
  cfg: CloudPaymentsConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): PublicCloudPayments | null {
  return isCloudPaymentsCheckoutAvailable(cfg, env)
    ? { surchargePercent: cfg.surchargePercent }
    : null
}
```

- [ ] **Step 5: Настройки в админке и публичные настройки**

`api/src/routes/admin/settings.ts` — в zod-схему после `yandexPayMode` (импорт `MAX_PAYMENT_SURCHARGE_PERCENT` из `@ximi4ka-shop/shared/types/payment`):

```ts
  cloudpaymentsEnabled: z.boolean().optional(),
  cloudpaymentsMode: z.enum(['test', 'live']).optional(),
  // Надбавка за оплату через CloudPayments, целые проценты; 0 — без надбавки.
  cloudpaymentsSurchargePercent: z.number().int().min(0).max(MAX_PAYMENT_SURCHARGE_PERCENT).optional(),
```

`api/src/routes/public/settings.ts` — импорт `cloudPaymentsConfigFrom, publicCloudPayments` из `../../lib/payments/cloudpayments/config.js` и в `data` после `yandexPay`:

```ts
        // CloudPayments для блока ЕАЭС: null — недоступен; наружу — только процент надбавки.
        cloudPayments: publicCloudPayments(cloudPaymentsConfigFrom(s)),
```

Поправить комментарий над роутером: «Admin-only toggles (Yandex Pay, CloudPayments) stay out…».

- [ ] **Step 6: Тесты роутов настроек**

В `api/src/routes/settings.test.ts` добавить (по образцу соседних кейсов Яндекс Пэй в этом файле; хелперы входа админа — `loginAsAdmin` из `testUtils.ts`):

```ts
it('CloudPayments: админ сохраняет рубильник, режим и процент; процент вне 0…15 — 400', async () => {
  const ok = await adminPut({
    cloudpaymentsEnabled: true,
    cloudpaymentsMode: 'live',
    cloudpaymentsSurchargePercent: 8,
  })
  expect(ok.status).toBe(200)
  const bad = await adminPut({ cloudpaymentsSurchargePercent: 16 })
  expect(bad.status).toBe(400)
  const frac = await adminPut({ cloudpaymentsSurchargePercent: 7.5 })
  expect(frac.status).toBe(400)
})

it('публичные настройки: cloudPayments null без ключей и { surchargePercent } при включённом live', async () => {
  vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', '')
  expect((await request(app).get('/api/public/settings')).body.data.cloudPayments).toBeNull()
  vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
  vi.stubEnv('CLOUDPAYMENTS_API_SECRET', 'secret_test')
  await AppDataSource.getRepository(SiteSettings).save({
    id: 'default',
    cloudpaymentsEnabled: true,
    cloudpaymentsMode: 'live',
    cloudpaymentsSurchargePercent: 8,
  })
  const res = await request(app).get('/api/public/settings')
  expect(res.body.data.cloudPayments).toEqual({ surchargePercent: 8 })
  expect(JSON.stringify(res.body)).not.toContain('secret_test')
})
```

`adminPut` — тот же способ отправки PUT, что уже используется в файле для `yandexPayEnabled` (если хелпера нет — завести локально через `loginAsAdmin` + `.set(adminHeaders)`). В `afterEach` вернуть настройки CloudPayments к значениям по умолчанию и `vi.unstubAllEnvs()`.

- [ ] **Step 7: Прогон**

Run: `npm test -w api -- cloudpayments/config settings`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/migrations/1790860000000-AddCloudPayments.ts api/src/entities api/src/lib/payments/cloudpayments api/src/routes/admin/settings.ts api/src/routes/public/settings.ts api/src/routes/settings.test.ts
git commit -m "feat(api): настройки и конфигурация CloudPayments, колонка надбавки"
```

---

### Task 3: Подпись и разбор уведомлений CloudPayments

**Files:**

- Create: `api/src/lib/payments/cloudpayments/webhook.ts`
- Create: `api/src/lib/payments/cloudpayments/webhook.test.ts`

**Interfaces:**

- Produces:
  - `type CloudPaymentsNotification = Record<string, string>`
  - `verifyCloudPaymentsSignature(rawBody: Buffer, headers: IncomingHttpHeaders, apiSecret: string): boolean`
  - `parseCloudPaymentsBody(rawBody: Buffer, contentType: string | undefined): CloudPaymentsNotification | null`
  - `amountKopecks(value: string | undefined): number | null`
  - `isTestModeNotification(n: CloudPaymentsNotification): boolean`

- [ ] **Step 1: Падающий тест**

`api/src/lib/payments/cloudpayments/webhook.test.ts`:

```ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  amountKopecks,
  isTestModeNotification,
  parseCloudPaymentsBody,
  verifyCloudPaymentsSignature,
} from './webhook.js'

const SECRET = 'test-api-secret-not-real'
const sign = (data: string | Buffer, secret = SECRET) =>
  createHmac('sha256', secret).update(data).digest('base64')

const raw =
  'TransactionId=123&Amount=2916.00&InvoiceId=XM-2026-00001&Name=%D0%98%D0%B2%D0%B0%D0%BD+%D0%98'

describe('verifyCloudPaymentsSignature', () => {
  it('Content-HMAC от тела как есть — верно', () => {
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'content-hmac': sign(raw) }, SECRET),
    ).toBe(true)
  })

  it('X-Content-HMAC от раскодированного тела — верно', () => {
    const decoded = decodeURIComponent(raw.replace(/\+/g, ' '))
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'x-content-hmac': sign(decoded) }, SECRET),
    ).toBe(true)
  })

  it('изменённое тело, чужой ключ, пустой ключ, нет заголовков — неверно', () => {
    const tampered = raw.replace('2916.00', '1.00')
    expect(
      verifyCloudPaymentsSignature(Buffer.from(tampered), { 'content-hmac': sign(raw) }, SECRET),
    ).toBe(false)
    expect(
      verifyCloudPaymentsSignature(
        Buffer.from(raw),
        { 'content-hmac': sign(raw, 'other') },
        SECRET,
      ),
    ).toBe(false)
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'content-hmac': sign(raw, '') }, ''),
    ).toBe(false)
    expect(verifyCloudPaymentsSignature(Buffer.from(raw), {}, SECRET)).toBe(false)
  })

  it('мусор вместо base64 и битая %-последовательность не роняют проверку', () => {
    expect(verifyCloudPaymentsSignature(Buffer.from(raw), { 'content-hmac': '###' }, SECRET)).toBe(
      false,
    )
    expect(
      verifyCloudPaymentsSignature(Buffer.from('a=%E0%A4%A'), { 'x-content-hmac': 'AAAA' }, SECRET),
    ).toBe(false)
  })
})

describe('parseCloudPaymentsBody', () => {
  it('form-urlencoded', () => {
    expect(
      parseCloudPaymentsBody(Buffer.from(raw), 'application/x-www-form-urlencoded'),
    ).toMatchObject({
      TransactionId: '123',
      Amount: '2916.00',
      Name: 'Иван И',
    })
  })

  it('JSON: числа и булевы — строками, объекты — JSON-строкой', () => {
    const body = JSON.stringify({
      TransactionId: 123,
      Amount: 2916,
      TestMode: true,
      Data: { a: 1 },
      Email: null,
    })
    expect(parseCloudPaymentsBody(Buffer.from(body), 'application/json; charset=utf-8')).toEqual({
      TransactionId: '123',
      Amount: '2916',
      TestMode: 'true',
      Data: '{"a":1}',
      Email: '',
    })
  })

  it('битый JSON и не-объект — null', () => {
    expect(parseCloudPaymentsBody(Buffer.from('{'), 'application/json')).toBeNull()
    expect(parseCloudPaymentsBody(Buffer.from('[1]'), 'application/json')).toBeNull()
  })
})

describe('amountKopecks', () => {
  it('рубли с точкой в копейки без float', () => {
    expect(amountKopecks('2916.00')).toBe(291600)
    expect(amountKopecks('2916')).toBe(291600)
    expect(amountKopecks('0.1')).toBe(10)
    expect(amountKopecks(' 19.99 ')).toBe(1999)
  })

  it('запятая, минус, три знака, пусто — null', () => {
    for (const v of ['2916,00', '-1', '1.001', '', undefined, 'abc'])
      expect(amountKopecks(v)).toBeNull()
  })
})

describe('isTestModeNotification', () => {
  it('1 и true — тест, остальное — нет', () => {
    expect(isTestModeNotification({ TestMode: '1' })).toBe(true)
    expect(isTestModeNotification({ TestMode: 'true' })).toBe(true)
    expect(isTestModeNotification({ TestMode: '0' })).toBe(false)
    expect(isTestModeNotification({})).toBe(false)
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- cloudpayments/webhook`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`api/src/lib/payments/cloudpayments/webhook.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

// Уведомления CloudPayments (developers.cloudpayments.ru, «Уведомления» и «Проверка
// уведомлений»). Тело — form-urlencoded (в кабинете можно включить JSON), подпись —
// HMAC-SHA256 ключом API Secret в base64: Content-HMAC — от тела как пришло,
// X-Content-HMAC — от раскодированного. Проверяем по сырым байтам, сравнение — за
// постоянное время.

export type CloudPaymentsNotification = Record<string, string>

function digest(secret: string, data: Buffer | string): Buffer {
  return createHmac('sha256', secret).update(data).digest()
}

function header(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function matches(expected: Buffer, headerValue: string | null): boolean {
  if (!headerValue) return false
  const got = Buffer.from(headerValue, 'base64')
  return got.length === expected.length && timingSafeEqual(got, expected)
}

function decodeForm(text: string): string | null {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return null
  }
}

export function verifyCloudPaymentsSignature(
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
  apiSecret: string,
): boolean {
  if (!apiSecret) return false
  if (matches(digest(apiSecret, rawBody), header(headers['content-hmac']))) return true
  const decoded = decodeForm(rawBody.toString('utf8'))
  return decoded !== null && matches(digest(apiSecret, decoded), header(headers['x-content-hmac']))
}

export function parseCloudPaymentsBody(
  rawBody: Buffer,
  contentType: string | undefined,
): CloudPaymentsNotification | null {
  const text = rawBody.toString('utf8')
  if (!(contentType ?? '').toLowerCase().includes('application/json')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
      key,
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
    ]),
  )
}

// «2916.00» → 291600. Сумму сверяем с заказом целыми копейками, без float.
export function amountKopecks(value: string | undefined): number | null {
  const text = (value ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [rub, kop = ''] = text.split('.')
  return Number(rub) * 100 + Number(kop.padEnd(2, '0'))
}

export function isTestModeNotification(n: CloudPaymentsNotification): boolean {
  return n.TestMode === '1' || n.TestMode === 'true'
}
```

- [ ] **Step 4: Прогон**

Run: `npm test -w api -- cloudpayments/webhook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/payments/cloudpayments/webhook.ts api/src/lib/payments/cloudpayments/webhook.test.ts
git commit -m "feat(api): проверка подписи и разбор уведомлений CloudPayments"
```

---

### Task 4: Клиент API CloudPayments

**Files:**

- Create: `api/src/lib/payments/logText.ts` (перенос `clip`, `errMessage`, `MAX_LOG_TEXT` из `yandexPay/client.ts:20,51-71` без изменений)
- Modify: `api/src/lib/payments/yandexPay/client.ts` (импорт `clip`, `errMessage` из `../logText.js`, удалить локальные копии)
- Create: `api/src/lib/payments/cloudpayments/client.ts`
- Create: `api/src/lib/payments/cloudpayments/client.test.ts`

**Interfaces:**

- Consumes: `CloudPaymentsConfig`, `getCloudPaymentsConfig`, `acceptsTestPayments`, `CLOUDPAYMENTS_API_URL` (Task 2); `Fetch` из `../tbank.js`; `CreatePaymentResult`, `PaymentStatus` из `../types.js`.
- Produces:
  - `export function clip(value: unknown, secrets?: Array<string | null | undefined>): string`, `export function errMessage(err: unknown, secrets: Array<string | null | undefined>): string` из `api/src/lib/payments/logText.ts`.
  - `CLOUDPAYMENTS_REQUEST_TIMEOUT_MS = 15_000`
  - `interface CloudPaymentsClientDeps { config?: CloudPaymentsConfig | null; fetch?: Fetch; env?: NodeJS.ProcessEnv }`
  - `createCloudPaymentsOrder(order: Order, deps?): Promise<CreatePaymentResult | null>` — `externalId` = `Model.Id`, `paymentUrl` = `Model.Url`.
  - `getCloudPaymentsStatus(order: Order, deps?): Promise<PaymentStatus | 'unknown'>`.

- [ ] **Step 1: Перенести `clip`/`errMessage` и убедиться, что тесты Яндекса зелёные**

Создать `api/src/lib/payments/logText.ts`, перенеся код дословно, с комментарием-шапкой «Чужой текст в лог: наши значения вычёркиваем…» (как в исходнике), функции — с `export`. В `yandexPay/client.ts` заменить локальные определения импортом.

Run: `npm test -w api -- yandexPay`
Expected: PASS (поведение не изменилось).

- [ ] **Step 2: Падающий тест клиента**

`api/src/lib/payments/cloudpayments/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { Order } from '../../../entities/Order.js'
import type { CloudPaymentsConfig } from './config.js'
import { createCloudPaymentsOrder, getCloudPaymentsStatus } from './client.js'

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

const config: CloudPaymentsConfig = {
  publicId: 'pk_test',
  apiSecret: 'secret_test',
  mode: 'live',
  enabled: true,
  surchargePercent: 8,
}
const env = { WEB_ORIGIN: 'https://ximi4ka.ru/', NODE_ENV: 'production' }

const order = (over: Partial<Order> = {}) =>
  ({
    orderNumber: 'XM-2026-00042',
    publicToken: 'tok en/1',
    customerEmail: 'ales@example.com',
    totalRub: 2916,
    ...over,
  }) as Order

const reply = (body: unknown, status = 200) =>
  vi.fn<FetchFn>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )

describe('createCloudPaymentsOrder', () => {
  it('создаёт ссылку: Basic-авторизация, сумма, номер заказа, возвраты на страницу заказа', async () => {
    const fetch = reply({
      Success: true,
      Model: { Id: 'gASGZ', Url: 'https://orders.cloudpayments.ru/d/gASGZ' },
    })
    const res = await createCloudPaymentsOrder(order(), { config, fetch, env })
    expect(res).toEqual({
      externalId: 'gASGZ',
      paymentUrl: 'https://orders.cloudpayments.ru/d/gASGZ',
    })

    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://api.cloudpayments.ru/orders/create')
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('pk_test:secret_test').toString('base64')}`,
    )
    expect(headers['X-Request-ID']).toBe('order-XM-2026-00042')
    expect(JSON.parse(String(init!.body))).toEqual({
      Amount: 2916,
      Currency: 'RUB',
      Description: 'Заказ XM-2026-00042 на ximi4ka.ru',
      InvoiceId: 'XM-2026-00042',
      Email: 'ales@example.com',
      RequireConfirmation: false,
      SendEmail: false,
      CultureName: 'ru-RU',
      SuccessRedirectUrl: 'https://ximi4ka.ru/order/XM-2026-00042?new=1#t=tok%20en%2F1',
      FailRedirectUrl: 'https://ximi4ka.ru/order/XM-2026-00042?payment=failed#t=tok%20en%2F1',
    })
  })

  it('без email — без поля Email', async () => {
    const fetch = reply({
      Success: true,
      Model: { Id: 'x', Url: 'https://orders.cloudpayments.ru/d/x' },
    })
    await createCloudPaymentsOrder(order({ customerEmail: '' }), { config, fetch, env })
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).not.toHaveProperty('Email')
  })

  it('отказ, не-https ссылка, сеть, нет ключей, нет WEB_ORIGIN — null и лог без секретов', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await createCloudPaymentsOrder(order(), {
        config,
        fetch: reply({ Success: false, Message: 'secret_test bad' }),
        env,
      }),
    ).toBeNull()
    expect(
      await createCloudPaymentsOrder(order(), {
        config,
        fetch: reply({ Success: true, Model: { Id: 'x', Url: 'http://evil' } }),
        env,
      }),
    ).toBeNull()
    expect(
      await createCloudPaymentsOrder(order(), { config, fetch: reply({}, 401), env }),
    ).toBeNull()
    const down = vi.fn<FetchFn>(async () => {
      throw new Error('fetch failed')
    })
    expect(await createCloudPaymentsOrder(order(), { config, fetch: down, env })).toBeNull()
    expect(await createCloudPaymentsOrder(order(), { config: null, fetch: down, env })).toBeNull()
    expect(await createCloudPaymentsOrder(order(), { config, fetch: down, env: {} })).toBeNull()
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).not.toContain('secret_test')
    expect(logged).not.toContain('ales@example.com')
    log.mockRestore()
  })
})

describe('getCloudPaymentsStatus', () => {
  const found = (model: Record<string, unknown>, success = true) =>
    reply({
      Success: success,
      Message: null,
      Model: { InvoiceId: 'XM-2026-00042', Currency: 'RUB', TestMode: false, ...model },
    })

  it('Completed с верной суммой — paid; запрос по InvoiceId', async () => {
    const fetch = found({ Status: 'Completed', Amount: 2916 })
    expect(await getCloudPaymentsStatus(order(), { config, fetch, env })).toBe('paid')
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://api.cloudpayments.ru/payments/find')
    expect(JSON.parse(String(init!.body))).toEqual({ InvoiceId: 'XM-2026-00042' })
  })

  it('Completed с другой суммой, валютой или тестовый на проде — unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 1 }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, Currency: 'USD' }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, TestMode: true }),
        env,
      }),
    ).toBe('unknown')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Completed', Amount: 2916, TestMode: true }),
        env: { NODE_ENV: 'test' },
      }),
    ).toBe('paid')
    vi.restoreAllMocks()
  })

  it('Declined / Authorized / Not found — pending (ссылка жива, покупатель может повторить)', async () => {
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Declined', Amount: 2916 }, false),
        env,
      }),
    ).toBe('pending')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: found({ Status: 'Authorized', Amount: 2916 }),
        env,
      }),
    ).toBe('pending')
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: reply({ Success: false, Message: 'Not found' }),
        env,
      }),
    ).toBe('pending')
  })

  it('HTTP-ошибка, сеть, нет ключей — unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getCloudPaymentsStatus(order(), { config, fetch: reply({}, 500), env })).toBe(
      'unknown',
    )
    expect(
      await getCloudPaymentsStatus(order(), {
        config,
        fetch: vi.fn<FetchFn>(async () => {
          throw new Error('x')
        }),
        env,
      }),
    ).toBe('unknown')
    expect(await getCloudPaymentsStatus(order(), { config: null, env })).toBe('unknown')
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 3: Убедиться, что падает**

Run: `npm test -w api -- cloudpayments/client`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Реализация**

`api/src/lib/payments/cloudpayments/client.ts`:

```ts
import type { Order } from '../../../entities/Order.js'
import { clip, errMessage } from '../logText.js'
import type { Fetch } from '../tbank.js'
import type { CreatePaymentResult, PaymentStatus } from '../types.js'
import {
  acceptsTestPayments,
  CLOUDPAYMENTS_API_URL,
  getCloudPaymentsConfig,
  type CloudPaymentsConfig,
} from './config.js'

// CloudPayments API (developers.cloudpayments.ru): заказ на оплату создаёт сервер
// (POST /orders/create), покупатель уходит на одноразовую ссылку Model.Url. Наш номер
// заказа — InvoiceId: по нему сверка ищет платёж и вебхук находит заказ. Чек 54-ФЗ
// пока не передаём (решение B4 в плане 2026-10-27) — боевой режим без него не включаем.

// Чекаут ждёт ответ — запрос не должен висеть.
export const CLOUDPAYMENTS_REQUEST_TIMEOUT_MS = 15_000

export interface CloudPaymentsClientDeps {
  /** Подмена конфигурации; не задана — getCloudPaymentsConfig() (env + настройки сайта). */
  config?: CloudPaymentsConfig | null
  fetch?: Fetch
  env?: NodeJS.ProcessEnv
}

interface CloudPaymentsResponse {
  Success?: boolean
  Message?: string | null
  Model?: {
    Id?: string
    Url?: string
    Status?: string
    Amount?: number
    Currency?: string
    TestMode?: boolean
  } | null
}

async function resolveConfig(deps: CloudPaymentsClientDeps): Promise<CloudPaymentsConfig | null> {
  return deps.config !== undefined ? deps.config : getCloudPaymentsConfig(deps.env ?? process.env)
}

async function call(
  cfg: CloudPaymentsConfig,
  deps: CloudPaymentsClientDeps,
  path: string,
  body: unknown,
  requestId?: string,
): Promise<{ httpStatus: number; ok: boolean; body: CloudPaymentsResponse }> {
  const doFetch: Fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const auth = Buffer.from(`${cfg.publicId}:${cfg.apiSecret}`).toString('base64')
  const res = await doFetch(`${CLOUDPAYMENTS_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      // Повтор с тем же X-Request-ID в течение часа вернёт тот же результат.
      ...(requestId ? { 'X-Request-ID': requestId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CLOUDPAYMENTS_REQUEST_TIMEOUT_MS),
  })
  const parsed = (await res.json().catch(() => null)) as CloudPaymentsResponse | null
  return { httpStatus: res.status, ok: res.ok, body: parsed ?? {} }
}

// Любой сбой — null с записью в лог: заказ остаётся pending без ссылки и уходит
// менеджеру, как при отказе Т-Кассы и Яндекса.
export async function createCloudPaymentsOrder(
  order: Order,
  deps: CloudPaymentsClientDeps = {},
): Promise<CreatePaymentResult | null> {
  const env = deps.env ?? process.env
  const cfg = await resolveConfig(deps)
  if (!cfg) {
    console.error(
      'cloudpayments: CLOUDPAYMENTS_PUBLIC_ID / CLOUDPAYMENTS_API_SECRET не заданы — ссылка не создана',
    )
    return null
  }
  const origin = (env.WEB_ORIGIN ?? '').replace(/\/+$/, '')
  if (!origin) {
    console.error(
      'cloudpayments: WEB_ORIGIN не задан — некуда вернуть покупателя, ссылка не создана',
    )
    return null
  }

  const page = `${origin}/order/${encodeURIComponent(order.orderNumber)}`
  // Секрет — во фрагменте (#t=): браузер не шлёт его ни серверу, ни счётчикам.
  const t = encodeURIComponent(order.publicToken)
  const payload = {
    Amount: order.totalRub,
    Currency: 'RUB',
    Description: `Заказ ${order.orderNumber} на ximi4ka.ru`,
    InvoiceId: order.orderNumber,
    ...(order.customerEmail ? { Email: order.customerEmail } : {}),
    RequireConfirmation: false,
    SendEmail: false,
    CultureName: 'ru-RU',
    SuccessRedirectUrl: `${page}?new=1#t=${t}`,
    FailRedirectUrl: `${page}?payment=failed#t=${t}`,
  }
  const secrets = [order.publicToken, t, order.customerEmail, cfg.apiSecret, cfg.publicId]

  try {
    const res = await call(cfg, deps, '/orders/create', payload, `order-${order.orderNumber}`)
    const id = res.body.Model?.Id
    const url = res.body.Model?.Url
    if (
      !res.ok ||
      res.body.Success !== true ||
      typeof id !== 'string' ||
      !id ||
      typeof url !== 'string' ||
      !url.startsWith('https://')
    ) {
      console.error(
        `cloudpayments: ссылка для ${order.orderNumber} не создана: HTTP ${res.httpStatus} Success=${clip(String(res.body.Success))} Message=${clip(res.body.Message, secrets)}`,
      )
      return null
    }
    return { externalId: id, paymentUrl: url }
  } catch (err) {
    console.error(
      `cloudpayments: создание ссылки для ${order.orderNumber} не удалось: ${errMessage(err, secrets)}`,
    )
    return null
  }
}

// Сверка зависших платежей (reconcile.ts). paid — только Completed с той же суммой в
// рублях и не тестовый на проде; Declined и прочее — pending: ссылка живёт, покупатель
// может заплатить другой картой. Сбой — unknown, заказ не трогаем.
export async function getCloudPaymentsStatus(
  order: Order,
  deps: CloudPaymentsClientDeps = {},
): Promise<PaymentStatus | 'unknown'> {
  const env = deps.env ?? process.env
  const cfg = await resolveConfig(deps)
  if (!cfg) return 'unknown'
  try {
    const res = await call(cfg, deps, '/payments/find', { InvoiceId: order.orderNumber })
    if (!res.ok) {
      console.error(`cloudpayments: статус ${order.orderNumber} не получен: HTTP ${res.httpStatus}`)
      return 'unknown'
    }
    const model = res.body.Model
    if (!model || typeof model.Status !== 'string') {
      if (/not found/i.test(res.body.Message ?? '')) return 'pending'
      console.error(
        `cloudpayments: статус ${order.orderNumber} не получен: Message=${clip(res.body.Message)}`,
      )
      return 'unknown'
    }
    if (model.Status !== 'Completed') return 'pending'
    const amountOk =
      typeof model.Amount === 'number' && Math.round(model.Amount * 100) === order.totalRub * 100
    const currencyOk = (model.Currency ?? 'RUB') === 'RUB'
    const testOk = model.TestMode !== true || acceptsTestPayments(env)
    if (!amountOk || !currencyOk || !testOk) {
      console.error(
        `cloudpayments: платёж по ${order.orderNumber} не засчитан сверкой: Amount=${clip(model.Amount)} Currency=${clip(model.Currency)} TestMode=${clip(String(model.TestMode))}`,
      )
      return 'unknown'
    }
    return 'paid'
  } catch (err) {
    console.error(
      `cloudpayments: статус ${order.orderNumber} не получен: ${errMessage(err, [cfg.apiSecret, cfg.publicId])}`,
    )
    return 'unknown'
  }
}
```

- [ ] **Step 5: Прогон**

Run: `npm test -w api -- cloudpayments yandexPay`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/payments
git commit -m "feat(api): клиент CloudPayments — ссылка на оплату и поиск платежа"
```

---

### Task 5: Вебхуки check / pay / fail

**Files:**

- Create: `api/src/routes/webhooks/cloudpayments.ts`
- Create: `api/src/routes/cloudpayments-webhook.test.ts`
- Modify: `api/src/app.ts:26,79-85` (импорт и монтирование до `express.json`)
- Modify: `api/src/lib/payments/orderStatus.ts:23` (`by` включает `'cloudpayments'`)

**Interfaces:**

- Consumes: `getCloudPaymentsConfig`, `acceptsTestPayments` (Task 2); `verifyCloudPaymentsSignature`, `parseCloudPaymentsBody`, `amountKopecks`, `isTestModeNotification`, `CloudPaymentsNotification` (Task 3); `clip` (Task 4); `applyPaymentStatus`; `saveOrderWithStatusEvent` из `lib/notifications/outbox.js`.
- Produces: `POST /api/webhooks/cloudpayments/check|pay|fail` → `200 {"code": N}`; `401 {"code": 13}` при неверной подписи; `cloudPaymentsWebhookRouter`, `cloudPaymentsWebhookErrors`.

Поведение (коды Check из документации: 10 — неверный номер заказа, 12 — неверная сумма, 13 — платёж нельзя принять):

| Уведомление | Условие                                                 | Ответ / действие                                                                                                                              |
| ----------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| любое       | нет ключей, нет тела, неверная подпись                  | 401 `{code:13}`                                                                                                                               |
| любое       | тело не разбирается                                     | 400 `{code:13}`                                                                                                                               |
| check       | заказ не найден / провайдер не `cloudpayments`          | `{code:10}`                                                                                                                                   |
| check       | валюта не RUB / сумма ≠ `totalRub`                      | `{code:12}`                                                                                                                                   |
| check       | `TestMode=1` при `NODE_ENV=production`                  | `{code:13}`                                                                                                                                   |
| check       | статус заказа не `pending` (оплачен, отменён, отгружен) | `{code:13}`                                                                                                                                   |
| check       | иначе                                                   | `{code:0}`                                                                                                                                    |
| pay         | любое несоответствие из строк check (кроме статуса)     | лог, заказ не меняется, `{code:0}` (повторы бессмысленны)                                                                                     |
| pay         | `Status` ≠ `Completed`                                  | лог, `{code:0}`                                                                                                                               |
| pay         | иначе                                                   | `applyPaymentStatus(order,'paid','cloudpayments')`; при изменении — `paymentIntentId = TransactionId`, `saveOrderWithStatusEvent`; `{code:0}` |
| fail        | всегда                                                  | лог с `ReasonCode`/`Reason`, заказ не меняется, `{code:0}`                                                                                    |

- [ ] **Step 1: Падающий тест роута**

`api/src/routes/cloudpayments-webhook.test.ts`:

```ts
import 'reflect-metadata'
import { createHmac } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { createApp } from '../app.js'

const SECRET = 'test-api-secret-not-real'
const BASE = '/api/webhooks/cloudpayments'

let app: ReturnType<typeof createApp>
let seq = 0

async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-8${String(seq).padStart(4, '0')}`,
      status: 'pending',
      customerName: 'Алесь Новик',
      customerPhone: '+375291234567',
      customerEmail: 'ales@example.com',
      deliveryAddress: { address: 'Минск, ул. Ленина, 5', comment: null },
      deliveryMethod: 'cdek_manual_cis',
      subtotalRub: 2000,
      shippingRub: 700,
      paymentSurchargeRub: 216,
      totalRub: 2916,
      paymentProvider: 'cloudpayments',
      paymentIntentId: 'gASGZ',
      statusHistory: [],
      ...overrides,
    }),
  )
}

const fields = (order: Order, extra: Record<string, string> = {}) => ({
  TransactionId: '504',
  Amount: `${order.totalRub}.00`,
  Currency: 'RUB',
  InvoiceId: order.orderNumber,
  TestMode: '0',
  Status: 'Completed',
  OperationType: 'Payment',
  ...extra,
})

function post(
  kind: string,
  data: Record<string, string>,
  opts: { secret?: string; signed?: boolean } = {},
) {
  const raw = new URLSearchParams(data).toString()
  const req = request(app)
    .post(`${BASE}/${kind}`)
    .set('Content-Type', 'application/x-www-form-urlencoded')
  if (opts.signed !== false) {
    req.set(
      'Content-HMAC',
      createHmac('sha256', opts.secret ?? SECRET)
        .update(raw)
        .digest('base64'),
    )
  }
  return req.send(raw)
}

const reload = (o: Order) => AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })
const statusEvents = (o: Order) =>
  AppDataSource.getRepository(OrderNotification).countBy({ orderId: o.id })

describe('вебхуки CloudPayments', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', SECRET)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('подпись', () => {
    it('без подписи и с чужим ключом — 401, заказ не меняется', async () => {
      const o = await seedOrder()
      expect((await post('pay', fields(o), { signed: false })).status).toBe(401)
      expect((await post('pay', fields(o), { secret: 'other' })).status).toBe(401)
      expect((await reload(o)).status).toBe('pending')
    })

    it('без ключей в env — 401', async () => {
      vi.stubEnv('CLOUDPAYMENTS_API_SECRET', '')
      const o = await seedOrder()
      expect((await post('check', fields(o))).status).toBe(401)
    })
  })

  describe('check', () => {
    it('верный заказ — code 0', async () => {
      const o = await seedOrder()
      const res = await post('check', fields(o))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ code: 0 })
    })

    it('неизвестный заказ и заказ Т-Кассы — 10', async () => {
      const o = await seedOrder()
      expect((await post('check', fields(o, { InvoiceId: 'XM-NOPE' }))).body).toEqual({ code: 10 })
      const t = await seedOrder({ paymentProvider: 'tbank' })
      expect((await post('check', fields(t))).body).toEqual({ code: 10 })
    })

    it('другая сумма или валюта — 12', async () => {
      const o = await seedOrder()
      expect((await post('check', fields(o, { Amount: '2700.00' }))).body).toEqual({ code: 12 })
      expect((await post('check', fields(o, { Currency: 'USD' }))).body).toEqual({ code: 12 })
      expect((await post('check', fields(o, { Amount: 'abc' }))).body).toEqual({ code: 12 })
    })

    it('отменённый или уже оплаченный заказ — 13', async () => {
      const cancelled = await seedOrder({ status: 'cancelled' })
      expect((await post('check', fields(cancelled))).body).toEqual({ code: 13 })
      const paid = await seedOrder({ status: 'paid' })
      expect((await post('check', fields(paid))).body).toEqual({ code: 13 })
    })

    it('тестовый платёж на production — 13, вне production — 0', async () => {
      const o = await seedOrder()
      vi.stubEnv('NODE_ENV', 'production')
      expect((await post('check', fields(o, { TestMode: '1' }))).body).toEqual({ code: 13 })
      vi.stubEnv('NODE_ENV', 'test')
      expect((await post('check', fields(o, { TestMode: '1' }))).body).toEqual({ code: 0 })
    })
  })

  describe('pay', () => {
    it('оплачивает заказ: статус, история, TransactionId, событие в очереди', async () => {
      const o = await seedOrder()
      const res = await post('pay', fields(o))
      expect(res.body).toEqual({ code: 0 })
      const after = await reload(o)
      expect(after.status).toBe('paid')
      expect(after.paidAt).not.toBeNull()
      expect(after.paymentIntentId).toBe('504')
      expect(after.statusHistory.at(-1)).toMatchObject({
        from: 'pending',
        to: 'paid',
        by: 'cloudpayments',
      })
      expect(await statusEvents(o)).toBeGreaterThan(0)
    })

    it('повтор Pay — без второго события и без изменений', async () => {
      const o = await seedOrder()
      await post('pay', fields(o))
      const events = await statusEvents(o)
      const history = (await reload(o)).statusHistory.length
      const again = await post('pay', fields(o))
      expect(again.body).toEqual({ code: 0 })
      expect(await statusEvents(o)).toBe(events)
      expect((await reload(o)).statusHistory.length).toBe(history)
    })

    it('несовпавшая сумма, чужой провайдер, тест на проде, не Completed — code 0, заказ не оплачен', async () => {
      const o = await seedOrder()
      expect((await post('pay', fields(o, { Amount: '1.00' }))).body).toEqual({ code: 0 })
      const t = await seedOrder({ paymentProvider: 'tbank' })
      await post('pay', fields(t))
      vi.stubEnv('NODE_ENV', 'production')
      await post('pay', fields(o, { TestMode: '1' }))
      vi.stubEnv('NODE_ENV', 'test')
      await post('pay', fields(o, { Status: 'Authorized' }))
      expect((await reload(o)).status).toBe('pending')
      expect((await reload(t)).status).toBe('pending')
    })

    it('JSON-тело с верной подписью тоже принимается', async () => {
      const o = await seedOrder()
      const raw = JSON.stringify({
        ...fields(o),
        TransactionId: 505,
        Amount: o.totalRub,
        TestMode: false,
      })
      const res = await request(app)
        .post(`${BASE}/pay`)
        .set('Content-Type', 'application/json')
        .set('Content-HMAC', createHmac('sha256', SECRET).update(raw).digest('base64'))
        .send(raw)
      expect(res.body).toEqual({ code: 0 })
      expect((await reload(o)).status).toBe('paid')
    })
  })

  describe('fail', () => {
    it('отказ банка (5113) — заказ остаётся pending, в логе код причины', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const o = await seedOrder()
      const res = await post(
        'fail',
        fields(o, {
          Status: 'Declined',
          ReasonCode: '5113',
          Reason: 'Card issuer is not supported',
        }),
      )
      expect(res.body).toEqual({ code: 0 })
      expect((await reload(o)).status).toBe('pending')
      expect(log.mock.calls.flat().join(' ')).toContain('5113')
    })
  })

  it('неизвестный тип уведомления — 404', async () => {
    const o = await seedOrder()
    expect((await post('refund', fields(o))).status).toBe(404)
  })
})
```

Если сущность `OrderNotification` использует другое имя поля для связи с заказом, взять его из `yandex-pay-webhook.test.ts` (там есть такая же проверка).

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- cloudpayments-webhook`
Expected: FAIL — 404 на всех запросах (роут не смонтирован).

- [ ] **Step 3: Реализация роута**

`api/src/lib/payments/orderStatus.ts:23`:

```ts
  by: 'tbank' | 'yandex_pay' | 'cloudpayments' | 'reconcile',
```

`api/src/routes/webhooks/cloudpayments.ts`:

```ts
import { Router, type ErrorRequestHandler, type Request, type Response } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'
import {
  acceptsTestPayments,
  getCloudPaymentsConfig,
} from '../../lib/payments/cloudpayments/config.js'
import {
  amountKopecks,
  isTestModeNotification,
  parseCloudPaymentsBody,
  verifyCloudPaymentsSignature,
  type CloudPaymentsNotification,
} from '../../lib/payments/cloudpayments/webhook.js'
import { clip } from '../../lib/payments/logText.js'
import { applyPaymentStatus } from '../../lib/payments/orderStatus.js'

export const cloudPaymentsWebhookRouter: Router = Router()

// Уведомления CloudPayments. В кабинете (настройки сайта → уведомления, метод POST):
//   Check — https://ximi4ka.ru/api/webhooks/cloudpayments/check
//   Pay   — https://ximi4ka.ru/api/webhooks/cloudpayments/pay
//   Fail  — https://ximi4ka.ru/api/webhooks/cloudpayments/fail
// Ответ — {"code":N}. Check с ненулевым кодом отклоняет платёж до списания; Pay и Fail
// CloudPayments повторяет до 100 раз, пока не получит code 0, поэтому на них всегда
// отвечаем 0 после обработки, а несоответствия только логируем.
const CODE = { OK: 0, BAD_ORDER: 10, BAD_AMOUNT: 12, REJECT: 13 } as const

async function readNotification(
  req: Request,
  res: Response,
): Promise<CloudPaymentsNotification | null> {
  const cfg = await getCloudPaymentsConfig()
  const raw = Buffer.isBuffer(req.body) ? req.body : null
  if (!cfg || !raw || !verifyCloudPaymentsSignature(raw, req.headers, cfg.apiSecret)) {
    res.status(401).json({ code: CODE.REJECT })
    return null
  }
  const n = parseCloudPaymentsBody(raw, req.headers['content-type'])
  if (!n) {
    res.status(400).json({ code: CODE.REJECT })
    return null
  }
  return n
}

type Match = { ok: true; order: Order } | { ok: false; code: number; reason: string }

// Заказ CloudPayments с той же суммой в рублях; тестовые платежи — только вне production.
async function matchOrder(n: CloudPaymentsNotification): Promise<Match> {
  const invoiceId = n.InvoiceId ?? ''
  const order = invoiceId
    ? await AppDataSource.getRepository(Order).findOneBy({ orderNumber: invoiceId })
    : null
  if (!order || order.paymentProvider !== 'cloudpayments') {
    return {
      ok: false,
      code: CODE.BAD_ORDER,
      reason: `заказ ${clip(invoiceId)} не найден или оплачивается не через CloudPayments`,
    }
  }
  if ((n.Currency ?? '') !== 'RUB' || amountKopecks(n.Amount) !== order.totalRub * 100) {
    return {
      ok: false,
      code: CODE.BAD_AMOUNT,
      reason: `сумма ${clip(n.Amount)} ${clip(n.Currency)} не совпала с заказом ${order.orderNumber} (${order.totalRub} RUB)`,
    }
  }
  if (isTestModeNotification(n) && !acceptsTestPayments()) {
    return {
      ok: false,
      code: CODE.REJECT,
      reason: `тестовый платёж по ${order.orderNumber} на production`,
    }
  }
  return { ok: true, order }
}

cloudPaymentsWebhookRouter.post('/check', async (req, res, next) => {
  try {
    const n = await readNotification(req, res)
    if (!n) return
    const match = await matchOrder(n)
    if (!match.ok) {
      console.error(`cloudpayments check: отклонено (${match.code}): ${match.reason}`)
      res.status(200).json({ code: match.code })
      return
    }
    // Оплатить можно только ожидающий заказ: отменённый менеджером, оплаченный или
    // отгруженный по старой ссылке — отказ до списания.
    if (match.order.status !== 'pending') {
      console.error(
        `cloudpayments check: заказ ${match.order.orderNumber} в статусе ${match.order.status} — отклонено`,
      )
      res.status(200).json({ code: CODE.REJECT })
      return
    }
    res.status(200).json({ code: CODE.OK })
  } catch (err) {
    next(err)
  }
})

cloudPaymentsWebhookRouter.post('/pay', async (req, res, next) => {
  try {
    const n = await readNotification(req, res)
    if (!n) return
    const match = await matchOrder(n)
    if (!match.ok) {
      console.error(`cloudpayments pay: НЕ засчитано, проверьте вручную: ${match.reason}`)
      res.status(200).json({ code: CODE.OK })
      return
    }
    // Оплата в одну стадию (RequireConfirmation=false): деньги списаны при Completed.
    if (n.Status !== 'Completed') {
      console.error(
        `cloudpayments pay: заказ ${match.order.orderNumber}, статус ${clip(n.Status)} — не засчитано`,
      )
      res.status(200).json({ code: CODE.OK })
      return
    }
    const order = match.order
    const previousStatus = order.status
    // Повтор того же статуса — no-op внутри applyPaymentStatus (до 100 повторов Pay).
    if (applyPaymentStatus(order, 'paid', 'cloudpayments')) {
      // TransactionId нужен для возврата в кабинете CloudPayments.
      if (n.TransactionId) order.paymentIntentId = n.TransactionId
      await saveOrderWithStatusEvent(order, previousStatus)
    }
    res.status(200).json({ code: CODE.OK })
  } catch (err) {
    next(err)
  }
})

// Отказ одной попытки: ссылка остаётся рабочей, покупатель может заплатить другой
// картой, поэтому заказ не трогаем. ReasonCode 5113 — шлюз не принял карту банка не из
// России (иностранные карты не подключены у CloudPayments).
cloudPaymentsWebhookRouter.post('/fail', async (req, res, next) => {
  try {
    const n = await readNotification(req, res)
    if (!n) return
    console.error(
      `cloudpayments fail: заказ ${clip(n.InvoiceId)}, ReasonCode=${clip(n.ReasonCode)} Reason=${clip(n.Reason)} IssuerBankCountry=${clip(n.IssuerBankCountry)}`,
    )
    res.status(200).json({ code: CODE.OK })
  } catch (err) {
    next(err)
  }
})

// express.raw отклоняет тело больше лимита (entity.too.large) — отвечаем в формате
// CloudPayments, а не общим 500.
export const cloudPaymentsWebhookErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if ((err as { type?: unknown } | null)?.type === 'entity.too.large') {
    res.status(413).json({ code: CODE.REJECT })
    return
  }
  next(err)
}
```

`api/src/app.ts` — импорт рядом с `yandexPayWebhookRouter`:

```ts
import {
  cloudPaymentsWebhookErrors,
  cloudPaymentsWebhookRouter,
} from './routes/webhooks/cloudpayments.js'
```

и сразу после монтирования `/api/webhooks/yandex-pay` (до `app.use(express.json(...))`):

```ts
// CloudPayments подписывает сырое тело (HMAC) — разбираем его сами, до JSON-парсера.
app.use(
  '/api/webhooks/cloudpayments',
  express.raw({ type: '*/*', limit: '64kb' }),
  cloudPaymentsWebhookRouter,
  cloudPaymentsWebhookErrors,
)
```

- [ ] **Step 4: Прогон**

Run: `npm test -w api -- cloudpayments-webhook orderStatus yandex-pay-webhook tbank-webhook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/webhooks/cloudpayments.ts api/src/routes/cloudpayments-webhook.test.ts api/src/app.ts api/src/lib/payments/orderStatus.ts
git commit -m "feat(api): вебхуки CloudPayments check/pay/fail с проверкой подписи и суммы"
```

---

### Task 6: Чекаут — способ `cloudpayments` и надбавка

**Files:**

- Modify: `api/src/routes/checkout.schemas.ts:124`
- Modify: `api/src/routes/checkout.ts:1-30,143-158,200-205,281,354-358`
- Create: `api/src/routes/checkout-cloudpayments.test.ts`

**Interfaces:**

- Consumes: `paymentSurchargeRub` (Task 1); `getCloudPaymentsConfig`, `isCloudPaymentsCheckoutAvailable`, `CloudPaymentsConfig` (Task 2); `createCloudPaymentsOrder` (Task 4).
- Produces: `POST /api/checkout` с `paymentMethod: 'cloudpayments'` → заказ `paymentProvider = 'cloudpayments'`, `paymentSurchargeRub`, `totalRub` с надбавкой, `paymentUrl` ссылки CloudPayments; ошибка `400 payment_method_unavailable` вне ЕАЭС или при выключенном способе.

- [ ] **Step 1: Падающий тест**

`api/src/routes/checkout-cloudpayments.test.ts` (продукт, `body`, `cisBody` — как в `checkout-yandex-pay.test.ts:20-67`; скопировать эти хелперы в новый файл):

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { Product } from '../entities/Product.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'

const tbankFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/payments/tbankTransport.js', () => ({ tbankFetch: tbankFetchMock }))

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

// seedProduct, body, cisBody — дословно из checkout-yandex-pay.test.ts:20-67

const setCloud = (over: Partial<SiteSettings> = {}) =>
  AppDataSource.getRepository(SiteSettings).save({
    id: 'default',
    cloudpaymentsEnabled: true,
    cloudpaymentsMode: 'live',
    cloudpaymentsSurchargePercent: 8,
    ...over,
  })

function stubCloud(
  response: unknown = {
    Success: true,
    Model: { Id: 'gASGZ', Url: 'https://orders.cloudpayments.ru/d/gASGZ' },
  },
) {
  const fetchMock = vi.fn<FetchFn>(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const cloudCalls = (fetchMock: ReturnType<typeof vi.fn<FetchFn>>) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes('api.cloudpayments.ru/orders/create'))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)

const findOrder = (orderNumber: string) =>
  AppDataSource.getRepository(Order).findOneByOrFail({ orderNumber })

describe('POST /api/checkout: CloudPayments', () => {
  let app: ReturnType<typeof createApp>
  const checkout = (payload: unknown) => request(app).post('/api/checkout').send(payload)

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories RESTART IDENTITY CASCADE',
    )
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', 'secret_test')
    vi.stubEnv('WEB_ORIGIN', 'https://ximi4ka.ru')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await setCloud()
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    tbankFetchMock.mockReset()
    await setCloud({
      cloudpaymentsEnabled: false,
      cloudpaymentsMode: 'test',
      cloudpaymentsSurchargePercent: 0,
    })
  })

  it('ЕАЭС + cloudpayments: надбавка 8% от товаров + доставки, ссылка CloudPayments, Т-Касса не вызывается', async () => {
    const cloud = stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://orders.cloudpayments.ru/d/gASGZ')
    const order = await findOrder(res.body.data.orderNumber)
    // BY: доставка 700 ₽ до 3000 ₽ товаров; база 2700, надбавка 216.
    expect(order.shippingRub).toBe(700)
    expect(order.paymentSurchargeRub).toBe(216)
    expect(order.totalRub).toBe(2916)
    expect(order.paymentProvider).toBe('cloudpayments')
    expect(order.paymentIntentId).toBe('gASGZ')
    expect(cloudCalls(cloud)).toEqual([
      expect.objectContaining({ Amount: 2916, InvoiceId: order.orderNumber }),
    ])
    expect(tbankFetchMock).not.toHaveBeenCalled()
  })

  it('процент 0 — без надбавки', async () => {
    await setCloud({ cloudpaymentsSurchargePercent: 0 })
    stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))
    const order = await findOrder(res.body.data.orderNumber)
    expect(order.paymentSurchargeRub).toBe(0)
    expect(order.totalRub).toBe(2700)
  })

  it('промокод уменьшает базу надбавки', async () => {
    stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(
      cisBody(p.id, { paymentMethod: 'cloudpayments', promoCode: 'RENATA2026' }),
    )
    const order = await findOrder(res.body.data.orderNumber)
    // RENATA2026 = 5%: промо 100, база 2000 − 100 + 700 = 2600, надбавка 208.
    expect(order.promoDiscountRub).toBe(100)
    expect(order.paymentSurchargeRub).toBe(208)
    expect(order.totalRub).toBe(2808)
  })

  it('Т-Банк в ЕАЭС — без надбавки при любом проценте', async () => {
    stubCloud()
    tbankFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          Success: true,
          PaymentId: '1',
          PaymentURL: 'https://securepay.tinkoff.ru/x',
        }),
      ),
    )
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'tbank' }))
    const order = await findOrder(res.body.data.orderNumber)
    expect(order.paymentSurchargeRub).toBe(0)
    expect(order.totalRub).toBe(2700)
  })

  it('доставка по России — 400 payment_method_unavailable, заказа нет', async () => {
    const cloud = stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'cloudpayments' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('payment_method_unavailable')
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
    expect(cloudCalls(cloud)).toEqual([])
  })

  it('рубильник выключен, нет ключей, тестовый режим на production — 400', async () => {
    stubCloud()
    const p = await seedProduct(2000)
    await setCloud({ cloudpaymentsEnabled: false })
    expect((await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))).status).toBe(400)
    await setCloud({ cloudpaymentsMode: 'test' })
    vi.stubEnv('NODE_ENV', 'production')
    expect((await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))).status).toBe(400)
    vi.stubEnv('NODE_ENV', 'test')
    await setCloud()
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', '')
    expect((await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))).status).toBe(400)
  })

  it('CloudPayments отказал — заказ создан pending без ссылки', async () => {
    stubCloud({ Success: false, Message: 'Invalid' })
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    const order = await findOrder(res.body.data.orderNumber)
    expect(order.status).toBe('pending')
    expect(order.paymentProvider).toBe('cloudpayments')
  })
})
```

Код ошибки в ответе — в том же поле, что проверяет `checkout-yandex-pay.test.ts` для `payment_method_unavailable`; если там другое поле (например, `res.body.code`), использовать его. Ответ мока Т-Кассы взять из того же файла (кейс `paymentMethod=tbank`), если формат отличается.

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- checkout-cloudpayments`
Expected: FAIL — 400 `validation_error` на `paymentMethod: 'cloudpayments'`.

- [ ] **Step 3: Реализация**

`api/src/routes/checkout.schemas.ts:124`:

```ts
  paymentMethod: z.enum(['tbank', 'yandex_pay', 'yandex_split', 'cloudpayments']).optional(),
```

`api/src/routes/checkout.ts` — импорты:

```ts
import { paymentSurchargeRub } from '@ximi4ka-shop/shared/types/payment'
import { createCloudPaymentsOrder } from '../lib/payments/cloudpayments/client.js'
import {
  getCloudPaymentsConfig,
  isCloudPaymentsCheckoutAvailable,
  type CloudPaymentsConfig,
} from '../lib/payments/cloudpayments/config.js'
```

После блока Яндекса (`:143-158`):

```ts
// CloudPayments — карты Visa / Mastercard банков стран ЕАЭС, только при доставке
// туда (B7). Недоступный способ — 400 без заказа. Конфигурация нужна ниже: процент
// надбавки берём из неё, клиенту не доверяем.
const cloudMethod = parsed.paymentMethod === 'cloudpayments'
let cloudConfig: CloudPaymentsConfig | null = null
if (cloudMethod) {
  if (parsed.delivery.method !== 'cdek_manual_cis') {
    throw badRequest(
      'payment_method_unavailable',
      'Оплата картой банка другой страны доступна только при доставке в страны ЕАЭС',
    )
  }
  const cfg = await getCloudPaymentsConfig()
  if (!isCloudPaymentsCheckoutAvailable(cfg)) {
    throw badRequest(
      'payment_method_unavailable',
      'Оплата картой банка другой страны сейчас недоступна',
    )
  }
  cloudConfig = cfg
}
```

Расчёт итога (`:203-204`) заменить на:

```ts
const promoRub = promo ? promoDiscountRub(subtotalRub - discountRub, promo.percent) : 0
// Надбавка за оплату через CloudPayments — от суммы к оплате без неё самой (B6);
// порог бесплатной доставки и промокод выше её не учитывают.
const baseTotalRub = subtotalRub - discountRub - promoRub + shippingRub
const surchargeRub = cloudConfig
  ? paymentSurchargeRub(baseTotalRub, cloudConfig.surchargePercent)
  : 0
const totalRub = baseTotalRub + surchargeRub
```

В `create({...})` (`:276-281`):

```ts
            shippingRub,
            paymentSurchargeRub: surchargeRub,
            totalRub,
            paymentProvider: yandexMethod ? 'yandex_pay' : cloudMethod ? 'cloudpayments' : provider.name,
```

Создание платежа (`:354-356`):

```ts
const payment = yandexMethod
  ? await createYandexOrder(order, { preferSplit: true })
  : cloudMethod
    ? await createCloudPaymentsOrder(order)
    : await provider.createPayment(order)
```

- [ ] **Step 4: Прогон**

Run: `npm test -w api -- checkout`
Expected: PASS (новые и существующие тесты чекаута).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/checkout.ts api/src/routes/checkout.schemas.ts api/src/routes/checkout-cloudpayments.test.ts
git commit -m "feat(checkout): оплата через CloudPayments для доставки в ЕАЭС, надбавка на сервере"
```

---

### Task 7: Сверка зависших платежей

**Files:**

- Modify: `api/src/lib/payments/reconcile.ts:1-8,58-62,68-73,86-91`
- Create: `api/src/lib/payments/reconcile.cloudpayments.test.ts`

**Interfaces:**

- Consumes: `getCloudPaymentsStatus` (Task 4), `hasCloudPaymentsKeys` (Task 2).
- Produces: заказы `cloudpayments` сверяются через CloudPayments, никогда — через глобальный провайдер; джоб стартует при наличии ключей CloudPayments.

- [ ] **Step 1: Падающий тест**

`api/src/lib/payments/reconcile.cloudpayments.test.ts` (структуру — сид заказа, состаривание `created_at`, фейковый провайдер — взять из `reconcile.yandex.test.ts`):

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { reconcilePendingOrders, startReconciliationJob } from './reconcile.js'
import type { PaymentProvider } from './types.js'

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

const fakeProvider = (): PaymentProvider => ({
  name: 'tbank',
  createPayment: vi.fn(),
  verifyAndParseWebhook: vi.fn(),
  getStatus: vi.fn(async () => 'paid' as const),
})

async function seedCloudOrder(over: Partial<Order> = {}, ageMinutes = 10): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  const o = await repo.save(
    repo.create({
      orderNumber: `XM-2026-9${Math.random().toString().slice(2, 6)}`,
      status: 'pending',
      customerName: 'Алесь Новик',
      customerPhone: '+375291234567',
      customerEmail: 'ales@example.com',
      deliveryAddress: { address: 'Минск', comment: null },
      deliveryMethod: 'cdek_manual_cis',
      subtotalRub: 2000,
      shippingRub: 700,
      paymentSurchargeRub: 216,
      totalRub: 2916,
      paymentProvider: 'cloudpayments',
      paymentIntentId: 'gASGZ',
      statusHistory: [],
      ...over,
    }),
  )
  await AppDataSource.query(
    `UPDATE orders SET created_at = now() - make_interval(mins => $1) WHERE id = $2`,
    [ageMinutes, o.id],
  )
  return o
}

const stubFind = (model: Record<string, unknown> | null, message: string | null = null) =>
  vi.stubGlobal(
    'fetch',
    vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            Success: model?.Status === 'Completed',
            Message: message,
            Model: model,
          }),
          { status: 200 },
        ),
    ),
  )

describe('сверка CloudPayments', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', 'secret_test')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Completed с верной суммой — paid от сверки; глобальный провайдер не спрашивается', async () => {
    const provider = fakeProvider()
    const o = await seedCloudOrder()
    stubFind({ Status: 'Completed', Amount: 2916, Currency: 'RUB', TestMode: false })
    const result = await reconcilePendingOrders(provider)
    expect(result).toEqual({ checked: 1, updated: 1 })
    const after = await AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })
    expect(after.status).toBe('paid')
    expect(after.statusHistory.at(-1)).toMatchObject({ by: 'reconcile' })
    expect(provider.getStatus).not.toHaveBeenCalled()
  })

  it('другая сумма и Not found — заказ остаётся pending', async () => {
    const o = await seedCloudOrder()
    stubFind({ Status: 'Completed', Amount: 1, Currency: 'RUB', TestMode: false })
    await reconcilePendingOrders(fakeProvider())
    stubFind(null, 'Not found')
    await reconcilePendingOrders(fakeProvider())
    expect((await AppDataSource.getRepository(Order).findOneByOrFail({ id: o.id })).status).toBe(
      'pending',
    )
  })

  it('заказы старше 8 суток не опрашиваются', async () => {
    await seedCloudOrder({}, 9 * 24 * 60)
    stubFind({ Status: 'Completed', Amount: 2916, Currency: 'RUB', TestMode: false })
    expect(await reconcilePendingOrders(fakeProvider())).toEqual({ checked: 0, updated: 0 })
  })

  it('джоб стартует при одних ключах CloudPayments', () => {
    const manual: PaymentProvider = { ...fakeProvider(), name: 'manual' }
    const timer = startReconciliationJob(manual, {
      CLOUDPAYMENTS_PUBLIC_ID: 'pk',
      CLOUDPAYMENTS_API_SECRET: 's',
    })
    expect(timer).not.toBeNull()
    if (timer) clearInterval(timer)
    expect(startReconciliationJob(manual, {})).toBeNull()
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w api -- reconcile.cloudpayments`
Expected: FAIL — `provider.getStatus` вызван, джоб без ключей Т-Кассы и Яндекса не стартует.

- [ ] **Step 3: Реализация**

`reconcile.ts` — импорты:

```ts
import { getCloudPaymentsStatus } from './cloudpayments/client.js'
import { hasCloudPaymentsKeys } from './cloudpayments/config.js'
```

Условие возраста (`:58-62`):

```ts
    // Ссылки Яндекса и CloudPayments живут ограниченно; если статус так и не пришёл,
    // старше 8 суток не опрашиваем.
    .andWhere(
      "(o.payment_provider NOT IN ('yandex_pay', 'cloudpayments') OR o.created_at > now() - make_interval(days => :maxDays))",
      { maxDays: YANDEX_RECONCILE_MAX_AGE_DAYS },
    )
```

Ветка статуса (`:68-73`):

```ts
// Яндекс и CloudPayments сверяются у себя по номеру заказа, остальные — как раньше.
const status =
  order.paymentProvider === 'yandex_pay'
    ? await getYandexOrderStatus(order.orderNumber)
    : order.paymentProvider === 'cloudpayments'
      ? await getCloudPaymentsStatus(order)
      : await provider.getStatus(order.paymentIntentId!)
```

Старт (`:86-91`):

```ts
// Т-Касса — как раньше; Яндекс и CloudPayments досверяются, пока заданы их ключи.
if (provider.name !== 'tbank' && !hasYandexPayMerchant(env) && !hasCloudPaymentsKeys(env))
  return null
```

- [ ] **Step 4: Прогон**

Run: `npm test -w api -- reconcile`
Expected: PASS (все три файла сверки).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/payments/reconcile.ts api/src/lib/payments/reconcile.cloudpayments.test.ts
git commit -m "feat(api): сверка зависших платежей CloudPayments"
```

---

### Task 8: Страница заказа, Telegram и подписи в админке

**Files:**

- Modify: `api/src/routes/public/orders.ts:62-66`
- Modify: `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx:43-50`
- Modify: `api/src/lib/notifications/format.ts:7-32,207-241`
- Modify: `web/app/admin/(authed)/orders/orderUi.ts:27-46`
- Test: `api/src/lib/notifications/format.test.ts`, тест публичного роута заказа (найти: `grep -rl "api/public/orders" api/src | grep test`), тест `OrderStatusView` (если есть рядом с компонентом — добавить кейс; если нет — проверка в Task 12 вручную)

**Interfaces:**

- Consumes: `PaymentProvider` с `'cloudpayments'` (Task 1); `Order.paymentSurchargeRub` (Task 2).
- Produces: ссылка «Оплатить» для неоплаченного заказа CloudPayments; страница заказа опрашивает статус; Telegram-карточка показывает способ и надбавку; подписи `PAYMENT_PROVIDER_LABELS.cloudpayments`, `HISTORY_ACTOR_LABELS.cloudpayments`.

- [ ] **Step 1: Падающие тесты**

В тест публичного роута заказа:

```ts
it('«Оплатить» отдаётся для неоплаченного заказа CloudPayments с секретом', async () => {
  const o = await seedOrder({
    paymentProvider: 'cloudpayments',
    paymentUrl: 'https://orders.cloudpayments.ru/d/gASGZ',
  })
  const res = await request(app)
    .get(`/api/public/orders/${o.orderNumber}`)
    .query({ t: o.publicToken })
  expect(res.body.data.paymentUrl).toBe('https://orders.cloudpayments.ru/d/gASGZ')
  const noSecret = await request(app).get(`/api/public/orders/${o.orderNumber}`)
  expect(noSecret.body.data.paymentUrl ?? null).toBeNull()
})
```

(Имя поля ответа — то, в которое роут кладёт `payLink`; посмотреть в `public/orders.ts` ниже `:66` и в существующем тесте кейс для `yandex_pay`.)

В `api/src/lib/notifications/format.test.ts` (базовый заказ — из существующих кейсов `telegramCard` в файле):

```ts
it('CloudPayments: способ оплаты и надбавка в карточке; без надбавки — без строки', () => {
  const card = telegramCard({
    ...baseOrder,
    paymentProvider: 'cloudpayments',
    paymentSurchargeRub: 216,
    totalRub: baseOrder.totalRub + 216,
  })
  expect(card).toContain('Оплата: карта банка другой страны (CloudPayments)')
  expect(card).toContain('надбавка за способ оплаты +')
  const zero = telegramCard({
    ...baseOrder,
    paymentProvider: 'cloudpayments',
    paymentSurchargeRub: 0,
  })
  expect(zero).not.toContain('надбавка')
  const tbank = telegramCard({ ...baseOrder, paymentProvider: 'tbank' })
  expect(tbank).not.toContain('CloudPayments')
})
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w api -- format orders`
Expected: FAIL — нет ссылки, нет строк в карточке.

- [ ] **Step 3: Реализация**

`api/src/routes/public/orders.ts`:

```ts
// Кнопка «Оплатить»: ссылка на форму Яндекса или CloudPayments — только с секретом
// и пока заказ не оплачен. У CloudPayments после отказа карты ссылка рабочая.
const payLink =
  withSecret &&
  order.status === 'pending' &&
  (order.paymentProvider === 'yandex_pay' || order.paymentProvider === 'cloudpayments')
    ? order.paymentUrl
    : null
```

`OrderStatusView.tsx`:

```ts
function isOnlinePayment(provider: PaymentProvider): boolean {
  return provider === 'tbank' || provider === 'yandex_pay' || provider === 'cloudpayments'
}

// Ссылка «Оплатить» — только https: api отдаёт её для неоплаченного заказа Яндекс Пэй
// или CloudPayments.
```

`api/src/lib/notifications/format.ts` — в `NotifiableOrder`:

```ts
  paymentProvider?: PaymentProvider
  /** Надбавка за оплату через CloudPayments, уже в totalRub. */
  paymentSurchargeRub?: number
```

(`import type { PaymentProvider } from '@ximi4ka-shop/shared'`.) В `telegramCard`:

```ts
if (order.paymentProvider === 'cloudpayments') {
  client.push('Оплата: карта банка другой страны (CloudPayments)')
}
```

(рядом с `Адрес:`/ИИН), и строка итогов:

```ts
const surcharge =
  (order.paymentSurchargeRub ?? 0) > 0
    ? ` · надбавка за способ оплаты +${rub(order.paymentSurchargeRub ?? 0)}`
    : ''
const totals = `${goods.join(' · ')} · ${shipping}${surcharge} · итого ${rub(order.totalRub)}`
```

Проверить место вызова `telegramCard`: если туда передаётся сущность `Order` целиком — поля придут сами; если собирается объект вручную — добавить `paymentProvider` и `paymentSurchargeRub`.

`web/app/admin/(authed)/orders/orderUi.ts`:

```ts
export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  manual: 'Вручную',
  tbank: 'Т-Касса',
  ycp: 'Яндекс',
  yandex_pay: 'Сплит (Яндекс Пэй)',
  cloudpayments: 'CloudPayments (карта банка другой страны)',
}
// …
export const HISTORY_ACTOR_LABELS: Record<string, string> = {
  // …существующие
  cloudpayments: 'CloudPayments',
}
```

- [ ] **Step 4: Прогон**

Run: `npm test -w api -- format orders && npm test -w web -- order && npm run typecheck -w web`
Expected: PASS; оставшиеся ошибки типов web — только из Tasks 9–10 (`PAYMENT_METHOD_LABELS`, `adminApi`).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/public/orders.ts api/src/lib/notifications web/app
git commit -m "feat: CloudPayments на странице заказа, в Telegram и в подписях админки"
```

---

### Task 9: Чекаут на витрине — выбор оплаты в блоке ЕАЭС

**Files:**

- Create: `web/lib/cloudPayments.ts`
- Create: `web/lib/cloudPayments.test.ts`
- Modify: `web/lib/api.ts:314-331` (`PublicSettings.cloudPayments`)
- Modify: `web/lib/yandexPay.ts:9-13` (`PAYMENT_METHOD_LABELS.cloudpayments`)
- Create: `web/components/checkout/CisPaymentMethodField.tsx`
- Create: `web/components/checkout/CisPaymentMethodField.test.tsx`
- Modify: `web/lib/orderProcess.ts:146-148` (новый текст плашки)
- Modify: `web/components/checkout/CisDelivery.tsx:43-50` (+ тест `CisDelivery.test.tsx`)
- Modify: `web/app/[locale]/(public)/checkout/page.tsx:70-113,169-183,229,556-592` (+ `page.test.tsx`)

**Interfaces:**

- Consumes: `paymentSurchargeRub` (Task 1), `PublicCloudPayments` (Task 1), `GET /api/public/settings` → `cloudPayments` (Task 2), `POST /api/checkout` с `paymentMethod: 'cloudpayments'` (Task 6).
- Produces: `loadPublicCloudPayments(): Promise<PublicCloudPayments | null>`, `resetPublicCloudPaymentsCacheForTests(): void`; `<CisPaymentMethodField value onChange surchargePercent />`; `CIS_PAYMENT_NOTE_FOREIGN_CARDS`; проп `foreignCards: boolean` у `CisDelivery`; строка сводки `data-testid="summary-payment-surcharge"`.

Тексты (утверждаются владельцем в PR):

| Где                                      | Текст                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Способ `tbank` в блоке ЕАЭС              | «Картой «Мир» или российской Visa / Mastercard»                                                                                                                                                              |
| Способ `cloudpayments`                   | «Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии»; при проценте > 0 добавляется « — +N% к заказу»                                                                                         |
| Строка сводки                            | «Надбавка за оплату картой (N%)»                                                                                                                                                                             |
| Плашка ЕАЭС при включённом CloudPayments | «Оплата: картами «Мир» и российскими Visa и Mastercard — как обычно; картами Visa и Mastercard банков Беларуси, Казахстана, Армении и Киргизии — отдельным способом, выберите его перед оформлением заказа.» |
| `PAYMENT_METHOD_LABELS.cloudpayments`    | «Visa / Mastercard банка другой страны»                                                                                                                                                                      |

- [ ] **Step 1: Падающие тесты**

`web/lib/cloudPayments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ getPublicSettings: vi.fn() }))
import { getPublicSettings } from '@/lib/api'
import { loadPublicCloudPayments, resetPublicCloudPaymentsCacheForTests } from './cloudPayments'

describe('loadPublicCloudPayments', () => {
  afterEach(() => {
    resetPublicCloudPaymentsCacheForTests()
    vi.mocked(getPublicSettings).mockReset()
  })

  it('берёт cloudPayments из публичных настроек и кеширует на сессию', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({
      cloudPayments: { surchargePercent: 8 },
    } as never)
    expect(await loadPublicCloudPayments()).toEqual({ surchargePercent: 8 })
    await loadPublicCloudPayments()
    expect(getPublicSettings).toHaveBeenCalledTimes(1)
  })

  it('нет поля или ошибка api — null', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({} as never)
    expect(await loadPublicCloudPayments()).toBeNull()
    resetPublicCloudPaymentsCacheForTests()
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('down'))
    expect(await loadPublicCloudPayments()).toBeNull()
  })
})
```

`web/components/checkout/CisPaymentMethodField.test.tsx` (стиль — как `CisDelivery.test.tsx`):

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CisPaymentMethodField } from './CisPaymentMethodField'

describe('CisPaymentMethodField', () => {
  it('два способа; при 8% — надбавка в подписи; выбор уходит в onChange', () => {
    const onChange = vi.fn()
    render(<CisPaymentMethodField value="tbank" onChange={onChange} surchargePercent={8} />)
    expect(screen.getByLabelText('Картой «Мир» или российской Visa / Mastercard')).toBeChecked()
    const foreign = screen.getByLabelText(
      'Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии — +8% к заказу',
    )
    fireEvent.click(foreign)
    expect(onChange).toHaveBeenCalledWith('cloudpayments')
  })

  it('при 0% — без упоминания надбавки, без UnionPay', () => {
    render(<CisPaymentMethodField value="cloudpayments" onChange={() => {}} surchargePercent={0} />)
    expect(
      screen.getByLabelText('Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии'),
    ).toBeChecked()
    expect(document.body.textContent).not.toMatch(/%|UnionPay/)
  })
})
```

`CisDelivery.test.tsx` — добавить:

```tsx
it('при включённом CloudPayments — плашка про карты банков ЕАЭС отдельным способом', () => {
  renderCisDelivery({ foreignCards: true })
  expect(screen.getByRole('note')).toHaveTextContent(CIS_PAYMENT_NOTE_FOREIGN_CARDS)
})
```

(`renderCisDelivery` — тот рендер, что уже используется в файле; если его нет — передать `foreignCards` прямо в существующий `render(...)`. Существующие кейсы передают `foreignCards={false}` и проверяют прежний `CIS_PAYMENT_NOTE`.)

`checkout/page.test.tsx` — добавить (мок публичных настроек и `fetch` чекаута — как в существующих кейсах Сплита в этом файле):

```tsx
it('ЕАЭС + CloudPayments 8%: строка надбавки, итог с ней, paymentMethod в запросе', async () => {
  mockPublicSettings({ yandexPay: null, cloudPayments: { surchargePercent: 8 } })
  // корзина 2000 ₽, Беларусь (доставка 700 ₽) — тем же способом, что в кейсах ЕАЭС выше
  await chooseCisBelarus()
  fireEvent.click(screen.getByLabelText(/Visa \/ Mastercard банка Беларуси/))
  expect(screen.getByTestId('summary-payment-surcharge')).toHaveTextContent('216')
  expect(screen.getByTestId('summary-total')).toHaveTextContent('2 916')
  await submitValidCisForm()
  expect(lastCheckoutBody().paymentMethod).toBe('cloudpayments')
})

it('смена региона на Россию после выбора CloudPayments — сброс на Т-Банк, без надбавки', async () => {
  mockPublicSettings({ yandexPay: null, cloudPayments: { surchargePercent: 8 } })
  await chooseCisBelarus()
  fireEvent.click(screen.getByLabelText(/Visa \/ Mastercard банка Беларуси/))
  await chooseRussia()
  expect(screen.queryByTestId('summary-payment-surcharge')).toBeNull()
  await submitValidRuForm()
  expect(lastCheckoutBody().paymentMethod).not.toBe('cloudpayments')
})

it('CloudPayments недоступен — в блоке ЕАЭС нет выбора оплаты, прежняя плашка', async () => {
  mockPublicSettings({ yandexPay: null, cloudPayments: null })
  await chooseCisBelarus()
  expect(screen.queryByLabelText(/Visa \/ Mastercard банка Беларуси/)).toBeNull()
  expect(screen.getByRole('note')).toHaveTextContent(CIS_PAYMENT_NOTE)
})
```

`mockPublicSettings`, `chooseCisBelarus`, `chooseRussia`, `submitValidCisForm`, `submitValidRuForm`, `lastCheckoutBody` — существующие хелперы `page.test.tsx`, если они там есть под другими именами; если каких-то нет — завести в файле, собрав из шагов существующих кейсов ЕАЭС и Сплита (переключатель региона, ввод полей, клик «Оформить», чтение тела последнего вызова `fetch` на `/api/checkout`).

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w web -- cloudPayments CisPaymentMethodField CisDelivery checkout`
Expected: FAIL — модули и тексты отсутствуют.

- [ ] **Step 3: Реализация**

`web/lib/api.ts` — в `PublicSettings` после `yandexPay`:

```ts
  /** CloudPayments для блока ЕАЭС: null — недоступен. */
  cloudPayments?: PublicCloudPayments | null
```

(+ `PublicCloudPayments` в импорт типов из `@ximi4ka-shop/shared`.)

`web/lib/cloudPayments.ts`:

```ts
import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { getPublicSettings } from '@/lib/api'

// CloudPayments на витрине: значение из публичных настроек с кешем на сессию (чекаут
// спрашивает api один раз). null — способ недоступен, блок выбора в ЕАЭС не рисуется.

function fetchCloudPayments(): Promise<PublicCloudPayments | null> {
  return Promise.resolve()
    .then(() => getPublicSettings())
    .then((settings) => settings?.cloudPayments ?? null)
    .catch(() => null)
}

let cached: Promise<PublicCloudPayments | null> | null = null

export function loadPublicCloudPayments(): Promise<PublicCloudPayments | null> {
  cached ??= fetchCloudPayments()
  return cached
}

export function resetPublicCloudPaymentsCacheForTests(): void {
  cached = null
}
```

`web/lib/yandexPay.ts` — в `PAYMENT_METHOD_LABELS`:

```ts
  cloudpayments: 'Visa / Mastercard банка другой страны',
```

`web/components/checkout/CisPaymentMethodField.tsx`:

```tsx
'use client'

import type { CheckoutPaymentMethod } from '@ximi4ka-shop/shared'
import { LABEL_CLASS } from '@/components/checkout/fieldStyles'

// Оплата при доставке в страны ЕАЭС: Т-Банк принимает «Мир» и российские Visa /
// Mastercard, карты банков этих стран — через CloudPayments. Подписи однозначные, чтобы
// покупатель с «Миром» не выбрал способ с надбавкой случайно. UnionPay не обещаем.
const METHODS: Array<Extract<CheckoutPaymentMethod, 'tbank' | 'cloudpayments'>> = [
  'tbank',
  'cloudpayments',
]

function label(method: (typeof METHODS)[number], surchargePercent: number): string {
  if (method === 'tbank') return 'Картой «Мир» или российской Visa / Mastercard'
  const base = 'Visa / Mastercard банка Беларуси, Казахстана, Армении или Киргизии'
  return surchargePercent > 0 ? `${base} — +${surchargePercent}% к заказу` : base
}

interface Props {
  value: CheckoutPaymentMethod
  onChange: (method: CheckoutPaymentMethod) => void
  surchargePercent: number
}

export function CisPaymentMethodField({ value, onChange, surchargePercent }: Props) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={`${LABEL_CLASS} mb-2`}>Способ оплаты</legend>
      {METHODS.map((method) => (
        <label
          key={method}
          className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]"
        >
          <input
            type="radio"
            name="checkout-payment-method"
            value={method}
            checked={value === method}
            onChange={() => onChange(method)}
            className="accent-[var(--color-lj-ink)]"
          />
          {label(method, surchargePercent)}
        </label>
      ))}
    </fieldset>
  )
}
```

`web/lib/orderProcess.ts` — после `CIS_PAYMENT_NOTE`:

```ts
/** Плашка в чекауте, когда карты банков стран ЕАЭС принимаются через CloudPayments. */
export const CIS_PAYMENT_NOTE_FOREIGN_CARDS =
  'Оплата: картами «Мир» и российскими Visa и Mastercard — как обычно; картами Visa и Mastercard банков Беларуси, Казахстана, Армении и Киргизии — отдельным способом, выберите его перед оформлением заказа.'
```

`CisDelivery.tsx` — проп `foreignCards: boolean` в `Props`, плашка:

```tsx
{
  /* Т-Касса не принимает Visa / Mastercard банков этих стран; когда включён
          CloudPayments, они оплачиваются отдельным способом (выбор над кнопкой). */
}
;<p role="note" className="…как было…">
  {foreignCards ? CIS_PAYMENT_NOTE_FOREIGN_CARDS : CIS_PAYMENT_NOTE}
</p>
```

`checkout/page.tsx`:

1. Импорты: `paymentSurchargeRub` из `@ximi4ka-shop/shared/types/payment`, `PublicCloudPayments` (тип), `loadPublicCloudPayments` из `@/lib/cloudPayments`, `CisPaymentMethodField`.
2. Состояние рядом с `yandexPay` (`:74-83`):

```tsx
// CloudPayments для блока ЕАЭС: null — недоступен, выбора нет, оплата через Т-Банк.
const [cloudPayments, setCloudPayments] = useState<PublicCloudPayments | null>(null)
useEffect(() => {
  let cancelled = false
  void loadPublicCloudPayments().then((value) => {
    if (!cancelled) setCloudPayments(value)
  })
  return () => {
    cancelled = true
  }
}, [])
```

3. Выбор способа (`:111-113`):

```tsx
// Россия — Т-Банк или Сплит; ЕАЭС — Т-Банк или CloudPayments. Нет выбора — Т-Банк.
const showPaymentChoice = yandexPay !== null && !isCis
const showCisPaymentChoice = cloudPayments !== null && isCis
const selectedMethod: CheckoutPaymentMethod =
  showPaymentChoice || showCisPaymentChoice ? paymentMethod : 'tbank'
```

4. Итог (`:169-175`):

```tsx
const promoRub = promo ? promoDiscountRub(totals.totalRub, promo.percent) : 0
// Надбавку считает сервер; здесь та же функция только для показа до оформления.
const surchargePercent = cloudPayments?.surchargePercent ?? 0
const surchargeRub =
  selectedMethod === 'cloudpayments'
    ? paymentSurchargeRub(totals.totalRub - promoRub + shippingRub, surchargePercent)
    : 0
const totalRub = totals.totalRub - promoRub + shippingRub + surchargeRub
```

5. `changeRegion` (`:180-183`): заменить `if (next === 'cis') setPaymentMethod('tbank')` на безусловный сброс:

```tsx
// Способы у регионов разные: Сплит не едет в ЕАЭС, CloudPayments — в Россию.
setPaymentMethod('tbank')
```

6. Запрос (`:229`):

```tsx
      ...(showPaymentChoice || showCisPaymentChoice ? { paymentMethod: selectedMethod } : {}),
```

7. `<CisDelivery … foreignCards={showCisPaymentChoice} />` (`:482-483`).
8. Сводка — после строки доставки, перед «Итого»:

```tsx
{
  surchargeRub > 0 && (
    <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
      <span>Надбавка за оплату картой ({surchargePercent}%)</span>
      <span data-testid="summary-payment-surcharge" className="whitespace-nowrap">
        {formatRub(surchargeRub)}
      </span>
    </div>
  )
}
```

9. Выбор оплаты — рядом с `PaymentMethodField` (`:583-592`):

```tsx
{
  showCisPaymentChoice && (
    <div className="border-t border-[var(--color-lj-rule)] pt-5">
      <CisPaymentMethodField
        value={selectedMethod}
        onChange={setPaymentMethod}
        surchargePercent={surchargePercent}
      />
    </div>
  )
}
```

- [ ] **Step 4: Прогон**

Run: `npm test -w web && npm run typecheck -w web && npm run lint -w web`
Expected: PASS; ошибки типов остаются только в админке (Task 10), если она ещё не сделана.

- [ ] **Step 5: Проверка в браузере**

Поднять dev-сервер (`preview_start` по `.claude/launch.json`; api — с локальной БД, `CLOUDPAYMENTS_PUBLIC_ID`/`CLOUDPAYMENTS_API_SECRET` любые непустые, в админке включить CloudPayments, режим `test`, процент 8). На `/checkout`: Беларусь → видны два способа, плашка новая; выбор CloudPayments → строка надбавки и итог; переключение на Россию → строка пропала, выбор Т-Банк/Сплит. Ширина 375 px — без горизонтальной прокрутки. Скриншоты — владельцу в PR.

- [ ] **Step 6: Commit**

```bash
git add web/lib web/components/checkout 'web/app/[locale]/(public)/checkout'
git commit -m "feat(web): выбор оплаты картой банка ЕАЭС и строка надбавки на чекауте"
```

---

### Task 10: Админка — настройки CloudPayments и надбавка в заказе

**Files:**

- Modify: `web/lib/adminApi.ts:544-545` (типы настроек) и тип заказа админки (поле `paymentSurchargeRub`)
- Modify: `web/components/admin/SettingsForm.tsx:69-71,110-111,309-330`
- Modify: `web/app/admin/(authed)/orders/[id]/page.tsx:113-155`
- Test: тест `SettingsForm` (если есть — `web/components/admin/SettingsForm.test.tsx`), тест страницы заказа админки (если есть)

**Interfaces:**

- Consumes: поля настроек и валидация (Task 2), `Order.paymentSurchargeRub` (Task 2), `MAX_PAYMENT_SURCHARGE_PERCENT` (Task 1).
- Produces: раздел «CloudPayments» в настройках: «Включить на чекауте (только доставка в ЕАЭС)», «Режим: Тест / Боевой», «Надбавка за способ оплаты, %» (0–15, целое); строка «Надбавка за оплату картой (CloudPayments)» в итогах заказа при сумме > 0.

- [ ] **Step 1: Падающий тест формы**

В тест `SettingsForm` (или новый `web/components/admin/SettingsForm.cloudpayments.test.tsx`, рендер — как в существующих тестах формы):

```tsx
it('CloudPayments: поля уходят в сохранение; процент вне 0…15 не отправляется', async () => {
  const onSave = renderSettingsForm({
    cloudpaymentsEnabled: false,
    cloudpaymentsMode: 'test',
    cloudpaymentsSurchargePercent: 0,
  })
  fireEvent.click(
    screen.getByLabelText('Включить CloudPayments на чекауте (только доставка в ЕАЭС)'),
  )
  fireEvent.change(screen.getByLabelText('Режим CloudPayments'), { target: { value: 'live' } })
  fireEvent.change(screen.getByLabelText('Надбавка за способ оплаты, %'), {
    target: { value: '8' },
  })
  await submit()
  expect(lastSaved()).toMatchObject({
    cloudpaymentsEnabled: true,
    cloudpaymentsMode: 'live',
    cloudpaymentsSurchargePercent: 8,
  })
})
```

(`renderSettingsForm`, `submit`, `lastSaved` — существующий способ теста формы; если тестов формы нет совсем — этот шаг заменить проверкой в браузере на шаге 4 со скриншотом.)

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w web -- SettingsForm`
Expected: FAIL — полей нет.

- [ ] **Step 3: Реализация**

`web/lib/adminApi.ts` — в тип настроек:

```ts
cloudpaymentsEnabled: boolean
cloudpaymentsMode: 'test' | 'live'
cloudpaymentsSurchargePercent: number
```

и в тип заказа админки — `paymentSurchargeRub: number`.

`SettingsForm.tsx` — состояние рядом с Яндексом:

```tsx
const [cloudpaymentsEnabled, setCloudpaymentsEnabled] = useState(initial.cloudpaymentsEnabled)
const [cloudpaymentsMode, setCloudpaymentsMode] = useState<'test' | 'live'>(
  initial.cloudpaymentsMode,
)
const [cloudpaymentsSurchargePercent, setCloudpaymentsSurchargePercent] = useState(
  String(initial.cloudpaymentsSurchargePercent),
)
```

в объект сохранения:

```tsx
      cloudpaymentsEnabled,
      cloudpaymentsMode,
      cloudpaymentsSurchargePercent: Number(cloudpaymentsSurchargePercent),
```

(перед отправкой: если `!/^\d{1,2}$/.test(cloudpaymentsSurchargePercent) || Number(...) > MAX_PAYMENT_SURCHARGE_PERCENT` — показать ошибку поля тем же способом, что форма показывает другие ошибки валидации, и не отправлять).

Раздел после «Яндекс.Pay» — разметка по образцу `:309-330`:

```tsx
      <section>
        <h2 …>CloudPayments</h2>
        <p …>
          Оплата картами Visa / Mastercard банков Беларуси, Казахстана, Армении и Киргизии —
          только при доставке в эти страны. Ключи — в app.env на сервере. Боевой режим —
          только после подключения иностранных карт и решения по чеку (deploy/README.md).
        </p>
        <label …>
          <input type="checkbox" checked={cloudpaymentsEnabled} onChange={(e) => setCloudpaymentsEnabled(e.target.checked)} />
          Включить CloudPayments на чекауте (только доставка в ЕАЭС)
        </label>
        <label htmlFor="cloudpayments-mode" …>Режим CloudPayments</label>
        <select id="cloudpayments-mode" value={cloudpaymentsMode} onChange={(e) => setCloudpaymentsMode(e.target.value as 'test' | 'live')}>
          <option value="test">Тест (на сайте не виден)</option>
          <option value="live">Боевой</option>
        </select>
        <label htmlFor="cloudpayments-surcharge" …>Надбавка за способ оплаты, %</label>
        <input id="cloudpayments-surcharge" type="number" min={0} max={MAX_PAYMENT_SURCHARGE_PERCENT} step={1}
          value={cloudpaymentsSurchargePercent} onChange={(e) => setCloudpaymentsSurchargePercent(e.target.value)} />
        <p …>0 — без надбавки. Ненулевой процент — только после ответа юриста.</p>
      </section>
```

(классы — те же, что у соседнего раздела Яндекса.)

`orders/[id]/page.tsx` — в таблицу итогов после доставки:

```tsx
            {order.paymentSurchargeRub > 0 && (
              <tr>
                <th …>Надбавка за оплату картой (CloudPayments)</th>
                <td …>{formatRub(order.paymentSurchargeRub)}</td>
              </tr>
            )}
```

(разметка строки — как у соседней строки промокода.)

- [ ] **Step 4: Прогон и браузер**

Run: `npm test -w web && npm run typecheck && npm run lint`
Expected: PASS во всех workspace.

В браузере: `/admin/settings` — раздел CloudPayments сохраняется и переживает перезагрузку; процент 16 — ошибка, не сохраняется. Скриншот.

- [ ] **Step 5: Commit**

```bash
git add web/lib/adminApi.ts web/components/admin 'web/app/admin'
git commit -m "feat(admin): настройки CloudPayments и надбавка в карточке заказа"
```

---

### Task 11: Документация, переменные, проверки, ревью безопасности, PR

**Files:**

- Modify: `deploy/app.env.example:85-112`, `api/.env.example:97-122`
- Modify: `deploy/README.md` (новый раздел после «## Яндекс Пэй и Сплит», `:464-495`)
- Modify: `docs/superpowers/specs/2026-10-17-cloudpayments-card-payments-design.md` (статус и ссылка на план)

**Interfaces:**

- Consumes: всё выше.
- Produces: инструкция владельцу и PR.

- [ ] **Step 1: Переменные**

В оба `.env.example` после блока `YANDEX_PAY_*`:

```bash
# CloudPayments — оплата картами Visa / Mastercard банков стран ЕАЭС (только доставка
# в BY/KZ/AM/KG). Public ID и API Secret — из кабинета merchant.cloudpayments.ru,
# раздел сайта. API Secret — пароль API и ключ подписи уведомлений, никому не передавать.
# Рубильник, режим и надбавка — в админке (Настройки → CloudPayments).
CLOUDPAYMENTS_PUBLIC_ID=
CLOUDPAYMENTS_API_SECRET=
```

- [ ] **Step 2: Раздел `deploy/README.md` «## CloudPayments (карты банков стран ЕАЭС)»**

Содержание (по образцу раздела Яндекса):

1. **Как работает:** способ виден только при доставке в ЕАЭС и включённом рубильнике; сервер создаёт ссылку `orders/create`, покупатель платит на странице CloudPayments; Check сверяет сумму до списания; Pay оплачивает заказ (уведомления, материалы, Метрика — как у Т-Кассы); Fail ничего не меняет (ссылка остаётся рабочей, в логе `ReasonCode`); сверка раз в минуту досверяет зависшие оплаты до 8 суток.
2. **Что настроить в кабинете CloudPayments:** уведомления Check / Pay / Fail, метод POST, адреса `https://ximi4ka.ru/api/webhooks/cloudpayments/{check,pay,fail}`, кодировка UTF-8, формат CloudPayments.
3. **Включение (владелец):** ключи в `deploy/app.env` → перезапуск api (`docker compose up -d api` по `deploy/README.md`) → админка: включить, режим, процент.
4. **Тестовый терминал:** режим `test` на проде покупателям не показывается, тестовые платежи (`TestMode=1`) на проде заказ не оплачивают. Сквозная проверка — локально: api + web на машине разработчика, туннель (cloudflared / ngrok) на api, в кабинете тестового сайта адреса уведомлений — на туннель; тестовые карты из документации (любой будущий срок, любой CVV): успех — Visa `4000 0000 0000 3055`, Mastercard `5205 0000 0000 3055`, МИР `2202 0000 0000 3055`; недостаточно средств — Visa `4012 8888 8888 1881`, Mastercard `5404 0000 0000 0043`. Перед проверкой сверить с разделом «Тестовые карты» https://developers.cloudpayments.ru — в таблице несколько сценариев на карту.
5. **Стоп-правило боевого режима** (дословно из Global Constraints).
6. **Откат:** выключить рубильник в админке — способ пропадает с чекаута сразу (кеш публичных настроек 60 с); вебхуки и сверка продолжают засчитывать оплату по уже выданным ссылкам, пока ключи в env. Полное отключение — убрать ключи и перезапустить api.
7. **Риски:** смена процента во время оформления (покупатель видит итоговую сумму на форме CloudPayments); фрагмент `#t=` в адресе возврата (проверить на тесте); отказ 5113 до подключения иностранных карт; чек не передаётся.
8. **Разбор проблем:** 401 на вебхуке — неверный API Secret или подпись; code 12 — сумма не совпала (смотреть лог `cloudpayments check`); заказ не оплачен после списания — лог `cloudpayments pay: НЕ засчитано`.

- [ ] **Step 3: Спека**

В шапке спеки: «Статус: план реализации — `docs/superpowers/plans/2026-10-27-cloudpayments-integration.md` (27.10.2026); решения владельца B1, B3, B4, B6, B7 — там же».

- [ ] **Step 4: Полный прогон проверок**

```bash
npm run lint
npm run typecheck
npm test -w shared
TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_cp npm test -w api
npm test -w web
npx prettier --check .
```

Expected: всё зелёное. Красное — чинить и повторять; результат с выводом — в описание PR.

- [ ] **Step 5: Поиск заглушек**

Run: `git diff main --stat && git diff main | grep -nE "TODO|FIXME|\.only\(|\.skip\(|it\.todo"`
Expected: пусто.

- [ ] **Step 6: Ревью безопасности**

Запустить `/security-review` на ветке (оплата, вебхуки, подпись, секреты в логах). Каждое найденное — исправить с тестом или обосновать в PR.

- [ ] **Step 7: Ревью кода**

Отдельный проход ревьюера (`code-reviewer` / `superpowers:requesting-code-review`) по всей ветке против этого плана и спеки.

- [ ] **Step 8: Commit и PR**

```bash
git add deploy api/.env.example docs/superpowers
git commit -m "docs: CloudPayments — переменные, инструкция владельцу, ссылка на план"
git push -u origin claude/cloudpayments-integration-10bb92
```

PR в `main`: что сделано, что выключено по умолчанию (рубильник, процент 0), миграция (добавляет 4 колонки, безопасна заранее), скриншоты чекаута и админки, вывод проверок, стоп-правило. **Не мёржить без команды владельца.**

---

### Task 12: Запуск (после мёржа, по шагам владельца — не код)

Выполняется только по команде владельца, каждый пункт — отдельное подтверждение.

- [ ] Тестовые ключи от CloudPayments → сквозная проверка по `deploy/README.md` (локально + туннель): успешная оплата → заказ `paid`, событие в Telegram; отказная карта → заказ `pending`, «Оплатить» работает; повтор Pay из кабинета → без дублей; сумма в форме CloudPayments = итог чекаута с надбавкой; возврат на страницу заказа сохраняет `#t=` (если нет — завести задачу на возврат без секрета).
- [ ] Письменно от CloudPayments: подключены иностранные карты (BY/KZ/AM/KG), понятны тарифы и ошибка 5113, срок жизни ссылки `orders/create`.
- [ ] Решение по чеку 54-ФЗ (B4): если CloudKassir — отдельный план на передачу чека в `JsonData` + сверка суммы позиций; без решения боевой режим не включается.
- [ ] Ответ юриста по надбавке (B3) → процент в админке (или остаётся 0).
- [ ] Боевые ключи в `deploy/app.env`, перезапуск api, кабинет боевого сайта: адреса уведомлений на `https://ximi4ka.ru/api/webhooks/cloudpayments/…`.
- [ ] Админка: режим «Боевой», рубильник включён; один пробный боевой заказ на реальную карту банка ЕАЭС с возвратом через кабинет.
- [ ] Текст на `/order-process` (`web/lib/orderProcess.ts`, `EAEU_CARD_RULES`): строку `{ card: 'Visa и Mastercard, выпущенные в Беларуси, Казахстане, Армении и Киргизии', accepted: false }` заменить на `accepted: true` с подписью `'Visa и Mastercard, выпущенные в Беларуси, Казахстане, Армении и Киргизии — отдельным способом оплаты'` (+ обновить `orderProcess.test.ts`, `EaeuOrderGuide.test.tsx`) — отдельным маленьким PR после пробного заказа.
- [ ] Обновить память проекта `cloudpayments-plan.md`: что на проде, что осталось.
