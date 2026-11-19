# Яндекс Пэй и Сплит на сайте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** покупатель оплачивает заказ через Яндекс Пэй — картой или частями в Сплите — и видит плашку Сплита на карточке товара, в корзинах и на чекауте; код Т-Кассы не меняется, а пока Яндекс не включён, прод ведёт себя как сейчас.

**Architecture:** новый модуль `api/src/lib/payments/yandexPay/` (`config`, `cart`, `client`, `webhook`) стоит рядом с Т-Кассой: чекаут при `paymentMethod: 'yandex_*'` создаёт заказ в Yandex Pay API и отдаёт `paymentUrl`, вебхук (JWT ES256 через `jose`) и сверка переводят заказ в «оплачен». Доступность Яндекса = рубильник в админке + ключи + режим; витрина узнаёт её из `GET /api/public/settings` (`yandexPay`), плашки и виджет рисует Web SDK `pay.js` (`lazyOnload`).

**Tech Stack:** Express 4 + TypeORM 0.3 + zod 4 (api), `jose@6.2.12` (новая зависимость), Next.js 16.2.4 + React 19 (web), Vitest 2 + supertest + Testing Library, npm workspaces (`api`, `web`, `shared`).

**Spec:** `docs/superpowers/specs/2026-10-24-yandex-pay-split-design.md` (упрощённая редакция, коммит d840cc7). Происхождение части кода — незакоммиченная работа от 11.10.2026 в worktree `jolly-panini-f53f95`; весь нужный код приведён ниже целиком, тот worktree не трогать.

## Global Constraints

- Рабочий каталог — этот worktree (ветка `claude/yandex-pay-split-integration-72a27a`). Перед первой правкой и после перерыва: `git status --short --branch`.
- **Т-Кассу не трогаем:** `tbank.ts`, `tbankTransport.ts`, `token.ts`, `manual.ts`, `types.ts`, `index.ts` (выбор по `PAYMENT_PROVIDER`), `routes/webhooks/tbank.ts` — без изменений. В `receipt.ts` разрешено только добавить `export` к существующим функциям `spreadDiscount`, `normalizePhone`, `cut`. Тесты Т-Кассы (`tbank.test.ts`, `receipt.test.ts`, `tbank-webhook.test.ts`, `tbankTransport.test.ts`, `token.test.ts`) проходят без правок.
- Секретов в репозитории нет (репозиторий публичный): ни Merchant ID, ни ключей. В тестах — фиктивные `00000000-aaaa-bbbb-cccc-000000000001`, `test-api-key-not-real`, `merchant-public-id`. В `*.env.example` — пустые плейсхолдеры.
- Мёрж в `main` = выкатка на прод (автодеплой). Мёрж, push, PR, прод-сервер и прод-БД — только по явной команде владельца в чате (`docs/seo/WORKFLOW.md`, раздел 1). Коммиты по задачам — **только локальные**, без `git push`.
- Сообщения коммитов: `feat(payments): …`, `test(payments): …`, `docs(payments): …`, `chore(perf-lab): …` с русским описанием; последняя строка — `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Пока Яндекс недоступен (выключен `yandexPayEnabled`, нет `YANDEX_PAY_MERCHANT_ID` или ключа боевого режима), всё как сейчас: `yandexPay` в публичных настройках — `null`, блока выбора и плашек нет, чекаут без `paymentMethod` (или с `tbank`) идёт через `getPaymentProvider()`.
- Песочница никогда не попадает к покупателям на проде: в режиме `sandbox` при `NODE_ENV=production` Яндекс недоступен.
- `shared` — только типы, без runtime-импортов `./x.js` (Turbopack в web их не резолвит, а vitest и tsc этого не ловят). Новые типы — в `shared/src/types/order.ts` и реэкспорт из `shared/src/index.ts`.
- Next.js здесь 16.2.4 (`web/AGENTS.md`): перед правками с `next/script` прочитать `node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md` и `…/01-app/02-guides/scripts.md` (после `npm ci`). Ключевое: `strategy="lazyOnload"`, `onReady` — только в клиентских компонентах и вызывается и при повторном монтировании; скрипт с одинаковым `id` грузится один раз.
- Серверный компонент карточки товара не импортирует `web/lib/yandexPay.ts` (там React-хук) — только `getPublicSettings` из `@/lib/api` и клиентский `SplitBadge`.
- Строки интерфейса — по-русски прямо в компонентах. Названия: «Яндекс Пэй», «Сплит». Логотипов Яндекса в репозитории нет — только текстовые подписи.
- Одна новая зависимость: `jose@6.2.12` в `api` (выпуск 05.09.2026). `npm install jose@6.2.12 -w api`.
- Тесты api — только на своей одноразовой БД: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp` (имя содержит `test`; `api/src/test/globalSetup.ts` сам создаёт базу и прогоняет миграции; нужен локальный Postgres). Для `localhost` TLS отключается сам; `DATABASE_SSL=false` нужен, только если хост не `localhost`/`127.0.0.1`/алиас без точки.
- Тесты api читают локальный `api/.env` (`import 'dotenv/config'` в `api/src/config/dataSource.ts`). Если там есть `PAYMENT_PROVIDER=tbank` или `YANDEX_PAY_*` (например, после проверки в песочнице), прежние тесты чекаута и сверки поменяют поведение — на время прогона эти строки закомментировать. Новые тесты задают свои переменные через `vi.stubEnv`.
- Команды тестов (из корня worktree): api — `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- <путь от api/>`; web — `npm test -w web -- <путь от web/>`; shared — `npm run typecheck -w shared`. `npm run typecheck -w api` тесты не проверяет (исключены в `api/tsconfig.json`).
- Перед каждым коммитом — `npx prettier --write <файлы задачи>` (CI проверяет `prettier --check .`, включая markdown). Перед PR: `npm run lint`, `npm run typecheck`, тесты всех workspace, `npx prettier --check .`, затем `/code-review` и `/security-review`.

## Review Focus

Пять сбоев, которые спек подразумевает, но не называет в списке тестов; тест на каждый добавлен в задачу-владельца.

1. **Яндекс выключили, пока покупатель заполнял форму:** сервер отвечает `400 payment_method_unavailable` без заказа; чекаут показывает понятное сообщение, сбрасывает выбор на Т-Банк, перечитывает настройки и прячет блок; корзина цела. Тесты: задача 5 («рубильник выключили…»), задача 7 («Яндекс выключили до отправки…»).
2. **Двойная отправка / повтор с тем же `Idempotency-Key`:** в Яндексе ровно один заказ (`orderId` — его ключ идемпотентности; поведение Яндекса при повторе с другим телом не документировано), второй ответ возвращает сохранённый `paymentUrl`; «Оплатить» на странице заказа берёт сохранённую ссылку и Яндекс не вызывает. Тест: задача 5.
3. **Вебхук Яндекса по заказу Т-Кассы с тем же номером:** 200, заказ не меняется. Тест: задача 4.
4. **Плашка на нулевую, нечисловую или бесконечную сумму** (пустая корзина, сбой расчёта): бейджа и скрипта нет. Тест: задача 6.
5. **Покупка в Метрику для неоплаченного заказа Яндекс Пэй:** `purchase` уходит только после `paid`, как у Т-Кассы (сейчас условие `=== 'tbank'`, и заказ Яндекса считался бы «ручным» — покупка ушла бы сразу). Тест: задача 7.

---

## Подготовка (один раз перед задачей 1)

- [ ] **Шаг 1: Ветка и зависимости**

```bash
git status --short --branch   # ## claude/yandex-pay-split-integration-72a27a
git log --oneline -1          # d840cc7 docs(payments): упростить дизайн Яндекс Пэй — Т-Касса не меняется
npm ci
```

- [ ] **Шаг 2: Зелёная база**

```bash
TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments src/routes/checkout.test.ts
npm test -w web -- "app/[locale]/(public)/checkout/page.test.tsx"
```

Expected: PASS. Если api падает на подключении — `brew services start postgresql@16` и повторить.

- [ ] **Шаг 3: Сборка «до» для замера (задача 8)**

```bash
npx playwright install chromium
tools/perf-lab/build.sh yp-base
```

Expected: `built yp-base → /tmp/perf-lab/builds/yp-base`. Пропущен — в задаче 8 есть запасной путь.

---

## File Structure

| Файл                                                                                                         | Что делает                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `shared/src/types/order.ts`, `shared/src/index.ts` (изм.)                                                    | `'yandex_pay'` в провайдере и истории, `CheckoutPaymentMethod`, `PublicYandexPay`, поля DTO |
| `web/app/admin/(authed)/orders/orderUi.ts` (изм.)                                                            | подписи «Яндекс Пэй»                                                                        |
| `api/src/lib/payments/orderStatus.ts` (изм.)                                                                 | автор истории `'yandex_pay'`                                                                |
| `api/src/lib/payments/receipt.ts` (изм., только `export`)                                                    | `spreadDiscount`, `normalizePhone`, `cut` доступны корзине Яндекса                          |
| `api/src/lib/payments/yandexPay/config.ts` (нов.)                                                            | ключи, режим, хосты, правило доступности, публичная часть для витрины                       |
| `api/src/lib/payments/yandexPay/cart.ts` (нов.)                                                              | корзина Яндекса: промокод, копейки, подарки, доставка, налог, контакт для чека              |
| `api/src/lib/payments/yandexPay/client.ts` (нов.)                                                            | `createYandexOrder`, `getYandexOrderStatus`, `mapYandexStatus`                              |
| `api/src/lib/payments/yandexPay/webhook.ts` (нов.)                                                           | `verifyYandexWebhook` — JWT ES256 по JWKS Яндекса, `reasonCode`                             |
| `api/src/routes/webhooks/yandexPay.ts` (нов.)                                                                | `POST /api/webhooks/yandex-pay/v1/webhook`, ответ на слишком большое тело                   |
| `api/src/app.ts` (изм.)                                                                                      | сырое тело для вебхука Яндекса до `express.json`                                            |
| `api/src/routes/checkout.schemas.ts`, `checkout.ts` (изм.)                                                   | `paymentMethod`, 400 на недоступный Яндекс и на ЕАЭС, заказ Яндекса                         |
| `api/src/routes/public/settings.ts` (изм.)                                                                   | поле `yandexPay`                                                                            |
| `api/src/routes/public/orders.ts` (изм.)                                                                     | `paymentUrl` в статусе — с секретом, у неоплаченного заказа Яндекс Пэй                      |
| `api/src/lib/payments/reconcile.ts`, `api/src/index.ts` (изм.)                                               | заказы Яндекса сверяются у Яндекса; задача стартует и при одном Merchant ID                 |
| `api/package.json`, `package-lock.json` (изм.)                                                               | `jose@6.2.12`                                                                               |
| `web/lib/api.ts` (изм.)                                                                                      | `yandexPay` в типе публичных настроек                                                       |
| `web/lib/yandexPay.ts` (нов.)                                                                                | подписи способов, сумма плашки, кеш `yandexPay` на сессию, хук                              |
| `web/types/yandex-pay.d.ts` (нов.)                                                                           | JSX-тип тега `yandex-pay-badge`                                                             |
| `web/components/payments/SplitBadge.tsx` (нов.)                                                              | плашка Сплита + `pay.js` (`lazyOnload`); вариант с загрузкой настроек                       |
| `web/components/payments/SplitWidget.tsx` (нов.)                                                             | виджет Ultimate с графиком Сплита, сессия уничтожается при размонтировании                  |
| `web/components/checkout/PaymentMethodField.tsx` (нов.)                                                      | блок «Способ оплаты»                                                                        |
| `web/app/[locale]/(public)/product/[slug]/page.tsx`, `cart/page.tsx`, `web/components/CartDrawer.tsx` (изм.) | плашки                                                                                      |
| `web/app/[locale]/(public)/checkout/page.tsx` (изм.)                                                         | выбор способа, ЕАЭС, `paymentMethod`, обработка 400                                         |
| `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx` (изм.)                            | Яндекс как онлайн-оплата, кнопка «Оплатить»                                                 |
| `deploy/app.env.example`, `api/.env.example`, `deploy/README.md` (изм.)                                      | переменные и раздел «Яндекс Пэй и Сплит»                                                    |
| `tools/perf-lab/build.sh`, `bench.sh`, `serve.sh`, `README.md` (изм.)                                        | серверный адрес api переопределяется `PERF_API_URL` (для замера плашки)                     |

Тесты: api — `src/lib/payments/{orderStatus,yandexPay/config,yandexPay/cart,yandexPay/client,yandexPay/webhook,reconcile.yandex}.test.ts`, `src/routes/{yandex-pay-webhook,checkout-yandex-pay}.test.ts`, `src/routes/public/{settingsYandexPay,orderPaymentLink}.test.ts` (новые); web — `lib/yandexPay.test.ts`, `components/payments/{SplitBadge,SplitWidget}.test.tsx` (новые), тесты админки заказов, карточки товара, корзины, `CartDrawer`, чекаута, `OrderStatusView` (изм.).

---

### Task 1: Типы shared и подписи в админке

**Files:**

- Modify: `shared/src/types/order.ts:9-13`, `:73`, `:177`, `:225`
- Modify: `shared/src/index.ts:8`
- Modify: `web/app/admin/(authed)/orders/orderUi.ts:27-44`
- Modify: `api/src/lib/payments/orderStatus.ts:23`
- Test: `web/app/admin/(authed)/orders/page.test.tsx`, `api/src/lib/payments/orderStatus.test.ts` (нов.)

**Interfaces:**

- Consumes: —
- Produces (shared, только типы):
  - `type PaymentProvider = 'manual' | 'tbank' | 'ycp' | 'yandex_pay'`
  - `type CheckoutPaymentMethod = 'tbank' | 'yandex_pay' | 'yandex_split'`
  - `interface PublicYandexPay { split: true; merchantId?: string }`
  - `CheckoutRequest.paymentMethod?: CheckoutPaymentMethod`, `PublicOrderStatus.paymentUrl?: string | null`
  - `OrderStatusHistoryEntry.by` дополнен `'yandex_pay'`
- Produces (api): `applyPaymentStatus(order, status, by: 'tbank' | 'yandex_pay' | 'reconcile', now?)`
- Produces (web): `PAYMENT_PROVIDER_LABELS.yandex_pay`, `HISTORY_ACTOR_LABELS.yandex_pay` = `'Яндекс Пэй'`

- [ ] **Step 1: Write the failing tests**

В `web/app/admin/(authed)/orders/page.test.tsx` в конец `describe('order UI helpers', …)`:

```ts
it('Яндекс Пэй подписан отдельно от «Купить в 1 клик» (YCP)', () => {
  expect(PAYMENT_PROVIDER_LABELS.yandex_pay).toBe('Яндекс Пэй')
  expect(PAYMENT_PROVIDER_LABELS.yandex_pay).not.toBe(PAYMENT_PROVIDER_LABELS.ycp)
  expect(HISTORY_ACTOR_LABELS.yandex_pay).toBe('Яндекс Пэй')
})
```

Создать `api/src/lib/payments/orderStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Order } from '../../entities/Order.js'
import { applyPaymentStatus } from './orderStatus.js'

describe('applyPaymentStatus: автор yandex_pay', () => {
  it('пишет в историю смену статуса от Яндекс Пэй', () => {
    const order = { status: 'pending', paidAt: null, statusHistory: [] } as unknown as Order
    const now = new Date('2026-10-24T12:00:00Z')
    expect(applyPaymentStatus(order, 'paid', 'yandex_pay', now)).toBe(true)
    expect(order.paidAt).toEqual(now)
    expect(order.statusHistory).toEqual([
      { from: 'pending', to: 'paid', at: now.toISOString(), by: 'yandex_pay' },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- "app/admin/(authed)/orders/page.test.tsx"`
Expected: FAIL — `expected undefined to be 'Яндекс Пэй'`.

Api-тест проходит и сейчас (vitest не проверяет типы); тип `by` правим здесь, потому что на нём держится вызов из вебхука в задаче 4.

- [ ] **Step 3: Implement**

`shared/src/types/order.ts` — строки 9–13 заменить:

```ts
// Payment provider actually wired to the order. `manual` — no online payment:
// the order stays pending and a manager contacts the customer. `tbank` —
// Т-Касса (Т-Банк, ex-Tinkoff Kassa) internet acquiring. `ycp` — оплату принял
// Яндекс (Яндекс Пэй, Сплит) в «Купить в 1 клик»; в Т-Кассу такие заказы не идут.
// `yandex_pay` — Яндекс Пэй на чекауте сайта (картой или Сплитом): заказ в Яндексе
// создаёт наш сервер, статус приходит вебхуком и сверкой.
export type PaymentProvider = 'manual' | 'tbank' | 'ycp' | 'yandex_pay'

/**
 * Способ оплаты на чекауте. Оба способа Яндекса создают заказ провайдера
 * yandex_pay; yandex_split открывает форму Яндекса сразу на Сплите.
 */
export type CheckoutPaymentMethod = 'tbank' | 'yandex_pay' | 'yandex_split'

/** Яндекс Пэй в публичных настройках; null — недоступен. */
export interface PublicYandexPay {
  split: true
  /** Только в боевом режиме: в песочнице Merchant ID служит ключом API. */
  merchantId?: string
}
```

Строку 73 (`by` в `OrderStatusHistoryEntry`):

```ts
by: 'tbank' | 'admin' | 'reconcile' | 'ycp' | 'yandex_pay'
```

В `CheckoutRequest` после `promoCode?: string` (строка 177):

```ts
  /** Способ оплаты; не указан или tbank — как раньше. Недоступный Яндекс сервер отклоняет 400. */
  paymentMethod?: CheckoutPaymentMethod
```

В `PublicOrderStatus` после `materials?: PublicOrderMaterial[]` (строка 225):

```ts
  /**
   * Только при верном секрете заказа (?t=) и только у неоплаченного заказа
   * Яндекс Пэй: ссылка на форму Яндекса для кнопки «Оплатить».
   */
  paymentUrl?: string | null
```

`shared/src/index.ts` — после строки `  PaymentProvider,` добавить:

```ts
  CheckoutPaymentMethod,
  PublicYandexPay,
```

`web/app/admin/(authed)/orders/orderUi.ts` — в `PAYMENT_PROVIDER_LABELS` (после строки 30 `ycp: 'Яндекс',`) и в `HISTORY_ACTOR_LABELS` (после строки 43 `ycp: 'Яндекс',`) добавить; `ORDER_SOURCE_LABELS` (строка 63) не трогать — это источник заказа, не провайдер:

```ts
  yandex_pay: 'Яндекс Пэй',
```

`api/src/lib/payments/orderStatus.ts` — строка 23:

```ts
  by: 'tbank' | 'yandex_pay' | 'reconcile',
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w web -- "app/admin/(authed)/orders/page.test.tsx" && TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments/orderStatus.test.ts && npm run typecheck`
Expected: PASS во всех трёх workspace.

- [ ] **Step 5: Commit**

```bash
npx prettier --write shared/src/types/order.ts shared/src/index.ts "web/app/admin/(authed)/orders" api/src/lib/payments/orderStatus.ts api/src/lib/payments/orderStatus.test.ts
git add shared/src/types/order.ts shared/src/index.ts "web/app/admin/(authed)/orders/orderUi.ts" "web/app/admin/(authed)/orders/page.test.tsx" api/src/lib/payments/orderStatus.ts api/src/lib/payments/orderStatus.test.ts
git commit -m "$(cat <<'EOF'
feat(payments): провайдер yandex_pay в типах и подписи «Яндекс Пэй» в админке

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Конфигурация Яндекса и корзина

**Files:**

- Modify: `api/src/lib/payments/receipt.ts:78`, `:89`, `:96` (только `export`)
- Create: `api/src/lib/payments/yandexPay/config.ts`, `api/src/lib/payments/yandexPay/cart.ts`
- Test: `api/src/lib/payments/yandexPay/config.test.ts`, `api/src/lib/payments/yandexPay/cart.test.ts`

**Interfaces:**

- Consumes: `getSettings()` (`api/src/lib/settings.ts`: `yandexPayEnabled`, `yandexPayMode`); `ItemTax`, `MAX_EMAIL_LENGTH` и (после `export`) `spreadDiscount`, `normalizePhone`, `cut` из `receipt.ts`; `PublicYandexPay` (задача 1).
- Produces (`config.ts`):
  - `type YandexPayMode = 'sandbox' | 'production'`, `const YANDEX_PAY_HOSTS: Record<YandexPayMode, string>`
  - `interface YandexPayConfig { merchantId; apiKey; authKey; mode; enabled; baseUrl; jwksUrl }`
  - `function hasYandexPayMerchant(env?): boolean`
  - `function yandexPayConfigFrom(settings: { yandexPayEnabled: boolean; yandexPayMode: string }, env?): YandexPayConfig | null`
  - `async function getYandexPayConfig(env?): Promise<YandexPayConfig | null>`
  - `function isCheckoutAvailable(cfg: YandexPayConfig | null, env?): cfg is YandexPayConfig`
  - `async function isYandexPayAvailable(env?): Promise<boolean>`
  - `function publicYandexPay(cfg: YandexPayConfig | null, env?): PublicYandexPay | null`
- Produces (`cart.ts`): `const YANDEX_TAX_CODES: Record<ItemTax, number>`, `interface YandexCartItem`, `interface YandexCart`, `function buildYandexCart(order: Order, tax: ItemTax): { cart: YandexCart; fiscalContact: string }` — бросает `yandex cart: …` при пустых items, расхождении суммы и без контакта.

- [ ] **Step 1: Write the failing tests**

Создать `api/src/lib/payments/yandexPay/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  hasYandexPayMerchant,
  isCheckoutAvailable,
  publicYandexPay,
  yandexPayConfigFrom,
} from './config.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
const on = (mode: 'sandbox' | 'production') => ({ yandexPayEnabled: true, yandexPayMode: mode })

