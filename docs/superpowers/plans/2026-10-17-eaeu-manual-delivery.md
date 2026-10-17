# Доставка в Беларусь, Казахстан, Армению, Киргизию: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Покупатель из Беларуси, Казахстана, Армении или Киргизии оформляет и оплачивает заказ: выбирает страну, город из списка городов с ПВЗ СДЭК и вручную пишет адрес ПВЗ.

**Architecture:** Отдельный способ доставки `cdek_manual_cis` рядом с `cdek_pvz`/`cdek_courier`, без расширения `DeliveryMethod`. Список городов и цены живут в одном модуле `shared/src/types/cis.ts`, из которого их берут сервер, чекаут и страница `/order-process`. Сервер сам проверяет город и считает цену; автозаказ в СДЭК такие заказы пропускает, отправку оформляет оператор.

**Tech Stack:** TypeScript, npm workspaces (`shared`, `api`, `web`), Express + zod + TypeORM (api), Next.js + React (web), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-17-eaeu-manual-delivery-design.md`

## Global Constraints

- Цены и пороги (из спеки): BY бесплатно от 3000 ₽, иначе 700 ₽; KZ от 5000 ₽, иначе 900 ₽; KG от 5000 ₽, иначе 900 ₽; AM от 5000 ₽, иначе 1200 ₽. Порог считается по `subtotal − discount`.
- Значение способа в заказе: `cdek_manual_cis` (`delivery_method` — `varchar(64)`, миграций нет).
- Город только из `CIS_CITIES[country]`; иначе 400 с кодом `delivery_city_unavailable`. Нет email у такого заказа — 400 `email_required`.
- Адрес в заказе хранится как `<город>, <введённый адрес>` (как у российских заказов); `country` и `city` ещё и отдельными полями.
- `DeliveryMethod` и `DeliveryDestination` не меняются (от них зависят `quoteDelivery`, Яндекс Pay, виджет СДЭК).
- Следуй `CLAUDE.md` проекта: перед PR `npm run lint`, `npm run typecheck`, тесты затронутых workspace, `npx prettier --check .` в корне. Тесты api — только на одноразовой БД через `TEST_DATABASE_URL`.
- Next.js здесь не тот, что в обучающих данных (`web/AGENTS.md`): новых API Next в плане нет; если понадобится, сначала читай `web/node_modules/next/dist/docs/`.
- Не коммитить, не пушить и не мёржить без команды владельца (мёрж в `main` = выкатка в прод). Шаги «Commit» ниже выполнять только если владелец разрешил коммиты в этой сессии.
- Комментарии и тексты интерфейса — по-русски, в стиле соседнего кода.

## Review Focus

Что спека подразумевает, но отдельные задачи могли бы не проверить (каждая строка закрыта тестом в указанной задаче):

1. Покупатель из Беларуси без email: чек Т-Кассы принимает только email или номер `+7…`, поэтому заказ без email отклоняется до создания (Task 3, Task 5).
2. Телефон `+375…`, `+996…`, `+374…` не должен портиться маской `+7` и уходит как `+<цифры>` (Task 5, Task 7).
3. Подмена запроса в обход формы: город другой страны, город не из списка, страна `RU` (Task 3).
4. Заказ `cdek_manual_cis` не попадает в очередь СДЭК и не ломает автозаполнение чекаута из прошлого заказа (Task 4).
5. Смена страны сбрасывает город; список городов показывает только города выбранной страны (Task 6, Task 7).

---

## File Structure

| Файл                                                                                | Ответственность                                                                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `shared/src/types/cis.ts` (создать)                                                 | Типы стран, `CisDeliveryDestination`, цены и пороги, `cisShippingRub`, `isCisCity`, реэкспорт городов |
| `shared/src/types/cisCities.ts` (создать, перенос из `web/lib/cdekCities.ts`)       | Данные: `CIS_CITIES`                                                                                  |
| `shared/src/types/order.ts`, `account.ts`, `index.ts`, `package.json` (изменить)    | Типы заказа и экспорты                                                                                |
| `api/src/routes/checkout.schemas.ts`, `checkout.ts` (изменить)                      | Схема, проверки, цена и адрес заказа                                                                  |
| `api/src/lib/notifications/format.ts` (изменить)                                    | Подписи в Telegram и в таблице                                                                        |
| `api/src/lib/account/orders.ts` (изменить)                                          | `lastDeliveryFor` и тип способа в сводке                                                              |
| `web/lib/checkout.ts` (изменить)                                                    | Валидация контактов и формы для СНГ                                                                   |
| `web/components/checkout/useCisDelivery.ts`, `CisDelivery.tsx` (создать)            | Состояние и поля доставки в СНГ                                                                       |
| `web/app/[locale]/(public)/checkout/page.tsx` (изменить)                            | Переключатель региона, сводка, отправка                                                               |
| `web/components/marketing/DeliveryCities.tsx`, `web/lib/orderProcess.ts` (изменить) | Страница `/order-process`                                                                             |
| `OrderDetails.tsx`, `orderUi.ts` (изменить)                                         | Подписи способа                                                                                       |

Команды тестов: shared — `npm test -w shared`; web — `cd web && npx vitest run <путь>`; api — `cd api && TEST_DATABASE_URL=<одноразовая БД> npx vitest run <путь>`.

---

### Task 1: Общий модуль `cis` (страны, цены, города)

**Files:**

- Create: `shared/src/types/cis.ts`, `shared/src/types/cis.test.ts`
- Move: `web/lib/cdekCities.ts` → `shared/src/types/cisCities.ts`
- Modify: `shared/package.json` (exports), `shared/src/index.ts`, `web/components/marketing/DeliveryCities.tsx`, `web/components/marketing/DeliveryCities.test.tsx`

**Interfaces:**

- Produces (из `@ximi4ka-shop/shared/types/cis`): `CIS_COUNTRIES`, `CisCountry`, `CIS_COUNTRY_NAMES`, `CIS_FLAG_CODES`, `CIS_DELIVERY_RULES`, `cisShippingRub(country, amountRub): number`, `CIS_CITIES`, `isCisCity(country, city): boolean`, `CisDeliveryDestination`.

- [ ] **Step 1: Write the failing test** — `shared/src/types/cis.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { CIS_CITIES, CIS_COUNTRIES, CIS_DELIVERY_RULES, cisShippingRub, isCisCity } from './cis.js'

describe('cisShippingRub', () => {
  it('Беларусь: 700 ₽ ниже 3000, бесплатно от 3000', () => {
    expect(cisShippingRub('BY', 2999)).toBe(700)
    expect(cisShippingRub('BY', 3000)).toBe(0)
  })

  it('Казахстан и Киргизия: 900 ₽ ниже 5000, бесплатно от 5000', () => {
    for (const c of ['KZ', 'KG'] as const) {
      expect(cisShippingRub(c, 4999)).toBe(900)
      expect(cisShippingRub(c, 5000)).toBe(0)
    }
  })

  it('Армения: 1200 ₽ ниже 5000, бесплатно от 5000', () => {
    expect(cisShippingRub('AM', 4999)).toBe(1200)
    expect(cisShippingRub('AM', 5000)).toBe(0)
  })

  it('пороги и цены заданы для каждой страны', () => {
    for (const c of CIS_COUNTRIES) {
      expect(CIS_DELIVERY_RULES[c].priceRub).toBeGreaterThan(0)
      expect(CIS_DELIVERY_RULES[c].freeFromRub).toBeGreaterThan(0)
    }
  })
})