describe('yandexPayConfigFrom', () => {
  it('без Merchant ID — null; хост, JWKS и ключ — по режиму', () => {
    expect(yandexPayConfigFrom(on('production'), env({}))).toBeNull()
    expect(yandexPayConfigFrom(on('production'), env({ YANDEX_PAY_MERCHANT_ID: '  ' }))).toBeNull()
    expect(
      yandexPayConfigFrom(
        on('production'),
        env({ YANDEX_PAY_MERCHANT_ID: ` ${MERCHANT} `, YANDEX_PAY_API_KEY: 'k' }),
      ),
    ).toEqual({
      merchantId: MERCHANT,
      apiKey: 'k',
      authKey: 'k',
      mode: 'production',
      enabled: true,
      baseUrl: 'https://pay.yandex.ru',
      jwksUrl: 'https://pay.yandex.ru/api/jwks',
    })
    expect(
      yandexPayConfigFrom(on('sandbox'), env({ YANDEX_PAY_MERCHANT_ID: MERCHANT })),
    ).toMatchObject({
      authKey: MERCHANT,
      baseUrl: 'https://sandbox.pay.yandex.ru',
      jwksUrl: 'https://sandbox.pay.yandex.ru/api/jwks',
    })
  })

  it('неизвестный режим в базе считается песочницей', () => {
    const cfg = yandexPayConfigFrom(
      { yandexPayEnabled: true, yandexPayMode: 'live' },
      env({ YANDEX_PAY_MERCHANT_ID: MERCHANT }),
    )
    expect(cfg?.mode).toBe('sandbox')
  })

  it('hasYandexPayMerchant — по одному Merchant ID', () => {
    expect(hasYandexPayMerchant(env({ YANDEX_PAY_MERCHANT_ID: MERCHANT }))).toBe(true)
    expect(hasYandexPayMerchant(env({ YANDEX_PAY_MERCHANT_ID: '' }))).toBe(false)
  })
})

describe('isCheckoutAvailable и publicYandexPay', () => {
  const prod = env({
    YANDEX_PAY_MERCHANT_ID: MERCHANT,
    YANDEX_PAY_API_KEY: 'k',
    NODE_ENV: 'production',
  })

  it('боевой режим: нужен ключ API; Merchant ID отдаётся витрине', () => {
    const cfg = yandexPayConfigFrom(on('production'), prod)
    expect(isCheckoutAvailable(cfg, prod)).toBe(true)
    expect(publicYandexPay(cfg, prod)).toEqual({ split: true, merchantId: MERCHANT })
    const noKey = env({ YANDEX_PAY_MERCHANT_ID: MERCHANT, NODE_ENV: 'production' })
    expect(isCheckoutAvailable(yandexPayConfigFrom(on('production'), noKey), noKey)).toBe(false)
  })

  it('рубильник выключен — недоступен', () => {
    const cfg = yandexPayConfigFrom({ yandexPayEnabled: false, yandexPayMode: 'production' }, prod)
    expect(isCheckoutAvailable(cfg, prod)).toBe(false)
    expect(publicYandexPay(cfg, prod)).toBeNull()
    expect(publicYandexPay(null, prod)).toBeNull()
  })

  it('песочница — только не на проде, и без Merchant ID (он же ключ)', () => {
    const dev = env({ YANDEX_PAY_MERCHANT_ID: MERCHANT, NODE_ENV: 'development' })
    const sandboxDev = yandexPayConfigFrom(on('sandbox'), dev)
    expect(isCheckoutAvailable(sandboxDev, dev)).toBe(true)
    expect(publicYandexPay(sandboxDev, dev)).toEqual({ split: true })
    const sandboxProd = yandexPayConfigFrom(on('sandbox'), prod)
    expect(isCheckoutAvailable(sandboxProd, prod)).toBe(false)
    expect(publicYandexPay(sandboxProd, prod)).toBeNull()
  })
})
```

Создать `api/src/lib/payments/yandexPay/cart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Order } from '../../../entities/Order.js'
import { ITEM_TAXES } from '../receipt.js'
import { buildYandexCart, YANDEX_TAX_CODES } from './cart.js'

type Line = {
  productId: string
  name: string
  quantity: number
  unitPriceRub: number
  lineTotalRub?: number | null
  isGift?: boolean
}

// totalRub — как в чекауте: товары − промокод + доставка; extra может его переопределить.
function order(lines: Line[], extra: Record<string, unknown> = {}): Order {
  const items = lines.map((l) => ({
    productId: l.productId,
    productSnapshot: { name: l.name, sku: null, priceRub: l.unitPriceRub },
    quantity: l.quantity,
    unitPriceRub: l.unitPriceRub,
    lineTotalRub: l.lineTotalRub ?? null,
    isGift: l.isGift ?? false,
  }))
  const goods = lines
    .filter((l) => !l.isGift)
    .reduce((sum, l) => sum + (l.lineTotalRub ?? l.unitPriceRub * l.quantity), 0)
  const promo = typeof extra.promoDiscountRub === 'number' ? extra.promoDiscountRub : 0
  const shipping = typeof extra.shippingRub === 'number' ? extra.shippingRub : 350
  return {
    orderNumber: 'XM-2026-00001',
    items,
    promoDiscountRub: 0,
    shippingRub: 350,
    totalRub: goods - promo + shipping,
    customerEmail: 'buyer@example.com',
    customerPhone: '+79001234567',
    ...extra,
  } as unknown as Order
}

const kop = (rub: string) => Math.round(Number(rub) * 100)

describe('buildYandexCart', () => {
  it('товар и доставка: суммы строками в рублях, «без НДС», предметы расчёта', () => {
    const { cart, fiscalContact } = buildYandexCart(
      order([{ productId: 'p1', name: 'Реагент', quantity: 2, unitPriceRub: 100 }]),
      'none',
    )
    expect(cart).toEqual({
      items: [
        {
          productId: 'p1',
          title: 'Реагент',
          quantity: { count: '2' },
          unitPrice: '100.00',
          total: '200.00',
          receipt: { tax: 6, measure: 0, paymentMethodType: 4, paymentSubjectType: 1 },
        },
        {
          productId: 'delivery',
          title: 'Доставка',
          quantity: { count: '1' },
          unitPrice: '350.00',
          total: '350.00',
          receipt: { tax: 6, measure: 0, paymentMethodType: 4, paymentSubjectType: 4 },
        },
      ],
      total: { amount: '550.00' },
    })
    expect(fiscalContact).toBe('buyer@example.com')
  })

  it('партия 313 ₽ за 21 штуку: цена за единицу — целые копейки, productId уникальны', () => {
    const { cart } = buildYandexCart(
      order([
        { productId: 'p1', name: 'Пробирки', quantity: 21, unitPriceRub: 15, lineTotalRub: 313 },
      ]),
      'none',
    )
    expect(
      cart.items.slice(0, 2).map((i) => [i.productId, i.unitPrice, i.quantity.count, i.total]),
    ).toEqual([
      ['p1', '14.90', '20', '298.00'],
      ['p1-2', '15.00', '1', '15.00'],
    ])
    const ids = cart.items.map((i) => i.productId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(cart.total.amount).toBe('663.00')
  })

  it('промокод раскидывается по товарам (как в чеке Т-Кассы), доставка целая', () => {
    const { cart } = buildYandexCart(
      order(
        [
          { productId: 'p-a', name: 'Набор', quantity: 1, unitPriceRub: 1000 },
          { productId: 'p-r', name: 'Реактив', quantity: 3, unitPriceRub: 111, lineTotalRub: 333 },
        ],
        { promoDiscountRub: 67, shippingRub: 350 },
      ),
      'none',
    )
    expect(cart.items.map((i) => [i.productId, i.unitPrice, i.quantity.count, i.total])).toEqual([
      ['p-a', '949.00', '1', '949.00'],
      ['p-r', '105.66', '2', '211.32'],
      ['p-r-2', '105.68', '1', '105.68'],
      ['delivery', '350.00', '1', '350.00'],
    ])
    expect(cart.total.amount).toBe('1616.00')
  })

  it('промокод + оптовая скидка + доставка СДЭК: сумма позиций равна итогу', () => {
    const o = order(
      [
        { productId: 'p-r', name: 'Реактив', quantity: 10, unitPriceRub: 80, lineTotalRub: 800 },
        { productId: 'p-t', name: 'Пробирка', quantity: 21, unitPriceRub: 15, lineTotalRub: 313 },
      ],
      { promoDiscountRub: 56, shippingRub: 390 },
    )
    const { cart } = buildYandexCart(o, 'none')
    expect(cart.total.amount).toBe('1447.00')
    expect(cart.items.reduce((s, i) => s + kop(i.total), 0)).toBe(o.totalRub * 100)
    for (const i of cart.items) {
      expect(i.unitPrice).toMatch(/^\d+\.\d{2}$/)
      expect(kop(i.unitPrice) * Number(i.quantity.count)).toBe(kop(i.total))
    }
  })

  it('доставка в ЕАЭС — позиция-услуга на её цену', () => {
    const { cart } = buildYandexCart(
      order([{ productId: 'p1', name: 'Набор', quantity: 1, unitPriceRub: 2000 }], {
        shippingRub: 700,
        deliveryMethod: 'cdek_manual_cis',
      }),
      'none',
    )
    expect(cart.items.at(-1)).toMatchObject({
      productId: 'delivery',
      total: '700.00',
      receipt: { paymentSubjectType: 4 },
    })
    expect(cart.total.amount).toBe('2700.00')
  })

  it('подарок и товар, обнулённый промокодом, в корзину не попадают', () => {
    const gift = buildYandexCart(
      order(
        [
          { productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 },
          {
            productId: 'g1',
            name: 'Подарок',
            quantity: 1,
            unitPriceRub: 0,
            lineTotalRub: 0,
            isGift: true,
          },
        ],
        { shippingRub: 0 },
      ),
      'none',
    )
    expect(gift.cart.items.map((i) => i.productId)).toEqual(['p1'])
    const zeroed = buildYandexCart(
      order([{ productId: 'p1', name: 'Набор', quantity: 1, unitPriceRub: 100 }], {
        promoDiscountRub: 100,
      }),
      'none',
    )
    expect(zeroed.cart.items.map((i) => i.productId)).toEqual(['delivery'])
  })

  it('ставка НДС из TBANK_RECEIPT_TAX переводится в код Яндекса; таблица полная', () => {
    const { cart } = buildYandexCart(
      order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }]),
      'vat22',
    )
    expect(cart.items.every((i) => i.receipt.tax === 11)).toBe(true)
    for (const tax of ITEM_TAXES) expect(YANDEX_TAX_CODES[tax]).toEqual(expect.any(Number))
  })

  it('контакт — телефон +7…, когда email не годится; без контакта — ошибка', () => {
    const { fiscalContact } = buildYandexCart(
      order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }], {
        customerEmail: '',
        customerPhone: '8 (900) 123-45-67',
      }),
      'none',
    )
    expect(fiscalContact).toBe('+79001234567')
    expect(() =>
      buildYandexCart(
        order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }], {
          customerEmail: '',
          customerPhone: '12',
        }),
        'none',
      ),
    ).toThrow(/no usable contact/)
  })

  it('сумма не сходится с итогом или нет items — ошибка, а не кривая корзина', () => {
    expect(() =>
      buildYandexCart(
        order([{ productId: 'p1', name: 'Реагент', quantity: 1, unitPriceRub: 100 }], {
          totalRub: 1,
        }),
        'none',
      ),
    ).toThrow(/sum of lines/)
    expect(() => buildYandexCart(order([], { items: [] }), 'none')).toThrow(/нет загруженных items/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments/yandexPay`
Expected: FAIL — `Failed to load url ./config.js` / `./cart.js`.

- [ ] **Step 3: Export the receipt helpers**

В `api/src/lib/payments/receipt.ts` добавить `export` перед тремя объявлениями, больше ничего не меняя:

```ts
export function normalizePhone(raw: string): string | null {
```

```ts
export function cut(name: string): string {
```

```ts
export function spreadDiscount(lineRub: number[], discountRub: number): number[] {
```

- [ ] **Step 4: Implement config.ts**

Создать `api/src/lib/payments/yandexPay/config.ts`:

```ts
import type { PublicYandexPay } from '@ximi4ka-shop/shared'
import { getSettings } from '../../settings.js'

// Яндекс Пэй: ключи — в env (YANDEX_PAY_MERCHANT_ID, YANDEX_PAY_API_KEY), рубильник
// и режим — в админке (SiteSettings.yandexPayEnabled, yandexPayMode). Вебхук и сверка
// работают, пока задан Merchant ID, независимо от рубильника; на чекауте Яндекс —
// только по правилу isCheckoutAvailable.

export type YandexPayMode = 'sandbox' | 'production'

export const YANDEX_PAY_HOSTS: Record<YandexPayMode, string> = {
  production: 'https://pay.yandex.ru',
  sandbox: 'https://sandbox.pay.yandex.ru',
}

export interface YandexPayConfig {
  merchantId: string
  apiKey: string
  /** Ключ для Authorization: Api-Key — в песочнице им служит Merchant ID. */
  authKey: string
  mode: YandexPayMode
  enabled: boolean
  baseUrl: string
  /** JWKS для проверки вебхука; адрес только отсюда, никогда из запроса. */
  jwksUrl: string
}

interface YandexSettings {
  yandexPayEnabled: boolean
  yandexPayMode: string
}

export function hasYandexPayMerchant(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.YANDEX_PAY_MERCHANT_ID ?? '').trim().length > 0
}

export function yandexPayConfigFrom(
  settings: YandexSettings,
  env: NodeJS.ProcessEnv = process.env,
): YandexPayConfig | null {
  const merchantId = (env.YANDEX_PAY_MERCHANT_ID ?? '').trim()
  if (!merchantId) return null
  const apiKey = (env.YANDEX_PAY_API_KEY ?? '').trim()
  const mode: YandexPayMode = settings.yandexPayMode === 'production' ? 'production' : 'sandbox'
  const baseUrl = YANDEX_PAY_HOSTS[mode]
  return {
    merchantId,
    apiKey,
    authKey: mode === 'production' ? apiKey : merchantId,
    mode,
    enabled: settings.yandexPayEnabled,
    baseUrl,
    jwksUrl: `${baseUrl}/api/jwks`,
  }
}

export async function getYandexPayConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<YandexPayConfig | null> {
  return yandexPayConfigFrom(await getSettings(), env)
}

// Доступен на чекауте: рубильник включён и в боевом режиме есть ключ API, а песочница —
// только вне NODE_ENV=production, чтобы она никогда не попала к покупателям на проде.
export function isCheckoutAvailable(
  cfg: YandexPayConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): cfg is YandexPayConfig {
  if (!cfg || !cfg.enabled) return false
  if (cfg.mode === 'production') return cfg.apiKey.length > 0
  return env.NODE_ENV !== 'production'
}

export async function isYandexPayAvailable(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return isCheckoutAvailable(await getYandexPayConfig(env), env)
}

// Для GET /api/public/settings: null — недоступен; Merchant ID — только в боевом режиме
// (в песочнице он равен ключу API; без него витрина плашек не рисует).
export function publicYandexPay(
  cfg: YandexPayConfig | null,
  env: NodeJS.ProcessEnv = process.env,
): PublicYandexPay | null {
  if (!isCheckoutAvailable(cfg, env)) return null
  return cfg.mode === 'production' ? { split: true, merchantId: cfg.merchantId } : { split: true }
}
```

- [ ] **Step 5: Implement cart.ts**

Создать `api/src/lib/payments/yandexPay/cart.ts`:

```ts
import type { Order } from '../../../entities/Order.js'
import { MAX_EMAIL_LENGTH, cut, normalizePhone, spreadDiscount, type ItemTax } from '../receipt.js'

// Корзина для POST /api/merchant/v1/orders. Правила те же, что у чека Т-Кассы
// (receipt.ts, оттуда раскидка промокода, обрезка названия и нормализация телефона):
// подарок и обнулённая промокодом позиция пропускаются, цена партии, не делящаяся на
// целые копейки, режется на две позиции, доставка — отдельная позиция-услуга, сумма
// позиций обязана равняться итогу заказа. Суммы — строки в рублях с двумя знаками:
// цена длиннее даёт ORDER_CART_DATA_ERROR. Коды полей чека — pay.yandex.ru/docs/ru/custom/fns.

// Ставка из TBANK_RECEIPT_TAX → код Яндекса (тег 1199). С 2026 года код 1 (20%)
// не используется: 22% — код 11, 22/122 — код 12.
export const YANDEX_TAX_CODES: Record<ItemTax, number> = {
  none: 6,
  vat0: 5,
  vat5: 8,
  vat7: 7,
  vat10: 2,
  vat22: 11,
  vat105: 10,
  vat107: 9,
  vat110: 4,
  vat122: 12,
}

// 4 — «полная оплата в момент передачи», как full_payment у Т-Кассы (тег 1214).
const PAYMENT_METHOD_FULL_PAYMENT = 4
// 1 — товар, 4 — услуга (тег 1212); 0 — штуки или единицы (тег 2108).
const SUBJECT_COMMODITY = 1
const SUBJECT_SERVICE = 4
const MEASURE_PIECES = 0

export interface YandexCartItem {
  productId: string
  title: string
  quantity: { count: string }
  unitPrice: string
  total: string
  receipt: { tax: number; measure: number; paymentMethodType: number; paymentSubjectType: number }
}

export interface YandexCart {
  items: YandexCartItem[]
  total: { amount: string }
}

interface Line {
  id: string
  title: string
  priceKop: number
  quantity: number
  amountKop: number
  subject: number
}

// Целочисленно, без плавающей точки: 1490 → "14.90".
function rub(kop: number): string {
  const whole = Math.floor(kop / 100)
  return `${whole}.${String(kop - whole * 100).padStart(2, '0')}`
}

function fiscalContactOf(order: Order): string {
  const email = order.customerEmail?.trim()
  if (email && email.length <= MAX_EMAIL_LENGTH) return email
  const phone = normalizePhone(order.customerPhone ?? '')
  if (!phone)
    throw new Error(`yandex cart: no usable contact (email/phone) for ${order.orderNumber}`)
  return phone
}

export function buildYandexCart(
  order: Order,
  tax: ItemTax,
): { cart: YandexCart; fiscalContact: string } {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error(`yandex cart: у заказа ${order.orderNumber} нет загруженных items`)
  }

  const paid = order.items.filter((line) => !line.isGift)
  const lineRub = paid.map((line) => line.lineTotalRub ?? line.unitPriceRub * line.quantity)
  const afterPromoRub = spreadDiscount(lineRub, order.promoDiscountRub ?? 0)

  // productId у Яндекса обязан быть уникальным: вторая позиция того же товара — -2, -3…
  const used = new Set<string>()
  const uniqueId = (base: string): string => {
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
    used.add(id)
    return id
  }

  const lines: Line[] = paid.flatMap((line, index): Line[] => {
    const totalKop = afterPromoRub[index] * 100
    if (totalKop <= 0) return []
    const title = cut(line.productSnapshot.name)
    const base = String(line.productId)
    const price = Math.floor(totalKop / line.quantity)
    if (price * line.quantity === totalKop) {
      return [
        {
          id: uniqueId(base),
          title,
          priceKop: price,
          quantity: line.quantity,
          amountKop: totalKop,
          subject: SUBJECT_COMMODITY,
        },
      ]
    }
    // Как в receipt.ts: N−1 штук по округлённой цене и одна штука на остаток.
    const head = price * (line.quantity - 1)
    return [
      {
        id: uniqueId(base),
        title,
        priceKop: price,
        quantity: line.quantity - 1,
        amountKop: head,
        subject: SUBJECT_COMMODITY,
      },
      {
        id: uniqueId(base),
        title,
        priceKop: totalKop - head,
        quantity: 1,
        amountKop: totalKop - head,
        subject: SUBJECT_COMMODITY,
      },
    ]
  })

  if (order.shippingRub > 0) {
    const shippingKop = order.shippingRub * 100
    lines.push({
      id: uniqueId('delivery'),
      title: 'Доставка',
      priceKop: shippingKop,
      quantity: 1,
      amountKop: shippingKop,
      subject: SUBJECT_SERVICE,
    })
  }

  const sum = lines.reduce((total, l) => total + l.amountKop, 0)
  if (sum !== order.totalRub * 100) {
    throw new Error(
      `yandex cart: sum of lines ${sum} != order total ${order.totalRub * 100} (${order.orderNumber})`,
    )
  }

  const items: YandexCartItem[] = lines.map((l) => ({
    productId: l.id,
    title: l.title,
    quantity: { count: String(l.quantity) },
    unitPrice: rub(l.priceKop),
    total: rub(l.amountKop),
    receipt: {
      tax: YANDEX_TAX_CODES[tax],
      measure: MEASURE_PIECES,
      paymentMethodType: PAYMENT_METHOD_FULL_PAYMENT,
      paymentSubjectType: l.subject,
    },
  }))
  return {
    cart: { items, total: { amount: rub(order.totalRub * 100) } },
    fiscalContact: fiscalContactOf(order),
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments`
Expected: PASS, включая `receipt.test.ts` и `tbank.test.ts` без правок.

Run: `npm run typecheck -w api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write api/src/lib/payments/receipt.ts api/src/lib/payments/yandexPay
git add api/src/lib/payments/receipt.ts api/src/lib/payments/yandexPay
git commit -m "$(cat <<'EOF'
feat(payments): конфигурация Яндекс Пэй и корзина с налогом позиций

Правило доступности (рубильник, ключи, песочница не на проде); корзина берёт
раскидку промокода из receipt.ts — там добавлен только export.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Клиент Yandex Pay API — создание заказа и статус

**Files:**

- Modify: `api/package.json`, `package-lock.json`
- Create: `api/src/lib/payments/yandexPay/client.ts`
- Test: `api/src/lib/payments/yandexPay/client.test.ts`

**Interfaces:**

- Consumes: `YandexPayConfig`, `getYandexPayConfig` (задача 2), `buildYandexCart` (задача 2), `parseReceiptConfig` (`receipt.ts`), тип `Fetch` (`tbank.ts`), `CreatePaymentResult`, `PaymentStatus` (`types.ts`).
- Produces:
  - `function mapYandexStatus(status: string | null | undefined): PaymentStatus`
  - `interface YandexClientDeps { config?: YandexPayConfig | null; fetch?: Fetch; env?: NodeJS.ProcessEnv }`
  - `async function createYandexOrder(order: Order, opts?: { preferSplit?: boolean }, deps?: YandexClientDeps): Promise<CreatePaymentResult | null>`
  - `async function getYandexOrderStatus(orderNumber: string, deps?: YandexClientDeps): Promise<PaymentStatus | 'unknown'>`

- [ ] **Step 1: Add the dependency**

```bash
npm install jose@6.2.12 -w api
```

Expected: `"jose": "^6.2.12"` в `api/package.json`, `node_modules/jose` `6.2.12` в `package-lock.json`.

- [ ] **Step 2: Write the failing test**

Создать `api/src/lib/payments/yandexPay/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Order } from '../../../entities/Order.js'
import { createYandexOrder, getYandexOrderStatus, mapYandexStatus } from './client.js'
import { yandexPayConfigFrom, type YandexPayConfig } from './config.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const API_KEY = 'test-api-key-not-real'
const ENV = {
  WEB_ORIGIN: 'https://ximi4ka.ru',
  TBANK_RECEIPT_TAX: 'none',
} as unknown as NodeJS.ProcessEnv

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

function cfg(mode: 'sandbox' | 'production' = 'production', apiKey = API_KEY): YandexPayConfig {
  return yandexPayConfigFrom({ yandexPayEnabled: true, yandexPayMode: mode }, {
    YANDEX_PAY_MERCHANT_ID: MERCHANT,
    YANDEX_PAY_API_KEY: apiKey,
  } as unknown as NodeJS.ProcessEnv)!
}

function order(extra: Partial<Order> = {}): Order {
  return {
    orderNumber: 'XM-2026-00042',
    publicToken: 'tok 123',
    items: [
      {
        productId: 'p1',
        productSnapshot: { name: 'Реагент', sku: null, priceRub: 100 },
        quantity: 2,
        unitPriceRub: 100,
        lineTotalRub: 200,
        isGift: false,
      },
    ],
    shippingRub: 350,
    promoDiscountRub: 0,
    totalRub: 550,
    customerEmail: 'buyer@example.com',
    customerPhone: '+79001234567',
    ...extra,
  } as unknown as Order
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const created = () =>
  vi.fn<FetchFn>(async () =>
    json({ code: 200, status: 'success', data: { paymentUrl: 'https://pay.ya.ru/l/abc' } }),
  )

function sent(fetchMock: ReturnType<typeof vi.fn<FetchFn>>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('mapYandexStatus', () => {
  it('сводит статусы Яндекса к статусам заказа', () => {
    expect(mapYandexStatus('CAPTURED')).toBe('paid')
    expect(mapYandexStatus('CONFIRMED')).toBe('paid')
    expect(mapYandexStatus('FAILED')).toBe('failed')
    expect(mapYandexStatus('VOIDED')).toBe('failed')
    for (const s of [
      'PENDING',
      'AUTHORIZED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      '',
      null,
      undefined,
    ]) {
      expect(mapYandexStatus(s)).toBe('pending')
    }
  })
})

describe('createYandexOrder', () => {
  it('боевой API, Api-Key, корзина, CARD+SPLIT, адреса возврата с секретом во фрагменте', async () => {
    const fetchMock = created()
    const result = await createYandexOrder(
      order(),
      {},
      { config: cfg(), fetch: fetchMock, env: ENV },
    )

    expect(result).toEqual({ externalId: 'XM-2026-00042', paymentUrl: 'https://pay.ya.ru/l/abc' })
    const { url, init, headers, body } = sent(fetchMock)
    expect(url).toBe('https://pay.yandex.ru/api/merchant/v1/orders')
    expect(init.method).toBe('POST')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(headers.Authorization).toBe(`Api-Key ${API_KEY}`)
    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(body).toMatchObject({
      orderId: 'XM-2026-00042',
      currencyCode: 'RUB',
      availablePaymentMethods: ['CARD', 'SPLIT'],
      fiscalContact: 'buyer@example.com',
      cart: { total: { amount: '550.00' } },
    })
    expect(body).not.toHaveProperty('preferredPaymentMethod')
    expect(body?.redirectUrls).toEqual({
      onSuccess: 'https://ximi4ka.ru/order/XM-2026-00042?new=1#t=tok%20123',
      onError: 'https://ximi4ka.ru/order/XM-2026-00042?payment=failed#t=tok%20123',
      onAbort: 'https://ximi4ka.ru/order/XM-2026-00042?payment=failed#t=tok%20123',
    })
  })

  it('Сплит — preferredPaymentMethod = SPLIT', async () => {
    const fetchMock = created()
    await createYandexOrder(
      order(),
      { preferSplit: true },
      { config: cfg(), fetch: fetchMock, env: ENV },
    )
    expect(sent(fetchMock).body).toMatchObject({ preferredPaymentMethod: 'SPLIT' })
  })

  it('песочница: свой хост, ключ — Merchant ID', async () => {
    const fetchMock = created()
    await createYandexOrder(order(), {}, { config: cfg('sandbox'), fetch: fetchMock, env: ENV })
    const { url, headers } = sent(fetchMock)
    expect(url).toBe('https://sandbox.pay.yandex.ru/api/merchant/v1/orders')
    expect(headers.Authorization).toBe(`Api-Key ${MERCHANT}`)
  })

  it('налог позиций — из TBANK_RECEIPT_TAX', async () => {
    const fetchMock = created()
    await createYandexOrder(
      order(),
      {},
      {
        config: cfg(),
        fetch: fetchMock,
        env: { ...ENV, TBANK_RECEIPT_TAX: 'vat22' } as NodeJS.ProcessEnv,
      },
    )
    const items = (sent(fetchMock).body?.cart as { items: Array<{ receipt: { tax: number } }> })
      .items
    expect(items.every((i) => i.receipt.tax === 11)).toBe(true)
  })

  it('отказ Яндекса → null; в логе HTTP и код, без ключа, секрета и почты', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<FetchFn>(async () =>
      json(
        {
          status: 'fail',
          reasonCode: 'ORDER_CART_DATA_ERROR',
          reason: 'bad cart for buyer@example.com tok 123',
        },
        400,
      ),
    )
    expect(
      await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV }),
    ).toBeNull()
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('HTTP 400')
    expect(line).toContain('ORDER_CART_DATA_ERROR')
    expect(line).not.toContain(API_KEY)
    expect(line).not.toContain('buyer@example.com')
    expect(line).not.toContain('tok 123')
  })

  it('сеть упала → null, код причины в логе', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<FetchFn>(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    })
    expect(
      await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV }),
    ).toBeNull()
    expect(String(spy.mock.calls[0]?.[0])).toContain('ECONNREFUSED')
  })

  it('ответ без paymentUrl → null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn<FetchFn>(async () => json({ status: 'success', data: {} }))
    expect(
      await createYandexOrder(order(), {}, { config: cfg(), fetch: fetchMock, env: ENV }),
    ).toBeNull()
  })

  it('корзина не сходится, нет конфигурации, ключа или WEB_ORIGIN — null и запроса нет', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = created()
    expect(
      await createYandexOrder(
        order({ totalRub: 1 }),
        {},
        { config: cfg(), fetch: fetchMock, env: ENV },
      ),
    ).toBeNull()
    expect(
      await createYandexOrder(order(), {}, { config: null, fetch: fetchMock, env: ENV }),
    ).toBeNull()
    expect(
      await createYandexOrder(
        order(),
        {},
        { config: cfg('production', ''), fetch: fetchMock, env: ENV },
      ),
    ).toBeNull()
    expect(
      await createYandexOrder(
        order(),
        {},
        { config: cfg(), fetch: fetchMock, env: {} as NodeJS.ProcessEnv },
      ),
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getYandexOrderStatus', () => {
  it('читает data.order.paymentStatus', async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      json({
        status: 'success',
        data: { order: { orderId: 'XM-2026-00042', paymentStatus: 'CAPTURED' } },
      }),
    )
    expect(await getYandexOrderStatus('XM-2026-00042', { config: cfg(), fetch: fetchMock })).toBe(
      'paid',
    )
    const { url, init } = sent(fetchMock)
    expect(url).toBe('https://pay.yandex.ru/api/merchant/v1/orders/XM-2026-00042')
    expect(init.method).toBe('GET')
  })

  it('ошибка, пустой статус, нет конфигурации или ключа → unknown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await getYandexOrderStatus('X', {
        config: cfg(),
        fetch: vi.fn<FetchFn>(async () => json({}, 500)),
      }),
    ).toBe('unknown')
    expect(
      await getYandexOrderStatus('X', {
        config: cfg(),
        fetch: vi.fn<FetchFn>(async () => json({ data: { order: { paymentStatus: null } } })),
      }),
    ).toBe('unknown')
    const never = vi.fn<FetchFn>()
    expect(await getYandexOrderStatus('X', { config: null, fetch: never })).toBe('unknown')
    expect(await getYandexOrderStatus('X', { config: cfg('production', ''), fetch: never })).toBe(
      'unknown',
    )
    expect(never).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments/yandexPay/client.test.ts`
Expected: FAIL — `Failed to load url ./client.js`.

- [ ] **Step 4: Implement**

Создать `api/src/lib/payments/yandexPay/client.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { Order } from '../../../entities/Order.js'
import { parseReceiptConfig } from '../receipt.js'
import type { Fetch } from '../tbank.js'
import type { CreatePaymentResult, PaymentStatus } from '../types.js'
import { buildYandexCart } from './cart.js'
import { getYandexPayConfig, type YandexPayConfig } from './config.js'

// Yandex Pay API (pay.yandex.ru/docs/ru/custom/backend/yandex-pay-api). Заказ создаёт
// сервер, покупатель уходит на paymentUrl. Внешний id платежа — наш номер заказа:
// Яндекс знает заказ по orderId, он же ключ идемпотентности создания.

// Чекаут ждёт ответ — запрос к Яндексу не должен висеть.
export const YANDEX_REQUEST_TIMEOUT_MS = 15_000
const MAX_LOG_TEXT = 300

// CAPTURED — списано, CONFIRMED — подтверждено; FAILED/VOIDED — окончательный провал.
// PENDING, AUTHORIZED, REFUNDED и прочее заказ не меняют (возвраты — вручную).
export function mapYandexStatus(status: string | null | undefined): PaymentStatus {
  switch (status) {
    case 'CAPTURED':
    case 'CONFIRMED':
      return 'paid'
    case 'FAILED':
    case 'VOIDED':
      return 'failed'
    default:
      return 'pending'
  }
}

export interface YandexClientDeps {
  /** Подмена конфигурации; не задана — getYandexPayConfig() (env + настройки сайта). */
  config?: YandexPayConfig | null
  fetch?: Fetch
  env?: NodeJS.ProcessEnv
}

interface YandexResponse {
  status?: string
  reasonCode?: string
  reason?: string
  data?: { paymentUrl?: string; order?: { orderId?: string; paymentStatus?: string | null } }
}

// Чужой текст в лог: наши значения вычёркиваем, управляющие символы убираем, длину режем.
function clip(value: unknown, secrets: Array<string | null | undefined> = []): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '-'
  let text = String(value)
  for (const secret of secrets) {
    if (secret && secret.length >= 4) text = text.split(secret).join('[redacted]')
  }
  const line = text
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LOG_TEXT)
  return line.length > 0 ? line : '-'
}

// У упавшего fetch причина лежит в cause.code (ECONNREFUSED, ETIMEDOUT…).
function errMessage(err: unknown, secrets: Array<string | null | undefined>): string {
  const message = clip(err instanceof Error ? err.message : err, secrets)
  const code = (err as { cause?: { code?: unknown } } | null | undefined)?.cause?.code
  return typeof code === 'string' ? `${message} (${clip(code)})` : message
}

async function resolveConfig(deps: YandexClientDeps): Promise<YandexPayConfig | null> {
  return deps.config !== undefined ? deps.config : getYandexPayConfig(deps.env ?? process.env)
}

async function call(
  cfg: YandexPayConfig,
  deps: YandexClientDeps,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ httpStatus: number; ok: boolean; body: YandexResponse }> {
  const doFetch: Fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Api-Key ${cfg.authKey}`,
      'Content-Type': 'application/json',
      'X-Request-Id': randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(YANDEX_REQUEST_TIMEOUT_MS),
  })
  const parsed = (await res.json().catch(() => null)) as YandexResponse | null
  return { httpStatus: res.status, ok: res.ok, body: parsed ?? {} }
}

// Любой сбой — null с записью в лог: заказ остаётся pending без ссылки и уходит
// менеджеру, как при отказе Т-Кассы.
export async function createYandexOrder(
  order: Order,
  opts: { preferSplit?: boolean } = {},
  deps: YandexClientDeps = {},
): Promise<CreatePaymentResult | null> {
  const env = deps.env ?? process.env
  const cfg = await resolveConfig(deps)
  if (!cfg || !cfg.authKey) {
    console.error(
      'yandex_pay: YANDEX_PAY_MERCHANT_ID / YANDEX_PAY_API_KEY не заданы — заказ не отправлен',
    )
    return null
  }
  const origin = (env.WEB_ORIGIN ?? '').replace(/\/+$/, '')
  if (!origin) {
    console.error('yandex_pay: WEB_ORIGIN не задан — некуда вернуть покупателя, заказ не отправлен')
    return null
  }

  let payload: Record<string, unknown>
  let contact: string
  try {
    // Неверная ставка в env или корзина, не сходящаяся с итогом, — отказ с логом.
    const { cart, fiscalContact } = buildYandexCart(order, parseReceiptConfig(env).tax)
    contact = fiscalContact
    const page = `${origin}/order/${encodeURIComponent(order.orderNumber)}`
    // Секрет — во фрагменте (#t=): браузер не шлёт его ни серверу, ни счётчикам.
    const t = encodeURIComponent(order.publicToken)
    const onError = `${page}?payment=failed#t=${t}`
    payload = {
      orderId: order.orderNumber,
      currencyCode: 'RUB',
      cart,
      availablePaymentMethods: ['CARD', 'SPLIT'],
      ...(opts.preferSplit ? { preferredPaymentMethod: 'SPLIT' } : {}),
      redirectUrls: { onSuccess: `${page}?new=1#t=${t}`, onError, onAbort: onError },
      fiscalContact,
      purpose: `Заказ ${order.orderNumber} на ximi4ka.ru`,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(
      `yandex_pay: корзина не собрана для ${order.orderNumber} — заказ не отправлен: ${reason}`,
    )
    return null
  }

  const secrets = [
    order.publicToken,
    order.publicToken ? encodeURIComponent(order.publicToken) : null,
    order.customerEmail,
    order.customerPhone,
    contact,
    cfg.apiKey,
    cfg.merchantId,
  ]
  try {
    const res = await call(cfg, deps, 'POST', '/api/merchant/v1/orders', payload)
    const paymentUrl = res.body.data?.paymentUrl
    if (!res.ok || res.body.status !== 'success' || typeof paymentUrl !== 'string' || !paymentUrl) {
      console.error(
        `yandex_pay: заказ ${order.orderNumber} не принят: HTTP ${res.httpStatus} status=${clip(res.body.status)} reasonCode=${clip(res.body.reasonCode, secrets)} reason=${clip(res.body.reason, secrets)}`,
      )
      return null
    }
    return { externalId: order.orderNumber, paymentUrl }
  } catch (err) {
    console.error(
      `yandex_pay: создание заказа ${order.orderNumber} не удалось: ${errMessage(err, secrets)}`,
    )
    return null
  }
}

export async function getYandexOrderStatus(
  orderNumber: string,
  deps: YandexClientDeps = {},
): Promise<PaymentStatus | 'unknown'> {
  const cfg = await resolveConfig(deps)
  if (!cfg || !cfg.authKey) return 'unknown'
  try {
    const res = await call(
      cfg,
      deps,
      'GET',
      `/api/merchant/v1/orders/${encodeURIComponent(orderNumber)}`,
    )
    if (!res.ok) {
      console.error(
        `yandex_pay: статус заказа ${orderNumber} не получен: HTTP ${res.httpStatus} reasonCode=${clip(res.body.reasonCode)}`,
      )
      return 'unknown'
    }
    const status = res.body.data?.order?.paymentStatus
    return typeof status === 'string' ? mapYandexStatus(status) : 'unknown'
  } catch (err) {
    console.error(
      `yandex_pay: статус заказа ${orderNumber} не получен: ${errMessage(err, [cfg.apiKey, cfg.merchantId])}`,
    )
    return 'unknown'
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments/yandexPay && npm run typecheck -w api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write api/src/lib/payments/yandexPay api/package.json
git add api/package.json package-lock.json api/src/lib/payments/yandexPay/client.ts api/src/lib/payments/yandexPay/client.test.ts
git commit -m "$(cat <<'EOF'
feat(payments): клиент Yandex Pay API — создание заказа и статус

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Вебхук Яндекс Пэй — проверка JWT, маршрут, сырое тело

**Files:**

- Create: `api/src/lib/payments/yandexPay/webhook.ts`
- Create: `api/src/routes/webhooks/yandexPay.ts`
- Modify: `api/src/app.ts:25` (импорт), перед `:76` (`express.json`)
- Test: `api/src/lib/payments/yandexPay/webhook.test.ts`, `api/src/routes/yandex-pay-webhook.test.ts`

**Interfaces:**

- Consumes: `getYandexPayConfig`, `YandexPayConfig` (задача 2), `mapYandexStatus` (задача 3), `applyPaymentStatus(order, status, 'yandex_pay')` (задача 1), `saveOrderWithStatusEvent` (`api/src/lib/notifications/outbox.ts`).
- Produces:
  - `type YandexWebhookReason = 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'OTHER'`
  - `type YandexWebhookResult = { ok: true; orderNumber: string; status: PaymentStatus } | { ok: false; reasonCode: YandexWebhookReason; reason: string }`
  - `interface YandexWebhookDeps { config?: YandexPayConfig | null; keys?: JWTVerifyGetKey }`
  - `async function verifyYandexWebhook(rawBody: Buffer | undefined, deps?: YandexWebhookDeps): Promise<YandexWebhookResult>`
  - `yandexPayWebhookRouter: Router` (`POST /v1/webhook`), `yandexPayWebhookErrors: ErrorRequestHandler`

- [ ] **Step 1: Write the failing verification test**

Создать `api/src/lib/payments/yandexPay/webhook.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { yandexPayConfigFrom } from './config.js'
import { verifyYandexWebhook } from './webhook.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'

// CryptoKey нет в глобальных типах api (без DOM) — берём тип у самого jose.
type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let privateKey: Key
let publicKey: Key
let otherKey: Key

beforeAll(async () => {
  const a = await generateKeyPair('ES256')
  privateKey = a.privateKey
  publicKey = a.publicKey
  otherKey = (await generateKeyPair('ES256')).privateKey
})

const config = (merchantId = MERCHANT) =>
  yandexPayConfigFrom({ yandexPayEnabled: true, yandexPayMode: 'production' }, {
    YANDEX_PAY_MERCHANT_ID: merchantId,
    YANDEX_PAY_API_KEY: 'k',
  } as unknown as NodeJS.ProcessEnv)

const verify = (raw: Buffer | undefined, keys: JWTVerifyGetKey = async () => publicKey) =>
  verifyYandexWebhook(raw, { config: config(), keys })

async function sign(
  payload: Record<string, unknown>,
  opts: { key?: Key; header?: Record<string, unknown>; exp?: number | string | null } = {},
): Promise<Buffer> {
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'test', ...(opts.header ?? {}) })
    .setIssuedAt()
  if (opts.exp !== null) jwt = jwt.setExpirationTime(opts.exp ?? '5m')
  return Buffer.from(await jwt.sign(opts.key ?? privateKey))
}

const orderEvent = (paymentStatus: string, extra: Record<string, unknown> = {}) => ({
  event: 'ORDER_STATUS_UPDATED',
  eventTime: '2026-10-24T12:00:00+00:00',
  merchantId: MERCHANT,
  order: { orderId: 'XM-2026-00042', paymentStatus },
  ...extra,
})

const now = () => Math.floor(Date.now() / 1000)

describe('verifyYandexWebhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('валидный CAPTURED → paid с номером заказа; FAILED, VOIDED, PENDING', async () => {
    expect(await verify(await sign(orderEvent('CAPTURED')))).toEqual({
      ok: true,
      orderNumber: 'XM-2026-00042',
      status: 'paid',
    })
    expect(await verify(await sign(orderEvent('CONFIRMED')))).toMatchObject({ status: 'paid' })
    expect(await verify(await sign(orderEvent('FAILED')))).toMatchObject({ status: 'failed' })
    expect(await verify(await sign(orderEvent('VOIDED')))).toMatchObject({ status: 'failed' })
    expect(await verify(await sign(orderEvent('PENDING')))).toMatchObject({ status: 'pending' })
  })

  it('OPERATION_STATUS_UPDATED проверяется, но заказ не меняет', async () => {
    const raw = await sign({
      event: 'OPERATION_STATUS_UPDATED',
      merchantId: MERCHANT,
      operation: {
        operationId: 'op1',
        orderId: 'XM-2026-00042',
        status: 'SUCCESS',
        operationType: 'REFUND',
      },
    })
    expect(await verify(raw)).toEqual({ ok: true, orderNumber: 'XM-2026-00042', status: 'pending' })
  })

  it('чужой merchantId → OTHER', async () => {
    const raw = await sign(orderEvent('CAPTURED', { merchantId: 'someone-else' }))
    expect(await verify(raw)).toMatchObject({ ok: false, reasonCode: 'OTHER' })
  })

  it('чужой ключ и подменённая подпись → UNAUTHORIZED', async () => {
    expect(await verify(await sign(orderEvent('CAPTURED'), { key: otherKey }))).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
    const s = (await sign(orderEvent('CAPTURED'))).toString()
    const tampered = Buffer.from(`${s.slice(0, -4)}${s.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`)
    expect(await verify(tampered)).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
  })

  it('просрочен (exp в нагрузке или в заголовке, как в примере Яндекса) → TOKEN_EXPIRED', async () => {
    expect(await verify(await sign(orderEvent('CAPTURED'), { exp: now() - 600 }))).toMatchObject({
      ok: false,
      reasonCode: 'TOKEN_EXPIRED',
    })
    const inHeader = await sign(orderEvent('CAPTURED'), { exp: null, header: { exp: now() - 600 } })
    expect(await verify(inHeader)).toMatchObject({ ok: false, reasonCode: 'TOKEN_EXPIRED' })
  })

  it('срок только в заголовке принимается; без срока и с iat из будущего — OTHER', async () => {
    expect(
      await verify(await sign(orderEvent('CAPTURED'), { exp: null, header: { exp: now() + 300 } })),
    ).toMatchObject({
      ok: true,
    })
    expect(await verify(await sign(orderEvent('CAPTURED'), { exp: null }))).toMatchObject({
      ok: false,
      reasonCode: 'OTHER',
    })
    expect(
      await verify(await sign(orderEvent('CAPTURED'), { header: { iat: now() + 3600 } })),
    ).toMatchObject({
      ok: false,
      reasonCode: 'OTHER',
    })
  })

  it('alg none и ES384 → UNAUTHORIZED', async () => {
    const none = Buffer.from(
      `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(orderEvent('CAPTURED'))).toString('base64url')}.`,
    )
    expect(await verify(none)).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
    const es384 = await generateKeyPair('ES384')
    const jwt = await new SignJWT(orderEvent('CAPTURED'))
      .setProtectedHeader({ alg: 'ES384', typ: 'JWT', kid: 'test' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(es384.privateKey)
    expect(await verify(Buffer.from(jwt), async () => es384.publicKey)).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
  })

  it('без конфигурации (нет Merchant ID), пустое тело и не-JWT → UNAUTHORIZED без исключений', async () => {
    const raw = await sign(orderEvent('CAPTURED'))
    expect(
      await verifyYandexWebhook(raw, { config: null, keys: async () => publicKey }),
    ).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
    expect(await verify(Buffer.alloc(0))).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
    expect(await verify(undefined)).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
    expect(await verify(Buffer.from('not a jwt'))).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
  })

  it('лог отказа — одна строка с именем и кодом ошибки jose, без токена', async () => {
    const spy = vi.mocked(console.error)
    const raw = await sign(orderEvent('CAPTURED'), { key: otherKey })
    await verify(raw)
    expect(spy).toHaveBeenCalledTimes(1)
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('ERR_JWS_SIGNATURE_VERIFICATION_FAILED')
    expect(line).not.toContain(raw.toString().split('.')[1]!)
  })
})
```

- [ ] **Step 2: Write the failing route test**

Создать `api/src/routes/yandex-pay-webhook.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const PATH = '/api/webhooks/yandex-pay/v1/webhook'

// JWKS без сети: createRemoteJWKSet отдаёт локальный ключ, адреса копим — чтобы
// проверить, что хост берётся из режима магазина, а не из запроса.
const jwks = vi.hoisted(() => ({ resolver: null as JWTVerifyGetKey | null, urls: [] as string[] }))
vi.mock('jose', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jose')>()),
  createRemoteJWKSet: (url: URL) => {
    jwks.urls.push(url.href)
    return (...args: Parameters<JWTVerifyGetKey>) => jwks.resolver!(...args)
  },
}))

// CryptoKey нет в глобальных типах api (без DOM) — берём тип у самого jose.
type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let privateKey: Key
let otherKey: Key
let app: ReturnType<typeof createApp>

async function signed(
  payload: Record<string, unknown>,
  opts: { key?: Key; exp?: number | string } = {},
) {
  return Buffer.from(
    await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'test' })
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? privateKey),
  )
}

const event = (orderId: string, paymentStatus: string, extra: Record<string, unknown> = {}) => ({
  merchantId: MERCHANT,
  event: 'ORDER_STATUS_UPDATED',
  eventTime: '2026-10-24T12:00:00+00:00',
  order: { orderId, paymentStatus },
  ...extra,
})

let seq = 0
async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-7${String(seq).padStart(4, '0')}`,
      status: 'pending',
      customerName: 'Тест Тестов',
      customerPhone: '+79001112233',
      customerEmail: 'test@example.com',
      deliveryAddress: { address: 'Москва', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 2000,
      shippingRub: 350,
      totalRub: 2350,
      paymentProvider: 'yandex_pay',
      paymentIntentId: null,
      statusHistory: [],
      ...overrides,
    }),
  )
}

const post = (body: Buffer) =>
  request(app).post(PATH).set('Content-Type', 'application/octet-stream').send(body)
const reload = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })

describe('POST /api/webhooks/yandex-pay/v1/webhook', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    const pair = await generateKeyPair('ES256')
    privateKey = pair.privateKey
    otherKey = (await generateKeyPair('ES256')).privateKey
    jwks.resolver = async () => pair.publicKey
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', MERCHANT)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await AppDataSource.getRepository(SiteSettings).save({
      id: 'default',
      yandexPayMode: 'sandbox',
    })
  })

  it.each(['CAPTURED', 'CONFIRMED'])(
    '%s — заказ оплачен, уведомления в очереди',
    async (status) => {
      const order = await seedOrder()
      const res = await post(await signed(event(order.orderNumber, status)))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'success' })
      const updated = await reload(order.id)
      expect(updated.status).toBe('paid')
      expect(updated.paymentIntentId).toBe(order.orderNumber)
      expect(updated.statusHistory).toEqual([
        expect.objectContaining({ from: 'pending', to: 'paid', by: 'yandex_pay' }),
      ])
      const events = await AppDataSource.getRepository(OrderNotification).find({
        where: { orderId: order.id },
        order: { channel: 'ASC' },
      })
      expect(events.map((e) => [e.channel, e.eventKey])).toEqual([
        ['sheets', 'status:paid'],
        ['telegram', 'status:paid'],
      ])
    },
  )

  it.each(['FAILED', 'VOIDED'])('%s — ожидающий заказ в failed', async (status) => {
    const order = await seedOrder()
    await post(await signed(event(order.orderNumber, status))).expect(200)
    expect((await reload(order.id)).status).toBe('failed')
  })

  it.each(['PENDING', 'AUTHORIZED', 'REFUNDED'])('%s — 200 без смены статуса', async (status) => {
    const order = await seedOrder()
    await post(await signed(event(order.orderNumber, status))).expect(200)
    const updated = await reload(order.id)
    expect(updated.status).toBe('pending')
    expect(updated.statusHistory).toEqual([])
  })

  it('повтор события — 200, история не дублируется; FAILED после оплаты не откатывает', async () => {
    const order = await seedOrder()
    const body = await signed(event(order.orderNumber, 'CAPTURED'))
    await post(body).expect(200)
    await post(body).expect(200)
    await post(await signed(event(order.orderNumber, 'FAILED'))).expect(200)
    const updated = await reload(order.id)
    expect(updated.status).toBe('paid')
    expect(updated.statusHistory).toHaveLength(1)
  })

  it('заказ Т-Кассы с тем же номером — 200, заказ не меняется', async () => {
    const order = await seedOrder({ paymentProvider: 'tbank', paymentIntentId: '777' })
    const res = await post(await signed(event(order.orderNumber, 'CAPTURED')))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'success' })
    const updated = await reload(order.id)
    expect(updated.status).toBe('pending')
    expect(updated.statusHistory).toEqual([])
    expect(updated.paymentIntentId).toBe('777')
  })

  it('неизвестный заказ — 200, чтобы Яндекс не повторял сутки', async () => {
    const res = await post(await signed(event('XM-0000-00000', 'CAPTURED')))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'success' })
  })

  it('мусор, пустое тело, чужая подпись — 401 UNAUTHORIZED; просрочен — 401 TOKEN_EXPIRED; чужой merchantId — 400 OTHER', async () => {
    const order = await seedOrder()
    const forged = await signed(event(order.orderNumber, 'CAPTURED'), { key: otherKey })
    for (const body of [Buffer.from('garbage'), Buffer.alloc(0), forged]) {
      const res = await post(body)
      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({ status: 'fail', reasonCode: 'UNAUTHORIZED' })
    }
    const expired = await post(
      await signed(event(order.orderNumber, 'CAPTURED'), {
        exp: Math.floor(Date.now() / 1000) - 600,
      }),
    )
    expect(expired.status).toBe(401)
    expect(expired.body).toMatchObject({ status: 'fail', reasonCode: 'TOKEN_EXPIRED' })
    const foreign = await post(
      await signed(event(order.orderNumber, 'CAPTURED', { merchantId: 'other' })),
    )
    expect(foreign.status).toBe(400)
    expect(foreign.body).toMatchObject({ status: 'fail', reasonCode: 'OTHER' })
    expect((await reload(order.id)).status).toBe('pending')
  })

  it('без YANDEX_PAY_MERCHANT_ID — 401, заказ не меняется', async () => {
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', '')
    const order = await seedOrder()
    expect((await post(await signed(event(order.orderNumber, 'CAPTURED')))).status).toBe(401)
    expect((await reload(order.id)).status).toBe('pending')
  })

  it('тело больше 64 КБ — 413 со status fail, не 500', async () => {
    const res = await post(Buffer.alloc(70 * 1024, 'a'))
    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ status: 'fail', reasonCode: 'OTHER' })
  })

  it('Content-Type application/json не ломает разбор: маршрут стоит до express.json', async () => {
    const order = await seedOrder()
    // Строкой: supertest сериализует Buffer в JSON при JSON Content-Type.
    const token = (await signed(event(order.orderNumber, 'CAPTURED'))).toString()
    const res = await request(app).post(PATH).set('Content-Type', 'application/json').send(token)
    expect(res.status).toBe(200)
    expect((await reload(order.id)).status).toBe('paid')
  })

  it('JWKS — только с хоста режима из настроек', async () => {
    const order = await seedOrder()
    await post(await signed(event(order.orderNumber, 'PENDING'))).expect(200)
    await AppDataSource.getRepository(SiteSettings).save({
      id: 'default',
      yandexPayMode: 'production',
    })
    await post(await signed(event(order.orderNumber, 'PENDING'))).expect(200)
    expect(jwks.urls).toContain('https://sandbox.pay.yandex.ru/api/jwks')
    expect(jwks.urls).toContain('https://pay.yandex.ru/api/jwks')
    expect(
      jwks.urls.every(
        (u) =>
          u === 'https://sandbox.pay.yandex.ru/api/jwks' || u === 'https://pay.yandex.ru/api/jwks',
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 3: Run both to verify they fail**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments/yandexPay/webhook.test.ts src/routes/yandex-pay-webhook.test.ts`
Expected: FAIL — нет `./webhook.js`; маршрут отвечает 404.

- [ ] **Step 4: Implement webhook.ts**

Создать `api/src/lib/payments/yandexPay/webhook.ts`:

```ts
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose'
import type { PaymentStatus } from '../types.js'
import { mapYandexStatus } from './client.js'
import { getYandexPayConfig, type YandexPayConfig } from './config.js'

// Вебхук Яндекс Пэй: тело — JWT ES256 (application/octet-stream). Ключ — из JWKS
// Яндекса по kid (адрес — из режима магазина, не из запроса); проверяются alg, typ,
// exp и iat (Яндекс кладёт их в заголовок), затем merchantId. reasonCode — по таблице
// Яндекса: UNAUTHORIZED (подпись), TOKEN_EXPIRED (срок), OTHER (прочее).

export type YandexWebhookReason = 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'OTHER'
export type YandexWebhookResult =
  | { ok: true; orderNumber: string; status: PaymentStatus }
  | { ok: false; reasonCode: YandexWebhookReason; reason: string }

export interface YandexWebhookDeps {
  /** Подмена конфигурации; не задана — getYandexPayConfig(). */
  config?: YandexPayConfig | null
  /** Подмена ключей — только для тестов. */
  keys?: JWTVerifyGetKey
}

// Допуск расхождения часов для iat/exp.
const CLOCK_SKEW_SEC = 60

// Один набор ключей на адрес на процесс: createRemoteJWKSet сам кеширует ключи и
// перезапрашивает набор, когда встречается неизвестный kid.
const keySets = new Map<string, JWTVerifyGetKey>()
function keysFor(url: string): JWTVerifyGetKey {
  let keys = keySets.get(url)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url))
    keySets.set(url, keys)
  }
  return keys
}

// iat/exp в заголовке: в примере Яндекса числа, в описании — строки.
function numericClaim(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function fail(reasonCode: YandexWebhookReason, reason: string): YandexWebhookResult {
  return { ok: false, reasonCode, reason }
}

export async function verifyYandexWebhook(
  rawBody: Buffer | undefined,
  deps: YandexWebhookDeps = {},
): Promise<YandexWebhookResult> {
  const cfg = deps.config !== undefined ? deps.config : await getYandexPayConfig()
  if (!cfg) return fail('UNAUTHORIZED', 'Yandex Pay is not configured')
  if (!rawBody || rawBody.length === 0) return fail('UNAUTHORIZED', 'Empty body')
  const token = rawBody.toString('utf8').trim()

  let header: ReturnType<typeof decodeProtectedHeader>
  try {
    header = decodeProtectedHeader(token)
  } catch (err) {
    console.error(
      `yandex_pay: webhook verification failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
    )
    return fail('UNAUTHORIZED', 'Body is not a JWT')
  }
  if (header.alg !== 'ES256') return fail('UNAUTHORIZED', 'Unexpected token algorithm')

  const now = Math.floor(Date.now() / 1000)
  const headerExp = numericClaim(header.exp)
  const headerIat = numericClaim(header.iat)
  if (headerExp !== undefined && headerExp + CLOCK_SKEW_SEC <= now) {
    return fail('TOKEN_EXPIRED', 'JWT token has expired')
  }
  if (headerIat !== undefined && headerIat > now + CLOCK_SKEW_SEC) {
    return fail('OTHER', 'JWT token is issued in the future')
  }

  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, deps.keys ?? keysFor(cfg.jwksUrl), {
      algorithms: ['ES256'],
      typ: 'JWT',
      clockTolerance: CLOCK_SKEW_SEC,
    }))
  } catch (err) {
    // Только имя и код ошибки: текст сообщения может повторять фрагмент токена.
    const code = (err as { code?: unknown } | null)?.code
    const name = err instanceof Error ? err.name : 'UnknownError'
    console.error(
      `yandex_pay: webhook verification failed: ${name}${typeof code === 'string' ? ` ${code}` : ''}`,
    )
    if (code === 'ERR_JWT_EXPIRED') return fail('TOKEN_EXPIRED', 'JWT token has expired')
    if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') return fail('OTHER', 'Invalid token claims')
    return fail('UNAUTHORIZED', 'Invalid token signature')
  }

  // Токен без срока годился бы для повтора вечно.
  if (headerExp === undefined && typeof payload.exp !== 'number') {
    return fail('OTHER', 'JWT token has no expiry')
  }
  if (payload.merchantId !== cfg.merchantId) return fail('OTHER', 'Invalid merchantId')

  const order = payload.order as { orderId?: unknown; paymentStatus?: unknown } | undefined
  const operation = payload.operation as { orderId?: unknown } | undefined
  const orderId = order?.orderId ?? operation?.orderId
  if (typeof orderId !== 'string' || orderId === '') return fail('OTHER', 'No orderId in event')

  // Меняет заказ только ORDER_STATUS_UPDATED; остальные проверенные события — pending.
  const status: PaymentStatus =
    payload.event === 'ORDER_STATUS_UPDATED' && typeof order?.paymentStatus === 'string'
      ? mapYandexStatus(order.paymentStatus)
      : 'pending'
  return { ok: true, orderNumber: orderId, status }
}
```

- [ ] **Step 5: Implement the route and mount it before express.json**

Создать `api/src/routes/webhooks/yandexPay.ts`:

```ts
import { Router, type ErrorRequestHandler } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { applyPaymentStatus } from '../../lib/payments/orderStatus.js'
import { verifyYandexWebhook } from '../../lib/payments/yandexPay/webhook.js'
import { saveOrderWithStatusEvent } from '../../lib/notifications/outbox.js'

export const yandexPayWebhookRouter: Router = Router()

// HTTP-статус отказа по reasonCode. Любой не-200 Яндекс повторяет до суток.
const FAIL_STATUS = { UNAUTHORIZED: 401, TOKEN_EXPIRED: 401, OTHER: 400 } as const

// Уведомления Яндекс Пэй. Callback URL в кабинете — https://ximi4ka.ru/api/webhooks/yandex-pay,
// путь /v1/webhook Яндекс дописывает сам. 200 {"status":"success"} — обработано, в том
// числе неизвестный заказ, заказ другого провайдера и повтор статуса; не-200 — только
// при неудачной проверке токена. Статус применяется как у Т-Кассы: уведомления, выдача
// материалов и офлайн-конверсии Метрики срабатывают без доработок.
yandexPayWebhookRouter.post('/v1/webhook', async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined
    const result = await verifyYandexWebhook(rawBody)
    if (!result.ok) {
      res
        .status(FAIL_STATUS[result.reasonCode])
        .json({ status: 'fail', reasonCode: result.reasonCode, reason: result.reason })
      return
    }

    const order = await AppDataSource.getRepository(Order).findOneBy({
      orderNumber: result.orderNumber,
    })
    if (!order) {
      console.error(`yandex_pay webhook: заказ ${result.orderNumber} не найден — ответили 200`)
      res.status(200).json({ status: 'success' })
      return
    }
    // Подписанное событие не трогает заказы Т-Кассы и ручной оплаты с совпавшим номером.
    if (order.paymentProvider !== 'yandex_pay') {
      console.error(
        `yandex_pay webhook: заказ ${order.orderNumber} оплачивается не через Яндекс Пэй`,
      )
      res.status(200).json({ status: 'success' })
      return
    }

    let changed = false
    if (!order.paymentIntentId) {
      order.paymentIntentId = result.orderNumber
      changed = true
    }
    // Повтор того же статуса — no-op внутри applyPaymentStatus.
    const previousStatus = order.status
    if (applyPaymentStatus(order, result.status, 'yandex_pay')) changed = true
    if (changed) await saveOrderWithStatusEvent(order, previousStatus)

    res.status(200).json({ status: 'success' })
  } catch (err) {
    next(err)
  }
})

// express.raw отклоняет тело больше лимита (entity.too.large) — отвечаем в формате
// Яндекса, а не общим 500.
export const yandexPayWebhookErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if ((err as { type?: unknown } | null)?.type === 'entity.too.large') {
    res
      .status(413)
      .json({ status: 'fail', reasonCode: 'OTHER', reason: 'Request body is too large' })
    return
  }
  next(err)
}
```

`api/src/app.ts` — после `import { tbankWebhookRouter } from './routes/webhooks/tbank.js'` добавить:

```ts
import { yandexPayWebhookErrors, yandexPayWebhookRouter } from './routes/webhooks/yandexPay.js'
```

Перед `app.use(express.json({ limit: '1mb' }))` (строка 76) вставить:

```ts
// Вебхук Яндекс Пэй: тело — JWT в application/octet-stream, нужны сырые байты.
// Стоит ДО express.json; лимит 64 КБ — событие весит меньше килобайта.
app.use(
  '/api/webhooks/yandex-pay',
  express.raw({ type: '*/*', limit: '64kb' }),
  yandexPayWebhookRouter,
  yandexPayWebhookErrors,
)
```

- [ ] **Step 6: Run tests and typecheck**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/lib/payments src/routes/yandex-pay-webhook.test.ts src/routes/tbank-webhook.test.ts && npm run typecheck -w api`
Expected: PASS (вебхук Т-Кассы — без изменений).

- [ ] **Step 7: Commit**

```bash
npx prettier --write api/src/lib/payments/yandexPay api/src/routes/webhooks/yandexPay.ts api/src/routes/yandex-pay-webhook.test.ts api/src/app.ts
git add api/src/lib/payments/yandexPay/webhook.ts api/src/lib/payments/yandexPay/webhook.test.ts api/src/routes/webhooks/yandexPay.ts api/src/routes/yandex-pay-webhook.test.ts api/src/app.ts
git commit -m "$(cat <<'EOF'
feat(payments): вебхук Яндекс Пэй — проверка JWT ES256 и маршрут с сырым телом

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Чекаут API, публичные настройки, ссылка «Оплатить», сверка

**Files:**

- Modify: `api/src/routes/checkout.schemas.ts:123`; `api/src/routes/checkout.ts:14`, `:131`, `:249`, `:320`
- Modify: `api/src/routes/public/settings.ts:2`, `:37`
- Modify: `api/src/routes/public/orders.ts:61`, `:73`
- Modify: `api/src/lib/payments/reconcile.ts:3`, `:44`, `:57-60`; `api/src/index.ts:26-30`
- Test: `api/src/routes/checkout-yandex-pay.test.ts`, `api/src/routes/public/settingsYandexPay.test.ts`, `api/src/routes/public/orderPaymentLink.test.ts`, `api/src/lib/payments/reconcile.yandex.test.ts` (все нов.)

**Interfaces:**

- Consumes: `isYandexPayAvailable`, `publicYandexPay`, `yandexPayConfigFrom`, `hasYandexPayMerchant` (задача 2); `createYandexOrder`, `getYandexOrderStatus` (задача 3).
- Produces:
  - `POST /api/checkout` — `paymentMethod?: 'tbank' | 'yandex_pay' | 'yandex_split'`; `400 payment_method_unavailable` (Яндекс недоступен или доставка `cdek_manual_cis`), `400 validation_error` на неизвестное значение; заказ Яндекса — `payment_provider = 'yandex_pay'`, `paymentIntentId = orderNumber`.
  - `GET /api/public/settings` → `data.yandexPay: PublicYandexPay | null`.
  - `GET /api/public/orders/:number/status` → `paymentUrl` только с верным `?t=`, `pending`, `yandex_pay`.
  - `reconcilePendingOrders(provider, minAgeMs?)` — заказы `yandex_pay` идут в `getYandexOrderStatus(orderNumber)`; `startReconciliationJob(provider?, env?)` стартует, если провайдер `tbank` или задан `YANDEX_PAY_MERCHANT_ID`.

- [ ] **Step 1: Write the failing checkout test**

Создать `api/src/routes/checkout-yandex-pay.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { Product } from '../entities/Product.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'

// Т-Касса ходит через tbankFetch, Яндекс — через глобальный fetch: подменяем оба.
const tbankFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/payments/tbankTransport.js', () => ({ tbankFetch: tbankFetchMock }))

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const API_KEY = 'test-api-key-not-real'
const ORDERS = '/api/merchant/v1/orders'

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

async function seedProduct(
  priceRub = 2000,
  slug = `kit-${Math.random().toString(36).slice(2, 8)}`,
) {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug,
      name: 'Набор юного химика',
      sku: slug.toUpperCase(),
      priceRub,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
    }),
  )
}

function body(
  items: Array<{ productId: string; quantity: number }>,
  extra: Record<string, unknown> = {},
) {
  return {
    items,
    customer: { name: 'Иван Иванов', phone: '+79001234567', email: 'ivan@example.com' },
    delivery: {
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK123',
      address: 'Москва, ул. Ленина, 1',
    },
    ...extra,
  }
}

function cisBody(productId: string, extra: Record<string, unknown> = {}) {
  return body([{ productId, quantity: 1 }], {
    customer: { name: 'Алесь Новик', phone: '+375291234567', email: 'ales@example.com' },
    delivery: {
      method: 'cdek_manual_cis',
      country: 'BY',
      city: 'Минск',
      address: 'ул. Ленина, 5, ПВЗ СДЭК',
    },
    ...extra,
  })
}

const setYandex = (yandexPayEnabled: boolean, yandexPayMode: 'sandbox' | 'production') =>
  AppDataSource.getRepository(SiteSettings).save({ id: 'default', yandexPayEnabled, yandexPayMode })

function stubYandex(paymentUrl = 'https://pay.ya.ru/l/test-1') {
  const fetchMock = vi.fn<FetchFn>(
    async () =>
      new Response(JSON.stringify({ status: 'success', data: { paymentUrl } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const yandexCalls = (fetchMock: ReturnType<typeof vi.fn<FetchFn>>) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes(ORDERS))
    .map(([url, init]) => ({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    }))

const findOrder = (orderNumber: string) =>
  AppDataSource.getRepository(Order).findOneByOrFail({ orderNumber })

describe('POST /api/checkout: Яндекс Пэй', () => {
  let app: ReturnType<typeof createApp>
  const checkout = (payload: unknown, key?: string) => {
    const req = request(app).post('/api/checkout')
    return (key ? req.set('Idempotency-Key', key) : req).send(payload)
  }

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
    vi.stubEnv('PAYMENT_PROVIDER', '')
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', MERCHANT)
    vi.stubEnv('YANDEX_PAY_API_KEY', API_KEY)
    vi.stubEnv('WEB_ORIGIN', 'https://ximi4ka.ru')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await setYandex(true, 'production')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    tbankFetchMock.mockReset()
    await setYandex(false, 'sandbox')
  })

  it('без paymentMethod — как сейчас (ручная оплата), Яндекс не вызывается', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(body([{ productId: p.id, quantity: 1 }]))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    expect((await findOrder(res.body.data.orderNumber)).paymentProvider).toBe('manual')
    expect(yandexCalls(yandex)).toEqual([])
  })

  it('paymentMethod=tbank — как сейчас через PAYMENT_PROVIDER=tbank', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    vi.stubEnv('TBANK_TERMINAL_KEY', 'TestTerminal')
    vi.stubEnv('TBANK_PASSWORD', 'secret')
    tbankFetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Success: true,
        PaymentId: 42,
        PaymentURL: 'https://securepay.tinkoff.ru/pay/42',
      }),
    }))
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'tbank' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://securepay.tinkoff.ru/pay/42')
    expect((await findOrder(res.body.data.orderNumber)).paymentProvider).toBe('tbank')
    expect(yandexCalls(yandex)).toEqual([])
  })

  it('yandex_pay — заказ в Яндексе без preferredPaymentMethod, ссылка сохранена', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://pay.ya.ru/l/test-1')
    const order = await findOrder(res.body.data.orderNumber)
    expect(order).toMatchObject({
      paymentProvider: 'yandex_pay',
      paymentIntentId: order.orderNumber,
      paymentUrl: 'https://pay.ya.ru/l/test-1',
    })
    const [call] = yandexCalls(yandex)
    expect(call.url).toBe(`https://pay.yandex.ru${ORDERS}`)
    expect(call.headers.Authorization).toBe(`Api-Key ${API_KEY}`)
    expect(call.body).toMatchObject({
      orderId: order.orderNumber,
      cart: { total: { amount: '2350.00' } },
    })
    expect(call.body).not.toHaveProperty('preferredPaymentMethod')
  })

  it('yandex_split — тот же провайдер, форма на Сплите', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_split' }),
    )
    expect(res.status).toBe(201)
    expect((await findOrder(res.body.data.orderNumber)).paymentProvider).toBe('yandex_pay')
    expect(yandexCalls(yandex)[0].body).toMatchObject({ preferredPaymentMethod: 'SPLIT' })
  })

  it('промокод: корзина Яндекса сходится с итогом заказа', async () => {
    const yandex = stubYandex()
    const a = await seedProduct(1000, 'promo-a')
    const b = await seedProduct(111, 'promo-b')
    const res = await checkout(
      body(
        [
          { productId: a.id, quantity: 1 },
          { productId: b.id, quantity: 3 },
        ],
        { promoCode: 'RENATA2026', paymentMethod: 'yandex_pay' },
      ),
    )
    expect(res.status).toBe(201)
    const order = await findOrder(res.body.data.orderNumber)
    const cart = yandexCalls(yandex)[0].body.cart as {
      items: Array<{ total: string }>
      total: { amount: string }
    }
    expect(cart.total.amount).toBe(`${order.totalRub}.00`)
    expect(cart.items.reduce((s, i) => s + Math.round(Number(i.total) * 100), 0)).toBe(
      order.totalRub * 100,
    )
  })

  it('рубильник выключили после загрузки чекаута — 400, заказа нет, Яндекс не вызывается', async () => {
    await setYandex(false, 'production')
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('payment_method_unavailable')
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
    expect(yandexCalls(yandex)).toEqual([])
  })

  it('боевой режим без ключа API — 400', async () => {
    vi.stubEnv('YANDEX_PAY_API_KEY', '')
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_split' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('payment_method_unavailable')
  })

  it('песочница: вне прода — заказ в песочнице с Merchant ID как ключом; при NODE_ENV=production — 400', async () => {
    await setYandex(true, 'sandbox')
    const yandex = stubYandex('https://sandbox.pay.yandex.ru/l/test-2')
    const p = await seedProduct()
    const ok = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(ok.status).toBe(201)
    const [call] = yandexCalls(yandex)
    expect(call.url).toBe(`https://sandbox.pay.yandex.ru${ORDERS}`)
    expect(call.headers.Authorization).toBe(`Api-Key ${MERCHANT}`)

    vi.stubEnv('NODE_ENV', 'production')
    const rejected = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.code).toBe('payment_method_unavailable')
  })

  it('доставка в ЕАЭС + Яндекс — 400, заказа нет', async () => {
    stubYandex()
    const p = await seedProduct()
    for (const paymentMethod of ['yandex_pay', 'yandex_split']) {
      const res = await checkout(cisBody(p.id, { paymentMethod }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('payment_method_unavailable')
    }
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
  })

  it('повтор с тем же Idempotency-Key — один заказ в Яндексе и та же ссылка', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const payload = body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' })
    const first = await checkout(payload, 'retry-yp-1')
    const second = await checkout(payload, 'retry-yp-1')
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.data).toEqual(first.body.data)
    expect(yandexCalls(yandex)).toHaveLength(1)
    expect(await AppDataSource.getRepository(Order).count()).toBe(1)
  })

  it('Яндекс не ответил — заказ создан без ссылки и ждёт менеджера', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchFn>(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    expect(await findOrder(res.body.data.orderNumber)).toMatchObject({
      status: 'pending',
      paymentProvider: 'yandex_pay',
      paymentIntentId: null,
    })
  })

  it('неизвестный paymentMethod — 400 validation_error', async () => {
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'paypal' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })
})
```

- [ ] **Step 2: Write the failing settings, status-link and reconcile tests**

Создать `api/src/routes/public/settingsYandexPay.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { SiteSettings } from '../../entities/SiteSettings.js'
import { createApp } from '../../app.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const API_KEY = 'test-api-key-not-real'