describe('CIS_CITIES / isCisCity', () => {
  it('city принимается только в своей стране', () => {
    expect(isCisCity('BY', 'Минск')).toBe(true)
    expect(isCisCity('KZ', 'Минск')).toBe(false)
    expect(isCisCity('KZ', 'Алматы')).toBe(true)
    expect(isCisCity('AM', 'Ереван')).toBe(true)
    expect(isCisCity('KG', 'Бишкек')).toBe(true)
  })

  it('неизвестный и пустой город отклоняется', () => {
    expect(isCisCity('BY', 'Атлантида')).toBe(false)
    expect(isCisCity('BY', '')).toBe(false)
  })

  it('в данных нет пустых и повторяющихся названий', () => {
    for (const country of CIS_COUNTRIES) {
      const cities = CIS_CITIES[country]
      expect(cities.length).toBeGreaterThan(0)
      expect(cities.every((c) => c.trim() === c && c.length > 0)).toBe(true)
      expect(new Set(cities).size).toBe(cities.length)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL (`./cis.js` не найден).

- [ ] **Step 3: Move the cities data and rename keys**

```bash
mv web/lib/cdekCities.ts shared/src/types/cisCities.ts
sed -i '' -e 's/^  by: \[/  BY: [/' -e 's/^  kz: \[/  KZ: [/' -e 's/^  am: \[/  AM: [/' -e 's/^  kg: \[/  KG: [/' \
  -e 's/CDEK_CITIES/CIS_CITIES/' -e 's/CdekCityCountry/CisCountry/g' shared/src/types/cisCities.ts
```

Затем в `shared/src/types/cisCities.ts` заменить строку `export type CisCountry = 'by' | 'kz' | 'am' | 'kg'` на импорт типа и поправить заголовочный комментарий. Верх файла должен выглядеть так:

```ts
import type { CisCountry } from './cis.js'

// Города, где у СДЭК есть пункты выдачи или постаматы. Снимок боевого API СДЭК
// (GET /v2/deliverypoints?country_code=…) на 17.10.2026; порядок — по числу точек,
// затем по алфавиту. Названия очищены от района и области. Обновлять вручную.
export const CIS_CITIES: Record<CisCountry, string[]> = {
  BY: [
```

Проверка: `grep -c '^    "' shared/src/types/cisCities.ts` должен вернуть `94`.

- [ ] **Step 4: Write `shared/src/types/cis.ts`**

```ts
import { CIS_CITIES } from './cisCities.js'

// Доставка в Беларусь, Казахстан, Армению и Киргизию: город выбирается из списка
// городов с ПВЗ СДЭК, адрес пункта покупатель пишет сам, отправку оформляет
// оператор вручную. Цены и список городов — единый источник для api и web.
export const CIS_COUNTRIES = ['BY', 'KZ', 'AM', 'KG'] as const
export type CisCountry = (typeof CIS_COUNTRIES)[number]

export const CIS_COUNTRY_NAMES: Record<CisCountry, string> = {
  BY: 'Беларусь',
  KZ: 'Казахстан',
  AM: 'Армения',
  KG: 'Киргизия',
}

// Код флага для <Flag> (web/components/marketing/Flag.tsx).
export const CIS_FLAG_CODES = { BY: 'by', KZ: 'kz', AM: 'am', KG: 'kg' } as const satisfies Record<
  CisCountry,
  string
>

// Условия от владельца, 17.10.2026. Порог — по сумме товаров за вычетом скидки.
export const CIS_DELIVERY_RULES: Record<CisCountry, { freeFromRub: number; priceRub: number }> = {
  BY: { freeFromRub: 3000, priceRub: 700 },
  KZ: { freeFromRub: 5000, priceRub: 900 },
  KG: { freeFromRub: 5000, priceRub: 900 },
  AM: { freeFromRub: 5000, priceRub: 1200 },
}

export function cisShippingRub(country: CisCountry, amountRub: number): number {
  const rule = CIS_DELIVERY_RULES[country]
  return amountRub >= rule.freeFromRub ? 0 : rule.priceRub
}

export { CIS_CITIES }

export function isCisCity(country: CisCountry, city: string): boolean {
  return CIS_CITIES[country].includes(city)
}

// Куда везём: способ «cdek_manual_cis» — страна, город из списка и адрес ПВЗ.
export interface CisDeliveryDestination {
  method: 'cdek_manual_cis'
  country: CisCountry
  city: string
  address: string
}
```

- [ ] **Step 5: Export the module**

В `shared/package.json` в `exports` добавить после `"./types/order"`:

```json
    "./types/cis": "./src/types/cis.ts",
```

В `shared/src/index.ts` добавить в конец:

```ts
export type { CisCountry, CisDeliveryDestination } from './types/cis.js'
```

- [ ] **Step 6: Point `DeliveryCities` and its test at the shared module**

`web/components/marketing/DeliveryCities.tsx` целиком:

```tsx
import {
  CIS_CITIES,
  CIS_COUNTRIES,
  CIS_COUNTRY_NAMES,
  CIS_FLAG_CODES,
} from '@ximi4ka-shop/shared/types/cis'
import { Flag } from './Flag'

// Города стран ЕАЭС, где есть пункты выдачи или постаматы СДЭК. Для /order-process.
export function DeliveryCities() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 font-lj-display text-xl font-[700] tracking-[-0.02em]">
        Города с пунктами выдачи СДЭК
      </h3>
      <ul aria-label="Города с пунктами выдачи СДЭК" className="m-0 flex list-none flex-col p-0">
        {CIS_COUNTRIES.map((code) => (
          <li
            key={code}
            className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] py-4 first:border-t-0 first:pt-0"
          >
            <span className="flex items-center gap-2 font-lj-body text-base font-[600]">
              <Flag code={CIS_FLAG_CODES[code]} />
              {CIS_COUNTRY_NAMES[code]}
            </span>
            <span className="font-lj-body text-[0.9375rem] leading-[1.6] opacity-80">
              {CIS_CITIES[code].join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

В `web/components/marketing/DeliveryCities.test.tsx`: импорт `import { CDEK_CITIES } from '@/lib/cdekCities'` заменить на `import { CIS_CITIES } from '@ximi4ka-shop/shared/types/cis'`, а `Object.values(CDEK_CITIES)` (два места) на `Object.values(CIS_CITIES)`.

- [ ] **Step 7: Run tests**

Run: `npm test -w shared && (cd web && npx vitest run components/marketing/DeliveryCities.test.tsx "app/[locale]/(public)/order-process")`
Expected: PASS, `tsc --noEmit` в shared без ошибок.

- [ ] **Step 8: Commit (только по команде владельца)**

```bash
git add shared web/components/marketing web/lib
git commit -m "feat(shared): единый модуль доставки в страны ЕАЭС (города и цены)"
```

---

### Task 2: Типы заказа в `shared`

**Files:**

- Modify: `shared/src/types/order.ts`, `shared/src/types/account.ts`, `shared/src/index.ts`
- Test: `shared/src/types/order.test.ts`

**Interfaces:**

- Consumes: `CisCountry`, `CisDeliveryDestination` из `./cis.js`.
- Produces: `OrderDeliveryMethod`, `CheckoutDelivery`, `DeliveryAddress.country?/city?`, `CheckoutRequest.delivery: CheckoutDelivery`, `AccountOrderSummary.deliveryMethod: OrderDeliveryMethod`.

- [ ] **Step 1: Write the failing type test** — добавить в `shared/src/types/order.test.ts`

```ts
import type { CheckoutRequest, OrderDeliveryMethod } from './order.js'
import type { DeliveryAddress } from './order.js'

test('OrderDeliveryMethod включает способ для стран ЕАЭС', () => {
  expectTypeOf<OrderDeliveryMethod>().toEqualTypeOf<
    'cdek_pvz' | 'cdek_courier' | 'cdek_manual_cis'
  >()
})

test('CheckoutRequest.delivery принимает доставку в страну ЕАЭС с комментарием', () => {
  const delivery: CheckoutRequest['delivery'] = {
    method: 'cdek_manual_cis',
    country: 'BY',
    city: 'Минск',
    address: 'ул. Ленина, 5',
    comment: 'после 18:00',
  }
  expectTypeOf(delivery).toMatchTypeOf<CheckoutRequest['delivery']>()
})

test('DeliveryAddress хранит страну и город', () => {
  expectTypeOf<DeliveryAddress['country']>().toEqualTypeOf<
    'BY' | 'KZ' | 'AM' | 'KG' | null | undefined
  >()
  expectTypeOf<DeliveryAddress['city']>().toEqualTypeOf<string | null | undefined>()
})
```

(Импорты в начало файла объединить с существующим `import type { OrderDto } from './order.js'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL (`OrderDeliveryMethod` не экспортируется).

- [ ] **Step 3: Implement**

`shared/src/types/order.ts`:

- добавить импорт `import type { CisCountry, CisDeliveryDestination } from './cis.js'` рядом с существующими импортами;
- после `export type DeliveryMethod = 'cdek_pvz' | 'cdek_courier'` добавить:

```ts
// Способ в сохранённом заказе: к двум способам СДЭК добавлена доставка в страны
// ЕАЭС с адресом ПВЗ вручную (cdek_manual_cis). Оформляется только через чекаут.
export type OrderDeliveryMethod = DeliveryMethod | 'cdek_manual_cis'
```

- в `DeliveryAddress` после `postalCode?: string | null` добавить:

```ts
  // Доставка в страну ЕАЭС (cdek_manual_cis): страна и город из списка городов с ПВЗ.
  country?: CisCountry | null
  city?: string | null
```

- перед `CheckoutRequest` добавить:

```ts
// Куда везём в чекауте: Россия (виджет и пикеры СДЭК) или страна ЕАЭС (адрес вручную).
export type CheckoutDelivery = (DeliveryDestination | CisDeliveryDestination) & {
  comment?: string
}
```

- в `CheckoutRequest` заменить `delivery: DeliveryDestination & { comment?: string }` на `delivery: CheckoutDelivery`.

`shared/src/types/account.ts`: в `AccountOrderSummary` заменить `deliveryMethod: DeliveryMethod` на `deliveryMethod: OrderDeliveryMethod`; импорт `OrderDeliveryMethod` добавить к импорту из `./order.js` (`DeliveryMethod` остаётся нужен `LastDelivery`).

`shared/src/index.ts`: в блок `export type { … DeliveryMethod, … } from './types/order.js'` добавить `OrderDeliveryMethod,` и `CheckoutDelivery,`.

- [ ] **Step 4: Run tests and typecheck all workspaces**

Run: `npm test -w shared && npm run typecheck`
Expected: shared PASS. Если в `api` или `web` появились ошибки типов из-за расширения `CheckoutRequest.delivery`, они ожидаемы и закрываются в Task 3 и Task 7 (обрати внимание на `web/app/[locale]/(public)/checkout/page.tsx`: `delivery.destination` остаётся совместимым).

- [ ] **Step 5: Commit (только по команде владельца)**

```bash
git add shared
git commit -m "feat(shared): типы заказа для доставки в страны ЕАЭС"
```

---

### Task 3: API — схема, проверки и цена в `POST /api/checkout`

**Files:**

- Modify: `api/src/routes/checkout.schemas.ts`, `api/src/routes/checkout.ts`
- Test: `api/src/routes/checkout.test.ts`

**Interfaces:**

- Consumes: `CIS_COUNTRIES`, `cisShippingRub`, `isCisCity` из `@ximi4ka-shop/shared/types/cis`; `DeliveryQuote` из `@ximi4ka-shop/shared`.
- Produces: заказ с `deliveryMethod: 'cdek_manual_cis'`, `deliveryAddress = { address: '<город>, <адрес>', comment, country, city, quote: null, packages }`, `shippingRub` по `cisShippingRub`. Ошибки 400: `email_required`, `delivery_city_unavailable`.

- [ ] **Step 1: Write the failing tests** — в `api/src/routes/checkout.test.ts`, в `describe('POST /api/checkout')` после теста `charges 500 ₽ for courier below 5000 ₽`. Хелпер добавить рядом с `checkoutBody` (на уровне файла):

```ts
function cisBody(
  items: Array<{ productId: string; quantity: number }>,
  delivery: Record<string, unknown> = {},
) {
  const body = checkoutBody(items)
  body.customer = { name: 'Алесь Новик', phone: '+375291234567', email: 'ales@example.com' }
  body.delivery = {
    method: 'cdek_manual_cis',
    country: 'BY',
    city: 'Минск',
    address: 'ул. Ленина, 5, ПВЗ СДЭК',
    ...delivery,
  }
  return body
}
```

Тесты:

```ts
describe('доставка в страны ЕАЭС: адрес ПВЗ вручную', () => {
  function noCdek() {
    const get = vi.fn()
    setCdekClientForTests({ get, post: vi.fn(), raw: vi.fn() })
    return get
  }

  async function placeCis(price: number, delivery: Record<string, unknown> = {}) {
    const p = await seedProduct({ priceRub: price })
    const res = await request(app)
      .post('/api/checkout')
      .send(cisBody([{ productId: p.id, quantity: 1 }], delivery))
    return res
  }

  it('Беларусь: 700 ₽ ниже 3000 ₽, адрес с городом, без калькулятора СДЭК', async () => {
    const get = noCdek()
    const res = await placeCis(2000)
    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.deliveryMethod).toBe('cdek_manual_cis')
    expect(order.shippingRub).toBe(700)
    expect(order.totalRub).toBe(2700)
    expect(order.deliveryAddress).toMatchObject({
      address: 'Минск, ул. Ленина, 5, ПВЗ СДЭК',
      country: 'BY',
      city: 'Минск',
      quote: null,
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('Беларусь: бесплатно от 3000 ₽', async () => {
    noCdek()
    const res = await placeCis(3000)
    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.shippingRub).toBe(0)
    expect(order.totalRub).toBe(3000)
  })

  it.each([
    ['KZ', 'Алматы', 900],
    ['KG', 'Бишкек', 900],
    ['AM', 'Ереван', 1200],
  ])('%s: %i ₽ ниже 5000 ₽ и бесплатно от 5000 ₽', async (country, city, price) => {
    noCdek()
    const below = await placeCis(4000, { country, city })
    expect(below.status).toBe(201)
    const belowOrder = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: below.body.data.orderNumber,
    })
    expect(belowOrder.shippingRub).toBe(price)

    const free = await placeCis(5000, { country, city })
    expect(free.status).toBe(201)
    const freeOrder = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: free.body.data.orderNumber,
    })
    expect(freeOrder.shippingRub).toBe(0)
  })

  it('400 email_required: без email чек не выписать — заказ не создаётся', async () => {
    noCdek()
    const p = await seedProduct()
    const body = cisBody([{ productId: p.id, quantity: 1 }])
    body.customer = { name: 'Алесь', phone: '+375291234567' } as typeof body.customer
    const res = await request(app).post('/api/checkout').send(body)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('email_required')
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
  })

  it('400 delivery_city_unavailable: города нет в списке страны', async () => {
    noCdek()
    const res = await placeCis(2000, { city: 'Атлантида' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('delivery_city_unavailable')
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
  })

  it('400 delivery_city_unavailable: город другой страны', async () => {
    noCdek()
    const res = await placeCis(2000, { country: 'KZ', city: 'Минск' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('delivery_city_unavailable')
  })

  it('400: страна вне списка и пустой адрес не проходят схему', async () => {
    noCdek()
    const ru = await placeCis(2000, { country: 'RU' })
    expect(ru.status).toBe(400)
    const noAddress = await placeCis(2000, { address: '   ' })
    expect(noAddress.status).toBe(400)
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && TEST_DATABASE_URL=<одноразовая БД> npx vitest run src/routes/checkout.test.ts -t "страны ЕАЭС"`
Expected: FAIL (схема отклоняет `cdek_manual_cis`, 400 вместо 201).

- [ ] **Step 3: Extend the schema** — `api/src/routes/checkout.schemas.ts`

Добавить импорт вверху: `import { CIS_COUNTRIES } from '@ximi4ka-shop/shared/types/cis'`.

После `CourierDeliverySchema` добавить:

```ts
// Доставка в Беларусь, Казахстан, Армению, Киргизию: город — из списка городов
// с ПВЗ СДЭК (проверяет маршрут), адрес пункта покупатель пишет сам. Расчёта СДЭК
// и кода пункта здесь нет: отправку оформляет оператор.
const CisDeliverySchema = z.object({
  method: z.literal('cdek_manual_cis'),
  country: z.enum(CIS_COUNTRIES),
  city: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(1000),
  comment,
})
```

И заменить `DeliverySchema`:

```ts
export const DeliverySchema = z.discriminatedUnion('method', [
  PvzDeliverySchema,
  CourierDeliverySchema,
  CisDeliverySchema,
])
```

`QuoteDestinationSchema` не менять.

- [ ] **Step 4: Implement the route** — `api/src/routes/checkout.ts`

Импорты: добавить `import { cisShippingRub, isCisCity } from '@ximi4ka-shop/shared/types/cis'` и тип `DeliveryQuote` в существующий импорт из `@ximi4ka-shop/shared` (если типов из него в файле нет, добавить `import type { DeliveryQuote } from '@ximi4ka-shop/shared'`).

Перед блоком `if (parsed.delivery.method === 'cdek_pvz') {` (проверка пункта) добавить:

```ts
// Страны ЕАЭС: чек Т-Кассы принимает только email или номер +7…, поэтому без
// email заказ не оплатить; город — только из списка городов с ПВЗ СДЭК.
if (parsed.delivery.method === 'cdek_manual_cis') {
  if (!parsed.customer.email) {
    throw badRequest('email_required', 'Укажите email — на него придёт чек')
  }
  if (!isCisCity(parsed.delivery.country, parsed.delivery.city)) {
    throw badRequest(
      'delivery_city_unavailable',
      'Доставка в этот город недоступна — выберите город из списка',
    )
  }
}
```

Блок расчёта (сейчас `const quote = await quoteDelivery(...)`, `const shippingRub = quote.customerPriceRub`) заменить на:

```ts
// Цену доставки считает только сервер. Россия — по калькулятору СДЭК; страны
// ЕАЭС — по таблице shared (адрес ПВЗ вручную, калькулятор не нужен).
let quote: DeliveryQuote | null = null
let shippingRub: number
if (delivery.method === 'cdek_manual_cis') {
  shippingRub = cisShippingRub(delivery.country, subtotalRub - discountRub)
} else {
  // Порог бесплатной доставки — по сумме, которую платят за товары.
  quote = await quoteDelivery(
    { destination: delivery, subtotalRub: subtotalRub - discountRub, packages: quotePackages },
    { cdek: getCdekClient(), config: deliveryConfigFromEnv() },
  )
  shippingRub = quote.customerPriceRub
}
```

(старые комментарии «Цену доставки считает только сервер…» и «Порог бесплатной доставки…» над прежним вызовом удалить, чтобы не дублировались.) Строку `const totalRub = …` оставить как есть.

В `create({ … deliveryAddress: { … } })` заменить объект `deliveryAddress` на выражение:

```ts
            deliveryAddress:
              delivery.method === 'cdek_manual_cis'
                ? {
                    address: `${delivery.city}, ${delivery.address}`,
                    comment: delivery.comment ?? null,
                    country: delivery.country,
                    city: delivery.city,
                    quote: null,
                    packages,
                  }
                : {
                    address: delivery.address,
                    comment: delivery.comment ?? null,
                    cityCode: delivery.cityCode ?? null,
                    deliveryPointCode:
                      delivery.method === 'cdek_pvz' ? delivery.deliveryPointCode : null,
                    postalCode:
                      delivery.method === 'cdek_courier' ? (delivery.postalCode ?? null) : null,
                    quote: {
                      tariffCode: quote!.tariffCode,
                      cdekPriceRub: quote!.cdekPriceRub,
                      periodMin: quote!.periodMin,
                      periodMax: quote!.periodMax,
                      source: quote!.source,
                    },
                    packages,
                  },
```

Если ESLint ругается на `quote!` (non-null assertion), заменить: вынести перед `AppDataSource.transaction` переменную
`const carrierQuote = quote` и в ветке использовать `quote?.tariffCode ?? 0`, `quote?.cdekPriceRub ?? null` и т. д. (`DeliveryAddress.quote` допускает все эти значения). Остальное в файле, использующее `quote` после транзакции, проверить через `grep -n "quote" api/src/routes/checkout.ts` и обработать `null`.

- [ ] **Step 5: Run tests**

Run: `cd api && TEST_DATABASE_URL=<одноразовая БД> npx vitest run src/routes/checkout.test.ts && npm run typecheck`
Expected: PASS (все прежние тесты чекаута тоже), typecheck без ошибок.

- [ ] **Step 6: Commit (только по команде владельца)**

```bash
git add api/src/routes/checkout.schemas.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git commit -m "feat(api): доставка в страны ЕАЭС в чекауте (город из списка, цена по таблице)"
```

---

### Task 4: API — Telegram, таблица, кабинет, очередь СДЭК

**Files:**

- Modify: `api/src/lib/notifications/format.ts`, `api/src/lib/account/orders.ts`
- Test: `api/src/lib/notifications/format.test.ts`, `api/src/lib/notifications/outbox.test.ts`, `api/src/routes/account-profile.test.ts`

**Interfaces:**

- Consumes: `CIS_COUNTRY_NAMES`, `CisCountry` из `@ximi4ka-shop/shared/types/cis`; `OrderDeliveryMethod` из `@ximi4ka-shop/shared`.
- Produces: подпись «Доставка в <страна> (СДЭК, адрес вручную)» в карточке и таблице; `lastDeliveryFor` игнорирует заказы `cdek_manual_cis`.

- [ ] **Step 1: Write the failing tests**

`api/src/lib/notifications/format.test.ts` — добавить в конец файла:

```ts
describe('доставка в страны ЕАЭС (cdek_manual_cis)', () => {
  const cisOrder: NotifiableOrder = {
    ...order,
    deliveryMethod: 'cdek_manual_cis',
    deliveryAddress: {
      address: 'Минск, ул. Ленина, 5, ПВЗ СДЭК',
      comment: null,
      country: 'BY',
      city: 'Минск',
      quote: null,
    },
    customerPhone: '+375291234567',
  }

  it('в таблице — не «Курьер», а страна и адрес', () => {
    expect(sheetRow(cisOrder)[6]).toBe(
      'Доставка в Беларусь (СДЭК, адрес вручную) · Минск, ул. Ленина, 5, ПВЗ СДЭК',
    )
  })

  it('в карточке Telegram — страна и адрес, телефон без маски +7', () => {
    const card = telegramCard(cisOrder)
    expect(card).toContain(
      'Адрес: Доставка в Беларусь (СДЭК, адрес вручную): Минск, ул. Ленина, 5, ПВЗ СДЭК',
    )
    expect(card).toContain('Телефон: +375291234567')
    expect(card).not.toContain('Курьер')
  })
})
```

`api/src/lib/notifications/outbox.test.ts` — в тесте `доставка не СДЭК и не оплата — не ставим` добавить заказ:

```ts
const cis = await seedOrder({ deliveryMethod: 'cdek_manual_cis' })
cis.status = 'paid'
await saveOrderWithStatusEvent(cis, 'pending')
```

и в конце `expect(await shipments(cis.id)).toHaveLength(0)`.

`api/src/routes/account-profile.test.ts` — после теста `lastDelivery из последнего заказа: ПВЗ и курьер`:

```ts
it('lastDelivery пропускает заказ в страну ЕАЭС и берёт последний российский', async () => {
  const auth = await loginAsCustomer(app)
  const c = await me()
  await seedOrder({ customerId: c.id, placedSignedIn: true })
  await seedOrder({
    customerId: c.id,
    placedSignedIn: true,
    deliveryMethod: 'cdek_manual_cis',
    deliveryAddress: {
      address: 'Минск, ул. Ленина, 5',
      comment: null,
      country: 'BY',
      city: 'Минск',
      quote: null,
    },
  })
  const res = await request(app).get('/api/account/me').set(customerHeaders(auth))
  expect(res.body.data.lastDelivery).toMatchObject({ method: 'cdek_pvz' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && TEST_DATABASE_URL=<одноразовая БД> npx vitest run src/lib/notifications src/routes/account-profile.test.ts`
Expected: FAIL (подпись «Курьер…»; `lastDelivery.method` равен `cdek_manual_cis`).

- [ ] **Step 3: Implement format.ts**

Импорт: `import { CIS_COUNTRY_NAMES } from '@ximi4ka-shop/shared/types/cis'`.

После `isPickupPoint` добавить:

```ts
// Доставка в страну ЕАЭС: адрес ПВЗ покупатель написал сам, отправку оформляет оператор.
function cisLabel(order: NotifiableOrder): string {
  const country = order.deliveryAddress.country
  const name = country ? CIS_COUNTRY_NAMES[country] : 'другую страну'
  return `Доставка в ${name} (СДЭК, адрес вручную)`
}
```

В `deliveryCell` перед `return \`Курьер · …\`` добавить:

```ts
if (order.deliveryMethod === 'cdek_manual_cis') return `${cisLabel(order)} · ${address}`
```

В `telegramCard` заменить определение `where`:

```ts
const where =
  order.deliveryMethod === 'cdek_manual_cis'
    ? `${cisLabel(order)}: ${address}`
    : isPickupPoint(order)
      ? `ПВЗ${deliveryPointCode ? ` ${deliveryPointCode}` : ''}: ${address}`
      : `Курьер: ${address}`
```

- [ ] **Step 4: Implement account/orders.ts**

Импорт типа: в существующий импорт из `@ximi4ka-shop/shared` добавить `OrderDeliveryMethod` (`DeliveryMethod` оставить, он нужен `lastDeliveryFor`).

В `lastDeliveryFor` после `.andWhere('o.placed_signed_in = true')` добавить:

```ts
    // Автозаполнение чекаута — только для способов с городом и пунктом СДЭК;
    // заказ в страну ЕАЭС (адрес вручную) форму не заполнит.
    .andWhere('o.delivery_method IN (:...methods)', { methods: ['cdek_pvz', 'cdek_courier'] })
```

В сводке заказа заменить `deliveryMethod: o.deliveryMethod as DeliveryMethod` на `deliveryMethod: o.deliveryMethod as OrderDeliveryMethod`.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd api && TEST_DATABASE_URL=<одноразовая БД> npx vitest run src/lib/notifications src/routes/account-profile.test.ts src/lib/cdek && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit (только по команде владельца)**

```bash
git add api/src/lib api/src/routes/account-profile.test.ts
git commit -m "feat(api): уведомления и кабинет для доставки в страны ЕАЭС"
```

---

### Task 5: Web — проверка формы для СНГ

**Files:**

- Modify: `web/lib/checkout.ts`
- Test: `web/lib/checkout.test.ts`

**Interfaces:**

- Consumes: `CisCountry`, `isCisCity` из `@ximi4ka-shop/shared/types/cis`.
- Produces: `internationalPhoneDigits(value): string`, `isInternationalPhone(value): boolean`, `CisFormState`, `validateCisCheckoutForm(fields, cis): CheckoutFormErrors`; ключи ошибок `country`, `cisCity`, `cisAddress` в `CheckoutFormErrors`.

- [ ] **Step 1: Write the failing tests** — добавить в `web/lib/checkout.test.ts` (импорты расширить):

```ts
import {
  internationalPhoneDigits,
  isInternationalPhone,
  validateCisCheckoutForm,
  type CheckoutFormFields,
} from './checkout'

const cisFields: CheckoutFormFields = {
  name: 'Алесь',
  phone: '+375 29 123-45-67',
  email: 'ales@example.com',
  telegram: '',
  comment: '',
}
const cisOk = { country: 'BY', city: 'Минск', address: 'ул. Ленина, 5' } as const

describe('международный телефон', () => {
  it('оставляет только цифры, без маски +7', () => {
    expect(internationalPhoneDigits('+375 (29) 123-45-67')).toBe('375291234567')
  })

  it('принимает от 8 до 15 цифр', () => {
    expect(isInternationalPhone('+375291234567')).toBe(true)
    expect(isInternationalPhone('+996 555 123 456')).toBe(true)
    expect(isInternationalPhone('1234567')).toBe(false)
    expect(isInternationalPhone('1234567890123456')).toBe(false)
  })
})

describe('validateCisCheckoutForm', () => {
  it('полная форма без ошибок', () => {
    expect(validateCisCheckoutForm(cisFields, cisOk)).toEqual({})
  })

  it('email обязателен: на него идёт чек', () => {
    expect(validateCisCheckoutForm({ ...cisFields, email: '' }, cisOk).email).toBe(
      'Укажите email — на него придёт чек',
    )
  })

  it('телефон +375 не требует 11 цифр и маски +7', () => {
    expect(validateCisCheckoutForm(cisFields, cisOk).phone).toBeUndefined()
    expect(validateCisCheckoutForm({ ...cisFields, phone: '12345' }, cisOk).phone).toBe(
      'Укажите телефон с кодом страны, например +375 29 123-45-67',
    )
  })

  it('страна и город обязательны, город — только из списка страны', () => {
    expect(
      validateCisCheckoutForm(cisFields, { country: null, city: '', address: 'x' }).country,
    ).toBe('Выберите страну')
    expect(
      validateCisCheckoutForm(cisFields, { country: 'BY', city: '', address: 'x' }).cisCity,
    ).toBe('Выберите город из списка')
    expect(
      validateCisCheckoutForm(cisFields, { country: 'BY', city: 'Алматы', address: 'x' }).cisCity,
    ).toBe('Доставка в этот город недоступна')
  })

  it('адрес пункта обязателен', () => {
    expect(validateCisCheckoutForm(cisFields, { ...cisOk, address: '  ' }).cisAddress).toBe(
      'Укажите адрес пункта выдачи СДЭК',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/checkout.test.ts`
Expected: FAIL (`internationalPhoneDigits` не экспортируется).

- [ ] **Step 3: Implement** — `web/lib/checkout.ts`

Импорт: `import { isCisCity, type CisCountry } from '@ximi4ka-shop/shared/types/cis'`.

В `CheckoutFormErrors` добавить ключи `| 'country' | 'cisCity' | 'cisAddress'` к объединению.

После `formatPhoneInput` добавить:

```ts
// Телефон покупателя из страны ЕАЭС: код страны любой (+375, +996, +374, +7), без маски.
export function internationalPhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function isInternationalPhone(value: string): boolean {
  const length = internationalPhoneDigits(value).length
  return length >= 8 && length <= 15
}
```

Общие проверки контактов вынести из `validateCheckoutForm` в помощник (сам `validateCheckoutForm` поведения не меняет):

```ts
function validateContacts(
  fields: CheckoutFormFields,
  { international }: { international: boolean },
): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {}
  if (fields.name.trim() === '') {
    errors.name = 'Укажите имя'
  }
  if (international) {
    if (!isInternationalPhone(fields.phone)) {
      errors.phone = 'Укажите телефон с кодом страны, например +375 29 123-45-67'
    }
  } else if (phoneDigits(fields.phone).length !== 11) {
    errors.phone = 'Укажите телефон полностью: +7 (XXX) XXX-XX-XX'
  }
  const email = fields.email.trim()
  if (international && email === '') {
    // Чек Т-Кассы принимает только email или номер +7…
    errors.email = 'Укажите email — на него придёт чек'
  } else if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Проверьте email — похоже, в нём опечатка'
  }
  if (fields.telegram.trim() !== '' && !normalizeTelegramHandle(fields.telegram)) {
    errors.telegram = 'Проверьте ник: 5–32 латинских букв, цифр или _'
  }
  return errors
}
```

В `validateCheckoutForm` первые проверки (имя, телефон, email, telegram) заменить на `const errors = validateContacts(fields, { international: false })`, остальное оставить.

Добавить в конец блока валидации:

```ts
// Что выбрано в блоке «страны ЕАЭС»: страна, город из списка и адрес пункта.
export interface CisFormState {
  country: CisCountry | null
  city: string
  address: string
}

// Зеркало серверных проверок для доставки в страны ЕАЭС (checkout.ts в api):
// международный телефон, обязательный email, город только из списка страны.
export function validateCisCheckoutForm(
  fields: CheckoutFormFields,
  cis: CisFormState,
): CheckoutFormErrors {
  const errors = validateContacts(fields, { international: true })
  if (!cis.country) {
    errors.country = 'Выберите страну'
  } else if (cis.city === '') {
    errors.cisCity = 'Выберите город из списка'
  } else if (!isCisCity(cis.country, cis.city)) {
    errors.cisCity = 'Доставка в этот город недоступна'
  }
  if (cis.address.trim() === '') {
    errors.cisAddress = 'Укажите адрес пункта выдачи СДЭК'
  }
  return errors
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run lib/checkout.test.ts && npm run typecheck -w web`
Expected: PASS, включая прежние тесты `validateCheckoutForm` (поведение не изменилось).

- [ ] **Step 5: Commit (только по команде владельца)**

```bash
git add web/lib/checkout.ts web/lib/checkout.test.ts
git commit -m "feat(web): проверка формы чекаута для стран ЕАЭС"
```

---

### Task 6: Web — состояние и поля доставки в страны ЕАЭС

**Files:**

- Create: `web/components/checkout/useCisDelivery.ts`, `web/components/checkout/CisDelivery.tsx`
- Test: `web/components/checkout/CisDelivery.test.tsx`

**Interfaces:**

- Consumes: `CIS_CITIES`, `CIS_COUNTRIES`, `CIS_COUNTRY_NAMES`, `CIS_DELIVERY_RULES`, `cisShippingRub`, `isCisCity`, `CisCountry`, `CisDeliveryDestination`; `ERROR_CLASS`, `FIELD_CLASS`, `HINT_CLASS`, `LABEL_CLASS` из `./fieldStyles`; `formatRub` из `@/lib/stockLabel`.
- Produces:
  - `useCisDelivery(): CisDeliveryModel` с полями `country`, `setCountry(c)`, `city`, `setCity(c)`, `address`, `setAddress(a)`, `shippingRub(amountRub): number | null`, `destination: CisDeliveryDestination | null`;
  - `<CisDelivery delivery={model} errors={{ country?, cisCity?, cisAddress? }} />`.

- [ ] **Step 1: Write the failing tests** — `web/components/checkout/CisDelivery.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CisDelivery } from './CisDelivery'
import { useCisDelivery } from './useCisDelivery'

afterEach(cleanup)

let model: ReturnType<typeof useCisDelivery>

function Harness({ errors = {} }: { errors?: Parameters<typeof CisDelivery>[0]['errors'] }) {
  const delivery = useCisDelivery()
  // eslint-disable-next-line react-hooks/globals
  model = delivery
  return <CisDelivery delivery={delivery} errors={errors} />
}

function options(select: HTMLElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '')
}

describe('<CisDelivery>', () => {
  it('город недоступен, пока не выбрана страна', () => {
    render(<Harness />)
    expect(screen.getByLabelText(/город/i)).toBeDisabled()
  })

  it('после страны в списке города только этой страны', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    const list = options(screen.getByLabelText(/город/i))
    expect(list).toContain('Алматы')
    expect(list).not.toContain('Минск')
  })

  it('смена страны сбрасывает город', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Минск' } })
    expect(model.city).toBe('Минск')
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'KZ' } })
    expect(model.city).toBe('')
    expect(screen.getByLabelText(/город/i)).toHaveValue('')
  })

  it('подсказка с ценой для выбранной страны', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'AM' } })
    expect(screen.getByText(/бесплатно от 5\D000\D*₽, иначе 1\D200\D*₽/i)).toBeInTheDocument()
    expect(
      screen.getByText(/нет вашего города\? доставка туда пока невозможна/i),
    ).toBeInTheDocument()
  })

  it('destination собирается только из страны, города из списка и адреса', () => {
    render(<Harness />)
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    fireEvent.change(screen.getByLabelText(/город/i), { target: { value: 'Минск' } })
    expect(model.destination).toBeNull()
    fireEvent.change(screen.getByLabelText(/адрес пункта/i), {
      target: { value: '  ул. Ленина, 5 ' },
    })
    expect(model.destination).toEqual({
      method: 'cdek_manual_cis',
      country: 'BY',
      city: 'Минск',
      address: 'ул. Ленина, 5',
    })
  })

  it('shippingRub: null без страны, затем цена или 0 по порогу', () => {
    render(<Harness />)
    expect(model.shippingRub(2000)).toBeNull()
    fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: 'BY' } })
    expect(model.shippingRub(2000)).toBe(700)
    expect(model.shippingRub(3000)).toBe(0)
  })

  it('показывает ошибки полей', () => {
    render(
      <Harness
        errors={{
          country: 'Выберите страну',
          cisCity: 'Выберите город из списка',
          cisAddress: 'Укажите адрес пункта выдачи СДЭК',
        }}
      />,
    )
    expect(screen.getByText('Выберите страну')).toBeInTheDocument()
    expect(screen.getByText('Укажите адрес пункта выдачи СДЭК')).toBeInTheDocument()
  })
})
```

Примечание для исполнителя: `Harness` присваивает модель внешней переменной ради проверок, которые не видны в DOM; если ESLint ругается на присваивание во время рендера, заменить на `useEffect(() => { model = delivery })` и вызывать `act`/`rerender` перед чтением `model` либо читать значения из DOM (`value` у `<select>`/`<input>`). Тест «destination» тогда проверять через `data-testid` с `JSON.stringify(delivery.destination)` в `Harness`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/checkout/CisDelivery.test.tsx`
Expected: FAIL (модулей нет).

- [ ] **Step 3: Implement the hook** — `web/components/checkout/useCisDelivery.ts`

```ts
'use client'

import { useState } from 'react'
import {
  cisShippingRub,
  isCisCity,
  type CisCountry,
  type CisDeliveryDestination,
} from '@ximi4ka-shop/shared/types/cis'

export interface CisDeliveryModel {
  country: CisCountry | null
  setCountry: (country: CisCountry | null) => void
  city: string
  setCity: (city: string) => void
  address: string
  setAddress: (address: string) => void
  /** Цена доставки для суммы товаров за вычетом скидки; null — страна не выбрана. */
  shippingRub: (amountRub: number) => number | null
  /** Готово к отправке: страна, город из списка и адрес пункта; иначе null. */
  destination: CisDeliveryDestination | null
}

// Доставка в Беларусь, Казахстан, Армению, Киргизию: страна, город из списка
// городов с ПВЗ СДЭК и адрес пункта, который покупатель пишет сам. Цену считает
// shared (её же пересчитывает сервер); смена страны сбрасывает город.
export function useCisDelivery(): CisDeliveryModel {
  const [country, setCountryState] = useState<CisCountry | null>(null)
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')

  function setCountry(next: CisCountry | null) {
    setCountryState(next)
    setCity('')
  }

  const trimmed = address.trim()
  return {
    country,
    setCountry,
    city,
    setCity,
    address,
    setAddress,
    shippingRub: (amountRub) => (country ? cisShippingRub(country, amountRub) : null),
    destination:
      country && isCisCity(country, city) && trimmed !== ''
        ? { method: 'cdek_manual_cis', country, city, address: trimmed }
        : null,
  }
}
```

- [ ] **Step 4: Implement the component** — `web/components/checkout/CisDelivery.tsx`

```tsx
'use client'

import {
  CIS_CITIES,
  CIS_COUNTRIES,
  CIS_COUNTRY_NAMES,
  CIS_DELIVERY_RULES,
  type CisCountry,
} from '@ximi4ka-shop/shared/types/cis'
import { formatRub } from '@/lib/stockLabel'
import { ERROR_CLASS, FIELD_CLASS, HINT_CLASS, LABEL_CLASS } from './fieldStyles'
import type { CisDeliveryModel } from './useCisDelivery'

export type CisDeliveryErrors = Partial<Record<'country' | 'cisCity' | 'cisAddress', string>>

interface Props {
  delivery: CisDeliveryModel
  errors: CisDeliveryErrors
}

// Блок «Доставка СДЭК» для Беларуси, Казахстана, Армении и Киргизии: страна, город
// только из списка городов с ПВЗ, адрес пункта вручную. Ошибка поля видна, пока оно
// не заполнено правильно.
export function CisDelivery({ delivery: d, errors }: Props) {
  const rule = d.country ? CIS_DELIVERY_RULES[d.country] : null
  const countryError = d.country ? undefined : errors.country
  const cityError = d.city ? undefined : errors.cisCity
  const addressError = d.address.trim() === '' ? errors.cisAddress : undefined

  return (
    <section aria-labelledby="checkout-cis-delivery" className="flex flex-col gap-5">
      <h2 id="checkout-cis-delivery" className={`${LABEL_CLASS} m-0`}>
        Доставка СДЭК в другую страну *
      </h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-cis-country" className={LABEL_CLASS}>
          Страна *
        </label>
        <select
          id="checkout-cis-country"
          value={d.country ?? ''}
          onChange={(e) => d.setCountry((e.target.value || null) as CisCountry | null)}
          aria-invalid={countryError ? true : undefined}
          className={FIELD_CLASS}
        >
          <option value="">Выберите страну</option>
          {CIS_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {CIS_COUNTRY_NAMES[c]}
            </option>
          ))}
        </select>
        {countryError && <p className={ERROR_CLASS}>{countryError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-cis-city" className={LABEL_CLASS}>
          Город *
        </label>
        <select
          id="checkout-cis-city"
          value={d.city}
          disabled={!d.country}
          onChange={(e) => d.setCity(e.target.value)}
          aria-invalid={cityError ? true : undefined}
          className={FIELD_CLASS}
        >
          <option value="">Выберите город</option>
          {d.country &&
            CIS_CITIES[d.country].map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
        </select>
        {d.country && (
          <p className={HINT_CLASS}>Нет вашего города? Доставка туда пока невозможна.</p>
        )}
        {cityError && <p className={ERROR_CLASS}>{cityError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-cis-address" className={LABEL_CLASS}>
          Адрес пункта выдачи СДЭК *
        </label>
        <input
          id="checkout-cis-address"
          type="text"
          autoComplete="off"
          placeholder="Улица, дом пункта выдачи СДЭК в вашем городе"
          value={d.address}
          onChange={(e) => d.setAddress(e.target.value)}
          aria-invalid={addressError ? true : undefined}
          className={FIELD_CLASS}
        />
        {addressError && <p className={ERROR_CLASS}>{addressError}</p>}
      </div>

      {rule && (
        <p className={HINT_CLASS}>
          Бесплатно от {formatRub(rule.freeFromRub)}, иначе {formatRub(rule.priceRub)}
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `cd web && npx vitest run components/checkout/CisDelivery.test.tsx && npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 6: Commit (только по команде владельца)**

```bash
git add web/components/checkout
git commit -m "feat(web): поля доставки в страны ЕАЭС в чекауте"
```

---

### Task 7: Web — страница чекаута: переключатель региона и отправка

**Files:**

- Modify: `web/app/[locale]/(public)/checkout/page.tsx`
- Test: `web/app/[locale]/(public)/checkout/page.test.tsx`

**Interfaces:**

- Consumes: `useCisDelivery`, `CisDelivery`, `validateCisCheckoutForm`, `internationalPhoneDigits` (Task 5, Task 6); `CIS_*` из shared.
- Produces: страница отправляет `delivery: { method: 'cdek_manual_cis', country, city, address, comment? }`, `customer.phone = '+<цифры>'` без маски `+7`.

- [ ] **Step 1: Write the failing tests** — добавить в `page.test.tsx` внутрь `describe('/checkout page')` (рядом с тестом про курьера). Хелпер на уровне файла после `fillValidForm`:

```ts
async function chooseCisRegion() {
  fireEvent.click(screen.getByRole('radio', { name: /беларусь, казахстан, армения, киргизия/i }))
  await screen.findByLabelText(/страна/i)
}

function fillCis(country: string, city: string, address = 'ул. Ленина, 5') {
  fireEvent.change(screen.getByLabelText(/страна/i), { target: { value: country } })
  fireEvent.change(screen.getByLabelText(/город/i), { target: { value: city } })
  fireEvent.change(screen.getByLabelText(/адрес пункта/i), { target: { value: address } })
}
```

Тесты:

```ts
  describe('доставка в Беларусь, Казахстан, Армению, Киргизию', () => {
    function cisContacts(phone = '+375 29 123-45-67', email = 'ales@example.com') {
      fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Алесь' } })
      fireEvent.change(screen.getByLabelText(/телефон/i), { target: { value: phone } })
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
    }

    it('заказ: страна, город из списка, адрес, телефон +375 без маски +7, цена 700 ₽', async () => {
      const fetchMock = vi.fn(async () => okCheckoutResponse())
      vi.stubGlobal('fetch', fetchMock)
      seedCart(seed) // 2000 ₽ — ниже порога Беларуси
      render(<CheckoutPage />)
      await chooseCisRegion()
      cisContacts()
      expect(screen.getByLabelText(/телефон/i)).toHaveValue('+375 29 123-45-67')
      fillCis('BY', 'Минск')
      expect(screen.getByTestId('summary-shipping')).toHaveTextContent('700')
      expect(screen.getByTestId('summary-total')).toHaveTextContent('2 700')

      submit()

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.delivery).toEqual({
        method: 'cdek_manual_cis',
        country: 'BY',
        city: 'Минск',
        address: 'ул. Ленина, 5',
      })
      expect(body.customer.phone).toBe('+375291234567')
      expect(body.customer.email).toBe('ales@example.com')
    })

    it('от порога Казахстана доставка бесплатна', async () => {
      seedCart([{ ...seed[0]!, quantity: 5 }]) // 5000 ₽
      render(<CheckoutPage />)
      await chooseCisRegion()
      fillCis('KZ', 'Алматы')
      expect(screen.getByTestId('summary-shipping')).toHaveTextContent('Бесплатно')
    })

    it('без email, города или адреса — ошибки у полей, ничего не отправляется', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      seedCart(seed)
      render(<CheckoutPage />)
      await chooseCisRegion()
      cisContacts('+375 29 123-45-67', '')
      submit()
      expect(await screen.findByText('Укажите email — на него придёт чек')).toBeInTheDocument()
      expect(screen.getByText('Выберите страну')).toBeInTheDocument()
      expect(screen.getByText('Укажите адрес пункта выдачи СДЭК')).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('возврат на «Россия» снова показывает российский блок СДЭК', async () => {
      seedCart(seed)
      render(<CheckoutPage />)
      await chooseCisRegion()
      fireEvent.click(screen.getByRole('radio', { name: /^россия$/i }))
      expect(await screen.findByRole('combobox', { name: /город/i })).toBeInTheDocument()
      expect(screen.queryByLabelText(/страна/i)).not.toBeInTheDocument()
    })

    it('сервер отклонил город (400 delivery_city_unavailable) — сообщение сервера на экране', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                error: { code: 'delivery_city_unavailable', message: 'Доставка в этот город недоступна' },
              }),
              { status: 400 },
            ),
        ),
      )
      seedCart(seed)
      render(<CheckoutPage />)
      await chooseCisRegion()
      cisContacts()
      fillCis('BY', 'Минск')
      submit()
      expect(await screen.findByRole('alert')).toHaveTextContent('Доставка в этот город недоступна')
    })
  })
```

Примечание для исполнителя: формат тела ошибки (`{ error: { code, message } }`) проверить по `okCheckoutResponse` и существующим тестам отказа сервера в этом файле (блок `отказ сервера по ловушке и лимиту`, строка ~467) и при необходимости подстроить.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run "app/[locale]/(public)/checkout/page.test.tsx" -t "страны"`
Expected: FAIL (нет переключателя региона).

- [ ] **Step 3: Implement** — `web/app/[locale]/(public)/checkout/page.tsx`

Импорты (рядом с существующими):

```ts
import { CisDelivery } from '@/components/checkout/CisDelivery'
import { useCisDelivery } from '@/components/checkout/useCisDelivery'
```

и в импорт из `@/lib/checkout` добавить `internationalPhoneDigits` и `validateCisCheckoutForm`.

После `const delivery = useCdekDelivery(items)` добавить:

```ts
// Куда везём: Россия (виджет и пикеры СДЭК) или Беларусь, Казахстан, Армения,
// Киргизия (город из списка, адрес пункта вручную; отправку оформляет оператор).
const [region, setRegion] = useState<'ru' | 'cis'>('ru')
const cis = useCisDelivery()
const isCis = region === 'cis'
```

Заменить расчёт цены:

```ts
const quote = delivery.quote
const cisShippingRub = isCis ? cis.shippingRub(totals.totalRub) : null
const hasShippingPrice = isCis ? cisShippingRub !== null : quote !== null
const shippingRub = isCis ? (cisShippingRub ?? 0) : (quote?.customerPriceRub ?? 0)
const totalRub = totals.totalRub + shippingRub
```

В `handleSubmit` заменить блок валидации и `destination`:

```ts
const validation = isCis
  ? validateCisCheckoutForm(fields, {
      country: cis.country,
      city: cis.city,
      address: cis.address,
    })
  : validateCheckoutForm(fields, {
      city: delivery.city,
      method: delivery.method,
      point: delivery.point,
      courier: delivery.courier,
      quoteStatus: delivery.quotes[delivery.method].status,
    })
setErrors(validation)
const destination = isCis ? cis.destination : delivery.destination
if (Object.keys(validation).length > 0 || !destination) return
```

В `payload.customer.phone` заменить на:

```ts
        phone: `+${isCis ? internationalPhoneDigits(fields.phone) : phoneDigits(fields.phone)}`,
```

В обработке ошибок `catch` перед веткой `err.status === 409` добавить:

```ts
        } else if (err.code === 'delivery_city_unavailable' || err.code === 'email_required') {
          // Список городов или правило про email разошлись с сервером: показываем его текст.
          setServerError(`${err.message}.`)
```

Поле телефона: заменить `onChange`/`placeholder`:

```tsx
                  placeholder={isCis ? '+375 29 123-45-67' : '+7 (___) ___-__-__'}
                  value={fields.phone}
                  onChange={(e) =>
                    setField(
                      'phone',
                      isCis ? e.target.value.replace(/[^\d+()\-\s]/g, '') : formatPhoneInput(e.target.value),
                    )
                  }
```

Подпись email: `Email{isCis ? ' *' : ''}`.

Вместо `<CdekDelivery delivery={delivery} shipping={shipping} errors={errors} />` вставить:

```tsx
;<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
  <legend className={`${LABEL_CLASS} mb-2`}>Куда доставить</legend>
  {(
    [
      ['ru', 'Россия'],
      ['cis', 'Беларусь, Казахстан, Армения, Киргизия'],
    ] as const
  ).map(([value, label]) => (
    <label
      key={value}
      className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]"
    >
      <input
        type="radio"
        name="checkout-region"
        value={value}
        checked={region === value}
        onChange={() => setRegion(value)}
        className="accent-[var(--color-lj-ink)]"
      />
      {label}
    </label>
  ))}
</fieldset>

{
  isCis ? (
    <CisDelivery delivery={cis} errors={errors} />
  ) : (
    <CdekDelivery delivery={delivery} shipping={shipping} errors={errors} />
  )
}
```

Сводка: `{quote ? (…) : '—'}` заменить на `{hasShippingPrice ? (shippingRub === 0 ? 'Бесплатно' : formatRub(shippingRub)) : '—'}`.

Кнопка: `disabled={submitting || (!isCis && delivery.quoting)}`.

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run "app/[locale]/(public)/checkout" && npm run typecheck -w web && npm run lint -w web`
Expected: PASS, все прежние тесты чекаута зелёные (регион по умолчанию `ru`).

- [ ] **Step 5: Commit (только по команде владельца)**

```bash
git add web/app/\[locale\]/\(public\)/checkout
git commit -m "feat(web): чекаут — доставка в Беларусь, Казахстан, Армению, Киргизию"
```

---

### Task 8: Web — подписи и страница `/order-process`

**Files:**

- Modify: `web/app/[locale]/(public)/account/_components/OrderDetails.tsx`, `web/app/admin/(authed)/orders/orderUi.ts`, `web/lib/orderProcess.ts`
- Test: `web/app/[locale]/(public)/account/_components/OrderDetails.test.tsx`, `web/lib/orderProcess.test.ts`

**Interfaces:**

- Consumes: `CIS_DELIVERY_RULES` из shared, `OrderDeliveryMethod` из `@ximi4ka-shop/shared`.
- Produces: подпись «Доставка СДЭК в другую страну»; условия по странам с ценой ниже порога.

- [ ] **Step 1: Write the failing tests**

`OrderDetails.test.tsx` — в `describe('OrderDetails')`:

```tsx
it('доставка в страну ЕАЭС: подпись способа и адрес', () => {
  render(
    <OrderDetails
      order={order({
        deliveryMethod: 'cdek_manual_cis',
        deliveryAddress: 'Минск, ул. Ленина, 5',
      })}
    />,
  )
  expect(screen.getByText(/Доставка СДЭК в другую страну:/)).toBeInTheDocument()
  expect(screen.getByText(/Минск, ул. Ленина, 5/)).toBeInTheDocument()
  expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
})
```

`web/lib/orderProcess.test.ts` — в тесте `пишет пороги: РФ 3000/5000, Беларусь 3000, ЕАЭС 5000, СНГ отдельно` заменить проверки Беларуси и ЕАЭС:

```ts
expect(by.condition).toMatch(/^Бесплатно от 3\D000\D*₽, иначе 700\D*₽$/u)
expect(eaeu.condition).toMatch(
  /^Бесплатно от 5\D000\D*₽, иначе 900\D*₽ \(Казахстан, Киргизия\), 1\D200\D*₽ \(Армения\)$/u,
)
```

и добавить тест:

```ts
it('шаг 1 объясняет выбор региона и города в чекауте', () => {
  expect(ORDER_STEPS[0]!.details.join(' ')).toMatch(/выберите страну и город из списка/u)
})
```

(импортировать `ORDER_STEPS`, если ещё не импортирован в файле).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run lib/orderProcess.test.ts "app/[locale]/(public)/account/_components/OrderDetails.test.tsx"`
Expected: FAIL.

- [ ] **Step 3: Implement labels**

`OrderDetails.tsx`: импорт `import type { AccountOrderSummary, OrderDeliveryMethod } from '@ximi4ka-shop/shared'`; карту заменить:

```ts
const DELIVERY_LABEL: Record<OrderDeliveryMethod, string> = {
  cdek_pvz: 'ПВЗ СДЭК',
  cdek_courier: 'Курьер СДЭК',
  cdek_manual_cis: 'Доставка СДЭК в другую страну',
}
```

`orderUi.ts`: в `DELIVERY_METHOD_LABELS` добавить `cdek_manual_cis: 'СДЭК — другая страна, адрес вручную',`.

- [ ] **Step 4: Implement order-process copy** — `web/lib/orderProcess.ts`

Импорт: `import { CIS_DELIVERY_RULES } from '@ximi4ka-shop/shared/types/cis'`. Удалить константы `BELARUS_FREE_FROM_RUB`, `EAEU_FREE_FROM_RUB` и комментарий над ними. В `buildDeliveryZones` перед `return` добавить:

```ts
const { BY, KZ, AM } = CIS_DELIVERY_RULES
```

условие Беларуси:

```ts
      condition: `Бесплатно от ${formatRub(BY.freeFromRub)}, иначе ${formatRub(BY.priceRub)}`,
```

условие ЕАЭС (Казахстан и Киргизия имеют одну цену, пороги у всех трёх равны):

```ts
      condition: `Бесплатно от ${formatRub(KZ.freeFromRub)}, иначе ${formatRub(KZ.priceRub)} (Казахстан, Киргизия), ${formatRub(AM.priceRub)} (Армения)`,
```

В `ORDER_STEPS[0].details` вставить второй абзац между двумя существующими нужными строками (перед `'Условия бесплатной доставки зависят от страны:'`):

```ts
      'Для Беларуси, Казахстана, Армении и Киргизии в оформлении заказа выберите регион «Беларусь, Казахстан, Армения, Киргизия», затем выберите страну и город из списка и впишите адрес пункта выдачи СДЭК. Если вашего города нет в списке, доставка туда пока невозможна.',
```

Тест требует фразу «выберите страну и город из списка» — она есть в абзаце выше.

- [ ] **Step 5: Run tests**

Run: `cd web && npx vitest run lib/orderProcess.test.ts components/marketing "app/[locale]/(public)/order-process" "app/[locale]/(public)/account" && npm run typecheck -w web`
Expected: PASS. `DeliveryZones.test.tsx` проверяет `toHaveTextContent('Беларусь')` и т. п. — должен остаться зелёным; при падении из-за изменённого текста обновить только ожидания, не поведение.

- [ ] **Step 6: Commit (только по команде владельца)**

```bash
git add web
git commit -m "feat(web): подписи и страница /order-process для доставки в страны ЕАЭС"
```

---

### Task 9: Полная проверка

**Files:** без изменений кода (если проверки найдут дефекты — править в соответствующих задачах).

- [ ] **Step 1: Lint, types, format, tests**

```bash
npm run lint
npm run typecheck
npx prettier --check .
npm test -w shared
(cd web && npx vitest run)
(cd api && TEST_DATABASE_URL=<одноразовая БД> npx vitest run)
```

Expected: всё зелёное (предупреждения ESLint, существовавшие до работы, допустимы). Проверить по `git diff` отсутствие `TODO`, `.skip`, `.only`.

- [ ] **Step 2: Проверка в браузере**

Запустить `web` (`preview_start`, имя `web`), открыть `/checkout` с товарами в корзине: переключить регион на «Беларусь, Казахстан, Армения, Киргизия», выбрать страну и город, ввести телефон `+375…`, проверить цену в сводке (700/900/1200 ₽ ниже порога и «Бесплатно» от порога), отправку без email (ошибка у поля) и возврат на «Россия». Открыть `/order-process`: условия и города. Консоль без новых ошибок. Если api не запущен, отправку заказа проверить тестами (Task 3, Task 7).

- [ ] **Step 3: Ревью и безопасность**

Запустить `/code-review` на диффе и `/security-review` (заказ, оплата, пользовательский ввод). Исправить найденное.

- [ ] **Step 4: Отчёт владельцу**

Перечислить: что сделано, какие проверки прошли (с выводом), и напомнить: мёрж в `main` = выкатка в прод; проверка оплаты рублями картами банков этих стран — на стороне Т-Кассы. Предложить коммит и PR.