const setYandex = (yandexPayEnabled: boolean, yandexPayMode: 'sandbox' | 'production') =>
  AppDataSource.getRepository(SiteSettings).save({ id: 'default', yandexPayEnabled, yandexPayMode })

describe('GET /api/public/settings: yandexPay', () => {
  const app = createApp()
  const get = () => request(app).get('/api/public/settings')

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', MERCHANT)
    vi.stubEnv('YANDEX_PAY_API_KEY', API_KEY)
    await setYandex(true, 'production')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await setYandex(false, 'sandbox')
  })

  it('боевой режим — Сплит и Merchant ID; ключа API в ответе нет', async () => {
    const res = await get()
    expect(res.body.data.yandexPay).toEqual({ split: true, merchantId: MERCHANT })
    expect(res.text).not.toContain(API_KEY)
  })

  it('выключен рубильник, нет Merchant ID или ключа боевого режима — null', async () => {
    await setYandex(false, 'production')
    expect((await get()).body.data.yandexPay).toBeNull()
    await setYandex(true, 'production')
    vi.stubEnv('YANDEX_PAY_API_KEY', '')
    expect((await get()).body.data.yandexPay).toBeNull()
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', '')
    expect((await get()).body.data.yandexPay).toBeNull()
  })

  it('песочница: вне прода — без Merchant ID (он же ключ); при NODE_ENV=production — null', async () => {
    await setYandex(true, 'sandbox')
    const res = await get()
    expect(res.body.data.yandexPay).toEqual({ split: true })
    expect(res.text).not.toContain(MERCHANT)
    vi.stubEnv('NODE_ENV', 'production')
    expect((await get()).body.data.yandexPay).toBeNull()
  })
})
```

Создать `api/src/routes/public/orderPaymentLink.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { resetAccountTables, seedOrder } from '../testUtils.js'

const LINK = 'https://pay.ya.ru/l/test-link'

describe('статус заказа: ссылка «Оплатить» для Яндекс Пэй', () => {
  const app = createApp()
  const status = (number: string, t?: string) =>
    request(app)
      .get(`/api/public/orders/${number}/status`)
      .query(t ? { t } : {})

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
  })

  it('неоплаченный заказ Яндекс Пэй с верным секретом — ссылка есть', async () => {
    const order = await seedOrder({ paymentProvider: 'yandex_pay', paymentUrl: LINK })
    expect((await status(order.orderNumber, order.publicToken)).body.data.paymentUrl).toBe(LINK)
  })

  it('без секрета или с чужим — поля нет', async () => {
    const order = await seedOrder({ paymentProvider: 'yandex_pay', paymentUrl: LINK })
    expect((await status(order.orderNumber)).body.data).not.toHaveProperty('paymentUrl')
    const wrong = 'x'.repeat(order.publicToken.length)
    expect((await status(order.orderNumber, wrong)).body.data).not.toHaveProperty('paymentUrl')
  })

  it('оплаченный заказ и заказ Т-Кассы — поля нет', async () => {
    const paid = await seedOrder({
      paymentProvider: 'yandex_pay',
      paymentUrl: LINK,
      status: 'paid',
    })
    expect((await status(paid.orderNumber, paid.publicToken)).body.data).not.toHaveProperty(
      'paymentUrl',
    )
    const tbank = await seedOrder({
      paymentProvider: 'tbank',
      paymentUrl: 'https://securepay.tinkoff.ru/x',
    })
    expect((await status(tbank.orderNumber, tbank.publicToken)).body.data).not.toHaveProperty(
      'paymentUrl',
    )
  })
})
```

Создать `api/src/lib/payments/reconcile.yandex.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { ManualProvider } from './manual.js'
import { reconcilePendingOrders, startReconciliationJob } from './reconcile.js'
import type { PaymentProvider } from './types.js'

const yandex = vi.hoisted(() => ({ getYandexOrderStatus: vi.fn() }))
vi.mock('./yandexPay/client.js', () => yandex)

function tbankProvider(calls: string[]): PaymentProvider {
  return {
    name: 'tbank',
    async createPayment() {
      return null
    },
    verifyAndParseWebhook() {
      return null
    },
    async getStatus(externalId: string) {
      calls.push(externalId)
      return 'paid'
    },
  }
}

async function seedOrder(overrides: Partial<Order>): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  const order = await repo.save(
    repo.create({
      status: 'pending',
      customerName: 'Тест',
      customerPhone: '+79000000000',
      customerEmail: '',
      deliveryAddress: { address: 'СПб', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 1000,
      shippingRub: 350,
      totalRub: 1350,
      statusHistory: [],
      ...overrides,
    }),
  )
  await AppDataSource.query(
    `UPDATE orders SET created_at = now() - interval '5 minutes' WHERE id = $1`,
    [order.id],
  )
  return order
}

describe('сверка: заказы Яндекс Пэй', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    yandex.getYandexOrderStatus.mockReset()
  })

  it('заказ Яндекса — к Яндексу по номеру, заказ Т-Кассы — как раньше', async () => {
    const tbankOrder = await seedOrder({
      orderNumber: 'XM-2026-81001',
      paymentProvider: 'tbank',
      paymentIntentId: '9001',
    })
    const yandexOrder = await seedOrder({
      orderNumber: 'XM-2026-81002',
      paymentProvider: 'yandex_pay',
      paymentIntentId: 'XM-2026-81002',
    })
    yandex.getYandexOrderStatus.mockResolvedValue('failed')
    const calls: string[] = []

    expect(await reconcilePendingOrders(tbankProvider(calls))).toEqual({ checked: 2, updated: 2 })
    expect(calls).toEqual(['9001'])
    expect(yandex.getYandexOrderStatus).toHaveBeenCalledWith('XM-2026-81002')
    const repo = AppDataSource.getRepository(Order)
    expect((await repo.findOneByOrFail({ id: tbankOrder.id })).status).toBe('paid')
    expect(await repo.findOneByOrFail({ id: yandexOrder.id })).toMatchObject({
      status: 'failed',
      statusHistory: [expect.objectContaining({ by: 'reconcile', to: 'failed' })],
    })
  })

  it('Яндекс ответил unknown — заказ не трогаем', async () => {
    const order = await seedOrder({
      orderNumber: 'XM-2026-81003',
      paymentProvider: 'yandex_pay',
      paymentIntentId: 'XM-2026-81003',
    })
    yandex.getYandexOrderStatus.mockResolvedValue('unknown')
    expect(await reconcilePendingOrders(new ManualProvider())).toEqual({ checked: 1, updated: 0 })
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })).status,
    ).toBe('pending')
  })
})

describe('startReconciliationJob: Яндекс', () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

  it('ручная оплата без Merchant ID — не стартует; с Merchant ID — стартует', () => {
    expect(startReconciliationJob(new ManualProvider(), env({}))).toBeNull()
    const timer = startReconciliationJob(
      new ManualProvider(),
      env({ YANDEX_PAY_MERCHANT_ID: 'M-1' }),
    )
    expect(timer).not.toBeNull()
    clearInterval(timer!)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/routes/checkout-yandex-pay.test.ts src/routes/public/settingsYandexPay.test.ts src/routes/public/orderPaymentLink.test.ts src/lib/payments/reconcile.yandex.test.ts`
Expected: FAIL — `paymentMethod` отбрасывается схемой (заказы уходят в `manual`), `yandexPay` и `paymentUrl` — `undefined`, сверка вызывает `getStatus` вместо Яндекса, задача сверки не стартует при одном Merchant ID.

- [ ] **Step 4: Implement checkout**

`api/src/routes/checkout.schemas.ts` — после `promoCode: z.string().max(64).optional(),`:

```ts
  // Способ оплаты: нет или tbank — как раньше (PAYMENT_PROVIDER); yandex_* роут
  // принимает, только когда Яндекс доступен (иначе 400 payment_method_unavailable).
  paymentMethod: z.enum(['tbank', 'yandex_pay', 'yandex_split']).optional(),
```

`api/src/routes/checkout.ts` — после `import { MAX_EMAIL_LENGTH } from '../lib/payments/receipt.js'` (строка 14) добавить:

```ts
import { createYandexOrder } from '../lib/payments/yandexPay/client.js'
import { isYandexPayAvailable } from '../lib/payments/yandexPay/config.js'
```

После закрывающей `}` блока `if (parsed.delivery.method === 'cdek_manual_cis') { … }` (строка 130) и перед комментарием `// Пункт сверяем со списком города…` вставить:

```ts
// Яндекс Пэй / Сплит: проверяем до расчёта доставки и до заказа — недоступный
// способ даёт 400 без заказа. При доставке в ЕАЭС пунктов Яндекса нет (спека),
// правило проверяет и сервер. Без paymentMethod или с tbank — всё как раньше.
const yandexMethod =
  parsed.paymentMethod === 'yandex_pay' || parsed.paymentMethod === 'yandex_split'
if (yandexMethod) {
  if (parsed.delivery.method === 'cdek_manual_cis') {
    throw badRequest(
      'payment_method_unavailable',
      'Яндекс Пэй и Сплит недоступны при доставке в страны ЕАЭС',
    )
  }
  if (!(await isYandexPayAvailable())) {
    throw badRequest('payment_method_unavailable', 'Яндекс Пэй сейчас недоступен')
  }
}
```

Строку 249 (`paymentProvider: provider.name,`) заменить:

```ts
            paymentProvider: yandexMethod ? 'yandex_pay' : provider.name,
```

Строку 320 (`const payment = await provider.createPayment(order)`) заменить:

```ts
const payment = yandexMethod
  ? await createYandexOrder(order, { preferSplit: parsed.paymentMethod === 'yandex_split' })
  : await provider.createPayment(order)
```

Идемпотентный повтор (строки 96–102) возвращает сохранённый заказ раньше этого кода — второй запрос в Яндекс не уходит.

- [ ] **Step 5: Implement public settings and the status link**

`api/src/routes/public/settings.ts` — после `import { getSettings } from '../../lib/settings.js'`:

```ts
import { publicYandexPay, yandexPayConfigFrom } from '../../lib/payments/yandexPay/config.js'
```

В объект `data` после `testimonials: s.testimonials,` добавить:

```ts
        // Яндекс Пэй для витрины: null — недоступен; Merchant ID — только в боевом
        // режиме. Рубильник и режим сами по-прежнему не отдаются.
        yandexPay: publicYandexPay(yandexPayConfigFrom(s)),
```

`api/src/routes/public/orders.ts` — после `const withSecret = tokenMatches(req.query.t, order.publicToken)` (строка 61):

```ts
// Кнопка «Оплатить»: ссылка на форму Яндекса — только с секретом и пока заказ
// Яндекс Пэй не оплачен.
const payLink =
  withSecret && order.status === 'pending' && order.paymentProvider === 'yandex_pay'
    ? order.paymentUrl
    : null
```

В объект `data` после `...(withSecret ? { materials: await listOrderMaterials(order.id) } : {}),`:

```ts
          ...(payLink ? { paymentUrl: payLink } : {}),
```

- [ ] **Step 6: Implement reconcile**

`api/src/lib/payments/reconcile.ts` — после `import { getPaymentProvider } from './index.js'` добавить:

```ts
import { getYandexOrderStatus } from './yandexPay/client.js'
import { hasYandexPayMerchant } from './yandexPay/config.js'
```

Строку 44 (`const status = await provider.getStatus(order.paymentIntentId!)`) заменить:

```ts
// Заказ Яндекс Пэй сверяется у Яндекса по номеру заказа, остальные — как раньше.
const status =
  order.paymentProvider === 'yandex_pay'
    ? await getYandexOrderStatus(order.orderNumber)
    : await provider.getStatus(order.paymentIntentId!)
```

Строки 57–60 (сигнатура и условие запуска) заменить:

```ts
export function startReconciliationJob(
  provider: PaymentProvider = getPaymentProvider(),
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.Timeout | null {
  // Т-Касса — как раньше; Яндекс досверяется, пока задан его Merchant ID.
  if (provider.name !== 'tbank' && !hasYandexPayMerchant(env)) return null
```

`api/src/index.ts` — строки 26–30 заменить:

```ts
// Polls Т-Касса (PAYMENT_PROVIDER=tbank) and Яндекс Пэй (YANDEX_PAY_MERCHANT_ID)
// for pending orders whose webhook never arrived. No-op otherwise.
if (startReconciliationJob()) {
  logger.info('payment reconciliation job started')
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test -w api -- src/routes src/lib/payments && npm run typecheck -w api`
Expected: PASS — новые тесты и все прежние (`checkout.test.ts`, `settings.test.ts`, `reconcile.test.ts`, `tbank*.test.ts`) без правок.

- [ ] **Step 8: Commit**

```bash
npx prettier --write api/src/routes api/src/lib/payments/reconcile.ts api/src/lib/payments/reconcile.yandex.test.ts api/src/index.ts
git add api/src/routes/checkout.schemas.ts api/src/routes/checkout.ts api/src/routes/checkout-yandex-pay.test.ts api/src/routes/public/settings.ts api/src/routes/public/settingsYandexPay.test.ts api/src/routes/public/orders.ts api/src/routes/public/orderPaymentLink.test.ts api/src/lib/payments/reconcile.ts api/src/lib/payments/reconcile.yandex.test.ts api/src/index.ts
git commit -m "$(cat <<'EOF'
feat(payments): Яндекс Пэй в чекауте, публичных настройках и сверке

paymentMethod yandex_pay/yandex_split, 400 на недоступный Яндекс и на ЕАЭС,
повтор по ключу идемпотентности без второго заказа в Яндексе; yandexPay в
публичных настройках (Merchant ID — только в боевом режиме); ссылка «Оплатить».

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Витрина — плашка Сплита на карточке товара и в корзинах

**Files:**

- Modify: `web/lib/api.ts:1-16` (импорт типа), `:313-328` (`PublicSettings`)
- Create: `web/lib/yandexPay.ts`, `web/types/yandex-pay.d.ts`, `web/components/payments/SplitBadge.tsx`
- Modify: `web/app/[locale]/(public)/product/[slug]/page.tsx`, `web/app/[locale]/(public)/cart/page.tsx`, `web/components/CartDrawer.tsx`
- Test: `web/lib/yandexPay.test.ts`, `web/components/payments/SplitBadge.test.tsx` (нов.); тесты карточки товара, корзины, `CartDrawer` (изм.)

**Interfaces:**

- Consumes: `PublicYandexPay`, `CheckoutPaymentMethod` (задача 1); `data.yandexPay` в `GET /api/public/settings` (задача 5).
- Produces (`web/lib/yandexPay.ts`):
  - `const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string>` (`'Картой — Т-Банк'`, `'Яндекс Пэй'`, `'Сплит — оплата частями'`)
  - `function isYandexMethod(method: CheckoutPaymentMethod): boolean`
  - `function splitBadgeAmount(amountRub: number): string | null`
  - `function loadPublicYandexPay(): Promise<PublicYandexPay | null>` (кеш на сессию), `reloadPublicYandexPay()`, `resetPublicYandexPayCacheForTests()`
  - `function usePublicYandexPay(): PublicYandexPay | null | undefined` (`undefined` — ещё загружается)
- Produces (`web/components/payments/SplitBadge.tsx`, `'use client'`): `YANDEX_PAY_SDK_URL`, `type SplitBadgeSource = 'item' | 'cart' | 'checkout'`, `YandexPaySdkScript({ onReady? })`, `SplitBadge({ merchantId, amountRub, source, className? })` (обёртка `data-testid="split-badge"`, `min-h-[40px]`), `SplitBadgeAuto({ amountRub, source, className? })`.

- [ ] **Step 1: Read the Next.js script docs**

```bash
sed -n 1,200p node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md
sed -n 1,120p node_modules/next/dist/docs/01-app/02-guides/scripts.md
```

Если в этой версии `lazyOnload`/`onReady`/дедупликация по `id` работают иначе — поправить код ниже под документацию до запуска тестов.

- [ ] **Step 2: Write the failing tests**

Создать `web/lib/yandexPay.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getPublicSettings: vi.fn() }))
vi.mock('@/lib/api', () => api)

import {
  PAYMENT_METHOD_LABELS,
  isYandexMethod,
  loadPublicYandexPay,
  reloadPublicYandexPay,
  resetPublicYandexPayCacheForTests,
  splitBadgeAmount,
} from './yandexPay'

beforeEach(() => {
  resetPublicYandexPayCacheForTests()
  api.getPublicSettings.mockReset()
})

describe('подписи и сумма плашки', () => {
  it('подписи способов и признак Яндекса', () => {
    expect(PAYMENT_METHOD_LABELS).toEqual({
      tbank: 'Картой — Т-Банк',
      yandex_pay: 'Яндекс Пэй',
      yandex_split: 'Сплит — оплата частями',
    })
    expect(isYandexMethod('yandex_split')).toBe(true)
    expect(isYandexMethod('tbank')).toBe(false)
  })

  it('сумма — строка с двумя знаками; 0, минус, NaN и бесконечность — плашки нет', () => {
    expect(splitBadgeAmount(2490)).toBe('2490.00')
    expect(splitBadgeAmount(2490.5)).toBe('2490.50')
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(splitBadgeAmount(bad)).toBeNull()
  })
})

describe('yandexPay из публичных настроек', () => {
  it('один запрос на сессию; reload спрашивает заново', async () => {
    api.getPublicSettings
      .mockResolvedValueOnce({ yandexPay: { split: true, merchantId: 'm-1' } })
      .mockResolvedValueOnce({ yandexPay: null })
    expect(await loadPublicYandexPay()).toEqual({ split: true, merchantId: 'm-1' })
    expect(await loadPublicYandexPay()).toEqual({ split: true, merchantId: 'm-1' })
    expect(api.getPublicSettings).toHaveBeenCalledTimes(1)
    expect(await reloadPublicYandexPay()).toBeNull()
    expect(api.getPublicSettings).toHaveBeenCalledTimes(2)
  })

  it('сбой api, нет поля или пустой ответ — null без исключения', async () => {
    api.getPublicSettings.mockRejectedValueOnce(new Error('down'))
    expect(await loadPublicYandexPay()).toBeNull()
    api.getPublicSettings.mockResolvedValueOnce({})
    expect(await reloadPublicYandexPay()).toBeNull()
    api.getPublicSettings.mockReturnValueOnce(undefined)
    expect(await reloadPublicYandexPay()).toBeNull()
  })
})
```

Создать `web/components/payments/SplitBadge.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/script в jsdom не исполняет код — подменяем на <script> с теми же атрибутами.
vi.mock('next/script', () => ({
  default: ({ id, src, strategy }: { id?: string; src?: string; strategy?: string }) => (
    <script data-testid={id} data-src={src} data-strategy={strategy} />
  ),
}))

const api = vi.hoisted(() => ({ yandexPay: null as unknown, calls: 0 }))
vi.mock('@/lib/api', () => ({
  getPublicSettings: async () => {
    api.calls += 1
    return { yandexPay: api.yandexPay }
  },
}))

import { SplitBadge, SplitBadgeAuto, YANDEX_PAY_SDK_URL } from './SplitBadge'
import { resetPublicYandexPayCacheForTests } from '@/lib/yandexPay'

beforeEach(() => {
  resetPublicYandexPayCacheForTests()
  api.yandexPay = null
  api.calls = 0
})

describe('SplitBadge', () => {
  it('бейдж Сплита с суммой, Merchant ID и местом; скрипт — lazyOnload; высота зарезервирована', () => {
    const { container } = render(
      <SplitBadge merchantId="merchant-public-id" amountRub={2490} source="item" />,
    )
    const badge = container.querySelector('yandex-pay-badge')
    expect(badge).toHaveAttribute('type', 'bnpl')
    expect(badge).toHaveAttribute('amount', '2490.00')
    expect(badge).toHaveAttribute('merchant-id', 'merchant-public-id')
    expect(badge).toHaveAttribute('source', 'item')
    const script = screen.getByTestId('yandex-pay-sdk')
    expect(script).toHaveAttribute('data-src', YANDEX_PAY_SDK_URL)
    expect(script).toHaveAttribute('data-strategy', 'lazyOnload')
    expect(screen.getByTestId('split-badge').className).toContain('min-h-[40px]')
  })

  it.each([null, undefined, '', '  '])(
    'без Merchant ID (%s) — ничего, скрипт не грузится',
    (merchantId) => {
      const { container } = render(
        <SplitBadge merchantId={merchantId} amountRub={2490} source="item" />,
      )
      expect(container).toBeEmptyDOMElement()
    },
  )

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('сумма %s — бейджа нет', (amount) => {
    const { container } = render(<SplitBadge merchantId="m" amountRub={amount} source="cart" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SplitBadgeAuto', () => {
  it('берёт Merchant ID из публичных настроек; две плашки — один запрос', async () => {
    api.yandexPay = { split: true, merchantId: 'merchant-public-id' }
    const { container } = render(
      <>
        <SplitBadgeAuto amountRub={4500} source="cart" />
        <SplitBadgeAuto amountRub={1000} source="cart" />
      </>,
    )
    expect(await screen.findAllByTestId('split-badge')).toHaveLength(2)
    expect(container.querySelector('yandex-pay-badge')).toHaveAttribute('amount', '4500.00')
    expect(api.calls).toBe(1)
  })

  it('песочница (без Merchant ID) и выключенный Яндекс — плашки нет', async () => {
    api.yandexPay = { split: true }
    const { container } = render(<SplitBadgeAuto amountRub={4500} source="cart" />)
    await vi.waitFor(() => expect(api.calls).toBe(1))
    expect(container).toBeEmptyDOMElement()
  })
})
```

Тесты мест размещения.

`web/app/[locale]/(public)/product/[slug]/page.test.tsx`: в фабрику `vi.mock('@/lib/api', () => ({ … }))` добавить `getPublicSettings: vi.fn(),`; рядом добавить мок скрипта; в импорт из `@/lib/api` добавить `getPublicSettings`; в конец `describe('ProductPage', …)` — блок ниже.

```tsx
vi.mock('next/script', () => ({ default: () => null }))
```

```tsx
describe('плашка Сплита', () => {
  const product: Product = {
    id: 'p1',
    slug: 'kit',
    sku: 'K-1',
    name: 'Набор Кит',
    shortDescription: null,
    longDescriptionBlocks: [],
    priceRub: 100,
    compareAtPriceRub: null,
    stockStatus: 'in_stock',
    isPublished: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const props = { params: Promise.resolve({ locale: 'ru', slug: 'kit' }) }
  const empty = { data: [], pagination: { limit: 100, offset: 0, total: 0 } }
  type Settings = Awaited<ReturnType<typeof getPublicSettings>>

  beforeEach(() => {
    vi.mocked(getPublishedProduct).mockResolvedValue(product)
    vi.mocked(listPublishedProducts).mockResolvedValue(empty)
    vi.mocked(listCategories).mockResolvedValue(empty)
  })

  it('под ценой и кнопкой — бейдж на цену товара', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({
      yandexPay: { split: true, merchantId: 'merchant-public-id' },
    } as Settings)
    const { container } = render(await ProductPage(props))
    const badge = container.querySelector('yandex-pay-badge')
    expect(badge).toHaveAttribute('amount', '100.00')
    expect(badge).toHaveAttribute('source', 'item')
  })

  it('Яндекс недоступен — бейджа нет', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({ yandexPay: null } as Settings)
    const { container } = render(await ProductPage(props))
    expect(container.querySelector('yandex-pay-badge')).toBeNull()
  })

  it('api настроек лежит — карточка рендерится без бейджа', async () => {
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('down'))
    const { container } = render(await ProductPage(props))
    expect(container.querySelector('h1')).toHaveTextContent('Набор Кит')
    expect(container.querySelector('yandex-pay-badge')).toBeNull()
  })
})
```

`web/app/[locale]/(public)/cart/page.test.tsx` и `web/components/CartDrawer.test.tsx` — в оба файла после импортов:

```tsx
import { resetPublicYandexPayCacheForTests } from '@/lib/yandexPay'

vi.mock('next/script', () => ({ default: () => null }))

const settingsMock = vi.hoisted(() => ({ yandexPay: null as unknown }))
```

в существующую фабрику `vi.mock('@/lib/api', async (importActual) => ({ … }))` добавить `getPublicSettings: async () => ({ yandexPay: settingsMock.yandexPay }),`; в `beforeEach` добавить:

```ts
resetPublicYandexPayCacheForTests()
settingsMock.yandexPay = null
```

В конец `describe('/cart page v3 calm', …)`:

```tsx
it('под «Итого» — плашка Сплита на сумму корзины', async () => {
  settingsMock.yandexPay = { split: true, merchantId: 'merchant-public-id' }
  act(() => {
    saveCart(seed)
  })
  const { container } = render(<CartPage />)
  await screen.findByTestId('split-badge')
  const badge = container.querySelector('yandex-pay-badge')
  expect(badge).toHaveAttribute('amount', '4500.00')
  expect(badge).toHaveAttribute('source', 'cart')
})

it('Яндекс недоступен — плашки нет', async () => {
  act(() => {
    saveCart(seed)
  })
  render(<CartPage />)
  await act(async () => {})
  expect(screen.queryByTestId('split-badge')).toBeNull()
})
```

В конец `describe('CartDrawer', …)` (перед `describe('CartDrawer: Метрика', …)`):

```tsx
it('плашка Сплита — только в открытой корзине, на сумму «Итого»', async () => {
  settingsMock.yandexPay = { split: true, merchantId: 'merchant-public-id' }
  act(() => {
    saveCart(seed)
  })
  render(<CartDrawer />)
  expect(document.querySelector('yandex-pay-badge')).toBeNull()
  act(() => {
    openDrawer()
  })
  const dialog = screen.getByRole('dialog', { name: 'Корзина' })
  await within(dialog).findByTestId('split-badge')
  expect(dialog.querySelector('yandex-pay-badge')).toHaveAttribute('amount', '4500.00')
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w web -- lib/yandexPay.test.ts components/payments/SplitBadge.test.tsx "app/[locale]/(public)/product/[slug]/page.test.tsx" "app/[locale]/(public)/cart/page.test.tsx" components/CartDrawer.test.tsx`
Expected: FAIL — нет `./yandexPay`, `./SplitBadge`; в карточке и корзинах нет `yandex-pay-badge`.

- [ ] **Step 4: Implement lib, types and the badge**

`web/lib/api.ts` — в импорт типов из `@ximi4ka-shop/shared` добавить `PublicYandexPay`; в `interface PublicSettings` после `testimonials: PublicTestimonial[]`:

```ts
  /** Яндекс Пэй: null — недоступен; merchantId — только в боевом режиме. */
  yandexPay?: PublicYandexPay | null
```

Создать `web/lib/yandexPay.ts`:

```ts
import { useEffect, useState } from 'react'
import type { CheckoutPaymentMethod, PublicYandexPay } from '@ximi4ka-shop/shared'
import { getPublicSettings } from '@/lib/api'

// Яндекс Пэй на витрине: подписи способов, сумма плашки и yandexPay из публичных
// настроек с кешем на сессию (корзины и чекаут спрашивают api один раз). Только для
// клиентских компонентов — здесь хук; серверная карточка товара берёт настройки сама.

export const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = {
  tbank: 'Картой — Т-Банк',
  yandex_pay: 'Яндекс Пэй',
  yandex_split: 'Сплит — оплата частями',
}

export function isYandexMethod(method: CheckoutPaymentMethod): boolean {
  return method === 'yandex_pay' || method === 'yandex_split'
}

/** Сумма для плашки строкой «2490.00»; ноль, минус и не-число — плашки нет. */
export function splitBadgeAmount(amountRub: number): string | null {
  return Number.isFinite(amountRub) && amountRub > 0 ? amountRub.toFixed(2) : null
}

function fetchYandexPay(): Promise<PublicYandexPay | null> {
  return Promise.resolve()
    .then(() => getPublicSettings())
    .then((settings) => settings?.yandexPay ?? null)
    .catch(() => null)
}

let cached: Promise<PublicYandexPay | null> | null = null

export function loadPublicYandexPay(): Promise<PublicYandexPay | null> {
  cached ??= fetchYandexPay()
  return cached
}

/** Перечитать: Яндекс выключили, пока покупатель был на чекауте. */
export function reloadPublicYandexPay(): Promise<PublicYandexPay | null> {
  cached = fetchYandexPay()
  return cached
}

export function resetPublicYandexPayCacheForTests(): void {
  cached = null
}

/** yandexPay для клиентского компонента; undefined — ещё загружается. */
export function usePublicYandexPay(): PublicYandexPay | null | undefined {
  const [yandexPay, setYandexPay] = useState<PublicYandexPay | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    void loadPublicYandexPay().then((value) => {
      if (!cancelled) setYandexPay(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return yandexPay
}
```

Создать `web/types/yandex-pay.d.ts`:

```ts
// Тег плашки Яндекс Пэй из Web SDK (pay.js). npm-пакета с типами у Яндекса нет —
// объявляем атрибуты, которые использует витрина (pay.yandex.ru/docs/ru/custom/web-sdk/badges).
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'yandex-pay-badge': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        type?: 'bnpl' | 'ultimate' | 'cashback'
        amount?: string
        'merchant-id'?: string
        source?: 'main' | 'listing' | 'item' | 'cart' | 'checkout' | 'other'
        size?: 's' | 'm' | 'l'
        theme?: 'light' | 'dark'
      }
    }
  }
}
```

Создать `web/components/payments/SplitBadge.tsx`:

```tsx
'use client'

import Script from 'next/script'
import { splitBadgeAmount, usePublicYandexPay } from '@/lib/yandexPay'

// Плашка Сплита от Яндекса (Web SDK, тег yandex-pay-badge type="bnpl"). pay.js
// грузится lazyOnload — в простое браузера после загрузки страницы, как счётчики в
// lib/analytics.tsx; Next подключает его один раз на страницу (общий id). Оплата от
// скрипта не зависит. Сплит покупателю недоступен — плашку прячет сам Яндекс,
// остаётся зарезервированная строка.

export const YANDEX_PAY_SDK_URL = 'https://pay.yandex.ru/sdk/v1/pay.js'

export type SplitBadgeSource = 'item' | 'cart' | 'checkout'

export function YandexPaySdkScript({ onReady }: { onReady?: () => void }) {
  return (
    <Script id="yandex-pay-sdk" src={YANDEX_PAY_SDK_URL} strategy="lazyOnload" onReady={onReady} />
  )
}

interface SplitBadgeProps {
  merchantId: string | null | undefined
  amountRub: number
  source: SplitBadgeSource
  className?: string
}

export function SplitBadge({ merchantId, amountRub, source, className }: SplitBadgeProps) {
  const id = merchantId?.trim()
  const amount = splitBadgeAmount(amountRub)
  if (!id || !amount) return null
  return (
    <div data-testid="split-badge" className={`min-h-[40px] ${className ?? ''}`.trim()}>
      <yandex-pay-badge
        type="bnpl"
        amount={amount}
        merchant-id={id}
        source={source}
        size="m"
        theme="light"
      />
      <YandexPaySdkScript />
    </div>
  )
}

/** Плашка для клиентских корзин: Merchant ID — из публичных настроек (кеш на сессию). */
export function SplitBadgeAuto(props: Omit<SplitBadgeProps, 'merchantId'>) {
  const yandexPay = usePublicYandexPay()
  return <SplitBadge merchantId={yandexPay?.merchantId} {...props} />
}
```

- [ ] **Step 5: Place the badges**

`web/app/[locale]/(public)/product/[slug]/page.tsx`: в импорт из `@/lib/api` (строки 4–10) добавить `getPublicSettings`; в импорт типов из `@ximi4ka-shop/shared` (строка 3) — `PublicYandexPay`; после импорта `ProductViewTracker`:

```ts
import { SplitBadge } from '@/components/payments/SplitBadge'
```

перед `export default async function ProductPage`:

```ts
// Яндекс Пэй для плашки Сплита. Api недоступен — плашки нет, карточка как обычно.
// Не импортировать lib/yandexPay: там клиентский хук.
async function fetchYandexPaySafe(): Promise<PublicYandexPay | null> {
  try {
    return (await getPublicSettings())?.yandexPay ?? null
  } catch {
    return null
  }
}
```

строки 239–242 заменить:

```ts
const [related, category, yandexPay] = await Promise.all([
  fetchRelatedProducts(product.id),
  fetchPrimaryCategory(product.id),
  fetchYandexPaySafe(),
])
```

после закрывающего `</div>` ряда «цена + В корзину» (строка 293, внутри `<div className="flex flex-col gap-5">`):

```tsx
<SplitBadge merchantId={yandexPay?.merchantId} amountRub={product.priceRub} source="item" />
```

`web/app/[locale]/(public)/cart/page.tsx` — импорт после `GiftBanner`:

```ts
import { SplitBadgeAuto } from '@/components/payments/SplitBadge'
```

после блока «Итого» (закрывающий `</div>` строки с `data-testid="cart-total"`, строка 102), внутри колонки `max-w-md ml-auto`:

```tsx
<SplitBadgeAuto amountRub={totals.totalRub} source="cart" />
```

`web/components/CartDrawer.tsx` — импорт после `formatRub`:

```ts
import { SplitBadgeAuto } from '@/components/payments/SplitBadge'
```

после блока «Итого» (закрывающий `</div>` строки с `data-testid="drawer-total"`, строка 217) и перед ссылкой «Оформить заказ →» — плашка с JSX-комментарием над ней `{/* Только в открытой корзине: закрытая возвращает null, и pay.js не грузится на каждой странице сайта. */}`:

```tsx
<SplitBadgeAuto amountRub={totals.totalRub} source="cart" />
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npm test -w web -- lib components "app/[locale]/(public)/product" "app/[locale]/(public)/cart" app/layout.test.tsx && npm run typecheck -w web && npm run lint -w web`
Expected: PASS (включая `lib/analytics.test.tsx` и `app/layout.test.tsx` без правок); lint без ошибок (`namespace` в `.d.ts` линтер допускает).

- [ ] **Step 7: Commit**

```bash
npx prettier --write web/lib/api.ts web/lib/yandexPay.ts web/lib/yandexPay.test.ts web/types/yandex-pay.d.ts web/components/payments "web/app/[locale]/(public)/product/[slug]" "web/app/[locale]/(public)/cart" web/components/CartDrawer.tsx web/components/CartDrawer.test.tsx
git add web/lib/api.ts web/lib/yandexPay.ts web/lib/yandexPay.test.ts web/types/yandex-pay.d.ts web/components/payments "web/app/[locale]/(public)/product/[slug]/page.tsx" "web/app/[locale]/(public)/product/[slug]/page.test.tsx" "web/app/[locale]/(public)/cart/page.tsx" "web/app/[locale]/(public)/cart/page.test.tsx" web/components/CartDrawer.tsx web/components/CartDrawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(payments): плашка Сплита на карточке товара и в корзинах

pay.js через next/script lazyOnload; бейдж только с Merchant ID боевого режима
и положительной суммой; в боковой корзине — только у открытой.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Чекаут — «Способ оплаты», виджет Сплита, страница заказа

**Files:**

- Create: `web/components/payments/SplitWidget.tsx`, `web/components/checkout/PaymentMethodField.tsx`
- Modify: `web/app/[locale]/(public)/checkout/page.tsx:6`, `:17` (импорты), `:69`, `:96`, `:164`, `:201`, `:264`, `:466`
- Modify: `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx:5`, `:123-131`, `:141-148`, `:325`, `:331-332`, `:355`
- Test: `web/components/payments/SplitWidget.test.tsx` (нов.), `web/app/[locale]/(public)/checkout/page.test.tsx`, `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx`

**Interfaces:**

- Consumes: `YandexPaySdkScript`, `SplitBadge` (задача 6); `PAYMENT_METHOD_LABELS`, `splitBadgeAmount`, `loadPublicYandexPay`, `reloadPublicYandexPay`, `resetPublicYandexPayCacheForTests` (задача 6); `400 payment_method_unavailable` (задача 5); `PublicOrderStatus.paymentUrl` (задачи 1, 5).
- Produces: `SPLIT_FALLBACK_TEXT`, `SplitWidget({ merchantId, totalRub })`; `PaymentMethodField({ value, onChange, merchantId, totalRub })`; чекаут шлёт `paymentMethod`, пока виден блок; страница заказа — `data-testid="order-pay-link"`.

- [ ] **Step 1: Write the failing tests**

Создать `web/components/payments/SplitWidget.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

// next/script: в jsdom скрипт не грузится — сразу сообщаем «готов», как onReady.
vi.mock('next/script', async () => {
  const { useEffect } = await import('react')
  // Именованный компонент: правило react-hooks не пускает хук в анонимной функции.
  function MockScript({ onReady }: { onReady?: () => void }) {
    useEffect(() => {
      onReady?.()
    }, [onReady])
    return null
  }
  return { default: MockScript }
})

import { SPLIT_FALLBACK_TEXT, SplitWidget } from './SplitWidget'

type W = Window & { YaPay?: unknown }

function stubYaPay() {
  const session = { mountWidget: vi.fn(), unmountWidget: vi.fn(), destroy: vi.fn() }
  // Тип вызова — дженериком: иначе mock.calls типизирован пустым кортежем.
  const createSession = vi.fn<
    (data: Record<string, unknown>, handlers: unknown) => Promise<typeof session>
  >(async () => session)
  ;(window as W).YaPay = {
    createSession,
    CurrencyCode: { Rub: 'RUB' },
    WidgetType: { Ultimate: 'Ultimate' },
  }
  return { createSession, session }
}

beforeEach(() => {
  delete (window as W).YaPay
})
afterEach(() => {
  delete (window as W).YaPay
})

describe('SplitWidget', () => {
  it('сессия только на Сплит, Ultimate без своей кнопки; текст уходит', async () => {
    const { createSession, session } = stubYaPay()
    render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(1))
    expect(createSession).toHaveBeenCalledWith(
      {
        version: 4,
        currencyCode: 'RUB',
        merchantId: 'merchant-public-id',
        totalAmount: '2390.00',
        availablePaymentMethods: ['SPLIT'],
      },
      expect.objectContaining({ onPayButtonClick: expect.any(Function) }),
    )
    expect(session.mountWidget).toHaveBeenCalledWith(screen.getByTestId('split-widget'), {
      widgetType: 'Ultimate',
      hasCheckoutButton: false,
    })
    await vi.waitFor(() => expect(screen.queryByText(SPLIT_FALLBACK_TEXT)).toBeNull())
  })

  it('без SDK или если сессия не создалась — остаётся текст', async () => {
    const view = render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await act(async () => {})
    expect(screen.getByText(SPLIT_FALLBACK_TEXT)).toBeInTheDocument()
    view.unmount()
    const createSession = vi.fn().mockRejectedValue(new Error('split unavailable'))
    ;(window as W).YaPay = {
      createSession,
      CurrencyCode: { Rub: 'RUB' },
      WidgetType: { Ultimate: 'Ultimate' },
    }
    render(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(screen.getByText(SPLIT_FALLBACK_TEXT)).toBeInTheDocument()
  })

  it('сумма изменилась — новая сессия; при размонтировании виджет снят, сессия уничтожена', async () => {
    const { createSession, session } = stubYaPay()
    const view = render(<SplitWidget merchantId="merchant-public-id" totalRub={2000} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(1))
    view.rerender(<SplitWidget merchantId="merchant-public-id" totalRub={2390} />)
    await vi.waitFor(() => expect(session.mountWidget).toHaveBeenCalledTimes(2))
    expect(createSession.mock.calls[1]?.[0]).toMatchObject({ totalAmount: '2390.00' })
    expect(session.unmountWidget).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(session.unmountWidget).toHaveBeenCalledTimes(2)
    expect(session.destroy).toHaveBeenCalledTimes(2)
  })
})
```

В `web/app/[locale]/(public)/checkout/page.test.tsx`: в импорт из `@testing-library/react` добавить `within`; добавить импорт `import { resetPublicYandexPayCacheForTests } from '@/lib/yandexPay'`; перед фабрикой `vi.mock('@/lib/api', …)`:

```ts
// Публичные настройки идут мимо fetch: тесты чекаута считают вызовы fetch.
const mockGetPublicSettings = vi.fn(async () => ({ yandexPay: null as unknown }))

// Виджет Сплита грузит pay.js — в тестах скрипта нет, остаётся текст.
vi.mock('next/script', () => ({ default: () => null }))
```

в фабрику `vi.mock('@/lib/api', …)` добавить `getPublicSettings: () => mockGetPublicSettings(),`; в первый `beforeEach`:

```ts
mockGetPublicSettings.mockReset()
mockGetPublicSettings.mockImplementation(async () => ({ yandexPay: null }))
resetPublicYandexPayCacheForTests()
```

в конец `describe('/checkout page', …)` (перед `describe('чекаут для вошедшего покупателя', …)`):

```tsx
describe('способ оплаты', () => {
  const ON = { yandexPay: { split: true, merchantId: 'merchant-public-id' } }

  function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    return JSON.parse(init.body as string) as Record<string, unknown>
  }

  it('Яндекс недоступен — блока нет, paymentMethod не уходит', async () => {
    mapMock.available = false
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()
    expect(screen.queryByRole('group', { name: /способ оплаты/i })).toBeNull()
    submit()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentBody(fetchMock)).not.toHaveProperty('paymentMethod')
  })

  it('три способа — Т-Банк по умолчанию, выбранный уходит в заказ', async () => {
    mockGetPublicSettings.mockImplementation(async () => ON)
    mapMock.available = false
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    const group = await screen.findByRole('group', { name: /способ оплаты/i })
    expect(within(group).getByRole('radio', { name: 'Картой — Т-Банк' })).toBeChecked()
    fireEvent.click(within(group).getByRole('radio', { name: 'Яндекс Пэй' }))
    await fillValidForm()
    submit()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentBody(fetchMock).paymentMethod).toBe('yandex_pay')
  })

  it('Сплит: плашка на сумму заказа, место виджета, paymentMethod=yandex_split', async () => {
    mockGetPublicSettings.mockImplementation(async () => ON)
    mapMock.available = false
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    const { container } = render(<CheckoutPage />)
    const group = await screen.findByRole('group', { name: /способ оплаты/i })
    const badge = container.querySelector('yandex-pay-badge')
    expect(badge).toHaveAttribute('source', 'checkout')
    expect(badge).toHaveAttribute('amount', '2000.00')
    expect(screen.queryByTestId('split-widget')).toBeNull()
    fireEvent.click(within(group).getByRole('radio', { name: 'Сплит — оплата частями' }))
    expect(screen.getByTestId('split-widget')).toBeInTheDocument()
    await fillValidForm()
    submit()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentBody(fetchMock).paymentMethod).toBe('yandex_split')
  })

  it('доставка в ЕАЭС скрывает Яндекс, выбор сбрасывается на Т-Банк', async () => {
    mockGetPublicSettings.mockImplementation(async () => ON)
    seedCart(seed)
    render(<CheckoutPage />)
    const group = await screen.findByRole('group', { name: /способ оплаты/i })
    fireEvent.click(within(group).getByRole('radio', { name: 'Сплит — оплата частями' }))
    await chooseCisRegion()
    expect(screen.queryByRole('group', { name: /способ оплаты/i })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Россия' }))
    const back = await screen.findByRole('group', { name: /способ оплаты/i })
    expect(within(back).getByRole('radio', { name: 'Картой — Т-Банк' })).toBeChecked()
  })

  it('Яндекс выключили до отправки: 400 — сообщение, сброс на Т-Банк, блок пропал, корзина цела', async () => {
    mockGetPublicSettings
      .mockImplementationOnce(async () => ON)
      .mockImplementation(async () => ({ yandexPay: null }))
    mapMock.available = false
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'payment_method_unavailable', message: 'Яндекс Пэй сейчас недоступен' },
          }),
          { status: 400 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    const group = await screen.findByRole('group', { name: /способ оплаты/i })
    fireEvent.click(within(group).getByRole('radio', { name: 'Яндекс Пэй' }))
    await fillValidForm()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /яндекс пэй сейчас недоступен.*картой/i,
    )
    await vi.waitFor(() => expect(mockGetPublicSettings).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(screen.queryByRole('group', { name: /способ оплаты/i })).toBeNull(),
    )
    expect(loadCart()).toHaveLength(1)
    expect(mockRedirectTo).not.toHaveBeenCalled()
  })
})
```

В `OrderStatusView.test.tsx` в конец `describe('<OrderStatusView>', …)`:

```tsx
it('Яндекс Пэй: опрашивает статус как онлайн-оплату и показывает «Оплатить»', async () => {
  vi.useFakeTimers()
  const fetchMock = fetchReturning(
    statusPayload({ paymentProvider: 'yandex_pay', paymentUrl: 'https://pay.ya.ru/l/abc' }),
    statusPayload({
      paymentProvider: 'yandex_pay',
      status: 'paid',
      paidAt: '2026-10-24T12:00:00.000Z',
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="tok123" />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByTestId('order-pay-link')).toHaveAttribute('href', 'https://pay.ya.ru/l/abc')
  expect(screen.getByText(/Ожидаем подтверждение оплаты/)).toBeInTheDocument()
  expect(screen.queryByText(/Менеджер свяжется/)).not.toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('order-status-label')).toHaveTextContent('Оплачен')
  expect(screen.queryByTestId('order-pay-link')).toBeNull()
})

it('ссылку не на https кнопкой не показывает', async () => {
  vi.stubGlobal(
    'fetch',
    fetchReturning(
      statusPayload({ paymentProvider: 'yandex_pay', paymentUrl: 'javascript:alert(1)' }),
    ),
  )
  render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="tok123" />)
  await screen.findByTestId('order-status-label')
  expect(screen.queryByTestId('order-pay-link')).toBeNull()
})

it('возврат с неудачной оплатой при ссылке Яндекса — предлагает оплатить ещё раз', async () => {
  vi.stubGlobal(
    'fetch',
    fetchReturning(
      statusPayload({ paymentProvider: 'yandex_pay', paymentUrl: 'https://pay.ya.ru/l/abc' }),
    ),
  )
  render(
    <OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="tok123" paymentFailed />,
  )
  expect(await screen.findByTestId('order-payment-failed')).toHaveTextContent(/нажмите «Оплатить»/)
})
```

В конец `describe('<OrderStatusView>: покупка для Метрики', …)`:

```tsx
it('Яндекс Пэй: заказ ещё ждёт оплаты — покупка не уходит', async () => {
  vi.stubGlobal('fetch', fetchReturning(statusPayload({ paymentProvider: 'yandex_pay' })))
  render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
  await screen.findByTestId('order-status-label')
  expect(packages()).toEqual([])
  expect(w.ym).not.toHaveBeenCalled()
})

it('Яндекс Пэй: заказ уже оплачен при загрузке — покупка уходит', async () => {
  vi.stubGlobal(
    'fetch',
    fetchReturning(
      statusPayload({
        paymentProvider: 'yandex_pay',
        status: 'paid',
        paidAt: '2026-10-24T12:00:00.000Z',
      }),
    ),
  )
  render(<OrderStatusView orderNumber="XM-2026-00042" celebrate />)
  await screen.findByTestId('order-status-label')
  expect(packages()).toHaveLength(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- components/payments/SplitWidget.test.tsx "app/[locale]/(public)/checkout/page.test.tsx" "app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx"`
Expected: FAIL — нет `./SplitWidget`; в чекауте нет группы «Способ оплаты»; нет `order-pay-link`; покупка по неоплаченному заказу Яндекса уходит.

- [ ] **Step 3: Implement the widget and the field**

Создать `web/components/payments/SplitWidget.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { YandexPaySdkScript } from '@/components/payments/SplitBadge'
import { splitBadgeAmount } from '@/lib/yandexPay'

// Виджет Ultimate Яндекс Пэй с графиком платежей Сплита (Web SDK,
// pay.yandex.ru/docs/ru/custom/web-sdk/ultimate-widget). Своей кнопки у виджета нет:
// заказ оформляется общей кнопкой чекаута, форму Яндекса открывает paymentUrl от
// сервера. Только Сплит: если он покупателю недоступен, виджет скрывает сам Яндекс.
// Скрипт не загрузился или сессия не создалась — остаётся текст.

export const SPLIT_FALLBACK_TEXT =
  'График платежей покажем в форме Яндекс Пэй после оформления заказа.'

interface YaPaySession {
  mountWidget(
    element: HTMLElement,
    options: { widgetType: unknown; hasCheckoutButton?: boolean },
  ): void
  unmountWidget(element: HTMLElement): void
  destroy?: () => void
}

interface YaPaySdk {
  createSession(
    paymentData: Record<string, unknown>,
    handlers: {
      onPayButtonClick: () => Promise<string>
      onFormOpenError?: (reason: unknown) => void
    },
  ): Promise<YaPaySession>
  CurrencyCode: { Rub: unknown }
  WidgetType: { Ultimate: unknown }
}

function getYaPay(): YaPaySdk | null {
  const sdk = (window as Window & { YaPay?: YaPaySdk }).YaPay
  return sdk && typeof sdk.createSession === 'function' ? sdk : null
}

export function SplitWidget({ merchantId, totalRub }: { merchantId: string; totalRub: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const amount = splitBadgeAmount(totalRub)
  const key = `${merchantId}:${amount}`
  // Для какой суммы виджет смонтирован; сменилась сумма — снова текст до новой сессии.
  const [mountedFor, setMountedFor] = useState<string | null>(null)

  useEffect(() => {
    const element = ref.current
    const sdk = sdkReady ? getYaPay() : null
    if (!element || !sdk || !amount) return
    let cancelled = false
    let session: YaPaySession | null = null
    sdk
      .createSession(
        {
          version: 4,
          currencyCode: sdk.CurrencyCode.Rub,
          merchantId,
          totalAmount: amount,
          availablePaymentMethods: ['SPLIT'],
        },
        {
          // Кнопки в виджете нет (hasCheckoutButton: false) — обработчик не вызывается.
          onPayButtonClick: () => Promise.reject(new Error('Оплата — кнопкой «Оформить заказ»')),
          onFormOpenError: () => {},
        },
      )
      .then((created) => {
        if (cancelled) {
          created.destroy?.()
          return
        }
        session = created
        created.mountWidget(element, {
          widgetType: sdk.WidgetType.Ultimate,
          hasCheckoutButton: false,
        })
        setMountedFor(`${merchantId}:${amount}`)
      })
      .catch(() => {
        // Сессия не создалась (Сплит недоступен, сеть) — остаётся текст.
      })
    return () => {
      cancelled = true
      if (session) {
        session.unmountWidget(element)
        session.destroy?.()
      }
    }
  }, [sdkReady, merchantId, amount])

  return (
    <div className="flex flex-col gap-2 pl-7">
      {mountedFor !== key && (
        <p className="m-0 font-lj-body text-sm text-[var(--color-lj-ink)] opacity-70">
          {SPLIT_FALLBACK_TEXT}
        </p>
      )}
      <div ref={ref} data-testid="split-widget" />
      <YandexPaySdkScript onReady={() => setSdkReady(true)} />
    </div>
  )
}
```

Создать `web/components/checkout/PaymentMethodField.tsx`:

```tsx
'use client'

import type { CheckoutPaymentMethod } from '@ximi4ka-shop/shared'
import { LABEL_CLASS } from '@/components/checkout/fieldStyles'
import { SplitBadge } from '@/components/payments/SplitBadge'
import { SPLIT_FALLBACK_TEXT, SplitWidget } from '@/components/payments/SplitWidget'
import { PAYMENT_METHOD_LABELS } from '@/lib/yandexPay'

const METHODS: CheckoutPaymentMethod[] = ['tbank', 'yandex_pay', 'yandex_split']

interface Props {
  value: CheckoutPaymentMethod
  onChange: (method: CheckoutPaymentMethod) => void
  /** Merchant ID боевого режима; null (песочница) — без плашки и виджета, только текст. */
  merchantId: string | null
  totalRub: number
}

// Блок «Способ оплаты»: радиокнопки по образцу «Куда доставить». У Сплита — плашка на
// сумму заказа, а при выбранном Сплите — виджет графика платежей.
export function PaymentMethodField({ value, onChange, merchantId, totalRub }: Props) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={`${LABEL_CLASS} mb-2`}>Способ оплаты</legend>
      {METHODS.map((method) => (
        <div key={method} className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]">
            <input
              type="radio"
              name="checkout-payment-method"
              value={method}
              checked={value === method}
              onChange={() => onChange(method)}
              className="accent-[var(--color-lj-ink)]"
            />
            {PAYMENT_METHOD_LABELS[method]}
          </label>
          {method === 'yandex_split' && (
            <SplitBadge
              merchantId={merchantId}
              amountRub={totalRub}
              source="checkout"
              className="pl-7"
            />
          )}
          {method === 'yandex_split' &&
            value === 'yandex_split' &&
            (merchantId ? (
              <SplitWidget merchantId={merchantId} totalRub={totalRub} />
            ) : (
              <p className="m-0 pl-7 font-lj-body text-sm text-[var(--color-lj-ink)] opacity-70">
                {SPLIT_FALLBACK_TEXT}
              </p>
            ))}
        </div>
      ))}
    </fieldset>
  )
}
```

- [ ] **Step 4: Wire the checkout page**

`web/app/[locale]/(public)/checkout/page.tsx`:

строку 6 заменить:

```ts
import type { CheckoutPaymentMethod, CheckoutRequest, PublicYandexPay } from '@ximi4ka-shop/shared'
```

после импорта `PromoCodeField` (строка 17):

```ts
import { PaymentMethodField } from '@/components/checkout/PaymentMethodField'
import { loadPublicYandexPay, reloadPublicYandexPay } from '@/lib/yandexPay'
```

после строки 69 (`const [submitting, setSubmitting] = useState(false)`):

```ts
// Яндекс Пэй из публичных настроек: null — недоступен, блока выбора нет и чекаут как
// раньше. По умолчанию — Т-Банк.
const [yandexPay, setYandexPay] = useState<PublicYandexPay | null>(null)
const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('tbank')
useEffect(() => {
  let cancelled = false
  void loadPublicYandexPay().then((value) => {
    if (!cancelled) setYandexPay(value)
  })
  return () => {
    cancelled = true
  }
}, [])
```

после строки 96 (`const isCis = region === 'cis'`):

```ts
// Доставка в ЕАЭС — без Яндекс Пэй и Сплита: блок скрыт, оплата картой.
const showPaymentChoice = yandexPay !== null && !isCis
const selectedMethod: CheckoutPaymentMethod = showPaymentChoice ? paymentMethod : 'tbank'
```

в `changeRegion` после `setRegion(next)` (строка 164):

```ts
if (next === 'cis') setPaymentMethod('tbank')
```

в `payload` после `...(promo ? { promoCode: promo.code } : {}),` (строка 201):

```ts
      ...(showPaymentChoice ? { paymentMethod: selectedMethod } : {}),
```

в обработке ошибок перед веткой `} else if (err.code === 'delivery_point_unknown') {` (строка 264):

```ts
        } else if (err.code === 'payment_method_unavailable') {
          // Яндекс выключили, пока покупатель заполнял форму: объясняем, переключаем на
          // карту и перечитываем настройки — блок выбора пропадёт сам.
          setServerError(`${err.message}. Выбрана оплата картой — оформите заказ ещё раз.`)
          setPaymentMethod('tbank')
          void reloadPublicYandexPay().then(setYandexPay)
```

в левой колонке после блока «Комментарий к заказу» (закрывающий `</div>` строки 466) и перед закрывающим `</div>` левой колонки (строка 467):

```tsx
{
  showPaymentChoice && (
    <PaymentMethodField
      value={selectedMethod}
      onChange={setPaymentMethod}
      merchantId={yandexPay?.merchantId ?? null}
      totalRub={totalRub}
    />
  )
}
```

- [ ] **Step 5: Update the order status page**

`web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx`:

строку 5 заменить:

```ts
import type { PaymentProvider, PublicOrderStatus } from '@ximi4ka-shop/shared'
```

после `formatDate` (перед комментарием `// Точка шага таймлайна`):

```ts
// Онлайн-оплата: статус приходит вебхуком провайдера, поэтому страница опрашивает
// статус, а покупка в Метрику уходит только после подтверждения оплаты.
function isOnlinePayment(provider: PaymentProvider): boolean {
  return provider === 'tbank' || provider === 'yandex_pay'
}

// Ссылка «Оплатить» — только https: api отдаёт её для неоплаченного заказа Яндекс Пэй.
function safePaymentUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null
}
```

строки 123–131 (комментарий и `purchasable`) заменить:

```ts
// Покупка для Метрики: после оформления (?new=1), когда заказ загружен.
// Онлайн-оплата (Т-Касса, Яндекс Пэй) — только после подтверждения оплаты
// (paid/shipped; пока pending, поллинг ждёт вебхук провайдера); ручной заказ —
// сразу (pending тоже). Повторов нет (отметка по номеру заказа), а без снимка
// состава из чекаута — страница открыта не тем браузером — ничего не уходит
// (lib/metrika.ts). Провал/отмена — снимок больше не нужен.
const status = order?.status
const paid = status === 'paid' || status === 'shipped'
const purchasable =
  order !== null && (isOnlinePayment(order.paymentProvider) ? paid : status === 'pending' || paid)
```

строки 141–148 (комментарий и `pollMode`) заменить:

```ts
// Поллинг каждые 5 секунд: пока онлайн-платёж в полёте (максимум 5 минут)
// и пока СДЭК регистрирует оплаченный заказ и не выдал трек (до 15 минут).
// Как только ждать нечего, pollMode → null и cleanup снимает интервал.
const pollMode =
  order?.status === 'pending' && isOnlinePayment(order.paymentProvider)
    ? 'payment'
    : order?.shipment?.state === 'pending'
      ? 'track'
      : null
const payUrl = order?.status === 'pending' ? safePaymentUrl(order.paymentUrl) : null
```

перед `<div aria-live="polite" className="flex flex-col gap-3">` (строка 325):

```tsx
{
  payUrl && (
    <a
      href={payUrl}
      data-testid="order-pay-link"
      className="inline-flex items-center gap-3 mb-8 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright"
    >
      Оплатить →
    </a>
  )
}
```

текст блока `order-payment-failed` (строки 331–332) заменить:

```tsx
{
  payUrl
    ? 'Оплата не прошла. Заказ сохранён — нажмите «Оплатить», чтобы попробовать ещё раз.'
    : 'Оплата не прошла. Заказ сохранён — напишите нам, и мы пришлём новую ссылку на оплату.'
}
```

строку 355 заменить:

```tsx
                {order.status === 'pending' && isOnlinePayment(order.paymentProvider) && (
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npm test -w web -- components/payments "app/[locale]/(public)/checkout" "app/[locale]/(public)/order" lib/orderStatus.test.ts && npm run typecheck -w web && npm run lint -w web`
Expected: PASS (все прежние тесты чекаута и страницы заказа — без изменений поведения при `yandexPay: null` и для Т-Кассы).

- [ ] **Step 7: Commit**

```bash
npx prettier --write web/components/payments web/components/checkout/PaymentMethodField.tsx "web/app/[locale]/(public)/checkout" "web/app/[locale]/(public)/order/[number]/_components"
git add web/components/payments/SplitWidget.tsx web/components/payments/SplitWidget.test.tsx web/components/checkout/PaymentMethodField.tsx "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx" "web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx" "web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx"
git commit -m "$(cat <<'EOF'
feat(payments): способ оплаты на чекауте, виджет Сплита, «Оплатить» на странице заказа

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Переменные, раздел в deploy/README, полная проверка, замер, песочница

**Files:**

- Modify: `deploy/app.env.example:104` (после `TBANK_RECEIPT_TAX=none`), `api/.env.example:116`
- Modify: `deploy/README.md` (новый раздел перед `## Конверсии оплаты в Яндекс.Метрику`, строка 429)
- Modify: `tools/perf-lab/build.sh:11`, `tools/perf-lab/bench.sh:20`, `tools/perf-lab/serve.sh:16`, `tools/perf-lab/README.md:22`
- Внешний файл (не в репозитории): `/tmp/perf-lab/pm-proxy.mjs`

**Interfaces:**

- Consumes: всё из задач 1–7.
- Produces: документация, `PERF_API_URL` в perf-lab, свидетельства проверки для владельца.

- [ ] **Step 1: Check (fails now)**

```bash
for v in YANDEX_PAY_MERCHANT_ID YANDEX_PAY_API_KEY; do
  grep -q "^$v=" deploy/app.env.example && grep -q "^$v=" api/.env.example || echo "нет $v"
done
grep -q '## Яндекс Пэй и Сплит' deploy/README.md || echo "нет раздела в README"
```

Expected: печатает «нет …».

- [ ] **Step 2: Env examples**

`deploy/app.env.example` — после `TBANK_RECEIPT_TAX=none`:

```bash
# Яндекс Пэй и Сплит (console.pay.yandex.ru → «Настройки»). Пусто — способа нет,
# у покупателей ничего не меняется. В песочнице ключом API служит сам Merchant ID,
# но на проде песочница недоступна. Режим и рубильник — в админке («Настройки» →
# «Яндекс.Pay»). Callback URL в кабинете: https://ximi4ka.ru/api/webhooks/yandex-pay.
# Ставка налога позиций — TBANK_RECEIPT_TAX выше. Порядок — deploy/README.md.
YANDEX_PAY_MERCHANT_ID=
YANDEX_PAY_API_KEY=
```

`api/.env.example` — после `TBANK_RECEIPT_TAX=none`:

```bash
# Яндекс Пэй. Для песочницы локально: песочничный Merchant ID (он же ключ API),
# WEB_ORIGIN=http://localhost:3000, в локальной админке — режим Sandbox и рубильник.
# Значения не коммитить.
YANDEX_PAY_MERCHANT_ID=
YANDEX_PAY_API_KEY=
```

- [ ] **Step 3: deploy/README section**

Перед `## Конверсии оплаты в Яндекс.Метрику` вставить:

```markdown
## Яндекс Пэй и Сплит

Спек: `docs/superpowers/specs/2026-10-24-yandex-pay-split-design.md`. Т-Касса не меняется. Пока в `deploy/app.env`
нет `YANDEX_PAY_MERCHANT_ID` или в админке выключен «Включить Яндекс.Pay», покупатели ничего не замечают.

**Как устроено.** На чекауте три пункта: «Картой — Т-Банк» (по умолчанию), «Яндекс Пэй», «Сплит — оплата частями».
Сервер создаёт заказ в Yandex Pay API и ведёт покупателя на форму Яндекса. Статус приходит вебхуком
`POST /api/webhooks/yandex-pay/v1/webhook` (Caddy уже проксирует `/api/*` в api, на `new.ximi4ka.ru` путь
`/api/webhooks/*` исключён из редиректа); потерянный вебхук добирает сверка раз в минуту. Чек 54-ФЗ пробивает облачная
касса в кабинете Яндекса, ставка налога позиций — из `TBANK_RECEIPT_TAX` («без НДС» = код 6). При доставке в страны
ЕАЭС пунктов Яндекса нет. Плашки Сплита — на карточке товара, в корзинах и на чекауте (только в боевом режиме).

**Включение (владелец).**

1. Кабинет Яндекса: подключить облачную кассу (АТОЛ Онлайн или CloudKassir); Callback URL —
   `https://ximi4ka.ru/api/webhooks/yandex-pay` (без `/v1/webhook`, Яндекс дописывает сам); выпустить боевой ключ API.
2. `deploy/app.env`: `YANDEX_PAY_MERCHANT_ID`, `YANDEX_PAY_API_KEY`; перезапустить api.
3. Админка → «Настройки» → «Яндекс.Pay»: режим Production, включить.
4. Проверка: `curl -s https://ximi4ka.ru/api/public/settings | grep -o '"yandexPay":{[^}]*}'` — есть `split` и
   `merchantId`, ключа API нет.
5. Первый настоящий платёж на небольшую сумму: статус «Оплачен», чек, карточка в Telegram; возврат — вручную в кабинете.
6. Ключи, показанные в чате 11.10.2026, перевыпустить в кабинете и заменить в `deploy/app.env`.

**Откат.** Снять «Включить Яндекс.Pay» в админке — мгновенно (публичные настройки кешируются до 60 секунд). Созданные
заказы Яндекса досверяются, пока задан `YANDEX_PAY_MERCHANT_ID`.

**Песочница — только локально.** На проде (`NODE_ENV=production`) режим Sandbox способов не включает.

**Если что-то не так.** Заказ без ссылки на оплату — в логе api `yandex_pay: заказ … не принят: HTTP … reasonCode=…`.
Вебхук отвечает 401/400 — смотреть `reasonCode` в ответе: `UNAUTHORIZED` (подпись или не задан Merchant ID),
`TOKEN_EXPIRED`, `OTHER` (чужой `merchantId`).
```

- [ ] **Step 4: Placeholder scan and full verification**

```bash
git diff --name-only origin/main...HEAD | xargs grep -nE 'TODO|FIXME|TBD|\.only\(|\.skip\(|it\.todo' || echo "чисто"
git diff --stat origin/main...HEAD -- api/src/lib/payments/tbank.ts api/src/lib/payments/tbankTransport.ts api/src/lib/payments/index.ts api/src/lib/payments/types.ts api/src/lib/payments/manual.ts api/src/routes/webhooks/tbank.ts
git diff origin/main...HEAD -- api/src/lib/payments/receipt.ts | grep -E '^[-+][^-+]'
npm run lint
npm run typecheck
TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_yp npm test
npx prettier --check .
```

Expected: «чисто»; `git diff --stat` по файлам Т-Кассы — пусто; в диффе `receipt.ts` — только три пары строк, где добавлен `export`; остальные команды завершаются с кодом 0 (PASS по `api`, `web`, `shared`). Сохранить хвосты вывода для отчёта.

- [ ] **Step 5: Dev server check (Turbopack)**

```bash
npm run dev -w api &
npm run dev -w web
```

Открыть `http://localhost:3000/checkout` (с товаром в корзине), `/cart`, `/product/<slug>`, `/order/<номер>`. Expected: страницы открываются без «Module not found», без ошибок гидратации. Остановить оба процесса.

- [ ] **Step 6: Let perf-lab override the api address**

В `tools/perf-lab/build.sh` (строка 11), `bench.sh` (строка 20), `serve.sh` (строка 16) заменить `API_URL=https://ximi4ka.ru` на `API_URL=${PERF_API_URL:-https://ximi4ka.ru}` (`NEXT_PUBLIC_API_URL` не трогать). В `tools/perf-lab/README.md` после абзаца «Смотреть на `dFCP`/`dLCP`…» добавить:

```markdown
Серверный адрес api сборки и стенда — `PERF_API_URL` (по умолчанию `https://ximi4ka.ru`): так подставляется локальный
прокси с ответами, которых ещё нет на проде (например, `yandexPay` в публичных настройках для плашки Сплита).
```

```bash
bash -n tools/perf-lab/build.sh tools/perf-lab/bench.sh tools/perf-lab/serve.sh
npx prettier --write tools/perf-lab/README.md deploy/README.md
git add deploy/app.env.example api/.env.example deploy/README.md tools/perf-lab/build.sh tools/perf-lab/bench.sh tools/perf-lab/serve.sh tools/perf-lab/README.md
git commit -m "$(cat <<'EOF'
docs(payments): переменные и раздел «Яндекс Пэй и Сплит» в deploy/README; PERF_API_URL в perf-lab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Measure the product page before/after**

Прокси вне репозитория: к публичным настройкам прода добавляет `yandexPay`, остальное отдаёт с прода (только GET):

```bash
mkdir -p /tmp/perf-lab
cat > /tmp/perf-lab/pm-proxy.mjs <<'EOF'
import http from 'node:http'
const UP = process.env.UPSTREAM_API ?? 'https://ximi4ka.ru'
const MERCHANT = process.env.YP_MERCHANT_ID ?? 'perf-lab-merchant'
http
  .createServer(async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end()
      return
    }
    const upstream = await fetch(UP + req.url, { headers: { accept: req.headers.accept ?? '*/*' } })
    const type = upstream.headers.get('content-type') ?? 'application/octet-stream'
    if (req.url === '/api/public/settings' && upstream.ok) {
      const body = await upstream.json()
      body.data.yandexPay = { split: true, merchantId: MERCHANT }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
      return
    }
    res.writeHead(upstream.status, { 'content-type': type })
    res.end(Buffer.from(await upstream.arrayBuffer()))
  })
  .listen(3199, '127.0.0.1')
EOF
node /tmp/perf-lab/pm-proxy.mjs &
```

`YP_MERCHANT_ID` — по желанию владельца публичный боевой Merchant ID; без него плашка рисуется с заглушкой (стенд всё равно обрывает сторонние не-скрипты, поэтому меряется стоимость `pay.js`, а не отрисовка бейджа).

Если «до» не собрано в «Подготовке»: `git worktree add /tmp/yp-base origin/main && (cd /tmp/yp-base && npm ci && tools/perf-lab/build.sh yp-base) && git worktree remove /tmp/yp-base`.

```bash
PERF_API_URL=http://127.0.0.1:3199 tools/perf-lab/build.sh yp-candidate
PERF_API_URL=http://127.0.0.1:3199 tools/perf-lab/bench.sh yp-base 9 /product/himichka-30
PERF_API_URL=http://127.0.0.1:3199 tools/perf-lab/bench.sh yp-candidate 9 /product/himichka-30
```

INP: в одном терминале `PERF_API_URL=http://127.0.0.1:3199 tools/perf-lab/serve.sh yp-base` (затем `yp-candidate`), в другом:

```bash
UPSTREAM=127.0.0.1:8443 STEPS=product node tools/perf-lab/inp-lab.mjs https://ximi4ka.ru/product/himichka-30 4 on early 3
UPSTREAM=127.0.0.1:8443 STEPS=product node tools/perf-lab/inp-lab.mjs https://ximi4ka.ru/product/himichka-30 4 on settled 3
```

Перед замером «после»: `curl -sk https://127.0.0.1:8443/product/himichka-30 -H 'host: ximi4ka.ru' | grep -c yandex-pay-badge` → `1`.

Expected: таблица для владельца — медианы `dFCP`/`dLCP` (9 прогонов) и INP в `early`/`settled` до и после. Критерий «не ухудшает заметно»: медианы в пределах разброса (ориентир ±10%), в сводке Long Animation Frames нет новых длинных кадров от `pay.js`. Хуже — не мёржить, отдать цифры владельцу и предложить монтировать плашку при появлении в зоне видимости. Остановить прокси (`kill %1`).

- [ ] **Step 8: Sandbox checklist — ТРЕБУЕТ ВЛАДЕЛЬЦА**

Сессия не вписывает ключи и Merchant ID и не меняет настройки кабинета.

- [ ] (владелец) локальный `api/.env`: песочничный `YANDEX_PAY_MERCHANT_ID`, `WEB_ORIGIN=http://localhost:3000`; локальная админка — Sandbox и рубильник; перед прогоном тестов эти строки закомментировать (Global Constraints);
- [ ] заказ картой «Мир» и заказ Сплитом доходят до «Оплачен» через сверку (2–3 минуты); в кабинете песочницы у заказа видны позиции, `receipt.tax`, `fiscalContact`; форма Сплита открывается на Сплите;
- [ ] сумма 10 001 ₽ → «Ошибка оплаты»;
- [ ] (владелец решает) живой вебхук: `cloudflared tunnel --url http://localhost:3001` и песочничный Callback URL `https://<адрес туннеля>/api/webhooks/yandex-pay` на время теста; иначе вебхук проверяется тестами и первым боевым платежом;
- [ ] плашки и виджет с боевым Merchant ID: локально режим Production и фиктивный `YANDEX_PAY_API_KEY=local-badges-only` (без ключа боевой режим недоступен); заказы Яндексом в этом режиме не оформлять;
- [ ] код налога «без НДС» = 6 принят песочницей.

- [ ] **Step 9: Reviews and handoff — без мёржа**

`/code-review` и `/security-review` по диффу ветки, найденное — отдельными коммитами, затем повторить шаг 4. Сообщить владельцу: `git log --oneline origin/main..HEAD`, вывод шага 4, таблицу замеров, состояние чек-листа шага 8. PR, push и мёрж — только по его явной команде (мёрж = выкатка на прод).

---

## Self-review

**1. Spec coverage**

| Раздел спека                                                                 | Задача                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Главный принцип: Т-Касса не меняется                                         | Global Constraints, 2 (только `export`), 8 шаг 4 (дифф-проверка)                         |
| Критерий: без включения прод как сейчас                                      | 2 (`isCheckoutAvailable`), 5 («без paymentMethod», «рубильник»), 7 («Яндекс недоступен») |
| Критерий: тесты Т-Кассы без правок                                           | 2, 4, 5, 8                                                                               |
| Критерий: полный цикл в песочнице картой и Сплитом                           | 8 шаг 8 (владелец)                                                                       |
| Критерий: сумма корзины = итог при промокоде, опте, доставке                 | 2 (`cart.test.ts`), 5 («промокод…»)                                                      |
| Критерий: потерянный вебхук добирается сверкой                               | 5 (`reconcile.yandex.test.ts`)                                                           |
| Критерий: скрипт не ухудшает INP/FCP                                         | 8 шаг 7                                                                                  |
| Критерий: ключей нет в репо и в ответах                                      | Global Constraints, 5 (`settingsYandexPay.test.ts`), 8                                   |
| Конфигурация и правило доступности                                           | 2 (`config.ts`)                                                                          |
| `client.ts`: создание заказа и статус                                        | 3                                                                                        |
| `cart.ts` из экспортов `receipt.ts`                                          | 2                                                                                        |
| `webhook.ts` (jose, JWKS по режиму, alg/exp/iat/merchantId)                  | 4                                                                                        |
| Чекаут API: публичные настройки, `paymentMethod`, 400, ЕАЭС, идемпотентность | 5                                                                                        |
| Вебхук-маршрут: raw до `express.json`, статусы, ответы                       | 4                                                                                        |
| Сверка                                                                       | 5                                                                                        |
| Типы и админка                                                               | 1                                                                                        |
| Плашки: компонент и места                                                    | 6                                                                                        |
| Чекаут: блок, виджет Ultimate, ЕАЭС, 400, логотипы → текст                   | 7                                                                                        |
| `OrderStatusView` «Оплатить»                                                 | 5 (api), 7 (web)                                                                         |
| Безопасность                                                                 | 2, 4, 5, Global Constraints, 8 шаг 9                                                     |
| Тесты (весь список)                                                          | 1–7                                                                                      |
| Проверка (песочница, вебхук, плашки и скорость)                              | 8                                                                                        |
| Выкатка и откат — раздел в `deploy/README.md`                                | 8 шаг 3                                                                                  |
| Риски (категории, код налога, СБП, тарифы)                                   | 8 (README, чек-лист: код 6); подпись «Картой — Т-Банк» без СБП до уточнения              |

Уточнения к букве спека, решённые в плане:

- «Разбиение цены» в `receipt.ts` — не функция, а код внутри `buildReceipt`; чтобы не менять `receipt.ts` больше, чем на `export`, `cart.ts` повторяет это разбиение (10 строк, с комментарием), а `spreadDiscount`, `cut`, `normalizePhone` берёт экспортом.
- Кнопки «Оплатить» на странице заказа в main нет (в работе от 11.10 её тоже не было), поэтому статус заказа получает `paymentUrl` — только с секретом, у неоплаченного заказа Яндекс Пэй (задачи 5, 7).
- Плашки локально «с боевым Merchant ID»: боевой режим без ключа API недоступен по правилу из спека, поэтому для показа плашек — фиктивный ключ и без оформления заказов Яндексом (задача 8, шаг 8).
- Подпись YCP в админке в main — «Яндекс», не «Яндекс (YCP)»; «Яндекс Пэй» от неё отличается, переименование YCP не входит в задачу.

**2. Placeholder scan.** Плейсхолдеров нет: у шагов с кодом — полный код, у проверок — команда и ожидаемый результат. Значения, которые вписывает владелец, помечены шагами владельца и в репозиторий не попадают.

**3. Type consistency.** `CheckoutPaymentMethod`, `PublicYandexPay`, `PublicOrderStatus.paymentUrl` (1) → схема и маршруты (5), `web/lib/yandexPay.ts`, `PaymentMethodField`, чекаут, `OrderStatusView` (6, 7). `YandexPayConfig`, `yandexPayConfigFrom`, `isCheckoutAvailable`, `isYandexPayAvailable`, `publicYandexPay`, `hasYandexPayMerchant` (2) → клиент, вебхук (3, 4), чекаут, настройки, сверка (5). `createYandexOrder(order, { preferSplit }, deps?)`, `getYandexOrderStatus(orderNumber, deps?)`, `mapYandexStatus` (3) → чекаут, сверка (5), вебхук (4). `verifyYandexWebhook(rawBody, deps?)` (4) → маршрут (4). `applyPaymentStatus(..., 'yandex_pay')` (1) → маршрут (4). `splitBadgeAmount`, `YandexPaySdkScript`, `SplitBadge({ merchantId })` (6) → `SplitWidget`, `PaymentMethodField` (7). `loadPublicYandexPay`/`reloadPublicYandexPay` (6) → чекаут (7).

**4. Review Focus.** Пять сбоев выписаны в начале; тесты: 1 → задачи 5 и 7, 2 → задача 5, 3 → задача 4, 4 → задача 6, 5 → задача 7.
