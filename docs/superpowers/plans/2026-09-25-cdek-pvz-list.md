# Выбор ПВЗ из списка на чекауте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** на чекауте есть поле «Город» с подсказками СДЭК, выбор способа с ценами, поле «Пункт получения» — список ПВЗ города с поиском по словам — и свои поля адреса курьера; карта СДЭК синхронизирована со списком в обе стороны, а без карты весь путь до оплаты проходит до конца.

**Architecture:** api получает два публичных эндпоинта только для чтения с кешем в памяти: подсказки городов и ПВЗ города (`api/src/lib/cdek/locations.ts`). Из того же кеша чекаут сверяет код пункта, а расчёт цены принимает ПВЗ без кода пункта. На вебе блок доставки собран из самостоятельных полей (`CityCombobox`, `PointCombobox`, `CourierFields`) и управляемой карты (`CdekWidget` за обёрткой `PvzMap`). Состояние блока живёт в хуке `useCdekDelivery`, страница только передаёт его в форму и в запрос заказа.

**Tech Stack:** Express 4 + zod 4 (api), Next.js 16 App Router + React 19 + Tailwind v4 (web), общие типы `@ximi4ka-shop/shared`, vitest + supertest + @testing-library/react, виджет `@cdek-it/widget@4.0.0` с CDN, собственный клиент СДЭК `api/src/lib/cdek/client.ts`.

**Spec:** `docs/superpowers/specs/2026-09-25-cdek-pvz-list-design.md`

## Global Constraints

- Новых зависимостей не добавлять.
- Всё — только в worktree `/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list` (дальше `$WT`), ветка `feat/cdek-pvz-list`. Основной checkout — чужой (там ветка `feat/cdek-orders`), его файлы не трогать; единственное исключение — записи `pvz-api`/`pvz-web` в его `.claude/launch.json` в Task 12.
- Зависимости: своих `node_modules` у worktree нет — их ставит Task 1 Step 0 (`npm ci`, lockfile не меняется). Симлинк на `node_modules` основного checkout не годится: `@ximi4ka-shop/shared` там указывает на чужой `shared/`.
- ESM: относительные импорты в api — с суффиксом `.js`; типы — из `@ximi4ka-shop/shared`.
- Комментарии в коде — по-русски, объясняют «почему», как в соседних файлах.
- Форматирование — prettier репозитория (`npx prettier --write <файлы>` перед коммитом).
- Коммиты — маленькие, сообщение по-русски в стиле репозитория (`feat(api): …`, `feat(web): …`), в конце строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Не пушить.
- Тесты api — только на своей тестовой базе: каждую команду `npm test -w api` (и общий `npm test`) запускать с `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz`. Базу `ximi4ka_shop_test` по умолчанию делит ветка `feat/cdek-orders`, а оба набора тестов делают `TRUNCATE`. `src/test/globalSetup.ts` сам создаёт недостающую базу через служебную `postgres` на том же сервере и прогоняет миграции; имя обязано содержать `test`. Хост и пользователь — как у значения по умолчанию (`postgres://localhost:5432/…`).
- Пункты — «Только ПВЗ с выдачей (`type=PVZ`, `is_handout=true`). Постаматы — вне задачи».
- Подсказки городов: `GET /api/public/cdek/cities?q=<строка>` проксирует `GET /v2/location/suggest/cities?name=<q>&country_code=RU`; «`q` — от 2 до 100 символов после обрезки пробелов, иначе 400»; ответ `{ data: [{ code, name, fullName }] }`, до 10 записей; «Кеш в памяти на 1 час по `q` в нижнем регистре; лимит 60 запросов в минуту с IP (существующий `rateLimit`)».
- Пункты города: `GET /api/public/cdek/points?cityCode=<код>` проксирует `GET /v2/deliverypoints?city_code=<код>&type=PVZ&is_handout=true` и `GET /v2/location/cities?code=<код>`; «`cityCode` — положительное целое, иначе 400»; ответ `{ data: { city: { code, name, location: [lng, lat] | null }, points: [{ code, name, address, location: [lng, lat], workTime }] } }`; «Сортировка — по `code`»; «Кеш в памяти на 6 часов по городу; лимит 60 запросов в минуту с IP»; «Ошибка СДЭК — 502 `cdek_unavailable`; пустой список — 200 с `points: []`».
- Чекаут: «Нет такого пункта — 400 `delivery_point_unknown` «Пункт выдачи не найден — выберите другой». СДЭК недоступен — проверку пропускаем и заказ принимаем». Пустой список пунктов города приравнивается к «СДЭК недоступен» (проверку пропускаем): в городе, откуда пришёл заказ на ПВЗ, пункты были, а пустота — скорее сбой СДЭК. Пустой список кешируется на 5 минут, не на 6 часов.
- «Контракт `DeliveryDestination` не меняется»: `{ method: 'cdek_courier', cityCode, postalCode?, address }`, `address` — «<город>, <улица, дом>[, кв. <квартира>]», «Индекс — необязательный, 6 цифр»; ПВЗ — `{ method: 'cdek_pvz', cityCode, deliveryPointCode, address: '<город>, <адрес пункта>' }`.
- Город: «подсказки от 2 символов, задержка 250 мс, отмена прошлого запроса (`AbortController`), строка «Нальчик · Кабардино-Балкария»»; выбранный город — в `localStorage` (обёрнуто в try/catch), «только код и название города, без персональных данных».
- Пункт: строка «MSK310 · пр-т Мира, 108», второй строкой часы работы; поиск по словам в коде, названии и адресе, «регистр и «ё/е» не важны, знаки препинания игнорируются»; «показываем первые 50 совпадений; если их больше — строка «Показаны 50 из N — уточните запрос»»; клавиатура «стрелки, Enter, Esc»; разметка `role="combobox"`/`listbox`, `aria-activedescendant`.
- Курьер: «Улица, дом» (обязательно), «Квартира/офис», «Индекс». «Смена города сбрасывает выбранный пункт, адрес курьера не трогает, цены пересчитываются».
- Карта: только для «Пункт выдачи»; от 768 px — сразу под полем «Пункт получения», уже — кнопка «Показать на карте», скрипты грузятся по нажатию. Список → карта: `updateLocation(location, 17)`, затем `selectOffice(code)` «каждые 300 мс до 3 с»; смена города — `updateLocation(city.location, 10)`; карта → список: пункта нет в списке города — «Этот пункт в другом городе — смените город»; курьерская вкладка отключена (`tariffs.door = []` и скрытие переключателя); нет ключа, `onError` у `next/script` или 10 с без готовности — «Карта недоступна — выберите пункт из списка». Решения ревью: пока покупатель меняет город, карта не пересоздаётся и не сворачивается; повтор `selectOffice` прекращается, как только покупатель трогает карту (мышь, палец, колесо, клавиши).
- Тексты ошибок — дословно из спеки §6: «Не удалось загрузить города» + «Повторить»; «Не удалось загрузить пункты выдачи» + «Повторить»; «В этом городе нет пунктов выдачи СДЭК — выберите курьера»; «Ничего не найдено — попробуйте часть адреса или код пункта».
- Цену доставки считает только сервер; бесплатная доставка — как сейчас (ПВЗ от 3000 ₽, курьер от 5000 ₽).
- Цена, которую видит покупатель, равна той, что спишет сервер (решение ревью 25.09). ПВЗ сервер считает только по городу, поэтому хватает расчёта по городу. Курьера чекаут считает по полному адресу (`quote.ts`: `to_location` с `postal_code` и `address`). Поэтому, как только адрес курьера полный (улица с домом; индекс — если введён, то 6 цифр), курьер пересчитывается с тем же `destination`, что уйдёт в заказ, с задержкой 400 мс. Пока ответа нет — «Курьер СДЭК — пересчитываем…», сводка «—», кнопка «Оформить» недоступна; оформить можно только со свежей ценой по полному адресу.

## Review Focus

1. **Покупатель правит текст города после того, как выбрал пункт.** Ожидание: город и пункт сбрасываются, цены пересчитываются. Старый пункт не уходит в заказ вместе с новым текстом в поле. Тесты — Task 5 (поле отдаёт `null`) и Task 10 (блок сбрасывает пункт).
2. **Enter в поле «Город» или «Пункт получения» при открытом списке.** Ожидание: Enter выбирает строку, форма заказа не отправляется. Тесты — Task 5 и Task 6 (`keyDown` Enter отменён: `preventDefault`).
3. **Быстрая смена города: ответ по прошлому городу (пункты, цены, подсказки) приходит позже ответа по новому.** Ожидание: список и цены — нового города. Тесты — Task 10 (пункты), Task 5 (подсказки).
4. **СДЭК однажды отдал пустой список пунктов для большого города.** Ожидание: пустота живёт в кеше 5 минут, а не 6 часов. Чекаут в это время не отклоняет заказы на ПВЗ в этот город: пустой список — повод пропустить проверку, а не ответить 400. Тесты — Task 1 (срок кеша) и Task 2 (чекаут).
5. **В `localStorage` лежит мусор, или хранилище бросает исключение (приватный режим Safari).** Ожидание: чекаут открывается без сохранённого города и не падает, выбор города работает. Тест — Task 10.

## Слияние

Ветка `feat/cdek-orders` ещё не влита. Она тоже меняет:

- `api/src/routes/checkout.ts` — сохраняет `packages` в `delivery_address`;
- `api/src/routes/checkout.test.ts` — переписывает проверку `deliveryAddress` в первом тесте (строки ~91–110), а здесь в тот же файл добавляются импорт, строка в `afterEach`, helper и тесты в конце;
- `shared/src/types/order.ts` и `shared/src/index.ts`.

Здесь правки этих мест маленькие и локальные: в `checkout.ts` — импорт и один блок сразу после проверки `Idempotency-Key`; в `shared` — новые типы в `types/shipping.ts` и строки в блоке экспорта `index.ts`; `order.ts` не трогаем. Та ветка, что вливается второй, делает rebase на `main` и разрешает конфликты (там только импорты и соседние блоки). После rebase прогнать оба набора тестов api — `checkout.test.ts` и тесты этапа 4 из `feat/cdek-orders` — на своей тестовой базе.

---

## Файлы

| Файл                                                                                                       | Что делает                                                                              |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `shared/src/types/shipping.ts`, `shared/src/index.ts`                                                      | `CdekCity`, `CdekPoint`, `CdekCityPoints`, `QuoteDestination`                           |
| `api/src/lib/cdek/locations.ts`                                                                            | TTL-кеш, подсказки городов, пункты города, проверка пункта                              |
| `api/src/routes/public/cdek-locations.ts`, `api/src/app.ts`                                                | `GET /api/public/cdek/cities`, `GET /api/public/cdek/points`                            |
| `api/src/routes/checkout.ts`                                                                               | 400 `delivery_point_unknown`                                                            |
| `api/src/routes/checkout.schemas.ts`, `api/src/routes/public/shipping.ts`, `api/src/lib/shipping/quote.ts` | расчёт ПВЗ без кода пункта                                                              |
| `web/lib/api.ts`                                                                                           | `suggestCdekCities`, `getCdekPoints`, тип `quoteShipping`                               |
| `web/lib/cdekPoints.ts`                                                                                    | поиск по словам, регион города                                                          |
| `web/lib/shipping.ts`                                                                                      | адрес курьера, `pvzDestination`/`courierDestination`/`quoteDestination`, `WidgetOffice` |
| `web/lib/checkout.ts`                                                                                      | `validateCheckoutForm` по полям доставки                                                |
| `web/components/checkout/fieldStyles.ts`                                                                   | общие классы полей чекаута                                                              |
| `web/components/checkout/CityCombobox.tsx`, `PointCombobox.tsx`, `CourierFields.tsx`                       | поля «Город», «Пункт получения», адрес курьера                                          |
| `web/components/checkout/CdekWidget.tsx`, `PvzMap.tsx`                                                     | управляемая карта, строка вместо карты, кнопка на телефоне                              |
| `web/components/checkout/useCdekDelivery.ts`, `CdekDelivery.tsx`                                           | состояние и разметка блока «Доставка»                                                   |
| `web/app/[locale]/(public)/checkout/page.tsx`                                                              | страница на новом блоке доставки                                                        |

---

### Task 1: API — подсказки городов и пункты выдачи с кешем

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить; тесты api — только с `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz` (база `ximi4ka_shop_test` занята другой веткой).

**Files:**

- Modify: `shared/src/types/shipping.ts` (добавить в конец), `shared/src/index.ts:23-28`
- Create: `api/src/lib/cdek/locations.ts`
- Test: `api/src/lib/cdek/locations.test.ts`
- Create: `api/src/routes/public/cdek-locations.ts`
- Modify: `api/src/app.ts:25,71`
- Test: `api/src/routes/cdek-locations.test.ts`

**Interfaces:**

- Consumes: `getCdekClient()` и `setCdekClientForTests()` из `api/src/lib/cdek/index.ts`; `CdekClient.get<T>(path, query)`; `CdekError(status, code, message)`; `rateLimit({ limit, windowMs })`.
- Produces (shared): `CdekCity { code: number; name: string; fullName: string }`, `CdekPoint { code: string; name: string; address: string; location: [number, number]; workTime: string }`, `CdekCityPoints { city: { code: number; name: string; location: [number, number] | null }; points: CdekPoint[] }`.
- Produces (api): `TtlCache<T>` (`get`, `set(key, value, ttlMs?)`, `size`, `clear`); `suggestCities(cdek: Pick<CdekClient,'get'>, q: string): Promise<CdekCity[]>`; `getCityPoints(cdek, cityCode: number): Promise<CdekCityPoints>`; `EMPTY_POINTS_TTL_MS = 5 * 60_000`; `clearCdekLocationCache(): void`; `cdekLocationsRouter` на `/api/public/cdek`.

- [ ] **Step 0: Зависимости worktree**

```bash
cd /Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list
npm ci
node -p "require('fs').realpathSync('node_modules/@ximi4ka-shop/shared')"
```

Expected: `npm ci` без ошибок; вторая команда печатает `/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list/shared`. Путь из основного checkout (без `.claude/worktrees/cdek-pvz-list`) — остановиться: тесты и типы пойдут против чужого `shared/`. `require.resolve('@ximi4ka-shop/shared/package.json')` здесь не годится: `exports` пакета не отдаёт `./package.json`, и Node отвечает `ERR_PACKAGE_PATH_NOT_EXPORTED`. `git status --short` после `npm ci` — пусто (`package-lock.json` не изменился).

- [ ] **Step 1: Падающий тест TTL-кеша**

`api/src/lib/cdek/locations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TtlCache } from './locations.js'

describe('TtlCache', () => {
  it('отдаёт значение до истечения срока и забывает после', () => {
    let t = 1_000
    const cache = new TtlCache<string>(100, 10, () => t)
    cache.set('a', 'x')
    t = 1_099
    expect(cache.get('a')).toBe('x')
    t = 1_100
    expect(cache.get('a')).toBeUndefined()
  })

  it('не растёт больше предела: вытесняет самую старую запись', () => {
    const cache = new TtlCache<number>(60_000, 2, () => 0)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('повторная запись ключа обновляет срок и не вытесняет соседей', () => {
    let t = 0
    const cache = new TtlCache<number>(100, 2, () => t)
    cache.set('a', 1)
    cache.set('b', 2)
    t = 50
    cache.set('a', 10)
    t = 120
    expect(cache.get('a')).toBe(10)
    expect(cache.get('b')).toBeUndefined()
  })

  it('у записи может быть свой, более короткий срок', () => {
    let t = 0
    const cache = new TtlCache<number>(1_000, 10, () => t)
    cache.set('long', 1)
    cache.set('short', 2, 100)
    t = 100
    expect(cache.get('short')).toBeUndefined()
    expect(cache.get('long')).toBe(1)
  })
})
```

- [ ] **Step 2: Падающий тест эндпоинтов**

`api/src/routes/cdek-locations.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { CdekError, setCdekClientForTests } from '../lib/cdek/index.js'
import { EMPTY_POINTS_TTL_MS, clearCdekLocationCache } from '../lib/cdek/locations.js'

const CITIES = '/api/public/cdek/cities'
const POINTS = '/api/public/cdek/points'

// Ответы песочницы СДЭК 25.09.2026, урезанные до полей, которые мы читаем,
// и пары лишних — их в нашем ответе быть не должно.
const MOSCOW_SUGGEST = {
  city_uuid: '7e2e4f9a-6a1b-4c1e-9d3b-1f2a3b4c5d6e',
  code: 44,
  full_name: 'Москва, Россия',
  country_code: 'RU',
}
const NALCHIK_SUGGEST = {
  city_uuid: '0b6f1c2d-3e4f-4a5b-8c7d-9e0f1a2b3c4d',
  code: 1106,
  full_name: 'Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия',
  country_code: 'RU',
}
const MOSCOW_CITY = [
  { code: 44, city: 'Москва', longitude: 37.6176, latitude: 55.7558, region: 'Москва' },
]

function rawPoint(code: string, address: string) {
  return {
    code,
    name: `${code}, Москва, ${address.split(',')[0]}`,
    type: 'PVZ',
    is_handout: true,
    work_time: 'Пн-Пт 10:00-20:00, Сб-Вс 10:00-18:00',
    phones: [{ number: '+74951234567' }],
    office_image_list: [{ url: 'https://example.test/photo.jpg' }],
    work_time_list: [{ day: 1, time: '10:00/20:00' }],
    location: {
      city_code: 44,
      city: 'Москва',
      postal_code: '125167',
      longitude: 37.5776,
      latitude: 55.7903,
      address,
      address_full: `Россия, Москва, ${address}`,
    },
  }
}

// Подменяет клиент СДЭК: ответ — по пути запроса; Error — СДЭК «упал».
function stubCdek(routes: Record<string, unknown>) {
  const get = vi.fn()
  get.mockImplementation(async (path: string) => {
    if (!(path in routes)) throw new Error(`неожиданный запрос в СДЭК: ${path}`)
    const answer = routes[path]
    if (answer instanceof Error) throw answer
    return answer
  })
  setCdekClientForTests({ get, post: vi.fn(), raw: vi.fn() })
  return get
}

let app: ReturnType<typeof createApp>
beforeAll(() => {
  app = createApp()
})
afterEach(() => {
  setCdekClientForTests(null)
  clearCdekLocationCache()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /api/public/cdek/cities', () => {
  it('обрезает q и спрашивает СДЭК только по России', async () => {
    const get = stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST] })
    const res = await request(app).get(CITIES).query({ q: '  Моск ' })
    expect(res.status).toBe(200)
    expect(get).toHaveBeenCalledWith('/location/suggest/cities', {
      name: 'Моск',
      country_code: 'RU',
    })
  })

  it('отдаёт code, name — первую часть full_name — и fullName', async () => {
    stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST, NALCHIK_SUGGEST] })
    const res = await request(app).get(CITIES).query({ q: 'на' })
    expect(res.body).toEqual({
      data: [
        { code: 44, name: 'Москва', fullName: 'Москва, Россия' },
        {
          code: 1106,
          name: 'Нальчик',
          fullName: 'Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия',
        },
      ],
    })
  })

  it('не больше 10 городов', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...MOSCOW_SUGGEST,
      code: 1000 + i,
      full_name: `Город ${i}, Россия`,
    }))
    stubCdek({ '/location/suggest/cities': many })
    const res = await request(app).get(CITIES).query({ q: 'город' })
    expect(res.body.data).toHaveLength(10)
  })

  it('400 на q короче 2 символов после обрезки, длиннее 100 или без q — в СДЭК не ходим', async () => {
    const get = stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST] })
    expect((await request(app).get(CITIES).query({ q: ' м ' })).status).toBe(400)
    expect(
      (
        await request(app)
          .get(CITIES)
          .query({ q: 'а'.repeat(101) })
      ).status,
    ).toBe(400)
    expect((await request(app).get(CITIES)).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })

  it('кеширует по q без учёта регистра: второй запрос не идёт в СДЭК', async () => {
    const get = stubCdek({ '/location/suggest/cities': [MOSCOW_SUGGEST] })
    await request(app).get(CITIES).query({ q: 'моск' })
    const res = await request(app).get(CITIES).query({ q: 'МОСК' })
    expect(res.body.data).toEqual([{ code: 44, name: 'Москва', fullName: 'Москва, Россия' }])
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('СДЭК недоступен — 502 cdek_unavailable; в лог — код ошибки, без текста запроса', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Сообщение сетевой ошибки содержит адрес запроса с тем, что набрал покупатель.
    stubCdek({
      '/location/suggest/cities': new CdekError(
        0,
        'network_error',
        'СДЭК недоступен: fetch …/location/suggest/cities?name=моск failed',
      ),
    })
    const res = await request(app).get(CITIES).query({ q: 'моск' })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('cdek_unavailable')
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = warn.mock.calls[0]!.join(' ')
    expect(logged).toContain('network_error')
    expect(logged).not.toContain('моск')
  })
})

describe('GET /api/public/cdek/points', () => {
  it('спрашивает у СДЭК только ПВЗ с выдачей и центр города', async () => {
    const get = stubCdek({
      '/deliverypoints': [rawPoint('MSK65', 'ул. Динамовская, 1А, 110а')],
      '/location/cities': MOSCOW_CITY,
    })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(200)
    expect(get).toHaveBeenCalledWith('/deliverypoints', {
      city_code: 44,
      type: 'PVZ',
      is_handout: true,
    })
    expect(get).toHaveBeenCalledWith('/location/cities', { code: 44 })
  })

  it('урезанная форма без фото и телефонов, пункты по коду', async () => {
    stubCdek({
      '/deliverypoints': [
        rawPoint('MSK65', 'ул. Динамовская, 1А, 110а'),
        rawPoint('MSK1', 'ул. Ленина, 1'),
      ],
      '/location/cities': MOSCOW_CITY,
    })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.body).toEqual({
      data: {
        city: { code: 44, name: 'Москва', location: [37.6176, 55.7558] },
        points: [
          {
            code: 'MSK1',
            name: 'MSK1, Москва, ул. Ленина',
            address: 'ул. Ленина, 1',
            location: [37.5776, 55.7903],
            workTime: 'Пн-Пт 10:00-20:00, Сб-Вс 10:00-18:00',
          },
          {
            code: 'MSK65',
            name: 'MSK65, Москва, ул. Динамовская',
            address: 'ул. Динамовская, 1А, 110а',
            location: [37.5776, 55.7903],
            workTime: 'Пн-Пт 10:00-20:00, Сб-Вс 10:00-18:00',
          },
        ],
      },
    })
  })

  it('центр города неизвестен — location: null, пункты всё равно отдаём', async () => {
    stubCdek({ '/deliverypoints': [rawPoint('MSK1', 'ул. Ленина, 1')], '/location/cities': [] })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.body.data.city).toEqual({ code: 44, name: '', location: null })
    expect(res.body.data.points).toHaveLength(1)
  })

  it('кеширует список города: второй запрос не идёт в СДЭК', async () => {
    const get = stubCdek({
      '/deliverypoints': [rawPoint('MSK1', 'ул. Ленина, 1')],
      '/location/cities': MOSCOW_CITY,
    })
    await request(app).get(POINTS).query({ cityCode: 44 })
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(2) // пункты + город, один раз
  })

  it('пустой список — 200 с points: [], в кеше только 5 минут: сбой СДЭК не выключит ПВЗ на 6 часов', async () => {
    // Подменяем только Date: таймеры supertest и express остаются настоящими.
    vi.useFakeTimers({ toFake: ['Date'] })
    const get = stubCdek({ '/deliverypoints': [], '/location/cities': MOSCOW_CITY })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(200)
    expect(res.body.data.points).toEqual([])
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(2) // второй запрос — из кеша
    vi.setSystemTime(Date.now() + EMPTY_POINTS_TTL_MS)
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(4) // через 5 минут — снова в СДЭК
  })

  it('непустой список живёт в кеше дольше 5 минут', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const get = stubCdek({
      '/deliverypoints': [rawPoint('MSK1', 'ул. Ленина, 1')],
      '/location/cities': MOSCOW_CITY,
    })
    await request(app).get(POINTS).query({ cityCode: 44 })
    vi.setSystemTime(Date.now() + EMPTY_POINTS_TTL_MS + 60_000)
    await request(app).get(POINTS).query({ cityCode: 44 })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('400 на cityCode, который не положительное целое', async () => {
    const get = stubCdek({ '/deliverypoints': [], '/location/cities': [] })
    for (const cityCode of ['abc', '0', '-5', '1.5', '']) {
      expect((await request(app).get(POINTS).query({ cityCode })).status).toBe(400)
    }
    expect((await request(app).get(POINTS)).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })

  it('СДЭК недоступен — 502 cdek_unavailable, в логе код ошибки', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubCdek({
      '/deliverypoints': new CdekError(0, 'network_error', 'timeout'),
      '/location/cities': MOSCOW_CITY,
    })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('cdek_unavailable')
    expect(warn.mock.calls[0]!.join(' ')).toContain('network_error')
  })

  it('СДЭК ответил не списком — 502, а не падение', async () => {
    stubCdek({ '/deliverypoints': { requests: [] }, '/location/cities': MOSCOW_CITY })
    const res = await request(app).get(POINTS).query({ cityCode: 44 })
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test -w api -- src/lib/cdek/locations.test.ts src/routes/cdek-locations.test.ts`
Expected: FAIL — `Cannot find module './locations.js'` / `../lib/cdek/locations.js`.

- [ ] **Step 4: Общие типы**

В конец `shared/src/types/shipping.ts`:

```ts
// Город из подсказок СДЭК (GET /api/public/cdek/cities). name — первая часть
// full_name («Москва»), fullName — вся строка («Нальчик, городской округ
// Нальчик, Кабардино-Балкария, Россия»).
export interface CdekCity {
  code: number
  name: string
  fullName: string
}

// Пункт выдачи для списка и карты на чекауте (GET /api/public/cdek/points):
// только то, что показываем. location — [долгота, широта], как у виджета.
export interface CdekPoint {
  code: string
  name: string
  address: string
  location: [number, number]
  workTime: string
}

export interface CdekCityPoints {
  // location — центр города для карты; null, если СДЭК его не знает.
  city: { code: number; name: string; location: [number, number] | null }
  points: CdekPoint[]
}
```

В `shared/src/index.ts` блок экспорта из `./types/shipping.js` заменить на:

```ts
export type {
  CdekCity,
  CdekCityPoints,
  CdekPoint,
  DeliveryDestination,
  DeliveryQuote,
  ShippingBox,
  ShippingPackage,
} from './types/shipping.js'
```

- [ ] **Step 5: `api/src/lib/cdek/locations.ts`**

```ts
import type { CdekCity, CdekCityPoints, CdekPoint } from '@ximi4ka-shop/shared'
import { CdekError, type CdekClient } from './client.js'

// Подсказки городов и пункты выдачи для чекаута (спека
// docs/superpowers/specs/2026-09-25-cdek-pvz-list-design.md, §4). Кеш — в
// памяти процесса, как у rateLimit: api — один контейнер. Кеш бережёт
// договорной ключ СДЭК, а чекаут проверяет по нему пункт без лишнего похода
// в СДЭК.

type Cdek = Pick<CdekClient, 'get'>

export const CITIES_TTL_MS = 60 * 60_000
export const POINTS_TTL_MS = 6 * 60 * 60_000
// Пустой список — скорее сбой СДЭК, чем город без ПВЗ: держим его недолго,
// чтобы не выключить пункты в городе на шесть часов, но и не ходить в СДЭК
// на каждый запрос.
export const EMPTY_POINTS_TTL_MS = 5 * 60_000
export const CITY_SUGGEST_LIMIT = 10
// Ключ кеша подсказок — то, что набрал покупатель: без предела карта росла бы
// от случайных строк.
const MAX_CACHE_ENTRIES = 2000

export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = MAX_CACHE_ENTRIES,
    // Date.now ищем при каждом вызове, а не запоминаем ссылку: так его
    // подменяют фейковые таймеры.
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return hit.value
  }

  // ttlMs — свой срок для этой записи (по умолчанию — срок кеша).
  set(key: string, value: T, ttlMs = this.ttlMs): void {
    this.entries.delete(key)
    // Map помнит порядок вставки: первый ключ — самый старый.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs })
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }
}

const citiesCache = new TtlCache<CdekCity[]>(CITIES_TTL_MS)
const pointsCache = new TtlCache<CdekCityPoints>(POINTS_TTL_MS)

// Для тестов: кеш модульный и иначе переживал бы соседние тесты.
export function clearCdekLocationCache(): void {
  citiesCache.clear()
  pointsCache.clear()
}

function badResponse(what: string): CdekError {
  return new CdekError(502, 'bad_response', `СДЭК вернул не список: ${what}`)
}

// Для логов — только статус и код. Текст сетевой ошибки содержит адрес
// запроса, а в нём то, что набрал покупатель.
export function describeCdekError(err: unknown): string {
  if (err instanceof CdekError) return `${err.status} ${err.code}`
  return err instanceof Error ? err.name : 'unknown'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toCity(raw: unknown): CdekCity | null {
  const r = raw as { code?: unknown; full_name?: unknown } | null
  if (!r || !isNumber(r.code) || typeof r.full_name !== 'string') return null
  const fullName = r.full_name.trim()
  const name = fullName.split(',')[0]!.trim()
  return name === '' ? null : { code: r.code, name, fullName }
}

function toPoint(raw: unknown): CdekPoint | null {
  const r = raw as {
    code?: unknown
    name?: unknown
    work_time?: unknown
    location?: { address?: unknown; longitude?: unknown; latitude?: unknown } | null
  } | null
  const loc = r?.location
  if (!r || typeof r.code !== 'string' || !loc) return null
  if (!isNumber(loc.longitude) || !isNumber(loc.latitude)) return null
  return {
    code: r.code,
    name: typeof r.name === 'string' ? r.name : r.code,
    address: typeof loc.address === 'string' ? loc.address : '',
    location: [loc.longitude, loc.latitude],
    workTime: typeof r.work_time === 'string' ? r.work_time : '',
  }
}

// По коду: порядок стабилен для поиска и тестов и не зависит от локали.
function byCode(a: CdekPoint, b: CdekPoint): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
}

// GET /v2/location/suggest/cities. q уже обрезан и проверен роутом.
export async function suggestCities(cdek: Cdek, q: string): Promise<CdekCity[]> {
  const key = q.toLowerCase()
  const cached = citiesCache.get(key)
  if (cached) return cached
  const raw = await cdek.get<unknown>('/location/suggest/cities', { name: q, country_code: 'RU' })
  if (!Array.isArray(raw)) throw badResponse('города')
  const cities = raw
    .map(toCity)
    .filter((c): c is CdekCity => c !== null)
    .slice(0, CITY_SUGGEST_LIMIT)
  citiesCache.set(key, cities)
  return cities
}

// Пункты выдачи города — только ПВЗ с выдачей (§3) — и центр города для
// карты. Пустой список живёт в кеше 5 минут, а не 6 часов: если СДЭК однажды
// ответит пустотой по ошибке, ПВЗ в городе быстро вернутся.
export async function getCityPoints(cdek: Cdek, cityCode: number): Promise<CdekCityPoints> {
  const key = String(cityCode)
  const cached = pointsCache.get(key)
  if (cached) return cached
  const [rawPoints, rawCities] = await Promise.all([
    cdek.get<unknown>('/deliverypoints', { city_code: cityCode, type: 'PVZ', is_handout: true }),
    cdek.get<unknown>('/location/cities', { code: cityCode }),
  ])
  if (!Array.isArray(rawPoints)) throw badResponse('пункты')
  if (!Array.isArray(rawCities)) throw badResponse('город')
  const found = rawCities[0] as
    | { city?: unknown; longitude?: unknown; latitude?: unknown }
    | undefined
  const result: CdekCityPoints = {
    city: {
      code: cityCode,
      name: typeof found?.city === 'string' ? found.city : '',
      location:
        found && isNumber(found.longitude) && isNumber(found.latitude)
          ? [found.longitude, found.latitude]
          : null,
    },
    points: rawPoints
      .map(toPoint)
      .filter((p): p is CdekPoint => p !== null)
      .sort(byCode),
  }
  pointsCache.set(key, result, result.points.length > 0 ? POINTS_TTL_MS : EMPTY_POINTS_TTL_MS)
  return result
}
```

- [ ] **Step 6: Роут и подключение**

`api/src/routes/public/cdek-locations.ts`:

```ts
import { Router, type Response } from 'express'
import { z } from 'zod'
import { getCdekClient } from '../../lib/cdek/index.js'
import { describeCdekError, getCityPoints, suggestCities } from '../../lib/cdek/locations.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Подсказки городов и пункты выдачи для полей чекаута (спека
// docs/superpowers/specs/2026-09-25-cdek-pvz-list-design.md, §4). Только
// чтение: в СДЭК уходят лишь проверенные схемой name/city_code/code.
export const cdekLocationsRouter: Router = Router()

const CitiesQuery = z.object({ q: z.string().trim().min(2).max(100) })
const PointsQuery = z.object({
  cityCode: z.coerce.number().int().positive().max(2_147_483_647),
})

// 502 и строка в лог: без неё сбой СДЭК на чекауте не заметить. В лог — только
// статус и код ошибки, без текста запроса (там город, который набрал покупатель).
function cdekUnavailable(res: Response, what: string, err: unknown): void {
  console.warn(`cdek: ${what} не загрузились —`, describeCdekError(err))
  res.status(502).json({ error: { code: 'cdek_unavailable', message: 'СДЭК временно недоступен' } })
}

// GET /api/public/cdek/cities?q=Моск
cdekLocationsRouter.get(
  '/cities',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    const parsed = CitiesQuery.safeParse(req.query)
    if (!parsed.success) {
      next(parsed.error)
      return
    }
    try {
      res.json({ data: await suggestCities(getCdekClient(), parsed.data.q) })
    } catch (err) {
      cdekUnavailable(res, 'подсказки городов', err)
    }
  },
)

// GET /api/public/cdek/points?cityCode=44
cdekLocationsRouter.get(
  '/points',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    const parsed = PointsQuery.safeParse(req.query)
    if (!parsed.success) {
      next(parsed.error)
      return
    }
    try {
      res.json({ data: await getCityPoints(getCdekClient(), parsed.data.cityCode) })
    } catch (err) {
      cdekUnavailable(res, 'пункты выдачи', err)
    }
  },
)
```

В `api/src/app.ts` после строки `import { cdekWidgetRouter } from './routes/public/cdek-widget.js'`:

```ts
import { cdekLocationsRouter } from './routes/public/cdek-locations.js'
```

и после `app.use('/api/public/cdek/widget', cdekWidgetRouter)`:

```ts
app.use('/api/public/cdek', cdekLocationsRouter)
```

`ZodError` уходит в общий `errorHandler`, и тот отвечает 400 `validation_error`.

- [ ] **Step 7: Тесты и типы зелёные**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test -w api -- src/lib/cdek/locations.test.ts src/routes/cdek-locations.test.ts src/routes/cdek-widget.test.ts`
Expected: PASS.
Run: `npm run typecheck -w shared && npm run typecheck -w api`
Expected: без ошибок.

- [ ] **Step 8: Коммит**

```bash
npx prettier --write shared/src/types/shipping.ts shared/src/index.ts api/src/lib/cdek/locations.ts api/src/lib/cdek/locations.test.ts api/src/routes/public/cdek-locations.ts api/src/routes/cdek-locations.test.ts api/src/app.ts
git add shared/src/types/shipping.ts shared/src/index.ts api/src/lib/cdek/locations.ts api/src/lib/cdek/locations.test.ts api/src/routes/public/cdek-locations.ts api/src/routes/cdek-locations.test.ts api/src/app.ts
git commit -m "feat(api): подсказки городов и пункты выдачи СДЭК с кешем

GET /api/public/cdek/cities и /points: только ПВЗ с выдачей, урезанная
форма, кеш в памяти (города — час, пункты — 6 часов, пустой список —
5 минут), лимит 60 запросов в минуту, сбой СДЭК — в лог кодом.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Чекаут сверяет пункт выдачи со списком города

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить; тесты api — только с `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz` (база `ximi4ka_shop_test` занята другой веткой).

**Files:**

- Modify: `api/src/lib/cdek/locations.ts` (добавить функцию в конец)
- Modify: `api/src/routes/checkout.ts:1-12` (импорты), `:52-53` (новый блок после проверки `Idempotency-Key`)
- Test: `api/src/routes/checkout.test.ts`

**Interfaces:**

- Consumes: `getCityPoints(cdek, cityCode)`, `describeCdekError(err)` (Task 1); `badRequest(code, message)` из `api/src/routes/errors.ts`.
- Produces: `isKnownDeliveryPoint(cdek: Pick<CdekClient,'get'>, cityCode: number, pointCode: string): Promise<boolean | null>` (`null` — проверить нечем: СДЭК не ответил или вернул пустой список); ответ чекаута 400 `{ error: { code: 'delivery_point_unknown', message: 'Пункт выдачи не найден — выберите другой' } }`. Веб опирается на этот код в Task 11.

- [ ] **Step 1: Падающие тесты**

В `api/src/routes/checkout.test.ts`:

- импорт после `import { setCdekClientForTests } from '../lib/cdek/index.js'`:

```ts
import { clearCdekLocationCache } from '../lib/cdek/locations.js'
```

- в `afterEach` после `setCdekClientForTests(null)`:

```ts
clearCdekLocationCache()
```

- helper после `checkoutBody`:

```ts
// Список пунктов города 44 так, как его отдаёт СДЭК (урезан). Калькулятор
// «не отвечает» — цена фиксированная, как в соседних тестах.
function stubCityPoints(codes: string[]) {
  const get = vi.fn()
  get.mockImplementation(async (path: string) =>
    path === '/deliverypoints'
      ? codes.map((code) => ({
          code,
          name: `${code}, Москва`,
          work_time: 'Пн-Пт 10:00-20:00',
          location: { address: 'ул. Ленина, 1', longitude: 37.6, latitude: 55.7 },
        }))
      : [{ code: 44, city: 'Москва', longitude: 37.6176, latitude: 55.7558 }],
  )
  setCdekClientForTests({
    get,
    post: vi.fn().mockRejectedValue(new Error('offline')),
    raw: vi.fn(),
  })
  return get
}
```

- тесты в конец `describe('POST /api/checkout')`:

```ts
it('400 delivery_point_unknown: пункта нет в списке города — заказ не создаётся', async () => {
  stubCityPoints(['MSK1', 'MSK65'])
  const p = await seedProduct()
  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
  expect(res.status).toBe(400)
  expect(res.body.error).toMatchObject({
    code: 'delivery_point_unknown',
    message: 'Пункт выдачи не найден — выберите другой',
  })
  expect(await AppDataSource.getRepository(Order).count()).toBe(0)
})

it('пункт из списка города — заказ создаётся', async () => {
  const get = stubCityPoints(['MSK123'])
  const p = await seedProduct()
  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
  expect(res.status).toBe(201)
  expect(get).toHaveBeenCalledWith('/deliverypoints', {
    city_code: 44,
    type: 'PVZ',
    is_handout: true,
  })
})

it('СДЭК не ответил на список пунктов — заказ принимаем: оформление важнее', async () => {
  setCdekClientForTests({
    get: vi.fn().mockRejectedValue(new Error('timeout')),
    post: vi.fn().mockRejectedValue(new Error('timeout')),
    raw: vi.fn(),
  })
  const p = await seedProduct()
  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
  expect(res.status).toBe(201)
})

it('СДЭК вернул пустой список пунктов — проверку пропускаем, заказ принимаем', async () => {
  // Покупатель выбрал пункт из списка, значит пункты в городе были: пустота —
  // скорее сбой СДЭК, и отвечать 400 на каждый заказ в этот город нельзя.
  stubCityPoints([])
  const p = await seedProduct()
  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
  expect(res.status).toBe(201)
})

it('курьеру список пунктов не нужен', async () => {
  const get = stubCityPoints([])
  const p = await seedProduct()
  const body = checkoutBody([{ productId: p.id, quantity: 1 }])
  body.delivery = { method: 'cdek_courier', cityCode: 44, address: 'Москва, Тверская ул., 1' }
  const res = await request(app).post('/api/checkout').send(body)
  expect(res.status).toBe(201)
  expect(get).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test -w api -- src/routes/checkout.test.ts`
Expected: FAIL ровно в двух новых тестах: `'400 delivery_point_unknown…'` получает 201 вместо 400, а в `'пункт из списка города — заказ создаётся'` заказ создаётся, но `get` не вызывался с `/deliverypoints`: проверки ещё нет. Три других новых теста зелёные уже сейчас (СДЭК не ответил, пустой список, курьер) — они стерегут поведение, которое не должно сломаться. Старые тесты файла зелёные.

- [ ] **Step 3: Проверка пункта**

В конец `api/src/lib/cdek/locations.ts`:

```ts
// Проверка пункта на чекауте (§4.3): true/false — по списку города из того же
// кеша, что видел покупатель; null — проверить нечем. Пустой список тоже null:
// покупатель выбрал пункт из списка, значит пункты в городе были, и пустота —
// скорее сбой СДЭК, чем закрытый город. Отвечать 400 на все заказы туда нельзя.
export async function isKnownDeliveryPoint(
  cdek: Cdek,
  cityCode: number,
  pointCode: string,
): Promise<boolean | null> {
  try {
    const { points } = await getCityPoints(cdek, cityCode)
    if (points.length === 0) return null
    return points.some((p) => p.code === pointCode)
  } catch (err) {
    console.warn('cdek: проверка пункта пропущена —', describeCdekError(err))
    return null
  }
}
```

В `api/src/routes/checkout.ts`:

- к импортам:

```ts
import { isKnownDeliveryPoint } from '../lib/cdek/locations.js'
import { badRequest } from './errors.js'
```

- сразу после блока `if (idempotencyKey) { … }` (повтор с тем же ключом отдаёт готовый заказ без проверки) и перед `const { lines, subtotalRub, packLines } = await loadCart(parsed.items)`:

```ts
// Пункт сверяем со списком города из того же кеша, что видел покупатель
// (спека §4.3). СДЭК не ответил — заказ принимаем: оформление важнее, а
// закрытый пункт всплывёт ошибкой при создании заказа в СДЭК.
if (parsed.delivery.method === 'cdek_pvz') {
  const known = await isKnownDeliveryPoint(
    getCdekClient(),
    parsed.delivery.cityCode,
    parsed.delivery.deliveryPointCode,
  )
  if (known === false) {
    throw badRequest('delivery_point_unknown', 'Пункт выдачи не найден — выберите другой')
  }
}
```

Старые тесты с `get: vi.fn()` не ломаются: `undefined` вместо списка — это «СДЭК не ответил», и проверка пропускается (с предупреждением в лог — в выводе тестов это ожидаемо).

- [ ] **Step 4: Тесты зелёные**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test -w api -- src/routes/checkout.test.ts src/routes/cdek-locations.test.ts`
Expected: PASS.
Run: `npm run typecheck -w api` → без ошибок.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write api/src/lib/cdek/locations.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git add api/src/lib/cdek/locations.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git commit -m "feat(api): чекаут сверяет пункт выдачи со списком города

Неизвестный код ПВЗ — 400 delivery_point_unknown. СДЭК недоступен —
проверку пропускаем и заказ принимаем.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Расчёт ПВЗ по городу, без кода пункта

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить; тесты api — только с `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz` (база `ximi4ka_shop_test` занята другой веткой).

Спека (§5.1, п. 2) требует цены обоих способов сразу после выбора города, то есть до выбора пункта. Сейчас `POST /api/public/shipping/quote` без `deliveryPointCode` отвечает 400. Код пункта для расчёта не нужен: `toLocation` для ПВЗ берёт только `cityCode`. Поэтому расчёт принимает ПВЗ без кода, а чекаут по-прежнему его требует.

**Files:**

- Modify: `shared/src/types/shipping.ts` (после `DeliveryDestination`), `shared/src/index.ts`
- Modify: `api/src/routes/checkout.schemas.ts:6-24`
- Modify: `api/src/routes/public/shipping.ts:7,12-15`
- Modify: `api/src/lib/shipping/quote.ts:1,38,51-53`
- Modify: `web/lib/api.ts:1-13,223-226`
- Test: `api/src/routes/shipping.test.ts`

**Interfaces:**

- Produces (shared): `QuoteDestination` — `DeliveryDestination`, у которого для ПВЗ `deliveryPointCode` необязателен. `DeliveryDestination` ему присваивается.
- Produces (api): `QuoteDestinationSchema` в `checkout.schemas.ts`; `quoteDelivery({ destination: QuoteDestination, … })`.
- Produces (web): `quoteShipping({ items, destination?: QuoteDestination })`.

- [ ] **Step 1: Падающий тест**

В конец `describe('POST /api/public/shipping/quote')` в `api/src/routes/shipping.test.ts`:

```ts
it('ПВЗ без кода пункта считается по городу — цену видно до выбора пункта', async () => {
  const post = vi.fn().mockResolvedValue({ total_sum: 390, period_min: 3, period_max: 5 })
  setCdekClientForTests({ post, get: vi.fn(), raw: vi.fn() })
  const p = await seedProduct({ priceRub: 500 })
  const res = await request(app)
    .post('/api/public/shipping/quote')
    .send({
      items: [{ productId: p.id, quantity: 1 }],
      destination: { method: 'cdek_pvz', cityCode: 44, address: 'Москва' },
    })
  expect(res.status).toBe(200)
  expect(res.body.data.quote).toMatchObject({ method: 'cdek_pvz', customerPriceRub: 390 })
  expect(post.mock.calls[0][1].to_location).toEqual({ code: 44 })
})

it('курьер до ввода улицы считается по коду города', async () => {
  const post = vi.fn().mockResolvedValue({ total_sum: 600, period_min: 2, period_max: 2 })
  setCdekClientForTests({ post, get: vi.fn(), raw: vi.fn() })
  const p = await seedProduct({ priceRub: 500 })
  const res = await request(app)
    .post('/api/public/shipping/quote')
    .send({
      items: [{ productId: p.id, quantity: 1 }],
      destination: { method: 'cdek_courier', cityCode: 44, address: 'Москва' },
    })
  expect(res.status).toBe(200)
  expect(res.body.data.quote).toMatchObject({ method: 'cdek_courier', customerPriceRub: 600 })
  expect(post.mock.calls[0][1].to_location).toEqual({ code: 44, address: 'Москва' })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test -w api -- src/routes/shipping.test.ts`
Expected: FAIL — первый новый тест получает 400.

- [ ] **Step 3: Тип и схемы**

В `shared/src/types/shipping.ts` сразу после `DeliveryDestination`:

```ts
// Куда считать доставку (POST /api/public/shipping/quote). Для ПВЗ код пункта
// не обязателен: цену СДЭК считает по городу, и чекаут показывает её сразу
// после выбора города, до выбора пункта.
export type QuoteDestination =
  | (Omit<Extract<DeliveryDestination, { method: 'cdek_pvz' }>, 'deliveryPointCode'> & {
      deliveryPointCode?: string
    })
  | Extract<DeliveryDestination, { method: 'cdek_courier' }>
```

В `shared/src/index.ts` в блок экспорта из `./types/shipping.js` добавить `QuoteDestination,` (по алфавиту — после `DeliveryQuote`).

В `api/src/routes/checkout.schemas.ts` заменить `DeliverySchema` (строки 6–24) на:

```ts
// Доставка приходит из полей чекаута. Для ПВЗ обязательны код пункта и код
// города — без них не создать заказ в СДЭК. Курьеру хватает адреса; код
// города и индекс уточняют расчёт, если есть.
const PvzDeliverySchema = z.object({
  method: z.literal('cdek_pvz'),
  cityCode: z.number().int().positive(),
  deliveryPointCode: z.string().trim().min(1).max(32),
  address: z.string().trim().min(1).max(1000),
  comment,
})

const CourierDeliverySchema = z.object({
  method: z.literal('cdek_courier'),
  cityCode: z.number().int().positive().optional(),
  postalCode: z.string().trim().max(16).optional(),
  address: z.string().trim().min(1).max(1000),
  comment,
})

export const DeliverySchema = z.discriminatedUnion('method', [
  PvzDeliverySchema,
  CourierDeliverySchema,
])

// Для расчёта цены ПВЗ код пункта не нужен (QuoteDestination в shared):
// чекаут показывает цену сразу после выбора города.
export const QuoteDestinationSchema = z.discriminatedUnion('method', [
  PvzDeliverySchema.extend({
    deliveryPointCode: PvzDeliverySchema.shape.deliveryPointCode.optional(),
  }),
  CourierDeliverySchema,
])
```

В `api/src/routes/public/shipping.ts`:

```ts
import { CheckoutSchema, QuoteDestinationSchema } from '../checkout.schemas.js'
```

и

```ts
const QuoteSchema = z.object({
  items: CheckoutSchema.shape.items,
  destination: QuoteDestinationSchema.optional(),
})
```

В `api/src/lib/shipping/quote.ts`:

- импорт: `import type { DeliveryDestination, DeliveryQuote, QuoteDestination, ShippingPackage } from '@ximi4ka-shop/shared'`;
- `function toLocation(destination: QuoteDestination): Record<string, unknown> {` (тело не меняется);
- в `quoteDelivery` — `input: { destination: QuoteDestination; subtotalRub: number; packages: ShippingPackage[] },`.

`tariffFor(method: DeliveryDestination['method'], …)` остаётся как есть. Чекаут передаёт `DeliveryDestination`, и он присваивается `QuoteDestination`.

В `web/lib/api.ts` добавить `QuoteDestination` в импорт типов и заменить тип `destination` у `quoteShipping`:

```ts
export async function quoteShipping(payload: {
  items: Array<{ productId: string; quantity: number }>
  destination?: QuoteDestination
}): Promise<ShippingQuoteResponse> {
```

Если после этого `DeliveryDestination` в `web/lib/api.ts` больше не используется, убрать его из импорта.

- [ ] **Step 4: Тесты и типы зелёные**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test -w api -- src/routes/shipping.test.ts src/routes/checkout.test.ts src/lib/shipping`
Expected: PASS. Чекаут без кода пункта по-прежнему отвечает 400 (`'не принимает ПВЗ без кода пункта…'`).
Run: `npm run typecheck -w shared && npm run typecheck -w api && npm run typecheck -w web` → без ошибок.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write shared/src/types/shipping.ts shared/src/index.ts api/src/routes/checkout.schemas.ts api/src/routes/public/shipping.ts api/src/lib/shipping/quote.ts api/src/routes/shipping.test.ts web/lib/api.ts
git add shared/src/types/shipping.ts shared/src/index.ts api/src/routes/checkout.schemas.ts api/src/routes/public/shipping.ts api/src/lib/shipping/quote.ts api/src/routes/shipping.test.ts web/lib/api.ts
git commit -m "feat(api): расчёт ПВЗ по городу, без кода пункта

Чекаут показывает цены обоих способов сразу после выбора города. Заказ
по-прежнему требует код пункта.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Поиск пунктов по словам

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Create: `web/lib/cdekPoints.ts`
- Test: `web/lib/cdekPoints.test.ts`

**Interfaces:**

- Consumes: `CdekPoint` (Task 1).
- Produces: `POINTS_SHOWN = 50`; `normalizeSearchText(value: string): string`; `searchPoints(points: CdekPoint[], query: string, limit?: number): { matches: CdekPoint[]; total: number }`; `cityRegion(fullName: string): string | null`.

- [ ] **Step 1: Падающий тест**

`web/lib/cdekPoints.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { CdekPoint } from '@ximi4ka-shop/shared'
import { POINTS_SHOWN, cityRegion, normalizeSearchText, searchPoints } from './cdekPoints'

function point(code: string, address: string, name = `${code}, Москва`): CdekPoint {
  return { code, name, address, location: [37.6, 55.7], workTime: 'Пн-Пт 10:00-20:00' }
}

const MIRA = point('MSK310', 'пр-т Мира, 108', 'MSK310, Москва, пр-т Мира')
const DINAMO = point('MSK65', 'ул. Динамовская, 1А, 110а', 'MSK65, Москва, ул. Динамовская')
const KOROLEV = point('KRL2', 'ул. Королёва, 5')

describe('normalizeSearchText', () => {
  it('нижний регистр, ё как е, знаки препинания — пробелы', () => {
    expect(normalizeSearchText('  Пр-т Мира, 108 ')).toBe('пр т мира 108')
    expect(normalizeSearchText('Королёв')).toBe('королев')
  })
})

describe('searchPoints', () => {
  const points = [MIRA, DINAMO, KOROLEV]

  it('«мира 108» находит «пр-т Мира, 108»: каждое слово — где угодно', () => {
    expect(searchPoints(points, 'мира 108').matches).toEqual([MIRA])
  })

  it('«ё» и «е» не различаются в обе стороны', () => {
    expect(searchPoints(points, 'королева').matches).toEqual([KOROLEV])
    expect(searchPoints([point('X1', 'ул. Королева, 5')], 'королёва').total).toBe(1)
  })

  it('находит по коду пункта без учёта регистра', () => {
    expect(searchPoints(points, 'msk65').matches).toEqual([DINAMO])
  })

  it('знаки препинания в запросе не мешают', () => {
    expect(searchPoints(points, 'Мира,108.').matches).toEqual([MIRA])
  })

  it('все слова обязательны: «мира 5» не находит ничего', () => {
    expect(searchPoints(points, 'мира 5')).toEqual({ matches: [], total: 0 })
  })

  it('пустой запрос — все пункты', () => {
    expect(searchPoints(points, '  ').total).toBe(3)
  })

  it('показывает первые 50, а total — сколько совпало всего', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      point(`MSK${1000 + i}`, `ул. Тестовая, ${i}`),
    )
    const result = searchPoints(many, 'тестовая')
    expect(POINTS_SHOWN).toBe(50)
    expect(result.matches).toHaveLength(50)
    expect(result.matches[0]).toBe(many[0])
    expect(result.total).toBe(120)
  })
})

describe('cityRegion', () => {
  it('регион — часть перед страной', () => {
    expect(cityRegion('Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия')).toBe(
      'Кабардино-Балкария',
    )
    expect(cityRegion('Королёв, Московская область, Россия')).toBe('Московская область')
  })

  it('у «Москва, Россия» региона нет', () => {
    expect(cityRegion('Москва, Россия')).toBeNull()
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w web -- lib/cdekPoints.test.ts`
Expected: FAIL — `Failed to resolve import "./cdekPoints"`.

- [ ] **Step 3: Реализация `web/lib/cdekPoints.ts`**

```ts
import type { CdekPoint } from '@ximi4ka-shop/shared'

// Сколько пунктов показываем за раз: в Москве их сотни, а длинный список на
// телефоне никто не листает — уточняют запрос (спека §5.1).
export const POINTS_SHOWN = 50

// Нижний регистр, «ё» как «е», знаки препинания и дефисы — пробелы:
// «Пр-т Мира, 108» → «пр т мира 108».
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Поиск по словам (§5.1): каждое слово запроса должно встретиться в коде,
// названии или адресе пункта. У Тильды поиск по подстроке целиком, и
// «мира 108» ничего не находит: у пункта «пр-т Мира, 108» между словами запятая.
export function searchPoints(
  points: CdekPoint[],
  query: string,
  limit = POINTS_SHOWN,
): { matches: CdekPoint[]; total: number } {
  const words = normalizeSearchText(query)
    .split(' ')
    .filter((w) => w !== '')
  const found =
    words.length === 0
      ? points
      : points.filter((p) => {
          const haystack = normalizeSearchText(`${p.code} ${p.name} ${p.address}`)
          return words.every((w) => haystack.includes(w))
        })
  return { matches: found.slice(0, limit), total: found.length }
}

// Регион для строки подсказки города: «Нальчик, городской округ Нальчик,
// Кабардино-Балкария, Россия» → «Кабардино-Балкария» (часть перед страной).
// У «Москва, Россия» региона нет.
export function cityRegion(fullName: string): string | null {
  const parts = fullName
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  return parts.length >= 3 ? parts[parts.length - 2]! : null
}
```

- [ ] **Step 4: Тест зелёный**

Run: `npm test -w web -- lib/cdekPoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write web/lib/cdekPoints.ts web/lib/cdekPoints.test.ts
git add web/lib/cdekPoints.ts web/lib/cdekPoints.test.ts
git commit -m "feat(web): поиск пунктов выдачи по словам

Каждое слово запроса — в коде, названии или адресе; регистр, «ё/е» и
знаки препинания не важны; первые 50 совпадений.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Поле «Город» с подсказками СДЭК

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Create: `web/components/checkout/fieldStyles.ts`
- Modify: `web/app/[locale]/(public)/checkout/page.tsx:57-64` (классы переезжают в `fieldStyles.ts`)
- Modify: `web/lib/api.ts` (новая функция после `searchCatalog`)
- Test: `web/lib/api.test.ts`
- Create: `web/components/checkout/CityCombobox.tsx`
- Test: `web/components/checkout/CityCombobox.test.tsx`

**Interfaces:**

- Consumes: `CdekCity` (Task 1); `cityRegion` (Task 4); `request`/`DataEnvelope` в `web/lib/api.ts`.
- Produces: `suggestCdekCities(q: string, opts?: { signal?: AbortSignal }): Promise<CdekCity[]>`; `FIELD_CLASS`, `LABEL_CLASS`, `ERROR_CLASS`, `HINT_CLASS`, `LISTBOX_CLASS`, `optionClass(active: boolean): string` из `fieldStyles.ts`; `CityCombobox({ id, value, onChange, error })`, где `value: CdekCity | null`, `onChange: (city: CdekCity | null) => void`, `error?: string`. `onChange(null)` приходит, когда покупатель правит текст выбранного города.

- [ ] **Step 1: Общие классы полей**

`web/components/checkout/fieldStyles.ts`:

```ts
// Классы полей чекаута: страница и поля доставки выглядят одинаково.
export const FIELD_CLASS =
  'w-full px-4 py-3 bg-transparent border border-[var(--color-lj-rule)] rounded-none font-lj-body text-base text-[var(--color-lj-ink)] placeholder:opacity-40 focus:outline-none focus:border-[var(--color-lj-ink)] transition-colors'

export const LABEL_CLASS =
  'font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70'

export const ERROR_CLASS =
  'font-lj-mono text-[length:var(--text-lj-mono-xs)] tracking-[0.04em] text-[var(--color-stock-danger)]'

// Приглушённая подпись: подсказки, статусы, часы работы пункта.
export const HINT_CLASS =
  'm-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-60'

// Выпадающий список полей «Город» и «Пункт получения».
export const LISTBOX_CLASS =
  'absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[60] m-0 max-h-[min(60vh,24rem)] list-none overflow-y-auto border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-1 shadow-[var(--shadow-lj-bright)]'

export function optionClass(active: boolean): string {
  return `flex cursor-pointer flex-col gap-0.5 px-3 py-2 font-lj-body text-base text-[var(--color-lj-ink)] ${
    active ? 'bg-[var(--color-lj-cream-shade)]' : 'hover:bg-[var(--color-lj-cream-shade)]'
  }`
}
```

В `web/app/[locale]/(public)/checkout/page.tsx` удалить три константы `FIELD_CLASS`, `LABEL_CLASS`, `ERROR_CLASS` (строки 57–64) и добавить импорт рядом с `CdekWidget`:

```ts
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'
```

- [ ] **Step 2: Падающие тесты клиента и поля**

В `web/lib/api.test.ts` добавить `suggestCdekCities` в импорт из `./api` и в конец файла:

```ts
describe('СДЭК: подсказки городов', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('кодирует запрос, не берёт из кеша и передаёт сигнал отмены', async () => {
    const cities = [{ code: 44, name: 'Москва', fullName: 'Москва, Россия' }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: cities }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    expect(await suggestCdekCities('Моск', { signal: controller.signal })).toEqual(cities)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`http://localhost:3001/api/public/cdek/cities?q=${encodeURIComponent('Моск')}`)
    expect(init.cache).toBe('no-store')
    expect(init.signal).toBe(controller.signal)
  })

  it('502 — ApiError с кодом cdek_unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(502, {
          error: { code: 'cdek_unavailable', message: 'СДЭК временно недоступен' },
        }),
      ),
    )
    await expect(suggestCdekCities('Моск')).rejects.toMatchObject({
      status: 502,
      code: 'cdek_unavailable',
    })
  })
})
```

`web/components/checkout/CityCombobox.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { CdekCity } from '@ximi4ka-shop/shared'

const mockSuggest = vi.fn<(q: string, opts?: { signal?: AbortSignal }) => Promise<CdekCity[]>>()
vi.mock('@/lib/api', () => ({
  suggestCdekCities: (q: string, opts?: { signal?: AbortSignal }) => mockSuggest(q, opts),
}))

import { CityCombobox } from './CityCombobox'

const MOSCOW: CdekCity = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }
const NALCHIK: CdekCity = {
  code: 1106,
  name: 'Нальчик',
  fullName: 'Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия',
}

// Поле управляемое: значение держит родитель, как на чекауте.
function Controlled({
  initial = null,
  onChange,
}: {
  initial?: CdekCity | null
  onChange: (city: CdekCity | null) => void
}) {
  const [value, setValue] = useState<CdekCity | null>(initial)
  return (
    <CityCombobox
      id="city"
      value={value}
      onChange={(city) => {
        setValue(city)
        onChange(city)
      }}
    />
  )
}

function input() {
  return screen.getByRole('combobox', { name: /город/i })
}

function type(value: string) {
  fireEvent.focus(input())
  fireEvent.change(input(), { target: { value } })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockSuggest.mockReset()
  mockSuggest.mockResolvedValue([MOSCOW, NALCHIK])
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('<CityCombobox>', () => {
  it('короче 2 символов СДЭК не спрашиваем', () => {
    render(<Controlled onChange={vi.fn()} />)
    type('М')
    act(() => vi.advanceTimersByTime(400))
    expect(mockSuggest).not.toHaveBeenCalled()
  })

  it('спрашивает через 250 мс и показывает «Нальчик · Кабардино-Балкария»', async () => {
    render(<Controlled onChange={vi.fn()} />)
    type('На')
    act(() => vi.advanceTimersByTime(200))
    expect(mockSuggest).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(60))
    expect(mockSuggest).toHaveBeenCalledWith(
      'На',
      expect.objectContaining({ signal: expect.anything() }),
    )
    await flush()
    expect(screen.getByRole('option', { name: 'Нальчик · Кабардино-Балкария' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument()
  })

  it('новый ввод отменяет прошлый запрос, и его поздний ответ не показывается', async () => {
    let resolveFirst!: (cities: CdekCity[]) => void
    mockSuggest.mockImplementationOnce(
      () =>
        new Promise<CdekCity[]>((resolve) => {
          resolveFirst = resolve
        }),
    )
    mockSuggest.mockResolvedValueOnce([MOSCOW])
    render(<Controlled onChange={vi.fn()} />)

    type('Мо')
    act(() => vi.advanceTimersByTime(250))
    const firstSignal = mockSuggest.mock.calls[0]![1]!.signal!
    type('Моск')
    expect(firstSignal.aborted).toBe(true)
    act(() => vi.advanceTimersByTime(250))
    await flush()
    resolveFirst([NALCHIK])
    await flush()

    expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Нальчик/ })).toBeNull()
  })

  it('клик выбирает город: наружу — город, в поле — название, под полем — полное имя', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    type('На')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.click(screen.getByRole('option', { name: /Нальчик/ }))
    expect(onChange).toHaveBeenLastCalledWith(NALCHIK)
    expect(input()).toHaveValue('Нальчик')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByText(NALCHIK.fullName)).toBeInTheDocument()
  })

  it('стрелки и Enter выбирают город, Enter не отправляет форму', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    type('На')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input()).toHaveAttribute('aria-activedescendant', options[1]!.id)
    // false — у события вызван preventDefault: браузер не отправит форму.
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
    expect(onChange).toHaveBeenLastCalledWith(NALCHIK)
  })

  it('Esc закрывает список', async () => {
    render(<Controlled onChange={vi.fn()} />)
    type('На')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('СДЭК не ответил — «Не удалось загрузить города» и «Повторить»', async () => {
    mockSuggest.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce([MOSCOW])
    render(<Controlled onChange={vi.fn()} />)
    type('Мо')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить города')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    act(() => vi.advanceTimersByTime(250))
    await flush()
    expect(mockSuggest).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument()
  })

  it('город подставлен снаружи (прошлый визит) — в поле название, запросов нет', () => {
    render(<Controlled initial={MOSCOW} onChange={vi.fn()} />)
    expect(input()).toHaveValue('Москва')
    act(() => vi.advanceTimersByTime(400))
    expect(mockSuggest).not.toHaveBeenCalled()
  })

  it('правка текста выбранного города сбрасывает выбор, чтобы не остался старый пункт', () => {
    const onChange = vi.fn()
    render(<Controlled initial={MOSCOW} onChange={onChange} />)
    type('Мос')
    expect(onChange).toHaveBeenCalledWith(null)
    expect(input()).toHaveValue('Мос')
  })
})
```

- [ ] **Step 3: Убедиться, что падают**

Run: `npm test -w web -- lib/api.test.ts components/checkout/CityCombobox.test.tsx`
Expected: FAIL — `suggestCdekCities is not a function`, `Failed to resolve import "./CityCombobox"`.

- [ ] **Step 4: Клиент API**

В `web/lib/api.ts` добавить `CdekCity` в импорт типов из `@ximi4ka-shop/shared` и после `searchCatalog`:

```ts
// Подсказки городов СДЭК для чекаута (GET /api/public/cdek/cities). signal
// отменяет устаревший запрос, пока покупатель печатает.
export async function suggestCdekCities(
  q: string,
  opts: { signal?: AbortSignal } = {},
): Promise<CdekCity[]> {
  const body = await request<DataEnvelope<CdekCity[]>>(
    `/api/public/cdek/cities?q=${encodeURIComponent(q)}`,
    { cache: 'no-store', signal: opts.signal },
  )
  return body.data
}
```

- [ ] **Step 5: `web/components/checkout/CityCombobox.tsx`**

```tsx
'use client'

import { useEffect, useId, useState } from 'react'
import type { CdekCity } from '@ximi4ka-shop/shared'
import { suggestCdekCities } from '@/lib/api'
import { cityRegion } from '@/lib/cdekPoints'
import {
  ERROR_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  LISTBOX_CLASS,
  optionClass,
} from './fieldStyles'

const DEBOUNCE_MS = 250
const MIN_QUERY = 2

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface Props {
  id: string
  value: CdekCity | null
  onChange: (city: CdekCity | null) => void
  error?: string
}

// «Нальчик · Кабардино-Балкария»; у Москвы региона нет — просто «Москва».
function cityLine(city: CdekCity): string {
  const region = cityRegion(city.fullName)
  return region ? `${city.name} · ${region}` : city.name
}

// Поле «Город» с подсказками СДЭК (спека §5.1, п. 1): от 2 символов, задержка
// 250 мс, прошлый запрос отменяется. Разметка — как у HeaderSearch, но
// role="combobox" стоит на самом поле (ARIA 1.2): так у него есть подпись.
export function CityCombobox({ id, value, onChange, error }: Props) {
  const listboxId = useId()
  const optionIdBase = useId()
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [cities, setCities] = useState<CdekCity[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [attempt, setAttempt] = useState(0)
  // Для какого города в поле сейчас текст. Родитель может подставить город сам
  // (сохранённый с прошлого визита) — тогда текст догоняет его.
  const [shownFor, setShownFor] = useState<CdekCity | null>(value)
  if (value !== shownFor) {
    setShownFor(value)
    setQuery(value?.name ?? '')
  }

  const q = query.trim()
  // Подсказки нужны, только пока город не выбран.
  const searching = value === null && q.length >= MIN_QUERY

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggestCdekCities(q, { signal: controller.signal })
        .then((found) => {
          if (controller.signal.aborted) return
          setCities(found)
          setActiveIndex(-1)
          setStatus('ready')
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, searching, attempt])

  // Пока идёт новый запрос, прежние подсказки остаются на месте — список не
  // мигает на каждой букве.
  const listOpen =
    open && searching && status !== 'error' && (status === 'ready' || cities.length > 0)
  const optionId = (i: number) => `${optionIdBase}-city-${i}`

  function handleInput(next: string) {
    const searchable = next.trim().length >= MIN_QUERY
    setQuery(next)
    setOpen(true)
    setActiveIndex(-1)
    setStatus(searchable ? 'loading' : 'idle')
    if (!searchable) setCities([])
    if (value !== null) {
      // Покупатель правит выбранный город — прежний выбор (и пункт в нём)
      // больше не верен.
      setShownFor(null)
      onChange(null)
    }
  }

  function choose(city: CdekCity) {
    setShownFor(city)
    setQuery(city.name)
    setOpen(false)
    setActiveIndex(-1)
    onChange(city)
  }

  function retry() {
    setStatus('loading')
    setOpen(true)
    setAttempt((n) => n + 1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!listOpen || cities.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % cities.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? cities.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // Enter выбирает город, а не отправляет форму заказа; без выделенной
      // строки — первую.
      e.preventDefault()
      choose(cities[activeIndex >= 0 ? activeIndex : 0]!)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        Город *
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          placeholder="Начните вводить название"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={FIELD_CLASS}
        />
        {listOpen && (
          <ul id={listboxId} role="listbox" aria-label="Города" className={LISTBOX_CLASS}>
            {cities.length === 0 ? (
              <li
                role="option"
                aria-disabled="true"
                aria-selected="false"
                className={`${HINT_CLASS} px-3 py-3`}
              >
                Город не найден — проверьте название
              </li>
            ) : (
              cities.map((city, i) => (
                <li
                  key={city.code}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  // Клик не должен уводить фокус из поля: onBlur закрыл бы
                  // список раньше, чем сработает выбор.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(city)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={optionClass(i === activeIndex)}
                >
                  {cityLine(city)}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {value && <p className={HINT_CLASS}>{value.fullName}</p>}
      {searching && status === 'loading' && cities.length === 0 && (
        <p role="status" className={HINT_CLASS}>
          Ищем город…
        </p>
      )}
      {searching && status === 'error' && (
        <p role="alert" className={ERROR_CLASS}>
          Не удалось загрузить города{' '}
          <button type="button" onClick={retry} className="underline">
            Повторить
          </button>
        </p>
      )}
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Тесты, типы, линт зелёные**

Run: `npm test -w web -- lib/api.test.ts components/checkout/CityCombobox.test.tsx checkout/page.test.tsx`
Expected: PASS. Тесты страницы не меняются: переехали только классы.
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок.

- [ ] **Step 7: Коммит**

```bash
npx prettier --write web/components/checkout/fieldStyles.ts web/components/checkout/CityCombobox.tsx web/components/checkout/CityCombobox.test.tsx web/lib/api.ts web/lib/api.test.ts "web/app/[locale]/(public)/checkout/page.tsx"
git add web/components/checkout/fieldStyles.ts web/components/checkout/CityCombobox.tsx web/components/checkout/CityCombobox.test.tsx web/lib/api.ts web/lib/api.test.ts "web/app/[locale]/(public)/checkout/page.tsx"
git commit -m "feat(web): поле «Город» с подсказками СДЭК

Подсказки от 2 символов через 250 мс с отменой прошлого запроса,
клавиатура, «Повторить» при ошибке. Классы полей чекаута — в общем
fieldStyles.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Поле «Пункт получения» — список ПВЗ с поиском

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Create: `web/components/checkout/PointCombobox.tsx`
- Test: `web/components/checkout/PointCombobox.test.tsx`

**Interfaces:**

- Consumes: `CdekPoint` (Task 1); `searchPoints` (Task 4); классы из `fieldStyles.ts` (Task 5).
- Produces: `PointCombobox({ id, points, value, onChange, error })`, где `points: CdekPoint[]`, `value: CdekPoint | null`, `onChange: (point: CdekPoint) => void`, `error?: string`; `pointLabel(point: Pick<CdekPoint,'code'|'address'>): string` → `'MSK310 · пр-т Мира, 108'`.

- [ ] **Step 1: Падающий тест**

`web/components/checkout/PointCombobox.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { CdekPoint } from '@ximi4ka-shop/shared'
import { PointCombobox, pointLabel } from './PointCombobox'

function point(code: string, address: string, workTime = 'Пн-Пт 10:00-20:00'): CdekPoint {
  return { code, name: `${code}, Москва`, address, location: [37.6, 55.7], workTime }
}

const MIRA = point('MSK310', 'пр-т Мира, 108', 'Пн-Вс 09:00-21:00')
const MANY = [
  ...Array.from({ length: 120 }, (_, i) => point(`MSK${1000 + i}`, `ул. Тестовая, ${i + 1}`)),
  MIRA,
]
const FEW = [point('MSK1', 'ул. Ленина, 1'), point('MSK2', 'ул. Ленина, 2'), MIRA]

function Controlled({
  points,
  onChange,
}: {
  points: CdekPoint[]
  onChange: (p: CdekPoint) => void
}) {
  const [value, setValue] = useState<CdekPoint | null>(null)
  return (
    <PointCombobox
      id="point"
      points={points}
      value={value}
      onChange={(p) => {
        setValue(p)
        onChange(p)
      }}
    />
  )
}

function input() {
  return screen.getByRole('combobox', { name: /пункт получения/i })
}

describe('<PointCombobox>', () => {
  it('при фокусе — первые 50 пунктов и «Показаны 50 из N — уточните запрос»', () => {
    render(<Controlled points={MANY} onChange={vi.fn()} />)
    fireEvent.focus(input())
    expect(screen.getAllByRole('option')).toHaveLength(50)
    expect(screen.getByText('Показаны 50 из 121 — уточните запрос')).toBeInTheDocument()
  })

  it('«мира 108» находит пункт; в строке код · адрес и часы работы', () => {
    render(<Controlled points={MANY} onChange={vi.fn()} />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'мира 108' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('MSK310 · пр-т Мира, 108')
    expect(options[0]).toHaveTextContent('Пн-Вс 09:00-21:00')
    expect(screen.queryByText(/уточните запрос/)).toBeNull()
  })

  it('ничего не нашлось — подсказка, как искать', () => {
    render(<Controlled points={FEW} onChange={vi.fn()} />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'луна' } })
    expect(
      screen.getByText('Ничего не найдено — попробуйте часть адреса или код пункта'),
    ).toBeInTheDocument()
  })

  it('стрелки и Enter выбирают пункт, Enter не отправляет форму', () => {
    const onChange = vi.fn()
    render(<Controlled points={FEW} onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id)
    // false — у события вызван preventDefault: браузер не отправит форму.
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
    expect(onChange).toHaveBeenCalledWith(FEW[1])
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input()).toHaveValue('MSK2 · ул. Ленина, 2')
  })

  it('Enter без выделения при открытом списке тоже не отправляет форму', () => {
    render(<Controlled points={FEW} onChange={vi.fn()} />)
    fireEvent.focus(input())
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
  })

  it('Esc закрывает список и не меняет выбор', () => {
    const onChange = vi.fn()
    render(<Controlled points={FEW} onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'ленина' } })
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(input()).toHaveValue('')
  })

  it('клик по строке выбирает пункт; закрытое поле показывает его', () => {
    const onChange = vi.fn()
    render(<Controlled points={FEW} onChange={onChange} />)
    fireEvent.focus(input())
    fireEvent.click(screen.getByRole('option', { name: /MSK310/ }))
    expect(onChange).toHaveBeenCalledWith(MIRA)
    expect(input()).toHaveValue(pointLabel(MIRA))
  })

  it('показывает ошибку у поля', () => {
    render(
      <PointCombobox
        id="point"
        points={FEW}
        value={null}
        onChange={vi.fn()}
        error="Выберите пункт получения"
      />,
    )
    expect(screen.getByText('Выберите пункт получения')).toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-invalid', 'true')
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w web -- components/checkout/PointCombobox.test.tsx`
Expected: FAIL — `Failed to resolve import "./PointCombobox"`.

- [ ] **Step 3: `web/components/checkout/PointCombobox.tsx`**

```tsx
'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import type { CdekPoint } from '@ximi4ka-shop/shared'
import { searchPoints } from '@/lib/cdekPoints'
import {
  ERROR_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  LISTBOX_CLASS,
  optionClass,
} from './fieldStyles'

interface Props {
  id: string
  points: CdekPoint[]
  value: CdekPoint | null
  onChange: (point: CdekPoint) => void
  error?: string
}

// «MSK310 · пр-т Мира, 108» — как строка списка у Тильды.
export function pointLabel(point: Pick<CdekPoint, 'code' | 'address'>): string {
  return point.address ? `${point.code} · ${point.address}` : point.code
}

// «Пункт получения» — список ПВЗ города с поиском по словам (спека §5.1, п. 3).
// Пока список закрыт, в поле — выбранный пункт; при фокусе поле пустеет под
// запрос, а выбранный пункт остаётся в подсказке.
export function PointCombobox({ id, points, value, onChange, error }: Props) {
  const listboxId = useId()
  const optionIdBase = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  const { matches, total } = useMemo(() => searchPoints(points, query), [points, query])
  const optionId = (i: number) => `${optionIdBase}-point-${i}`

  // Выделенная стрелками строка не уходит из видимой части списка.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    document
      .getElementById(`${optionIdBase}-point-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex, optionIdBase])

  function close() {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }

  function choose(point: CdekPoint) {
    close()
    onChange(point)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // Стрелка на закрытом поле открывает список, как у select.
      if (!open) {
        setOpen(true)
        return
      }
      if (matches.length === 0) return
      const down = e.key === 'ArrowDown'
      setActiveIndex((i) => (down ? (i + 1) % matches.length : i <= 0 ? matches.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter' && open) {
      // Enter выбирает пункт, а не отправляет форму заказа.
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < matches.length) choose(matches[activeIndex]!)
      else if (matches.length === 1) choose(matches[0]!)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        Пункт получения *
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          placeholder={value ? pointLabel(value) : 'Код пункта или часть адреса'}
          value={open ? query : value ? pointLabel(value) : ''}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={onKeyDown}
          className={FIELD_CLASS}
        />
        {open && (
          <div className={LISTBOX_CLASS}>
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Пункты выдачи"
              className="m-0 list-none p-0"
            >
              {matches.map((p, i) => (
                <li
                  key={p.code}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  // Клик не уводит фокус из поля: onBlur закрыл бы список раньше выбора.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={optionClass(i === activeIndex)}
                >
                  <span>{pointLabel(p)}</span>
                  {p.workTime && <span className={HINT_CLASS}>{p.workTime}</span>}
                </li>
              ))}
            </ul>
            {total === 0 && (
              <p className={`${HINT_CLASS} px-3 py-3`}>
                Ничего не найдено — попробуйте часть адреса или код пункта
              </p>
            )}
            {total > matches.length && (
              <p className={`${HINT_CLASS} px-3 py-2`}>
                Показаны {matches.length} из {total} — уточните запрос
              </p>
            )}
          </div>
        )}
      </div>
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Тест, типы, линт зелёные**

Run: `npm test -w web -- components/checkout/PointCombobox.test.tsx`
Expected: PASS.
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок.

- [ ] **Step 5: Коммит**

```bash
npx prettier --write web/components/checkout/PointCombobox.tsx web/components/checkout/PointCombobox.test.tsx
git add web/components/checkout/PointCombobox.tsx web/components/checkout/PointCombobox.test.tsx
git commit -m "feat(web): поле «Пункт получения» — список ПВЗ с поиском

Строка «код · адрес» и часы работы, поиск по словам, первые 50 и
«уточните запрос», стрелки, Enter и Esc.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Поля адреса курьера и сборка адреса

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Modify: `web/lib/shipping.ts` (добавить в конец; импорт типов в начале)
- Test: `web/lib/shipping.test.ts`
- Create: `web/components/checkout/CourierFields.tsx`
- Test: `web/components/checkout/CourierFields.test.tsx`

**Interfaces:**

- Consumes: `CdekCity`, `CdekPoint`, `DeliveryDestination`, `DeliveryMethod`, `QuoteDestination` из shared (Tasks 1, 3); классы из `fieldStyles.ts` (Task 5).
- Produces: `CourierAddress { street: string; apartment: string; postalCode: string }`; `EMPTY_COURIER_ADDRESS`; `courierAddressLine(cityName: string, a: CourierAddress): string`; `isPostalCode(value: string): boolean`; `courierDestination(city: Pick<CdekCity,'code'|'name'>, a: CourierAddress)` → `Extract<DeliveryDestination,{method:'cdek_courier'}>`; `pvzDestination(city, point: Pick<CdekPoint,'code'|'address'>)` → `Extract<DeliveryDestination,{method:'cdek_pvz'}>`; `quoteDestination(method: DeliveryMethod, city): QuoteDestination`; `CourierFields({ value, onChange, errors: { street?: string; postalCode?: string } })`.

- [ ] **Step 1: Падающие тесты**

В `web/lib/shipping.test.ts` дополнить импорт:

```ts
import {
  EMPTY_COURIER_ADDRESS,
  courierAddressLine,
  courierDestination,
  destinationFromWidget,
  formatPeriod,
  isPostalCode,
  pvzDestination,
  quoteDestination,
  widgetGoods,
} from './shipping'
```

и в конец файла:

```ts
const MOSCOW = { code: 44, name: 'Москва' }

describe('courierAddressLine', () => {
  it('«город, улица, дом, кв. квартира»', () => {
    expect(
      courierAddressLine('Москва', {
        street: ' Тверская ул., 1 ',
        apartment: '12',
        postalCode: '',
      }),
    ).toBe('Москва, Тверская ул., 1, кв. 12')
  })

  it('без квартиры — без хвостовой запятой', () => {
    expect(
      courierAddressLine('Москва', { ...EMPTY_COURIER_ADDRESS, street: 'Тверская ул., 1' }),
    ).toBe('Москва, Тверская ул., 1')
  })

  it('«кв.», «квартира», «офис», написанные покупателем, не дублируются', () => {
    const line = (apartment: string) =>
      courierAddressLine('Москва', { street: 'Тверская ул., 1', apartment, postalCode: '' })
    expect(line('кв. 12')).toBe('Москва, Тверская ул., 1, кв. 12')
    expect(line('Квартира 7')).toBe('Москва, Тверская ул., 1, Квартира 7')
    expect(line('офис 305')).toBe('Москва, Тверская ул., 1, офис 305')
    expect(line('оф.3')).toBe('Москва, Тверская ул., 1, оф.3')
  })
})

describe('courierDestination', () => {
  it('код города, индекс и собранный адрес', () => {
    expect(
      courierDestination(MOSCOW, {
        street: 'Тверская ул., 1',
        apartment: '12',
        postalCode: '125009',
      }),
    ).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      postalCode: '125009',
      address: 'Москва, Тверская ул., 1, кв. 12',
    })
  })

  it('пустой индекс не отправляется', () => {
    expect(
      courierDestination(MOSCOW, { ...EMPTY_COURIER_ADDRESS, street: 'Тверская ул., 1' }),
    ).not.toHaveProperty('postalCode')
  })
})

describe('pvzDestination', () => {
  it('код пункта, код города и «город, адрес пункта»', () => {
    expect(pvzDestination(MOSCOW, { code: 'MSK310', address: 'пр-т Мира, 108' })).toEqual({
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK310',
      address: 'Москва, пр-т Мира, 108',
    })
  })
})

describe('quoteDestination', () => {
  it('для расчёта хватает города: ПВЗ без пункта, курьер без улицы', () => {
    expect(quoteDestination('cdek_pvz', MOSCOW)).toEqual({
      method: 'cdek_pvz',
      cityCode: 44,
      address: 'Москва',
    })
    expect(quoteDestination('cdek_courier', MOSCOW)).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      address: 'Москва',
    })
  })
})

describe('isPostalCode', () => {
  it('ровно 6 цифр', () => {
    expect(isPostalCode('125009')).toBe(true)
    expect(isPostalCode(' 125009 ')).toBe(true)
    expect(isPostalCode('12500')).toBe(false)
    expect(isPostalCode('12500a')).toBe(false)
  })
})
```

`web/components/checkout/CourierFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { EMPTY_COURIER_ADDRESS, type CourierAddress } from '@/lib/shipping'
import { CourierFields } from './CourierFields'

function Controlled({ onChange }: { onChange: (value: CourierAddress) => void }) {
  const [value, setValue] = useState<CourierAddress>(EMPTY_COURIER_ADDRESS)
  return (
    <CourierFields
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      errors={{}}
    />
  )
}

describe('<CourierFields>', () => {
  it('улица с домом, квартира и индекс собираются в адрес', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.change(screen.getByLabelText(/квартира/i), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })
    expect(onChange).toHaveBeenLastCalledWith({
      street: 'Тверская ул., 1',
      apartment: '12',
      postalCode: '125009',
    })
  })

  it('в индекс попадают только цифры, не больше шести', () => {
    render(<Controlled onChange={vi.fn()} />)
    const postal = screen.getByLabelText(/индекс/i)
    fireEvent.change(postal, { target: { value: '12-50 09 9' } })
    expect(postal).toHaveValue('125009')
  })

  it('показывает ошибки у полей', () => {
    render(
      <CourierFields
        value={{ street: '', apartment: '', postalCode: '123' }}
        onChange={vi.fn()}
        errors={{ street: 'Укажите улицу и дом', postalCode: 'Индекс — 6 цифр' }}
      />,
    )
    expect(screen.getByText('Укажите улицу и дом')).toBeInTheDocument()
    expect(screen.getByText('Индекс — 6 цифр')).toBeInTheDocument()
    expect(screen.getByLabelText(/улица, дом/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w web -- lib/shipping.test.ts components/checkout/CourierFields.test.tsx`
Expected: FAIL — `courierAddressLine is not a function`, `Failed to resolve import "./CourierFields"`.

- [ ] **Step 3: Сборка адресов в `web/lib/shipping.ts`**

Импорт в начале файла заменить на:

```ts
import type {
  CdekCity,
  CdekPoint,
  DeliveryDestination,
  DeliveryMethod,
  QuoteDestination,
  ShippingPackage,
} from '@ximi4ka-shop/shared'
```

В конец файла:

```ts
// Адрес курьера — свои поля под выбранным городом (спека §4.4, §5.1).
export interface CourierAddress {
  street: string
  apartment: string
  postalCode: string
}

export const EMPTY_COURIER_ADDRESS: CourierAddress = { street: '', apartment: '', postalCode: '' }

// «кв. 12», «офис 5»: покупатель уже написал, что это, второй «кв.» не нужен.
// \b с кириллицей не работает, поэтому граница — точка, пробел или конец.
const APARTMENT_PREFIX = /^(кв|квартира|оф|офис)(\.|\s|$)/i

// «<город>, <улица, дом>[, кв. <квартира>]» — так адрес попадает в заказ и в СДЭК.
export function courierAddressLine(cityName: string, a: CourierAddress): string {
  const street = a.street.trim()
  const apartment = a.apartment.trim()
  const flat = apartment === '' || APARTMENT_PREFIX.test(apartment) ? apartment : `кв. ${apartment}`
  return [cityName, street, flat].filter((part) => part !== '').join(', ')
}

export function isPostalCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

export function courierDestination(
  city: Pick<CdekCity, 'code' | 'name'>,
  a: CourierAddress,
): Extract<DeliveryDestination, { method: 'cdek_courier' }> {
  const postalCode = a.postalCode.trim()
  return {
    method: 'cdek_courier',
    cityCode: city.code,
    ...(postalCode !== '' ? { postalCode } : {}),
    address: courierAddressLine(city.name, a),
  }
}

// Адрес ПВЗ в заказе — «<город>, <адрес пункта>», как раньше из виджета.
export function pvzDestination(
  city: Pick<CdekCity, 'code' | 'name'>,
  point: Pick<CdekPoint, 'code' | 'address'>,
): Extract<DeliveryDestination, { method: 'cdek_pvz' }> {
  return {
    method: 'cdek_pvz',
    cityCode: city.code,
    deliveryPointCode: point.code,
    address: `${city.name}, ${point.address}`,
  }
}

// Расчёт до выбора пункта и улицы: цену ПВЗ СДЭК считает по городу, курьера —
// по коду города (api/src/routes/public/shipping.ts).
export function quoteDestination(
  method: DeliveryMethod,
  city: Pick<CdekCity, 'code' | 'name'>,
): QuoteDestination {
  return { method, cityCode: city.code, address: city.name }
}
```

- [ ] **Step 4: `web/components/checkout/CourierFields.tsx`**

```tsx
'use client'

import type { CourierAddress } from '@/lib/shipping'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from './fieldStyles'

interface Props {
  value: CourierAddress
  onChange: (value: CourierAddress) => void
  errors: { street?: string; postalCode?: string }
}

// Адрес курьера под выбранным городом (спека §5.1, п. 4): город уже выбран
// выше, здесь — улица с домом, квартира и индекс. Курьерская вкладка в
// виджете отключена, чтобы адрес вводился в одном месте.
export function CourierFields({ value, onChange, errors }: Props) {
  function set(key: keyof CourierAddress, next: string) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="checkout-street" className={LABEL_CLASS}>
          Улица, дом *
        </label>
        <input
          id="checkout-street"
          type="text"
          autoComplete="address-line1"
          value={value.street}
          onChange={(e) => set('street', e.target.value)}
          aria-invalid={errors.street ? true : undefined}
          className={FIELD_CLASS}
        />
        {errors.street && <p className={ERROR_CLASS}>{errors.street}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="checkout-apartment" className={LABEL_CLASS}>
            Квартира/офис
          </label>
          <input
            id="checkout-apartment"
            type="text"
            autoComplete="address-line2"
            value={value.apartment}
            onChange={(e) => set('apartment', e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="checkout-postal" className={LABEL_CLASS}>
            Индекс
          </label>
          <input
            id="checkout-postal"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={value.postalCode}
            // Только цифры: индекс в России — 6 цифр (§4.4).
            onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-invalid={errors.postalCode ? true : undefined}
            className={FIELD_CLASS}
          />
          {errors.postalCode && <p className={ERROR_CLASS}>{errors.postalCode}</p>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Тесты, типы зелёные**

Run: `npm test -w web -- lib/shipping.test.ts components/checkout/CourierFields.test.tsx`
Expected: PASS.
Run: `npm run typecheck -w web` → без ошибок.

- [ ] **Step 6: Коммит**

```bash
npx prettier --write web/lib/shipping.ts web/lib/shipping.test.ts web/components/checkout/CourierFields.tsx web/components/checkout/CourierFields.test.tsx
git add web/lib/shipping.ts web/lib/shipping.test.ts web/components/checkout/CourierFields.tsx web/components/checkout/CourierFields.test.tsx
git commit -m "feat(web): поля адреса курьера и сборка адреса

«Улица, дом», «Квартира/офис», «Индекс»; адрес «город, улица, кв.»;
ПВЗ и расчёт по городу — из общих функций.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Карта СДЭК управляется списком пунктов

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Modify: `web/lib/shipping.ts` (новый тип после `WidgetTariff`)
- Modify (весь файл): `web/components/checkout/CdekWidget.tsx`
- Test (весь файл): `web/components/checkout/CdekWidget.test.tsx`
- Modify: `web/app/[locale]/(public)/checkout/page.tsx` (вызов `<CdekWidget>`, строки ~302–307)
- Modify: `web/app/[locale]/(public)/checkout/page.test.tsx:19-40` и два курьерских теста

**Interfaces:**

- Consumes: API виджета 4.0.0 — опции `tariffs`, `hideDeliveryOptions`, `forceFilters`, `onReady`, `onChoose(mode, tariff, target)`; методы `updateLocation(location, 10|15|17)`, `selectOffice(code)`, `destroy()`.
- Produces: `WidgetOffice { code: string; city_code: number; city: string; address: string; location: [number, number] }` в `web/lib/shipping.ts`; `CdekWidgetProps { goods, servicePath, tariffPvz: number, cityLocation: [number, number] | null, selectedPoint: { code: string; location: [number, number] } | null, onChoose: (office: WidgetOffice) => void }`; `SELECT_RETRY_MS = 300`, `SELECT_RETRY_FOR_MS = 3_000`.

Курьерская вкладка карты отключается уже в этой задаче. До Task 11 на странице нет курьера: свои поля появятся там, поэтому два теста страницы про курьера через карту удаляются здесь, а новые курьерские тесты добавит Task 11.

- [ ] **Step 1: Падающий тест — новый `CdekWidget.test.tsx` целиком**

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// next/script: onReady — после монтирования, как у уже загруженного
// скрипта; script.outcome меняет исход для отдельных тестов.
const script = vi.hoisted(() => ({ outcome: 'ready' as 'ready' | 'error' | 'pending' }))
vi.mock('next/script', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MockScript({
      onReady,
      onError,
    }: {
      onReady?: () => void
      onError?: (e: unknown) => void
    }) {
      useEffect(() => {
        if (script.outcome === 'ready') onReady?.()
        if (script.outcome === 'error') onError?.(new Error('CDN недоступен'))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    },
  }
})

import { CdekWidget, SELECT_RETRY_FOR_MS, SELECT_RETRY_MS } from './CdekWidget'

interface WidgetConfig {
  apiKey: string
  servicePath: string
  goods: unknown
  tariffs: unknown
  hideDeliveryOptions: unknown
  forceFilters: unknown
  defaultLocation: unknown
  canChoose: boolean
  onReady: () => void
  onChoose: (mode: string, tariff: unknown, target: unknown) => void
}

// Экземпляр виджета так, как его устраивает 4.0.0: геокодер хранит готовый
// адрес запроса с ключом карты; методы — те, которыми пользуемся.
function fakeWidget() {
  return {
    yandexApi: { geocodeSrc: 'https://geocode-maps.yandex.ru/1.x/?apikey=ya-key&lang=ru_RU' },
    updateLocation: vi.fn(async (_location: [number, number], _zoom?: number) => {}),
    selectOffice: vi.fn((_code: string) => {}),
    destroy: vi.fn(),
  }
}

const CITY: [number, number] = [37.6176, 55.7558]
const POINT = { code: 'MSK65', location: [37.6634, 55.7335] as [number, number] }
const OFFICE = {
  code: 'MSK310',
  city_code: 44,
  city: 'Москва',
  address: 'пр-т Мира, 108',
  location: [37.6385, 55.8061] as [number, number],
}

const props = {
  goods: [{ weight: 180, length: 10, width: 10, height: 4 }],
  servicePath: 'https://shop/api/public/cdek/widget?subtotal=1000',
  tariffPvz: 136,
  cityLocation: null,
  selectedPoint: null,
  onChoose: vi.fn(),
}

describe('<CdekWidget>', () => {
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const ORIGINAL_GEO_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
  let instance: ReturnType<typeof fakeWidget>
  let ctor: ReturnType<typeof vi.fn>
  const config = () => ctor.mock.calls[0]![0] as WidgetConfig

  function renderReady(extra: Partial<typeof props> = {}) {
    const view = render(<CdekWidget {...props} {...extra} />)
    act(() => config().onReady())
    return view
  }

  beforeEach(() => {
    script.outcome = 'ready'
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    instance = fakeWidget()
    // Вызывается через new: возвращённый объект становится экземпляром.
    ctor = vi.fn(function () {
      return instance
    })
    ;(window as unknown as { CDEKWidget: unknown }).CDEKWidget = ctor
  })

  afterEach(() => {
    vi.useRealTimers()
    if (ORIGINAL_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = ORIGINAL_KEY
    if (ORIGINAL_GEO_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = ORIGINAL_GEO_KEY
    delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
  })

  it('без ключа Яндекс.Карт не грузит виджет', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    render(<CdekWidget {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent(/карта недоступна/i)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('создаёт виджет с нашими местами, прокси, тарифом ПВЗ и ключом', () => {
    render(<CdekWidget {...props} />)
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(config()).toMatchObject({
      apiKey: 'ya-key',
      servicePath: props.servicePath,
      goods: props.goods,
      canChoose: true,
      lang: 'rus',
      currency: 'RUB',
    })
  })

  it('только ПВЗ: курьерской вкладки и постаматов на карте нет', () => {
    render(<CdekWidget {...props} />)
    expect(config()).toMatchObject({
      tariffs: { office: [136], door: [], pickup: [] },
      hideDeliveryOptions: { office: false, door: true },
      forceFilters: { type: 'PVZ' },
    })
  })

  it('отдаёт наружу пункт, выбранный на карте; выбор курьера игнорирует', () => {
    const onChoose = vi.fn()
    render(<CdekWidget {...props} onChoose={onChoose} />)
    config().onChoose('office', { tariff_code: 136 }, OFFICE)
    config().onChoose('door', null, { formatted: 'Москва, Тверская, 1' })
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose).toHaveBeenCalledWith(OFFICE)
  })

  it('центр карты — координаты: выбранный пункт, иначе город, иначе Москва', () => {
    const a = render(<CdekWidget {...props} cityLocation={CITY} selectedPoint={POINT} />)
    expect(config().defaultLocation).toEqual(POINT.location)
    a.unmount()
    const b = render(<CdekWidget {...props} cityLocation={CITY} />)
    expect((ctor.mock.calls[1]![0] as WidgetConfig).defaultLocation).toEqual(CITY)
    b.unmount()
    render(<CdekWidget {...props} />)
    const fallback = (ctor.mock.calls[2]![0] as WidgetConfig).defaultLocation
    expect(Array.isArray(fallback)).toBe(true)
    expect(fallback).toHaveLength(2)
  })

  it('список → карта: центр на пункте, selectOffice сразу и каждые 300 мс до 3 с', () => {
    vi.useFakeTimers()
    const view = renderReady()
    view.rerender(<CdekWidget {...props} selectedPoint={POINT} />)
    expect(instance.updateLocation).toHaveBeenCalledWith(POINT.location, 17)
    expect(instance.selectOffice).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(SELECT_RETRY_MS))
    expect(instance.selectOffice).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(SELECT_RETRY_FOR_MS))
    const calls = 1 + SELECT_RETRY_FOR_MS / SELECT_RETRY_MS
    expect(instance.selectOffice).toHaveBeenCalledTimes(calls)
    act(() => vi.advanceTimersByTime(5_000))
    expect(instance.selectOffice).toHaveBeenCalledTimes(calls)
    expect(instance.selectOffice).toHaveBeenCalledWith('MSK65')
  })

  it('до готовности виджета карту не трогаем, после — догоняем выбранный пункт', () => {
    render(<CdekWidget {...props} selectedPoint={POINT} />)
    expect(instance.updateLocation).not.toHaveBeenCalled()
    act(() => config().onReady())
    expect(instance.updateLocation).toHaveBeenCalledWith(POINT.location, 17)
  })

  it('смена города — центр города, масштаб 10; с выбранным пунктом карту ведёт пункт', () => {
    const view = renderReady()
    view.rerender(<CdekWidget {...props} cityLocation={CITY} />)
    expect(instance.updateLocation).toHaveBeenLastCalledWith(CITY, 10)
    instance.updateLocation.mockClear()
    view.rerender(<CdekWidget {...props} cityLocation={[30.3, 59.9]} selectedPoint={POINT} />)
    expect(instance.updateLocation).not.toHaveBeenCalledWith([30.3, 59.9], 10)
    expect(instance.updateLocation).toHaveBeenCalledWith(POINT.location, 17)
  })

  it('пункт, выбранный на самой карте, не центрируется и не выбирается повторно', () => {
    const view = renderReady()
    act(() => config().onChoose('office', { tariff_code: 136 }, OFFICE))
    view.rerender(
      <CdekWidget {...props} selectedPoint={{ code: OFFICE.code, location: OFFICE.location }} />,
    )
    expect(instance.updateLocation).not.toHaveBeenCalled()
    expect(instance.selectOffice).not.toHaveBeenCalled()
  })

  it.each([
    ['нажал на карту', (el: HTMLElement) => fireEvent.pointerDown(el)],
    ['крутит колесо', (el: HTMLElement) => fireEvent.wheel(el)],
    ['жмёт клавиши на карте', (el: HTMLElement) => fireEvent.keyDown(el, { key: '+' })],
    ['коснулся карты пальцем', (el: HTMLElement) => fireEvent.touchStart(el)],
  ])('покупатель %s — повтор selectOffice прекращается и не спорит с ним', (_what, touch) => {
    vi.useFakeTimers()
    const view = renderReady()
    view.rerender(<CdekWidget {...props} selectedPoint={POINT} />)
    touch(screen.getByLabelText('Карта пунктов выдачи СДЭК'))
    act(() => vi.advanceTimersByTime(SELECT_RETRY_FOR_MS))
    expect(instance.selectOffice).toHaveBeenCalledTimes(1)
  })

  it('скрипт уже загружен — виджет создаётся при монтировании, без onReady скрипта', () => {
    script.outcome = 'pending'
    render(<CdekWidget {...props} />)
    expect(ctor).toHaveBeenCalledTimes(1)
  })

  it('размонтирование уничтожает экземпляр: хранилище у виджетов общее', () => {
    const view = render(<CdekWidget {...props} />)
    view.unmount()
    expect(instance.destroy).toHaveBeenCalledTimes(1)
  })

  it('подставляет отдельный ключ HTTP Геокодера, если он задан', () => {
    process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = 'geo-key'
    render(<CdekWidget {...props} />)
    const url = new URL(instance.yandexApi.geocodeSrc)
    expect(url.searchParams.get('apikey')).toBe('geo-key')
    expect(url.searchParams.get('lang')).toBe('ru_RU')
  })

  it('без ключа геокодера оставляет общий ключ карты', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY
    render(<CdekWidget {...props} />)
    expect(new URL(instance.yandexApi.geocodeSrc).searchParams.get('apikey')).toBe('ya-key')
  })

  it('не падает, если у виджета другая внутренняя структура', () => {
    process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY = 'geo-key'
    ctor.mockImplementation(function () {
      return {}
    })
    expect(() => render(<CdekWidget {...props} />)).not.toThrow()
  })
})
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -w web -- components/checkout/CdekWidget.test.tsx`
Expected: FAIL — `SELECT_RETRY_MS` не экспортирован, `tariffs.door` — `[137]`, `updateLocation` не вызывается.

- [ ] **Step 3: Тип пункта из виджета**

В `web/lib/shipping.ts` после `WidgetTariff`:

```ts
// Пункт, который виджет отдаёт в onChoose('office', …) — iOffice из
// dist/cdek-widget.es.d.ts 4.0.0. Берём только то, что используем.
export interface WidgetOffice {
  code: string
  city_code: number
  city: string
  address: string
  location: [number, number]
}
```

- [ ] **Step 4: Новый `web/components/checkout/CdekWidget.tsx` целиком**

```tsx
'use client'

import Script from 'next/script'
import { useEffect, useId, useRef, useState } from 'react'
import type { WidgetOffice } from '@/lib/shipping'

// Версия закреплена точно: у протокола между виджетом и нашим прокси
// (api/src/routes/public/cdek-widget.ts) нет отдельной спецификации, и новая
// версия может его поменять. Обновлять вместе с WIDGET_SERVICE_VERSION.
const WIDGET_SRC = 'https://cdn.jsdelivr.net/npm/@cdek-it/widget@4.0.0/dist/cdek-widget.umd.js'

// selectOffice находит только пункты, уже загруженные для видимой области, а
// виджет подгружает их примерно через 500 мс после сдвига карты. Узнать, что
// пункт нашёлся, нельзя (метод ничего не возвращает), поэтому повторяем его
// каждые 300 мс до 3 с (спека §5.2); повтор уже выбранного пункта ничего не
// меняет.
export const SELECT_RETRY_MS = 300
export const SELECT_RETRY_FOR_MS = 3_000
// Действия покупателя на карте, после которых повтор selectOffice
// прекращается: мышь, палец, колесо, клавиши масштаба.
const USER_MAP_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const

type LngLat = [number, number]

// То, чем пользуемся у экземпляра @cdek-it/widget 4.0.0
// (dist/cdek-widget.es.d.ts). Масштаб: 10 — город, 17 — дом.
interface WidgetInstance {
  updateLocation(location: LngLat, zoom?: 10 | 15 | 17): Promise<void>
  selectOffice(code: string): void
  destroy(): void
}

export interface CdekWidgetProps {
  goods: { weight: number; length: number; width: number; height: number }[]
  servicePath: string
  tariffPvz: number
  // Центр выбранного города; null — город не выбран или СДЭК не знает координат.
  cityLocation: LngLat | null
  selectedPoint: { code: string; location: LngLat } | null
  onChoose: (office: WidgetOffice) => void
}

// Центр Москвы, [долгота, широта] — формат defaultLocation у виджета.
// Координаты, а не строка 'Москва': строку виджет геокодирует прямо в
// конструкторе, до того как мы успеем подставить ключ геокодера (см. ниже).
const MOSCOW_CENTER: LngLat = [37.6176, 55.7558]

// Виджет 4.0.0 подписывает одним apiKey и загрузку карты (JavaScript API), и
// запросы к HTTP Геокодеру (поиск). В кабинете Яндекса это два разных ключа,
// а отдельной опции у виджета нет, поэтому адрес геокодера переписываем на
// готовом экземпляре. Поле yandexApi.geocodeSrc в сборке не минифицировано;
// версия виджета закреплена, так что поле не уедет без нашего ведома. Если
// структура другая — молча оставляем общий ключ.
function applyGeocoderKey(widget: unknown, geocoderKey: string | undefined): void {
  if (!geocoderKey) return
  const api = (widget as { yandexApi?: { geocodeSrc?: unknown } } | null)?.yandexApi
  if (!api || typeof api.geocodeSrc !== 'string') return
  try {
    const url = new URL(api.geocodeSrc)
    url.searchParams.set('apikey', geocoderKey)
    api.geocodeSrc = url.toString()
  } catch {
    // Не URL — не трогаем.
  }
}

function destroyWidget(ref: { current: WidgetInstance | null }): void {
  const widget = ref.current
  ref.current = null
  try {
    widget?.destroy()
  } catch {
    // Виджет не успел смонтироваться — убирать нечего.
  }
}

declare global {
  interface Window {
    CDEKWidget?: new (config: Record<string, unknown>) => unknown
  }
}

// Карта ПВЗ, которой управляет чекаут (спека §5.2): город и выбранный пункт
// приходят пропсами (список → карта), «Выбрать» на карте уходит в onChoose
// (карта → список). Хранилища виджета (pinia) общие для всех экземпляров,
// поэтому экземпляр один, а при размонтировании он уничтожается.
export function CdekWidget({
  goods,
  servicePath,
  tariffPvz,
  cityLocation,
  selectedPoint,
  onChoose,
}: CdekWidgetProps) {
  const rootId = `cdek-map-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const widgetRef = useRef<WidgetInstance | null>(null)
  const [ready, setReady] = useState(false)
  const onChooseRef = useRef(onChoose)
  // Последние город и пункт: центр при создании виджета и данные для
  // эффектов синхронизации.
  const latestRef = useRef({ cityLocation, selectedPoint })
  // Код пункта, который покупатель выбрал на самой карте: он уже выделен,
  // центрировать и выбирать его заново не нужно.
  const chosenOnMapRef = useRef<string | null>(null)
  const stopRetryRef = useRef<(() => void) | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onChooseRef.current = onChoose
    latestRef.current = { cityLocation, selectedPoint }
  })

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY

  function create() {
    if (widgetRef.current || !window.CDEKWidget) return
    const { cityLocation: city, selectedPoint: point } = latestRef.current
    const widget = new window.CDEKWidget({
      root: rootId,
      apiKey,
      servicePath,
      from: 'Москва',
      defaultLocation: point?.location ?? city ?? MOSCOW_CENTER,
      canChoose: true,
      goods,
      lang: 'rus',
      currency: 'RUB',
      // Только ПВЗ: адрес курьера вводится своими полями под городом, чтобы он
      // был в одном месте (§5.2). Постаматы — вне задачи (§3): у них свои
      // тарифы и ячейки, куда наши коробки проходят не всегда.
      tariffs: { office: [tariffPvz], door: [], pickup: [] },
      hideDeliveryOptions: { office: false, door: true },
      forceFilters: { type: 'PVZ' },
      // Наличные и карта в ПВЗ не нужны — заказ оплачен онлайн.
      hideFilters: { have_cash: true, have_cashless: true, is_dressing_room: true, type: true },
      onReady: () => setReady(true),
      onChoose: (mode: string, _tariff: unknown, target: WidgetOffice) => {
        if (mode !== 'office') return
        chosenOnMapRef.current = target.code
        onChooseRef.current(target)
      },
    }) as WidgetInstance
    widgetRef.current = widget
    applyGeocoderKey(widget, process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY)
  }

  // Скрипт уже загружен (карту показали снова, или React в разработке
  // перемонтировал компонент): второго onReady от next/script может не быть,
  // поэтому создаём сами. При размонтировании экземпляр уничтожаем.
  useEffect(() => {
    if (apiKey) create()
    return () => {
      stopRetryRef.current?.()
      destroyWidget(widgetRef)
    }
    // Только на монтирование: create берёт свежие пропсы из latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cityKey = cityLocation ? cityLocation.join(',') : null
  const pointCode = selectedPoint?.code ?? null

  // Смена города — центр города, общий масштаб. Если пункт выбран, карту
  // ведёт он (эффект ниже).
  useEffect(() => {
    const widget = widgetRef.current
    const { cityLocation: city, selectedPoint: point } = latestRef.current
    if (!ready || !widget || !city || point) return
    chosenOnMapRef.current = null
    widget.updateLocation(city, 10).catch(() => {})
  }, [ready, cityKey, pointCode])

  // Список → карта: центр на пункте, затем selectOffice с повтором.
  // selectOffice не вызывает onChoose, петли нет.
  useEffect(() => {
    const widget = widgetRef.current
    const point = latestRef.current.selectedPoint
    if (!ready || !widget || !point) return
    if (chosenOnMapRef.current === point.code) {
      chosenOnMapRef.current = null
      return
    }
    const select = () => {
      try {
        widget.selectOffice(point.code)
      } catch {
        // Виджет ещё не готов принять выбор — попробуем на следующем шаге.
      }
    }
    widget.updateLocation(point.location, 17).catch(() => {})
    select()
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      select()
      if (attempts * SELECT_RETRY_MS >= SELECT_RETRY_FOR_MS) clearInterval(timer)
    }, SELECT_RETRY_MS)
    const stop = () => clearInterval(timer)
    stopRetryRef.current = stop
    return stop
  }, [ready, pointCode])

  // Покупатель сам двигает или масштабирует карту — повтор selectOffice больше
  // не возвращает её к пункту и не спорит с ним. Слушаем на погружении:
  // Яндекс.Карты могут останавливать всплытие своих событий, и обработчики
  // React (onWheel и т. п.) их бы не увидели.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const stop = () => stopRetryRef.current?.()
    for (const type of USER_MAP_EVENTS) {
      root.addEventListener(type, stop, { capture: true, passive: true })
    }
    return () => {
      for (const type of USER_MAP_EVENTS) root.removeEventListener(type, stop, { capture: true })
    }
  }, [])

  if (!apiKey) {
    return (
      <p
        role="status"
        className="border border-[var(--color-lj-rule)] px-4 py-6 font-lj-body text-base text-[var(--color-lj-ink)] opacity-80"
      >
        Карта недоступна: не настроен ключ Яндекс.Карт. Напишите нам — оформим доставку вручную.
      </p>
    )
  }

  return (
    <>
      <Script src={WIDGET_SRC} strategy="afterInteractive" onReady={create} />
      <div
        id={rootId}
        ref={rootRef}
        className="w-full h-[420px] md:h-[560px] border border-[var(--color-lj-rule)] bg-white"
        aria-label="Карта пунктов выдачи СДЭК"
      />
    </>
  )
}
```

- [ ] **Step 5: Переходник на странице и в её тесте**

В `web/app/[locale]/(public)/checkout/page.tsx` заменить вызов:

```tsx
<CdekWidget
  goods={widgetGoods(shipping.packages)}
  servicePath={cdekWidgetServicePath(shipping.subtotalRub)}
  tariffs={shipping.tariffs}
  onChoose={handleChoose}
/>
```

на:

```tsx
<CdekWidget
  goods={widgetGoods(shipping.packages)}
  servicePath={cdekWidgetServicePath(shipping.subtotalRub)}
  tariffPvz={shipping.tariffs.pvz}
  cityLocation={null}
  selectedPoint={null}
  onChoose={(office) => void handleChoose('office', null, office)}
/>
```

Это временно, до Task 11. `WidgetOffice` содержит все поля `WidgetOfficeAddress`, поэтому `handleChoose` принимает его как есть.

В `web/app/[locale]/(public)/checkout/page.test.tsx`:

- строки 19–40 (константы `OFFICE`, `DOOR` и `vi.mock('@/components/checkout/CdekWidget', …)`) заменить на:

```tsx
// Виджет СДЭК — внешний скрипт с картой; в тестах вместо него кнопка,
// которая отдаёт пункт так же, как настоящий onChoose.
const OFFICE = {
  city_code: 270,
  city: 'Новосибирск',
  code: 'NSK1',
  address: 'ул. Кривощековская, 15',
  location: [82.9346, 55.0415],
}

vi.mock('@/components/checkout/CdekWidget', () => ({
  CdekWidget: ({ onChoose }: { onChoose: (office: unknown) => void }) => (
    <button type="button" onClick={() => onChoose(OFFICE)}>
      Выбрать ПВЗ на карте
    </button>
  ),
}))
```

- удалить тесты `'курьер: спрашивает квартиру и считает свою цену'` и `'курьерский заказ уходит с геокодированным адресом и квартирой'`: курьера через карту больше нет, свои поля курьера и их тесты добавит Task 11.

- [ ] **Step 6: Тесты, типы, линт зелёные**

Run: `npm test -w web -- components/checkout checkout/page.test.tsx`
Expected: PASS.
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок.

- [ ] **Step 7: Коммит**

```bash
npx prettier --write web/lib/shipping.ts web/components/checkout/CdekWidget.tsx web/components/checkout/CdekWidget.test.tsx "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx"
git add web/lib/shipping.ts web/components/checkout/CdekWidget.tsx web/components/checkout/CdekWidget.test.tsx "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx"
git commit -m "feat(web): карта СДЭК управляется списком пунктов

Экземпляр виджета в ref: город и выбранный пункт приходят пропсами,
selectOffice повторяется до 3 с, «Выбрать» на карте отдаёт пункт наружу.
Только ПВЗ: курьерская вкладка и постаматы на карте отключены.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Без карты — строка вместо карты и кнопка на телефоне

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Modify (весь файл): `web/components/checkout/CdekWidget.tsx`
- Test: `web/components/checkout/CdekWidget.test.tsx` (заменить первый тест, добавить новые)
- Create: `web/components/checkout/PvzMap.tsx`
- Test: `web/components/checkout/PvzMap.test.tsx`

**Interfaces:**

- Consumes: `CdekWidget`, `CdekWidgetProps` (Task 8).
- Produces: `MAP_READY_TIMEOUT_MS = 10_000`, `MAP_UNAVAILABLE_TEXT = 'Карта недоступна — выберите пункт из списка'` из `CdekWidget.tsx`; `PvzMap(props: CdekWidgetProps)` и `MAP_INLINE_QUERY = '(min-width: 768px)'` из `PvzMap.tsx`.

- [ ] **Step 1: Падающие тесты**

В `web/components/checkout/CdekWidget.test.tsx`:

- импорт компонента заменить на:

```tsx
import {
  CdekWidget,
  MAP_READY_TIMEOUT_MS,
  MAP_UNAVAILABLE_TEXT,
  SELECT_RETRY_FOR_MS,
  SELECT_RETRY_MS,
} from './CdekWidget'
```

- мок `next/script` запоминает последний `onReady`, чтобы вызвать его «с опозданием»: `vi.hoisted` и тело `MockScript` заменить на

```tsx
const script = vi.hoisted(() => ({
  outcome: 'ready' as 'ready' | 'error' | 'pending',
  onReady: null as null | (() => void),
}))
vi.mock('next/script', async () => {
  const { useEffect } = await import('react')
  return {
    default: function MockScript({
      onReady,
      onError,
    }: {
      onReady?: () => void
      onError?: (e: unknown) => void
    }) {
      // Запоминаем в эффекте, а не в рендере: мутация внешнего объекта в
      // рендере — нарушение правил хуков.
      useEffect(() => {
        script.onReady = onReady ?? null
      })
      useEffect(() => {
        if (script.outcome === 'ready') onReady?.()
        if (script.outcome === 'error') onError?.(new Error('CDN недоступен'))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    },
  }
})
```

и в `beforeEach` добавить `script.onReady = null`;

- тест `'без ключа Яндекс.Карт не грузит виджет'` заменить на шесть тестов:

```tsx
it('без ключа Яндекс.Карт — строка вместо карты, виджет не грузится', () => {
  delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  render(<CdekWidget {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
  expect(MAP_UNAVAILABLE_TEXT).toBe('Карта недоступна — выберите пункт из списка')
  expect(ctor).not.toHaveBeenCalled()
})

it('скрипт не загрузился (onError) — строка вместо карты', () => {
  script.outcome = 'error'
  delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
  render(<CdekWidget {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
})

it('10 с без готовности виджета — строка вместо карты, экземпляр убран', () => {
  vi.useFakeTimers()
  render(<CdekWidget {...props} />)
  act(() => vi.advanceTimersByTime(MAP_READY_TIMEOUT_MS - 1))
  expect(screen.queryByRole('status')).toBeNull()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
  expect(instance.destroy).toHaveBeenCalledTimes(1)
})

it('виджет успел подготовиться — строка не появляется', () => {
  vi.useFakeTimers()
  renderReady()
  act(() => vi.advanceTimersByTime(MAP_READY_TIMEOUT_MS * 2))
  expect(screen.queryByRole('status')).toBeNull()
})

it('после 10 с запоздавший onReady скрипта виджет уже не создаёт', () => {
  vi.useFakeTimers()
  script.outcome = 'pending'
  delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
  render(<CdekWidget {...props} />)
  act(() => vi.advanceTimersByTime(MAP_READY_TIMEOUT_MS))
  expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
  // Скрипт всё-таки догрузился и зовёт onReady последнего рендера.
  ;(window as unknown as { CDEKWidget: unknown }).CDEKWidget = ctor
  act(() => script.onReady?.())
  expect(ctor).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
})

it('конструктор виджета упал — строка вместо карты, страница не падает', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ctor.mockImplementation(function () {
    throw new Error('битая сборка')
  })
  expect(() => render(<CdekWidget {...props} />)).not.toThrow()
  expect(screen.getByRole('status')).toHaveTextContent(MAP_UNAVAILABLE_TEXT)
})
```

В `afterEach` этого файла добавить `vi.restoreAllMocks()` — чтобы шпион `console.warn` не пережил тест.

`web/components/checkout/PvzMap.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('./CdekWidget', () => ({
  CdekWidget: () => <div data-testid="cdek-widget" />,
}))

import { MAP_INLINE_QUERY, PvzMap } from './PvzMap'

const props = {
  goods: [],
  servicePath: 'https://shop/api/public/cdek/widget?subtotal=1000',
  tariffPvz: 136,
  cityLocation: null,
  selectedPoint: null,
  onChoose: vi.fn(),
}

function stubMatchMedia(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches, media: query }))
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })
  return matchMedia
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('<PvzMap>', () => {
  it('на телефоне карта за кнопкой: виджет и скрипты — только по нажатию', () => {
    const matchMedia = stubMatchMedia(false)
    render(<PvzMap {...props} />)
    expect(matchMedia).toHaveBeenCalledWith(MAP_INLINE_QUERY)
    expect(MAP_INLINE_QUERY).toBe('(min-width: 768px)')
    expect(screen.queryByTestId('cdek-widget')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Показать на карте' }))
    expect(screen.getByTestId('cdek-widget')).toBeInTheDocument()
  })

  it('от 768 px карта сразу', () => {
    stubMatchMedia(true)
    render(<PvzMap {...props} />)
    expect(screen.getByTestId('cdek-widget')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать на карте' })).toBeNull()
  })

  it('без matchMedia (старый браузер) — карта сразу', () => {
    render(<PvzMap {...props} />)
    expect(screen.getByTestId('cdek-widget')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w web -- components/checkout/CdekWidget.test.tsx components/checkout/PvzMap.test.tsx`
Expected: FAIL — `MAP_READY_TIMEOUT_MS` не экспортирован, `Failed to resolve import "./PvzMap"`.

- [ ] **Step 3: Новый `web/components/checkout/CdekWidget.tsx` целиком**

Файл из Task 8 с тремя изменениями: константы недоступности, состояние `unavailable` с таймером готовности и `onError` у скрипта. Строка вместо карты теперь одна для всех трёх случаев.

```tsx
'use client'

import Script from 'next/script'
import { useEffect, useId, useRef, useState } from 'react'
import type { WidgetOffice } from '@/lib/shipping'

// Версия закреплена точно: у протокола между виджетом и нашим прокси
// (api/src/routes/public/cdek-widget.ts) нет отдельной спецификации, и новая
// версия может его поменять. Обновлять вместе с WIDGET_SERVICE_VERSION.
const WIDGET_SRC = 'https://cdn.jsdelivr.net/npm/@cdek-it/widget@4.0.0/dist/cdek-widget.umd.js'

// selectOffice находит только пункты, уже загруженные для видимой области, а
// виджет подгружает их примерно через 500 мс после сдвига карты. Узнать, что
// пункт нашёлся, нельзя (метод ничего не возвращает), поэтому повторяем его
// каждые 300 мс до 3 с (спека §5.2); повтор уже выбранного пункта ничего не
// меняет.
export const SELECT_RETRY_MS = 300
export const SELECT_RETRY_FOR_MS = 3_000
// Действия покупателя на карте, после которых повтор selectOffice
// прекращается: мышь, палец, колесо, клавиши масштаба.
const USER_MAP_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const

// Сколько ждём готовности виджета, прежде чем показать строку вместо карты:
// завис скрипт или Яндекс не отдал карту (§5.2). Чекаут без карты не
// блокируется — пункт выбирают из списка.
export const MAP_READY_TIMEOUT_MS = 10_000
export const MAP_UNAVAILABLE_TEXT = 'Карта недоступна — выберите пункт из списка'

type LngLat = [number, number]

// То, чем пользуемся у экземпляра @cdek-it/widget 4.0.0
// (dist/cdek-widget.es.d.ts). Масштаб: 10 — город, 17 — дом.
interface WidgetInstance {
  updateLocation(location: LngLat, zoom?: 10 | 15 | 17): Promise<void>
  selectOffice(code: string): void
  destroy(): void
}

export interface CdekWidgetProps {
  goods: { weight: number; length: number; width: number; height: number }[]
  servicePath: string
  tariffPvz: number
  // Центр выбранного города; null — город не выбран или СДЭК не знает координат.
  cityLocation: LngLat | null
  selectedPoint: { code: string; location: LngLat } | null
  onChoose: (office: WidgetOffice) => void
}

// Центр Москвы, [долгота, широта] — формат defaultLocation у виджета.
// Координаты, а не строка 'Москва': строку виджет геокодирует прямо в
// конструкторе, до того как мы успеем подставить ключ геокодера (см. ниже).
const MOSCOW_CENTER: LngLat = [37.6176, 55.7558]

// Виджет 4.0.0 подписывает одним apiKey и загрузку карты (JavaScript API), и
// запросы к HTTP Геокодеру (поиск). В кабинете Яндекса это два разных ключа,
// а отдельной опции у виджета нет, поэтому адрес геокодера переписываем на
// готовом экземпляре. Поле yandexApi.geocodeSrc в сборке не минифицировано;
// версия виджета закреплена, так что поле не уедет без нашего ведома. Если
// структура другая — молча оставляем общий ключ.
function applyGeocoderKey(widget: unknown, geocoderKey: string | undefined): void {
  if (!geocoderKey) return
  const api = (widget as { yandexApi?: { geocodeSrc?: unknown } } | null)?.yandexApi
  if (!api || typeof api.geocodeSrc !== 'string') return
  try {
    const url = new URL(api.geocodeSrc)
    url.searchParams.set('apikey', geocoderKey)
    api.geocodeSrc = url.toString()
  } catch {
    // Не URL — не трогаем.
  }
}

function destroyWidget(ref: { current: WidgetInstance | null }): void {
  const widget = ref.current
  ref.current = null
  try {
    widget?.destroy()
  } catch {
    // Виджет не успел смонтироваться — убирать нечего.
  }
}

declare global {
  interface Window {
    CDEKWidget?: new (config: Record<string, unknown>) => unknown
  }
}

// Карта ПВЗ, которой управляет чекаут (спека §5.2): город и выбранный пункт
// приходят пропсами (список → карта), «Выбрать» на карте уходит в onChoose
// (карта → список). Хранилища виджета (pinia) общие для всех экземпляров,
// поэтому экземпляр один, а при размонтировании он уничтожается.
export function CdekWidget({
  goods,
  servicePath,
  tariffPvz,
  cityLocation,
  selectedPoint,
  onChoose,
}: CdekWidgetProps) {
  const rootId = `cdek-map-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  const widgetRef = useRef<WidgetInstance | null>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(!apiKey)
  // То же, что unavailable, но видно сразу и в колбэках: next/script может
  // вызвать onReady уже после того, как карта признана недоступной, и тогда
  // виджет не должен создаваться.
  const unavailableRef = useRef(!apiKey)
  const onChooseRef = useRef(onChoose)
  // Последние город и пункт: центр при создании виджета и данные для
  // эффектов синхронизации.
  const latestRef = useRef({ cityLocation, selectedPoint })
  // Код пункта, который покупатель выбрал на самой карте: он уже выделен,
  // центрировать и выбирать его заново не нужно.
  const chosenOnMapRef = useRef<string | null>(null)
  const stopRetryRef = useRef<(() => void) | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onChooseRef.current = onChoose
    latestRef.current = { cityLocation, selectedPoint }
  })

  function create() {
    if (unavailableRef.current || widgetRef.current || !window.CDEKWidget) return
    const { cityLocation: city, selectedPoint: point } = latestRef.current
    let widget: WidgetInstance
    try {
      widget = new window.CDEKWidget({
        root: rootId,
        apiKey,
        servicePath,
        from: 'Москва',
        defaultLocation: point?.location ?? city ?? MOSCOW_CENTER,
        canChoose: true,
        goods,
        lang: 'rus',
        currency: 'RUB',
        // Только ПВЗ: адрес курьера вводится своими полями под городом, чтобы он
        // был в одном месте (§5.2). Постаматы — вне задачи (§3): у них свои
        // тарифы и ячейки, куда наши коробки проходят не всегда.
        tariffs: { office: [tariffPvz], door: [], pickup: [] },
        hideDeliveryOptions: { office: false, door: true },
        forceFilters: { type: 'PVZ' },
        // Наличные и карта в ПВЗ не нужны — заказ оплачен онлайн.
        hideFilters: { have_cash: true, have_cashless: true, is_dressing_room: true, type: true },
        onReady: () => setReady(true),
        onChoose: (mode: string, _tariff: unknown, target: WidgetOffice) => {
          if (mode !== 'office') return
          chosenOnMapRef.current = target.code
          onChooseRef.current(target)
        },
      }) as WidgetInstance
    } catch (err) {
      // Конструктор упал (битая сборка на CDN, несовместимые настройки) —
      // карты не будет, список работает.
      console.warn('cdek widget: не создался —', err instanceof Error ? err.message : err)
      unavailableRef.current = true
      setUnavailable(true)
      return
    }
    widgetRef.current = widget
    applyGeocoderKey(widget, process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY)
  }

  // Скрипт уже загружен (карту показали снова, или React в разработке
  // перемонтировал компонент): второго onReady от next/script может не быть,
  // поэтому создаём сами. При размонтировании экземпляр уничтожаем.
  useEffect(() => {
    if (apiKey) create()
    return () => {
      stopRetryRef.current?.()
      destroyWidget(widgetRef)
    }
    // Только на монтирование: create берёт свежие пропсы из latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Нет готовности за 10 с — вместо карты строка, список работает (§5.2).
  useEffect(() => {
    if (ready || unavailable) return
    const timer = setTimeout(() => {
      unavailableRef.current = true
      stopRetryRef.current?.()
      destroyWidget(widgetRef)
      setUnavailable(true)
    }, MAP_READY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [ready, unavailable])

  const cityKey = cityLocation ? cityLocation.join(',') : null
  const pointCode = selectedPoint?.code ?? null

  // Смена города — центр города, общий масштаб. Если пункт выбран, карту
  // ведёт он (эффект ниже).
  useEffect(() => {
    const widget = widgetRef.current
    const { cityLocation: city, selectedPoint: point } = latestRef.current
    if (!ready || !widget || !city || point) return
    chosenOnMapRef.current = null
    widget.updateLocation(city, 10).catch(() => {})
  }, [ready, cityKey, pointCode])

  // Список → карта: центр на пункте, затем selectOffice с повтором.
  // selectOffice не вызывает onChoose, петли нет.
  useEffect(() => {
    const widget = widgetRef.current
    const point = latestRef.current.selectedPoint
    if (!ready || !widget || !point) return
    if (chosenOnMapRef.current === point.code) {
      chosenOnMapRef.current = null
      return
    }
    const select = () => {
      try {
        widget.selectOffice(point.code)
      } catch {
        // Виджет ещё не готов принять выбор — попробуем на следующем шаге.
      }
    }
    widget.updateLocation(point.location, 17).catch(() => {})
    select()
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      select()
      if (attempts * SELECT_RETRY_MS >= SELECT_RETRY_FOR_MS) clearInterval(timer)
    }, SELECT_RETRY_MS)
    const stop = () => clearInterval(timer)
    stopRetryRef.current = stop
    return stop
  }, [ready, pointCode])

  // Покупатель сам двигает или масштабирует карту — повтор selectOffice больше
  // не возвращает её к пункту и не спорит с ним. Слушаем на погружении:
  // Яндекс.Карты могут останавливать всплытие своих событий, и обработчики
  // React (onWheel и т. п.) их бы не увидели.
  // Корень карты появляется и пропадает вместе с unavailable.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const stop = () => stopRetryRef.current?.()
    for (const type of USER_MAP_EVENTS) {
      root.addEventListener(type, stop, { capture: true, passive: true })
    }
    return () => {
      for (const type of USER_MAP_EVENTS) root.removeEventListener(type, stop, { capture: true })
    }
  }, [unavailable])

  if (unavailable) {
    return (
      <p
        role="status"
        className="border border-[var(--color-lj-rule)] px-4 py-6 font-lj-body text-base text-[var(--color-lj-ink)] opacity-80"
      >
        {MAP_UNAVAILABLE_TEXT}
      </p>
    )
  }

  return (
    <>
      <Script
        src={WIDGET_SRC}
        strategy="afterInteractive"
        onReady={create}
        onError={() => {
          unavailableRef.current = true
          setUnavailable(true)
        }}
      />
      <div
        id={rootId}
        ref={rootRef}
        className="w-full h-[420px] md:h-[560px] border border-[var(--color-lj-rule)] bg-white"
        aria-label="Карта пунктов выдачи СДЭК"
      />
    </>
  )
}
```

- [ ] **Step 4: `web/components/checkout/PvzMap.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { CdekWidget, type CdekWidgetProps } from './CdekWidget'

// От 768 px карта стоит сразу под списком. Уже — за кнопкой: виджет и скрипты
// Яндекса тяжёлые, на телефоне пункт обычно ищут в списке, и грузить их стоит,
// только если покупатель попросил (спека §5.2).
export const MAP_INLINE_QUERY = '(min-width: 768px)'

// Блок доставки рендерится только после гидрации (page.tsx ждёт hydrated),
// поэтому window здесь есть и разметка сервера с клиентом не разойдётся.
function wideScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(MAP_INLINE_QUERY).matches
}

export function PvzMap(props: CdekWidgetProps) {
  const [shown, setShown] = useState(wideScreen)
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="self-start inline-flex items-center gap-2 px-5 py-3 border border-[var(--color-lj-ink)] font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)]"
      >
        Показать на карте
      </button>
    )
  }
  return <CdekWidget {...props} />
}
```

- [ ] **Step 5: Тесты, типы, линт зелёные**

Run: `npm test -w web -- components/checkout checkout/page.test.tsx`
Expected: PASS.
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок. Правило `react-hooks/set-state-in-effect` может указать на `create()` в эффекте монтирования: там `setUnavailable` в `catch`. Тогда над этой строкой поставить `// eslint-disable-next-line react-hooks/set-state-in-effect -- конструктор виджета упал: одна перерисовка в строку «Карта недоступна»`. Другие замечания линта не глушить — исправлять.

- [ ] **Step 6: Коммит**

```bash
npx prettier --write web/components/checkout/CdekWidget.tsx web/components/checkout/CdekWidget.test.tsx web/components/checkout/PvzMap.tsx web/components/checkout/PvzMap.test.tsx
git add web/components/checkout/CdekWidget.tsx web/components/checkout/CdekWidget.test.tsx web/components/checkout/PvzMap.tsx web/components/checkout/PvzMap.test.tsx
git commit -m "feat(web): без карты — строка вместо карты и кнопка на телефоне

Нет ключа, скрипт не загрузился, конструктор упал или 10 с без
готовности — «Карта недоступна — выберите пункт из списка»; поздний
onReady после этого виджет не создаёт. Уже 768 px карта и скрипты
Яндекса грузятся по кнопке «Показать на карте».

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Блок доставки — город, способ, пункт или курьер

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Modify: `web/lib/api.ts` (новая функция после `suggestCdekCities`)
- Test: `web/lib/api.test.ts`
- Create: `web/components/checkout/useCdekDelivery.ts`
- Create: `web/components/checkout/CdekDelivery.tsx`
- Test: `web/components/checkout/CdekDelivery.test.tsx`

**Interfaces:**

- Consumes: `suggestCdekCities` и `CityCombobox` (Task 5); `PointCombobox`, `pointLabel` (Task 6); `CourierFields`, `CourierAddress`, `EMPTY_COURIER_ADDRESS`, `courierDestination`, `pvzDestination`, `quoteDestination`, `isPostalCode` (Task 7); `WidgetOffice` (Task 8); `PvzMap` (Task 9); `quoteShipping` (Task 3); `formatPeriod`, `widgetGoods` из `web/lib/shipping.ts`; `SHIPPING_RULES` из `web/lib/checkout.ts`.
- Produces: `getCdekPoints(cityCode: number, opts?: { signal?: AbortSignal }): Promise<CdekCityPoints>`; `useCdekDelivery(items: { productId: string; quantity: number }[]): CdekDeliveryModel`; `CITY_STORAGE_KEY = 'ximi4ka-checkout-city'`, `COURIER_REQUOTE_DELAY_MS = 400`, `loadSavedCity()`, `saveCity(city)`; `LoadStatus = 'idle' | 'loading' | 'ready' | 'error'`; `QuoteView { status: LoadStatus; quote: DeliveryQuote | null; refining: boolean }` (`refining` — идёт пересчёт курьера по полному адресу); `CdekDeliveryModel` (поля и методы — в коде ниже; `cityLocation` — центр последнего загруженного города, `pointsSeen` — список уже загружался в этом визите); `CdekDelivery({ delivery, shipping, errors })`; `DeliveryErrors = Partial<Record<'city' | 'point' | 'street' | 'postalCode' | 'delivery', string>>`.

Три решения ревью, которые реализует эта задача:

- **Карта переживает смену города.** Первая же буква в поле «Город» сбрасывает город. Раньше это размонтировало карту: виджет уничтожался, а на телефоне она снова сворачивалась за кнопку. Теперь `PvzMap` стоит вне условия `d.city &&` и показывается, пока выбран способ «Пункт выдачи», места загружены, а список либо грузится, либо непустой, либо уже загружался в этом визите. Центр карты — последний загруженный город, пока грузится новый.
- **Пункт с карты, пока список грузится** — «Список ещё загружается — попробуйте через секунду», а не «нельзя выбрать».
- **Цена курьера равна той, что спишет сервер.** Как только адрес курьера полный, курьер пересчитывается с тем же `destination`, что уйдёт в заказ (задержка 400 мс). До ответа — «Курьер СДЭК — пересчитываем…», `quoting = true`.

- [ ] **Step 1: Падающие тесты**

В `web/lib/api.test.ts` добавить `getCdekPoints` в импорт и тест внутрь `describe('СДЭК: подсказки городов')` (переименовать его в `'СДЭК: подсказки городов и пункты'`):

```ts
it('getCdekPoints: код города в query, без кеша, с отменой', async () => {
  const payload = { city: { code: 44, name: 'Москва', location: [37.6, 55.7] }, points: [] }
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: payload }))
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()

  expect(await getCdekPoints(44, { signal: controller.signal })).toEqual(payload)

  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://localhost:3001/api/public/cdek/points?cityCode=44')
  expect(init.cache).toBe('no-store')
  expect(init.signal).toBe(controller.signal)
})
```

`web/components/checkout/CdekDelivery.test.tsx`:

```tsx
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  CdekCity,
  CdekCityPoints,
  CdekPoint,
  DeliveryQuote,
  QuoteDestination,
} from '@ximi4ka-shop/shared'
import type { ShippingQuoteResponse } from '@/lib/api'

const mockSuggest = vi.fn<(q: string) => Promise<CdekCity[]>>()
const mockGetPoints =
  vi.fn<(cityCode: number, opts?: { signal?: AbortSignal }) => Promise<CdekCityPoints>>()
const mockQuote =
  vi.fn<
    (payload: { items: unknown; destination?: QuoteDestination }) => Promise<ShippingQuoteResponse>
  >()

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return {
    ...actual,
    suggestCdekCities: (q: string) => mockSuggest(q),
    getCdekPoints: (cityCode: number, opts?: { signal?: AbortSignal }) =>
      mockGetPoints(cityCode, opts),
    quoteShipping: (payload: { items: unknown; destination?: QuoteDestination }) =>
      mockQuote(payload),
  }
})

// Карта: показывает, что получила, и отдаёт пункт кнопкой, как настоящий onChoose.
const mapOffice = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/components/checkout/CdekWidget', () => ({
  CdekWidget: ({
    selectedPoint,
    cityLocation,
    onChoose,
  }: {
    selectedPoint: { code: string } | null
    cityLocation: [number, number] | null
    onChoose: (office: unknown) => void
  }) => (
    <div
      data-testid="map"
      data-point={selectedPoint?.code ?? ''}
      data-city={cityLocation ? cityLocation.join(',') : ''}
    >
      <button type="button" onClick={() => onChoose(mapOffice.current)}>
        Выбрать на карте
      </button>
    </div>
  ),
}))

import { CdekDelivery, type DeliveryErrors } from './CdekDelivery'
import { CITY_STORAGE_KEY, useCdekDelivery } from './useCdekDelivery'

const MOSCOW: CdekCity = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }
const SPB: CdekCity = { code: 137, name: 'Санкт-Петербург', fullName: 'Санкт-Петербург, Россия' }
const MOSCOW_CENTER: [number, number] = [37.6176, 55.7558]
const SPB_CENTER: [number, number] = [30.3141, 59.9386]
const MSK65: CdekPoint = {
  code: 'MSK65',
  name: 'MSK65, Москва, ул. Динамовская',
  address: 'ул. Динамовская, 1А, 110а',
  location: [37.6634, 55.7335],
  workTime: 'Пн-Пт 10:00-20:00',
}
const MSK310: CdekPoint = {
  code: 'MSK310',
  name: 'MSK310, Москва, пр-т Мира',
  address: 'пр-т Мира, 108',
  location: [37.6385, 55.8061],
  workTime: 'Пн-Вс 09:00-21:00',
}
const SPB1: CdekPoint = {
  code: 'SPB1',
  name: 'SPB1, Санкт-Петербург, Невский пр-т',
  address: 'Невский пр-т, 1',
  location: [30.3141, 59.9386],
  workTime: 'Пн-Вс 10:00-22:00',
}

function pointsOf(city: CdekCity, points: CdekPoint[], location: [number, number]): CdekCityPoints {
  return { city: { code: city.code, name: city.name, location }, points }
}

const SHIPPING: ShippingQuoteResponse = {
  subtotalRub: 2000,
  packages: [
    {
      box: 'small',
      weightG: 180,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 4,
      estimated: false,
      items: [],
    },
  ],
  quote: null,
  tariffs: { pvz: 136, courier: 137 },
}

// Цены «с сервера»: ПВЗ 390 ₽, курьер по городу 600 ₽, курьер по полному
// адресу (в адресе есть улица — запятая после города) 650 ₽: так видно, какой
// расчёт попал в сводку.
function quoteFor(destination: QuoteDestination): DeliveryQuote {
  const pvz = destination.method === 'cdek_pvz'
  const fullAddress = !pvz && destination.address.includes(',')
  const price = pvz ? 390 : fullAddress ? 650 : 600
  return {
    method: destination.method,
    tariffCode: pvz ? 136 : 137,
    customerPriceRub: price,
    cdekPriceRub: price,
    periodMin: pvz ? 3 : 2,
    periodMax: pvz ? 5 : 2,
    free: false,
    source: 'cdek',
  }
}

const ITEMS = [{ productId: 'p1', quantity: 2 }]

// Блок доставки как на странице; destination, quoting и цена — в разметку,
// чтобы проверять то, что уйдёт в заказ и в сводку.
function Harness({ errors = {} }: { errors?: DeliveryErrors }) {
  const delivery = useCdekDelivery(ITEMS)
  return (
    <>
      <CdekDelivery delivery={delivery} shipping={SHIPPING} errors={errors} />
      <output data-testid="destination">{JSON.stringify(delivery.destination)}</output>
      <output data-testid="quoting">{String(delivery.quoting)}</output>
      <output data-testid="quote">{delivery.quote?.customerPriceRub ?? ''}</output>
      <button
        type="button"
        onClick={() => delivery.rejectPoint('Пункт выдачи не найден — выберите другой')}
      >
        сервер отклонил пункт
      </button>
    </>
  )
}

function destination() {
  return JSON.parse(screen.getByTestId('destination').textContent!)
}

function cityInput() {
  return screen.getByRole('combobox', { name: /город/i })
}

async function chooseCity(city: CdekCity) {
  mockSuggest.mockResolvedValue([city])
  fireEvent.focus(cityInput())
  fireEvent.change(cityInput(), { target: { value: city.name.slice(0, 4) } })
  fireEvent.click(await screen.findByRole('option', { name: city.name }))
}

async function choosePoint(name: RegExp) {
  const input = await screen.findByRole('combobox', { name: /пункт получения/i })
  fireEvent.focus(input)
  fireEvent.click(screen.getByRole('option', { name }))
}

// Вызовы расчёта курьера по полному адресу (а не по одному городу).
function fullCourierQuotes() {
  return mockQuote.mock.calls.filter(
    ([p]) => p.destination?.method === 'cdek_courier' && p.destination.address.includes(','),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  mockSuggest.mockReset()
  mockGetPoints.mockReset()
  mockQuote.mockReset()
  mockGetPoints.mockImplementation(async (code) =>
    code === 44
      ? pointsOf(MOSCOW, [MSK310, MSK65], MOSCOW_CENTER)
      : pointsOf(SPB, [SPB1], SPB_CENTER),
  )
  mockQuote.mockImplementation(async ({ destination: d }) => ({
    ...SHIPPING,
    quote: d ? quoteFor(d) : null,
  }))
  mapOffice.current = null
})

describe('<CdekDelivery>', () => {
  it('после выбора города — пункты города и цены обоих способов с сервера', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — 390\s₽, 3–5 дн\./ }),
    ).toBeChecked()
    expect(screen.getByRole('radio', { name: /Курьер СДЭК — 600\s₽, 2 дн\./ })).not.toBeChecked()
    expect(mockGetPoints).toHaveBeenCalledWith(44, expect.anything())
    expect(mockQuote).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_pvz', cityCode: 44, address: 'Москва' },
    })
    expect(mockQuote).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_courier', cityCode: 44, address: 'Москва' },
    })
  })

  it('пункт из списка — в заказ уходит код пункта и «город, адрес пункта»', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(destination()).toBeNull()
    await choosePoint(/MSK310/)
    expect(destination()).toEqual({
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK310',
      address: 'Москва, пр-т Мира, 108',
    })
  })

  it('смена города сбрасывает пункт, адрес курьера не трогает, цены пересчитываются', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.click(screen.getByRole('radio', { name: /Пункт выдачи СДЭК/ }))
    await choosePoint(/MSK65/)

    await chooseCity(SPB)

    expect(destination()).toBeNull()
    expect(mockQuote).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_pvz', cityCode: 137, address: 'Санкт-Петербург' },
    })
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    expect(screen.getByLabelText(/улица, дом/i)).toHaveValue('Тверская ул., 1')
    expect(destination()).toEqual({
      method: 'cdek_courier',
      cityCode: 137,
      address: 'Санкт-Петербург, Тверская ул., 1',
    })
  })

  it('выбор в списке уходит на карту; «Выбрать» на карте ставит пункт в список', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    const map = await screen.findByTestId('map')
    await vi.waitFor(() => expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(',')))
    await choosePoint(/MSK65/)
    expect(map).toHaveAttribute('data-point', 'MSK65')

    mapOffice.current = {
      code: 'MSK310',
      city_code: 44,
      city: 'Москва',
      address: 'пр-т Мира, 108',
      location: MSK310.location,
    }
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(screen.getByRole('combobox', { name: /пункт получения/i })).toHaveValue(
      'MSK310 · пр-т Мира, 108',
    )
    expect(destination()).toMatchObject({ deliveryPointCode: 'MSK310' })
  })

  it('карта не пересоздаётся при смене города и стоит на прошлом городе, пока грузится новый', async () => {
    let resolveSpb!: (value: CdekCityPoints) => void
    render(<Harness />)
    await chooseCity(MOSCOW)
    const map = await screen.findByTestId('map')
    await vi.waitFor(() => expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(',')))

    mockGetPoints.mockImplementation(
      () =>
        new Promise<CdekCityPoints>((resolve) => {
          resolveSpb = resolve
        }),
    )
    // Первая буква нового города сбрасывает город — карта остаётся тем же элементом.
    mockSuggest.mockResolvedValue([SPB])
    fireEvent.focus(cityInput())
    fireEvent.change(cityInput(), { target: { value: 'Санк' } })
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(','))

    fireEvent.click(await screen.findByRole('option', { name: 'Санкт-Петербург' }))
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-city', MOSCOW_CENTER.join(','))

    await act(async () => {
      resolveSpb(pointsOf(SPB, [SPB1], SPB_CENTER))
    })
    expect(screen.getByTestId('map')).toBe(map)
    expect(map).toHaveAttribute('data-city', SPB_CENTER.join(','))
  })

  it('до первого выбора города карты нет', () => {
    render(<Harness />)
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('пункт с карты, пока список грузится, — «Список ещё загружается»', async () => {
    let resolvePoints!: (value: CdekCityPoints) => void
    mockGetPoints.mockImplementation(
      () =>
        new Promise<CdekCityPoints>((resolve) => {
          resolvePoints = resolve
        }),
    )
    render(<Harness />)
    await chooseCity(MOSCOW)
    mapOffice.current = { ...MSK65, city_code: 44, city: 'Москва' }
    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать на карте' }))
    expect(
      screen.getByText('Список ещё загружается — попробуйте через секунду'),
    ).toBeInTheDocument()
    expect(destination()).toBeNull()

    await act(async () => {
      resolvePoints(pointsOf(MOSCOW, [MSK65], MOSCOW_CENTER))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(destination()).toMatchObject({ deliveryPointCode: 'MSK65' })
    expect(screen.queryByText(/Список ещё загружается/)).toBeNull()
  })

  it('пункт с карты из другого города отклоняется с подсказкой', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    // Ждём список: пока он грузится, подсказка другая (тест выше).
    await screen.findByRole('combobox', { name: /пункт получения/i })
    mapOffice.current = { ...SPB1, city_code: 137, city: 'Санкт-Петербург' }
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(screen.getByText('Этот пункт в другом городе — смените город')).toBeInTheDocument()
    expect(destination()).toBeNull()
  })

  it('пункты не загрузились — «Повторить», курьер доступен', async () => {
    mockGetPoints.mockRejectedValueOnce(new Error('502'))
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить пункты выдачи')
    expect(screen.getByRole('radio', { name: /Курьер СДЭК/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('combobox', { name: /пункт получения/i })).toBeInTheDocument()
  })

  it('в городе нет ПВЗ — подсказка выбрать курьера, карты нет', async () => {
    mockGetPoints.mockResolvedValue(pointsOf(MOSCOW, [], MOSCOW_CENTER))
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByText('В этом городе нет пунктов выдачи СДЭК — выберите курьера'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('расчёт не удался — «не удалось рассчитать» и «Повторить расчёт»', async () => {
    mockQuote.mockRejectedValueOnce(new Error('500')).mockRejectedValueOnce(new Error('500'))
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — не удалось рассчитать/ }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить расчёт' }))
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — 390/ }),
    ).toBeInTheDocument()
  })

  it('курьер: полный адрес пересчитывается тем же destination, что уйдёт в заказ', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК — 600/ }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })

    // До ответа — «пересчитываем», цены нет, оформить нельзя.
    expect(screen.getByRole('radio', { name: 'Курьер СДЭК — пересчитываем…' })).toBeChecked()
    expect(screen.getByTestId('quoting')).toHaveTextContent('true')
    expect(screen.getByTestId('quote')).toHaveTextContent('')

    expect(await screen.findByRole('radio', { name: /Курьер СДЭК — 650\s₽/ })).toBeChecked()
    expect(screen.getByTestId('quoting')).toHaveTextContent('false')
    expect(screen.getByTestId('quote')).toHaveTextContent('650')
    expect(fullCourierQuotes().at(-1)![0].destination).toEqual(destination())
    expect(destination()).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      address: 'Москва, Тверская ул., 1',
    })
  })

  it('пересчёт ждёт, пока покупатель допечатает: одна правка за другой — один запрос', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    const street = screen.getByLabelText(/улица, дом/i)
    fireEvent.change(street, { target: { value: 'Т' } })
    fireEvent.change(street, { target: { value: 'Тверская' } })
    fireEvent.change(street, { target: { value: 'Тверская ул., 1' } })
    await screen.findByRole('radio', { name: /Курьер СДЭК — 650/ })
    expect(fullCourierQuotes()).toHaveLength(1)
  })

  it('недописанный индекс — по нему не считаем; шесть цифр — пересчёт с индексом', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    fireEvent.click(await screen.findByRole('radio', { name: /Курьер СДЭК/ }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    await screen.findByRole('radio', { name: /Курьер СДЭК — 650/ })

    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '1250' } })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(fullCourierQuotes()).toHaveLength(1)

    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })
    await vi.waitFor(() => expect(fullCourierQuotes()).toHaveLength(2))
    expect(fullCourierQuotes()[1]![0].destination).toEqual({
      method: 'cdek_courier',
      cityCode: 44,
      postalCode: '125009',
      address: 'Москва, Тверская ул., 1',
    })
    expect(await screen.findByRole('radio', { name: /Курьер СДЭК — 650/ })).toBeChecked()
  })

  it('сервер не нашёл пункт — выбор сброшен, ошибка у поля, список грузится заново', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    await choosePoint(/MSK65/)
    fireEvent.click(screen.getByRole('button', { name: 'сервер отклонил пункт' }))
    expect(await screen.findByText('Пункт выдачи не найден — выберите другой')).toBeInTheDocument()
    expect(destination()).toBeNull()
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: /пункт получения/i })).toHaveValue('')
  })

  it('поздний ответ по прошлому городу не перетирает пункты нового', async () => {
    let resolveMoscow!: (value: CdekCityPoints) => void
    mockGetPoints.mockImplementation((code) =>
      code === 44
        ? new Promise<CdekCityPoints>((resolve) => {
            resolveMoscow = resolve
          })
        : Promise.resolve(pointsOf(SPB, [SPB1], SPB_CENTER)),
    )
    render(<Harness />)
    await chooseCity(MOSCOW)
    await chooseCity(SPB)
    const input = await screen.findByRole('combobox', { name: /пункт получения/i })
    await act(async () => {
      resolveMoscow(pointsOf(MOSCOW, [MSK65], MOSCOW_CENTER))
    })
    fireEvent.focus(input)
    expect(screen.getByRole('option', { name: /SPB1/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /MSK65/ })).toBeNull()
  })

  it('город запоминается и подставляется при следующем визите', async () => {
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(JSON.parse(window.localStorage.getItem(CITY_STORAGE_KEY)!)).toEqual({
      code: 44,
      name: 'Москва',
      fullName: 'Москва, Россия',
    })
    cleanup()
    mockGetPoints.mockClear()

    render(<Harness />)
    expect(cityInput()).toHaveValue('Москва')
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledWith(44, expect.anything()))
    expect(mockSuggest).toHaveBeenCalledTimes(1) // только при первом выборе
  })

  it('мусор в хранилище или хранилище недоступно — блок работает без сохранённого города', async () => {
    window.localStorage.setItem(CITY_STORAGE_KEY, '{"code":"44","name":"Москва"}')
    render(<Harness />)
    expect(cityInput()).toHaveValue('')
    cleanup()

    window.localStorage.setItem(CITY_STORAGE_KEY, 'не json')
    render(<Harness />)
    expect(cityInput()).toHaveValue('')
    cleanup()

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    render(<Harness />)
    await chooseCity(MOSCOW)
    expect(
      await screen.findByRole('radio', { name: /Пункт выдачи СДЭК — 390/ }),
    ).toBeInTheDocument()
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('ошибки формы — у своих полей и пропадают, когда поле заполнено', async () => {
    const { rerender } = render(<Harness errors={{ city: 'Укажите город' }} />)
    expect(screen.getByText('Укажите город')).toBeInTheDocument()
    await chooseCity(MOSCOW)
    rerender(<Harness errors={{ city: 'Укажите город', point: 'Выберите пункт получения' }} />)
    expect(screen.queryByText('Укажите город')).toBeNull()
    expect(await screen.findByText('Выберите пункт получения')).toBeInTheDocument()
    await choosePoint(/MSK65/)
    expect(screen.queryByText('Выберите пункт получения')).toBeNull()
  })
})
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -w web -- lib/api.test.ts components/checkout/CdekDelivery.test.tsx`
Expected: FAIL — `getCdekPoints is not a function`, `Failed to resolve import "./CdekDelivery"`.

- [ ] **Step 3: Клиент API**

В `web/lib/api.ts` добавить `CdekCityPoints` в импорт типов и после `suggestCdekCities`:

```ts
// Пункты выдачи города и его центр для карты (GET /api/public/cdek/points).
// signal отменяет запрос, если покупатель успел сменить город.
export async function getCdekPoints(
  cityCode: number,
  opts: { signal?: AbortSignal } = {},
): Promise<CdekCityPoints> {
  const body = await request<DataEnvelope<CdekCityPoints>>(
    `/api/public/cdek/points?cityCode=${cityCode}`,
    { cache: 'no-store', signal: opts.signal },
  )
  return body.data
}
```

- [ ] **Step 4: `web/components/checkout/useCdekDelivery.ts`**

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  CdekCity,
  CdekCityPoints,
  CdekPoint,
  DeliveryDestination,
  DeliveryMethod,
  DeliveryQuote,
} from '@ximi4ka-shop/shared'
import { getCdekPoints, quoteShipping } from '@/lib/api'
import {
  EMPTY_COURIER_ADDRESS,
  courierDestination,
  isPostalCode,
  pvzDestination,
  quoteDestination,
  type CourierAddress,
  type WidgetOffice,
} from '@/lib/shipping'

export const CITY_STORAGE_KEY = 'ximi4ka-checkout-city'
// Пересчёт курьера по полному адресу ждёт, пока покупатель допечатает: на
// каждую букву в СДЭК не ходим.
export const COURIER_REQUOTE_DELAY_MS = 400

const METHODS: readonly DeliveryMethod[] = ['cdek_pvz', 'cdek_courier']
const EMPTY_POINTS: CdekPoint[] = []

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface QuoteView {
  status: LoadStatus
  quote: DeliveryQuote | null
  // Идёт пересчёт курьера по полному адресу: цена по городу уже не та, что
  // спишет сервер.
  refining: boolean
}

export interface CdekDeliveryModel {
  city: CdekCity | null
  method: DeliveryMethod
  pointsStatus: LoadStatus
  points: CdekPoint[]
  // Центр последнего загруженного города: пока грузится список нового (или
  // покупатель перепечатывает город), карта стоит на месте.
  cityLocation: [number, number] | null
  // Список пунктов уже загружался в этом визите — карта не пропадает, пока
  // покупатель меняет город.
  pointsSeen: boolean
  point: CdekPoint | null
  courier: CourierAddress
  quotes: Record<DeliveryMethod, QuoteView>
  // Расчёт выбранного способа — для сводки и кнопки «Оформить».
  quote: DeliveryQuote | null
  quoting: boolean
  // «Куда везём» для заказа; null — чего-то не хватает. Для курьера — ровно
  // тот destination, по которому посчитана цена.
  destination: DeliveryDestination | null
  mapNotice: string | null
  pointError: string | null
  setCity: (city: CdekCity | null) => void
  setMethod: (method: DeliveryMethod) => void
  setPoint: (point: CdekPoint) => void
  setCourier: (address: CourierAddress) => void
  chooseOnMap: (office: WidgetOffice) => void
  retryPoints: () => void
  retryQuotes: () => void
  rejectPoint: (message: string) => void
}

// Сохранённый город (спека §5.1): только код и название, без персональных
// данных (§7). Хранилище может быть недоступно (приватный режим) или
// содержать мусор — тогда сохранённого города просто нет.
export function loadSavedCity(): CdekCity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CITY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CdekCity> | null
    if (
      !parsed ||
      typeof parsed.code !== 'number' ||
      !Number.isInteger(parsed.code) ||
      parsed.code <= 0 ||
      typeof parsed.name !== 'string' ||
      parsed.name === '' ||
      typeof parsed.fullName !== 'string'
    ) {
      return null
    }
    return { code: parsed.code, name: parsed.name, fullName: parsed.fullName }
  } catch {
    return null
  }
}

export function saveCity(city: CdekCity | null): void {
  try {
    if (city) {
      window.localStorage.setItem(
        CITY_STORAGE_KEY,
        JSON.stringify({ code: city.code, name: city.name, fullName: city.fullName }),
      )
    } else {
      window.localStorage.removeItem(CITY_STORAGE_KEY)
    }
  } catch {
    // Хранилище недоступно — город просто не запомнится.
  }
}

// Ответ засчитывается только под своим ключом (город и попытка, для цен ещё и
// корзина, для курьера — полный адрес): поздний ответ по прошлому городу или
// адресу не перетрёт новый.
const pointsKeyOf = (cityCode: number, attempt: number) => `${cityCode}#${attempt}`
const quotesKeyOf = (cityCode: number, cartKey: string, attempt: number) =>
  `${cityCode}#${cartKey}#${attempt}`

interface PointsResult {
  key: string
  data: CdekCityPoints | null // null — СДЭК или сеть не ответили
}

interface QuotesResult {
  key: string
  byMethod: Partial<Record<DeliveryMethod, DeliveryQuote | null>> // null — ошибка
}

interface CourierQuoteResult {
  key: string
  quote: DeliveryQuote | null // null — ошибка
}

// Состояние блока «Доставка» чекаута (спека §5): город → способ → пункт или
// адрес курьера. Пункты и цены грузятся при выборе города; смена города
// сбрасывает пункт, но не адрес курьера (§5.1). Цена курьера по полному
// адресу пересчитывается, чтобы совпасть с тем, что спишет сервер.
export function useCdekDelivery(
  items: { productId: string; quantity: number }[],
): CdekDeliveryModel {
  const [city, setCityState] = useState<CdekCity | null>(loadSavedCity)
  const [method, setMethod] = useState<DeliveryMethod>('cdek_pvz')
  const [point, setPointState] = useState<CdekPoint | null>(null)
  const [courier, setCourier] = useState<CourierAddress>(EMPTY_COURIER_ADDRESS)
  const [mapNotice, setMapNotice] = useState<string | null>(null)
  const [pointError, setPointError] = useState<string | null>(null)
  const [pointsAttempt, setPointsAttempt] = useState(0)
  const [quotesAttempt, setQuotesAttempt] = useState(0)
  const [pointsResult, setPointsResult] = useState<PointsResult | null>(null)
  const [quotesResult, setQuotesResult] = useState<QuotesResult | null>(null)
  const [courierQuote, setCourierQuote] = useState<CourierQuoteResult | null>(null)

  const cityCode = city?.code ?? null
  const cityName = city?.name ?? ''
  const cartKey = items.map((i) => `${i.productId}:${i.quantity}`).join(',')

  // Полный адрес курьера — тот же destination, что уйдёт в заказ. Индекс, если
  // введён, должен быть из 6 цифр: с недописанным индексом не пересчитываем.
  const postalCode = courier.postalCode.trim()
  const courierFull =
    city && courier.street.trim() !== '' && (postalCode === '' || isPostalCode(postalCode))
      ? courierDestination(city, courier)
      : null
  const courierKey =
    courierFull && cartKey !== ''
      ? `${JSON.stringify(courierFull)}#${cartKey}#${quotesAttempt}`
      : null

  // Свежие корзина и адрес для отложенных запросов.
  const latestRef = useRef({ items, courierFull })
  useEffect(() => {
    latestRef.current = { items, courierFull }
  })

  useEffect(() => {
    if (cityCode === null) return
    const key = pointsKeyOf(cityCode, pointsAttempt)
    const controller = new AbortController()
    getCdekPoints(cityCode, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setPointsResult({ key, data })
      })
      .catch(() => {
        if (!controller.signal.aborted) setPointsResult({ key, data: null })
      })
    return () => controller.abort()
  }, [cityCode, pointsAttempt])

  useEffect(() => {
    if (cityCode === null || cartKey === '') return
    const key = quotesKeyOf(cityCode, cartKey, quotesAttempt)
    const lines = latestRef.current.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }))
    let cancelled = false
    const record = (m: DeliveryMethod, quote: DeliveryQuote | null) => {
      if (cancelled) return
      setQuotesResult((prev) => ({
        key,
        byMethod: { ...(prev?.key === key ? prev.byMethod : {}), [m]: quote },
      }))
    }
    // Цена ПВЗ зависит только от города, поэтому оба способа считаем сразу
    // после выбора города (§5.1, п. 2). Считает по-прежнему только сервер.
    for (const m of METHODS) {
      quoteShipping({
        items: lines,
        destination: quoteDestination(m, { code: cityCode, name: cityName }),
      })
        .then((data) => record(m, data.quote))
        .catch(() => record(m, null))
    }
    return () => {
      cancelled = true
    }
  }, [cityCode, cityName, cartKey, quotesAttempt])

  // Курьера сервер считает по полному адресу (postal_code и address в
  // to_location), и цена может отличаться от расчёта по городу. Показываем и
  // требуем для оформления ровно ту, что спишет сервер.
  useEffect(() => {
    if (courierKey === null) return
    const key = courierKey
    let cancelled = false
    const timer = setTimeout(() => {
      const { items: current, courierFull: destination } = latestRef.current
      if (!destination) return
      quoteShipping({
        items: current.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        destination,
      })
        .then((data) => {
          if (!cancelled) setCourierQuote({ key, quote: data.quote })
        })
        .catch(() => {
          if (!cancelled) setCourierQuote({ key, quote: null })
        })
    }, COURIER_REQUOTE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [courierKey])

  const pointsKey = cityCode === null ? null : pointsKeyOf(cityCode, pointsAttempt)
  const pointsHit = pointsKey !== null && pointsResult?.key === pointsKey ? pointsResult : null
  const pointsStatus: LoadStatus =
    pointsKey === null ? 'idle' : !pointsHit ? 'loading' : pointsHit.data ? 'ready' : 'error'
  const points = pointsHit?.data?.points ?? EMPTY_POINTS
  // Последний ответ, даже по прошлому городу: карта не прыгает в Москву, пока
  // грузится новый список.
  const cityLocation = pointsResult?.data?.city.location ?? null
  const pointsSeen = pointsResult?.data != null

  const quotesKey =
    cityCode === null || cartKey === '' ? null : quotesKeyOf(cityCode, cartKey, quotesAttempt)
  const quotesHit =
    quotesKey !== null && quotesResult?.key === quotesKey ? quotesResult.byMethod : null
  const cityQuoteView = (m: DeliveryMethod): QuoteView => {
    if (quotesKey === null) return { status: 'idle', quote: null, refining: false }
    const q = quotesHit?.[m]
    if (q === undefined) return { status: 'loading', quote: null, refining: false }
    return q
      ? { status: 'ready', quote: q, refining: false }
      : { status: 'error', quote: null, refining: false }
  }
  const courierView: QuoteView =
    courierKey === null
      ? cityQuoteView('cdek_courier')
      : courierQuote?.key !== courierKey
        ? { status: 'loading', quote: null, refining: true }
        : courierQuote.quote
          ? { status: 'ready', quote: courierQuote.quote, refining: false }
          : { status: 'error', quote: null, refining: false }
  const quotes: Record<DeliveryMethod, QuoteView> = {
    cdek_pvz: cityQuoteView('cdek_pvz'),
    cdek_courier: courierView,
  }

  const destination: DeliveryDestination | null = !city
    ? null
    : method === 'cdek_pvz'
      ? point
        ? pvzDestination(city, point)
        : null
      : courierFull

  function setCity(next: CdekCity | null) {
    setCityState(next)
    // Смена города сбрасывает пункт; адрес курьера не трогает (§5.1).
    setPointState(null)
    setPointError(null)
    setMapNotice(null)
    saveCity(next)
  }

  function setPoint(next: CdekPoint) {
    setPointState(next)
    setPointError(null)
    setMapNotice(null)
  }

  // Карта → список (§5.2): пункт с карты ставится, только если он есть в
  // списке города, иначе заказ ушёл бы с пунктом, которого сервер не знает.
  function chooseOnMap(office: WidgetOffice) {
    if (!city) {
      setMapNotice('Сначала выберите город — пункт появится в списке')
      return
    }
    if (pointsStatus === 'loading') {
      setMapNotice('Список ещё загружается — попробуйте через секунду')
      return
    }
    const found = points.find((p) => p.code === office.code)
    if (found) {
      setPoint(found)
      return
    }
    setMapNotice(
      office.city_code !== city.code
        ? 'Этот пункт в другом городе — смените город'
        : 'Этот пункт нельзя выбрать — найдите другой в списке',
    )
  }

  // Сервер не нашёл пункт при оформлении (§4.3, §6): выбор сброшен, ошибка у
  // поля, список города грузится заново.
  function rejectPoint(message: string) {
    setPointState(null)
    setPointError(message)
    setPointsAttempt((n) => n + 1)
  }

  return {
    city,
    method,
    pointsStatus,
    points,
    cityLocation,
    pointsSeen,
    point,
    courier,
    quotes,
    quote: quotes[method].quote,
    quoting: quotes[method].status === 'loading',
    destination,
    mapNotice,
    pointError,
    setCity,
    setMethod,
    setPoint,
    setCourier,
    chooseOnMap,
    retryPoints: () => setPointsAttempt((n) => n + 1),
    retryQuotes: () => setQuotesAttempt((n) => n + 1),
    rejectPoint,
  }
}
```

- [ ] **Step 5: `web/components/checkout/CdekDelivery.tsx`**

```tsx
'use client'

import type { DeliveryMethod } from '@ximi4ka-shop/shared'
import { cdekWidgetServicePath, type ShippingQuoteResponse } from '@/lib/api'
import { SHIPPING_RULES } from '@/lib/checkout'
import { formatPeriod, isPostalCode, widgetGoods } from '@/lib/shipping'
import { formatRub } from '@/lib/stockLabel'
import { CityCombobox } from './CityCombobox'
import { CourierFields } from './CourierFields'
import { ERROR_CLASS, HINT_CLASS, LABEL_CLASS } from './fieldStyles'
import { PointCombobox } from './PointCombobox'
import { PvzMap } from './PvzMap'
import type { CdekDeliveryModel, QuoteView } from './useCdekDelivery'

export type DeliveryErrors = Partial<
  Record<'city' | 'point' | 'street' | 'postalCode' | 'delivery', string>
>

interface Props {
  delivery: CdekDeliveryModel
  // Места и тарифы для карты; null — не загрузились, карты нет.
  shipping: ShippingQuoteResponse | null
  errors: DeliveryErrors
}

const METHOD_TITLES: Record<DeliveryMethod, string> = {
  cdek_pvz: 'Пункт выдачи СДЭК',
  cdek_courier: 'Курьер СДЭК',
}

const METHODS: readonly DeliveryMethod[] = ['cdek_pvz', 'cdek_courier']

// «Пункт выдачи СДЭК — 390 ₽, 3–5 дн.»: цена и срок — с сервера (§5.1, п. 2).
function methodLabel(method: DeliveryMethod, view: QuoteView): string {
  const title = METHOD_TITLES[method]
  if (view.status === 'loading') return `${title} — ${view.refining ? 'пересчитываем' : 'считаем'}…`
  if (view.status === 'error') return `${title} — не удалось рассчитать`
  if (!view.quote) return title
  const price =
    view.quote.customerPriceRub === 0 ? 'бесплатно' : formatRub(view.quote.customerPriceRub)
  const period = formatPeriod(view.quote.periodMin, view.quote.periodMax)
  return `${title} — ${price}${period ? `, ${period}` : ''}`
}

// Блок «Доставка» (спека §5.1): город, способ, пункт с картой или адрес
// курьера. Ошибка формы видна, пока поле не заполнено: исправленное поле не
// держит старую ошибку до следующего нажатия «Оформить».
export function CdekDelivery({ delivery: d, shipping, errors }: Props) {
  const cityError = d.city ? undefined : errors.city
  const pointError = d.pointError ?? (d.point ? undefined : errors.point)
  const streetError = d.courier.street.trim() === '' ? errors.street : undefined
  const postalCode = d.courier.postalCode.trim()
  const postalError = postalCode === '' || isPostalCode(postalCode) ? undefined : errors.postalCode
  const deliveryError = d.quotes[d.method].status === 'ready' ? undefined : errors.delivery
  const quoteFailed = METHODS.some((m) => d.quotes[m].status === 'error')

  // Карта стоит вне условия «город выбран»: первая буква в поле «Город»
  // сбрасывает город, и без этого виджет уничтожался бы и создавался заново
  // (на телефоне ещё и сворачивался за кнопку). Пока грузится список нового
  // города или покупатель перепечатывает город, карта остаётся на месте.
  const pickup = d.method === 'cdek_pvz'
  const listForMap =
    d.pointsStatus === 'loading' ||
    (d.pointsStatus === 'ready' && d.points.length > 0) ||
    (d.pointsStatus === 'idle' && d.pointsSeen)
  const showMap = pickup && listForMap

  return (
    <section aria-labelledby="checkout-delivery" className="flex flex-col gap-5">
      <h2 id="checkout-delivery" className={`${LABEL_CLASS} m-0`}>
        Доставка СДЭК *
      </h2>
      <p className={HINT_CLASS}>
        До пункта выдачи — бесплатно от {formatRub(SHIPPING_RULES.cdek_pvz.freeFromRub)}, курьером —
        от {formatRub(SHIPPING_RULES.cdek_courier.freeFromRub)}
      </p>

      <CityCombobox id="checkout-city" value={d.city} onChange={d.setCity} error={cityError} />

      {d.city && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={`${LABEL_CLASS} mb-2`}>Способ получения</legend>
          {METHODS.map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-center gap-3 font-lj-body text-base text-[var(--color-lj-ink)]"
            >
              <input
                type="radio"
                name="checkout-delivery-method"
                value={m}
                checked={d.method === m}
                onChange={() => d.setMethod(m)}
                className="accent-[var(--color-lj-ink)]"
              />
              {methodLabel(m, d.quotes[m])}
            </label>
          ))}
          {quoteFailed && (
            <button
              type="button"
              onClick={d.retryQuotes}
              className="self-start font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] underline"
            >
              Повторить расчёт
            </button>
          )}
        </fieldset>
      )}

      {d.city && pickup && <PickupList delivery={d} error={pointError} />}

      {pickup && d.mapNotice && (
        <p role="status" className={ERROR_CLASS}>
          {d.mapNotice}
        </p>
      )}

      {showMap && shipping && (
        <PvzMap
          goods={widgetGoods(shipping.packages)}
          servicePath={cdekWidgetServicePath(shipping.subtotalRub)}
          tariffPvz={shipping.tariffs.pvz}
          cityLocation={d.cityLocation}
          selectedPoint={d.point}
          onChoose={d.chooseOnMap}
        />
      )}

      {d.city && d.method === 'cdek_courier' && (
        <CourierFields
          value={d.courier}
          onChange={d.setCourier}
          errors={{ street: streetError, postalCode: postalError }}
        />
      )}

      {deliveryError && <p className={ERROR_CLASS}>{deliveryError}</p>}
    </section>
  )
}

// Поле «Пункт получения» или статус списка на его месте.
function PickupList({
  delivery: d,
  error,
}: {
  delivery: CdekDeliveryModel
  error: string | undefined
}) {
  if (d.pointsStatus === 'ready' && d.points.length > 0) {
    return (
      <PointCombobox
        id="checkout-point"
        points={d.points}
        value={d.point}
        onChange={d.setPoint}
        error={error}
      />
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {d.pointsStatus === 'error' ? (
        <p role="alert" className={ERROR_CLASS}>
          Не удалось загрузить пункты выдачи{' '}
          <button type="button" onClick={d.retryPoints} className="underline">
            Повторить
          </button>
        </p>
      ) : d.pointsStatus === 'ready' ? (
        <p role="status" className={HINT_CLASS}>
          В этом городе нет пунктов выдачи СДЭК — выберите курьера
        </p>
      ) : (
        <p role="status" className={HINT_CLASS}>
          Загружаем пункты выдачи…
        </p>
      )}
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Тесты, типы, линт зелёные**

Run: `npm test -w web -- lib/api.test.ts components/checkout`
Expected: PASS.
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок.

- [ ] **Step 7: Коммит**

```bash
npx prettier --write web/lib/api.ts web/lib/api.test.ts web/components/checkout/useCdekDelivery.ts web/components/checkout/CdekDelivery.tsx web/components/checkout/CdekDelivery.test.tsx
git add web/lib/api.ts web/lib/api.test.ts web/components/checkout/useCdekDelivery.ts web/components/checkout/CdekDelivery.tsx web/components/checkout/CdekDelivery.test.tsx
git commit -m "feat(web): блок доставки — город, способ, пункт или курьер

Пункты и цены обоих способов грузятся по городу; смена города
сбрасывает пункт и не трогает адрес курьера, карта при этом не
пересоздаётся; курьер по полному адресу пересчитывается тем же
destination, что уйдёт в заказ; город запоминается в localStorage.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Чекаут на новом блоке доставки

> Правила задачи: работать только в `$WT` (`/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list`); новых зависимостей не добавлять; не пушить.

**Files:**

- Modify: `web/lib/checkout.ts:11-14` (удалить `DELIVERY_LABELS`), `:55-95` (поля и проверка)
- Test: `web/lib/checkout.test.ts`
- Modify: `web/lib/shipping.ts` (удалить типы и функцию старого `onChoose`)
- Test: `web/lib/shipping.test.ts` (удалить `describe('destinationFromWidget')`)
- Modify (весь файл): `web/app/[locale]/(public)/checkout/page.tsx`
- Test (весь файл): `web/app/[locale]/(public)/checkout/page.test.tsx`

**Interfaces:**

- Consumes: `useCdekDelivery`, `CdekDeliveryModel` (Task 10); `CdekDelivery` (Task 10); 400 `delivery_point_unknown` (Task 2); классы полей (Task 5).
- Produces: `DeliveryFormState { city: { code: number } | null; method: DeliveryMethod; point: { code: string } | null; courier: { street: string; postalCode: string }; quoteStatus: 'idle' | 'loading' | 'ready' | 'error' }`; `validateCheckoutForm(fields: CheckoutFormFields, delivery: DeliveryFormState): CheckoutFormErrors`; `CheckoutFormErrors` с ключами `name | phone | email | telegram | city | point | street | postalCode | delivery`; `CheckoutFormFields` без `apartment`.

- [ ] **Step 1: Падающие тесты проверки формы**

В `web/lib/checkout.test.ts`:

- в импорт добавить `type DeliveryFormState`;
- `validFields` — без `apartment`:

```ts
const validFields: CheckoutFormFields = {
  name: 'Мария',
  phone: '+7 (912) 345-67-89',
  email: '',
  telegram: '',
  comment: '',
}

// Город выбран, пункт выбран, цена готова.
const PVZ_READY: DeliveryFormState = {
  city: { code: 44 },
  method: 'cdek_pvz',
  point: { code: 'MSK65' },
  courier: { street: '', postalCode: '' },
  quoteStatus: 'ready',
}
```

- во всём файле `, true)` заменить на `, PVZ_READY)` (восемь вызовов `validateCheckoutForm`): `sed -i '' 's/, true)/, PVZ_READY)/g' web/lib/checkout.test.ts`. Затем проверить: `grep -c "PVZ_READY)" web/lib/checkout.test.ts` → 8;
- тест `'требует выбрать пункт выдачи или адрес на карте'` (внутри `describe('validateCheckoutForm')`) заменить на:

```ts
it('без города — «Укажите город»', () => {
  expect(validateCheckoutForm(validFields, { ...PVZ_READY, city: null }).city).toBe('Укажите город')
})
```

- сразу после закрывающей скобки `describe('validateCheckoutForm')` добавить новый блок:

```ts
describe('validateCheckoutForm — доставка', () => {
  it('ПВЗ без пункта — «Выберите пункт получения»', () => {
    expect(validateCheckoutForm(validFields, { ...PVZ_READY, point: null })).toEqual({
      point: 'Выберите пункт получения',
    })
  })

  it('курьер: улица с домом обязательна, пункт не нужен', () => {
    const courier: DeliveryFormState = { ...PVZ_READY, method: 'cdek_courier', point: null }
    expect(validateCheckoutForm(validFields, courier).street).toBe('Укажите улицу и дом')
    expect(
      validateCheckoutForm(validFields, {
        ...courier,
        courier: { street: 'Тверская ул., 1', postalCode: '' },
      }),
    ).toEqual({})
  })

  it('индекс необязателен, но если указан — 6 цифр', () => {
    const courier: DeliveryFormState = {
      ...PVZ_READY,
      method: 'cdek_courier',
      point: null,
      courier: { street: 'Тверская ул., 1', postalCode: '1250' },
    }
    expect(validateCheckoutForm(validFields, courier).postalCode).toBe('Индекс — 6 цифр')
  })

  it('без готовой цены оформить нельзя', () => {
    expect(
      validateCheckoutForm(validFields, { ...PVZ_READY, quoteStatus: 'loading' }).delivery,
    ).toBe('Считаем доставку — подождите секунду')
    expect(validateCheckoutForm(validFields, { ...PVZ_READY, quoteStatus: 'error' }).delivery).toBe(
      'Не удалось рассчитать доставку — нажмите «Повторить расчёт»',
    )
  })
})
```

- [ ] **Step 2: Новый тест страницы целиком — `web/app/[locale]/(public)/checkout/page.test.tsx`**

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CdekCity, CdekCityPoints, CdekPoint, QuoteDestination } from '@ximi4ka-shop/shared'
import CheckoutPage from './page'
import { loadCart, saveCart, type CartItem } from '@/lib/cart'

const mockPush = vi.fn<(path: string) => void>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockRedirectTo = vi.fn<(url: string) => void>()

vi.mock('@/lib/checkout', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/checkout')>()
  return { ...actual, redirectTo: (url: string) => mockRedirectTo(url) }
})

// Город и пункты — как в песочнице СДЭК 25.09.2026 (урезаны).
const MOSCOW: CdekCity = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }
const MSK65: CdekPoint = {
  code: 'MSK65',
  name: 'MSK65, Москва, ул. Динамовская',
  address: 'ул. Динамовская, 1А, 110а',
  location: [37.6634, 55.7335],
  workTime: 'Пн-Пт 10:00-20:00',
}
const MSK310: CdekPoint = {
  code: 'MSK310',
  name: 'MSK310, Москва, пр-т Мира',
  address: 'пр-т Мира, 108',
  location: [37.6385, 55.8061],
  workTime: 'Пн-Вс 09:00-21:00',
}
const MOSCOW_POINTS: CdekCityPoints = {
  city: { code: 44, name: 'Москва', location: [37.6176, 55.7558] },
  points: [MSK310, MSK65],
}

// Карта — внешний скрипт; в тестах вместо неё кнопка, которая отдаёт пункт
// так же, как настоящий onChoose, или строка «карта недоступна».
const mapMock = vi.hoisted(() => ({ available: true }))
vi.mock('@/components/checkout/CdekWidget', () => ({
  CdekWidget: ({ onChoose }: { onChoose: (office: unknown) => void }) =>
    mapMock.available ? (
      <button
        type="button"
        onClick={() =>
          onChoose({
            code: 'MSK65',
            city_code: 44,
            city: 'Москва',
            address: 'ул. Динамовская, 1А, 110а',
            location: [37.6634, 55.7335],
          })
        }
      >
        Выбрать на карте
      </button>
    ) : (
      <p role="status">Карта недоступна — выберите пункт из списка</p>
    ),
}))

const mockSuggest = vi.fn(async (_q: string) => [MOSCOW])
const mockGetPoints = vi.fn(async (_cityCode: number) => MOSCOW_POINTS)

// Цены доставки «с сервера»: ПВЗ 390 ₽ за 3–5 дней, курьер 600 ₽ за 2 дня,
// от порога — 0 ₽. Для корзины без адреса — только места и тарифы.
const mockQuoteShipping = vi.fn(async ({ destination }: { destination?: QuoteDestination }) => {
  const subtotalRub = loadCart().reduce((sum, i) => sum + i.priceRub * i.quantity, 0)
  const pvz = destination?.method === 'cdek_pvz'
  const free = subtotalRub >= (pvz ? 3000 : 5000)
  return {
    subtotalRub,
    packages: [
      {
        box: 'small' as const,
        weightG: 180,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 4,
        estimated: false,
        items: [],
      },
    ],
    tariffs: { pvz: 136, courier: 137 },
    quote: destination
      ? {
          method: destination.method,
          tariffCode: pvz ? 136 : 137,
          customerPriceRub: free ? 0 : pvz ? 390 : 600,
          cdekPriceRub: pvz ? 390 : 600,
          periodMin: pvz ? 3 : 2,
          periodMax: pvz ? 5 : 2,
          free,
          source: 'cdek' as const,
        }
      : null,
  }
})

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>()
  return {
    ...actual,
    quoteShipping: (payload: never) => mockQuoteShipping(payload),
    suggestCdekCities: (q: string) => mockSuggest(q),
    getCdekPoints: (cityCode: number) => mockGetPoints(cityCode),
  }
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  mockPush.mockReset()
  mockRedirectTo.mockReset()
  mockQuoteShipping.mockClear()
  mockSuggest.mockClear()
  mockGetPoints.mockClear()
  mapMock.available = true
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Subtotal 2000 ₽ — ниже обоих порогов бесплатной доставки.
const seed: CartItem[] = [
  {
    productId: '3c6c508a-9f55-4d0f-a53e-0f0e0a0b0c0d',
    slug: 'kit-a',
    name: 'Набор A',
    priceRub: 1000,
    quantity: 2,
  },
]
const ITEMS = [{ productId: seed[0]!.productId, quantity: 2 }]

function seedCart(items: CartItem[]) {
  act(() => {
    saveCart(items)
  })
}

async function chooseCity() {
  const input = screen.getByRole('combobox', { name: /город/i })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'Моск' } })
  fireEvent.click(await screen.findByRole('option', { name: 'Москва' }))
  await screen.findByRole('radio', { name: /пункт выдачи сдэк — (390|бесплатно)/i })
}

async function choosePoint(name: RegExp = /MSK310/) {
  const input = await screen.findByRole('combobox', { name: /пункт получения/i })
  fireEvent.focus(input)
  fireEvent.click(screen.getByRole('option', { name }))
}

function fillContacts() {
  fireEvent.change(screen.getByLabelText(/имя/i), { target: { value: 'Мария' } })
  fireEvent.change(screen.getByLabelText(/телефон/i), { target: { value: '9123456789' } })
}

async function fillValidForm() {
  fillContacts()
  await chooseCity()
  await choosePoint()
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /оформить заказ/i }))
}

function okCheckoutResponse(orderNumber = 'XM-2026-00042', paymentUrl: string | null = null) {
  return new Response(JSON.stringify({ data: { orderNumber, paymentUrl } }), {
    status: 201,
  })
}

describe('/checkout page', () => {
  it('shows the empty-cart state with a catalog CTA when the cart is empty', () => {
    render(<CheckoutPage />)
    expect(screen.getByText(/корзина пуста/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /открыть каталог/i })).toHaveAttribute(
      'href',
      '/categories',
    )
  })

  it('форма, поле «Город» и расчёт корзины без адреса', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    expect(screen.getByRole('heading', { name: 'Оформление заказа' })).toBeInTheDocument()
    expect(screen.getByLabelText(/имя/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/телефон/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/комментарий/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /доставка сдэк/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /город/i })).toBeInTheDocument()
    // Карте нужны места отправления — корзина уходит на расчёт без адреса.
    await vi.waitFor(() => expect(mockQuoteShipping).toHaveBeenCalledWith({ items: ITEMS }))
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('—')
  })

  it('masks the phone as +7 (XXX) XXX-XX-XX while typing', () => {
    seedCart(seed)
    render(<CheckoutPage />)
    const phone = screen.getByLabelText(/телефон/i)
    fireEvent.change(phone, { target: { value: '89123456789' } })
    expect(phone).toHaveValue('+7 (912) 345-67-89')
  })

  it('после города — цены обоих способов с сервера, в сводке — цена пункта выдачи', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    await chooseCity()
    expect(
      screen.getByRole('radio', { name: /пункт выдачи сдэк — 390\s₽, 3–5 дн\./i }),
    ).toBeChecked()
    expect(screen.getByRole('radio', { name: /курьер сдэк — 600\s₽, 2 дн\./i })).toBeInTheDocument()
    expect(mockQuoteShipping).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_pvz', cityCode: 44, address: 'Москва' },
    })
    expect(mockQuoteShipping).toHaveBeenCalledWith({
      items: ITEMS,
      destination: { method: 'cdek_courier', cityCode: 44, address: 'Москва' },
    })
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('390')
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 390')
  })

  it('полный путь без карты: город → пункт из списка → заказ', async () => {
    mapMock.available = false
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()
    expect(screen.getByText('Карта недоступна — выберите пункт из списка')).toBeInTheDocument()

    submit()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/checkout$/)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body as string)).toEqual({
      items: ITEMS,
      customer: { name: 'Мария', phone: '+79123456789' },
      delivery: {
        method: 'cdek_pvz',
        cityCode: 44,
        deliveryPointCode: 'MSK310',
        address: 'Москва, пр-т Мира, 108',
      },
    })
    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/order/XM-2026-00042?new=1')
    })
    expect(loadCart()).toEqual([])
  })

  it('курьер: свои поля, адрес «город, улица, кв.» и индекс', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillContacts()
    await chooseCity()
    fireEvent.click(screen.getByRole('radio', { name: /курьер сдэк/i }))
    fireEvent.change(screen.getByLabelText(/улица, дом/i), { target: { value: 'Тверская ул., 1' } })
    fireEvent.change(screen.getByLabelText(/квартира/i), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(/индекс/i), { target: { value: '125009' } })

    // Пока курьер пересчитывается по полному адресу — цены нет, оформить нельзя.
    const button = screen.getByRole('button', { name: /оформить заказ/i })
    expect(screen.getByRole('radio', { name: 'Курьер СДЭК — пересчитываем…' })).toBeChecked()
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent('—')
    expect(button).toBeDisabled()

    await vi.waitFor(() => expect(screen.getByTestId('summary-shipping')).toHaveTextContent('600'))
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2 600')
    expect(button).toBeEnabled()
    const courierFull = {
      method: 'cdek_courier',
      cityCode: 44,
      postalCode: '125009',
      address: 'Москва, Тверская ул., 1, кв. 12',
    }
    // Цену посчитали ровно по тому адресу, что уйдёт в заказ.
    expect(mockQuoteShipping).toHaveBeenCalledWith({ items: ITEMS, destination: courierFull })

    submit()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).delivery).toEqual(courierFull)
  })

  it('validates required fields in Russian and does not POST', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)

    submit()

    expect(await screen.findByText('Укажите имя')).toBeInTheDocument()
    expect(screen.getByText(/укажите телефон полностью/i)).toBeInTheDocument()
    expect(screen.getByText('Укажите город')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('после города: без пункта или без улицы — ошибка у своего поля', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    fillContacts()
    await chooseCity()
    await screen.findByRole('combobox', { name: /пункт получения/i })

    submit()
    expect(await screen.findByText('Выберите пункт получения')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /курьер сдэк/i }))
    submit()
    expect(await screen.findByText('Укажите улицу и дом')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('пункт исчез к оформлению — ошибка у поля, выбор сброшен, список загружается заново', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'delivery_point_unknown',
              message: 'Пункт выдачи не найден — выберите другой',
            },
          }),
          { status: 400 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

    submit()

    expect(await screen.findByText('Пункт выдачи не найден — выберите другой')).toBeInTheDocument()
    await vi.waitFor(() => expect(mockGetPoints).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('combobox', { name: /пункт получения/i })).toHaveValue('')
    expect(screen.queryByText(/не удалось оформить заказ/i)).toBeNull()
    expect(loadCart()).toHaveLength(1)
  })

  it('«Выбрать» на карте ставит пункт в список', async () => {
    seedCart(seed)
    render(<CheckoutPage />)
    await chooseCity()
    // Пункт с карты сверяется со списком города — ждём, пока он загрузится.
    await screen.findByRole('combobox', { name: /пункт получения/i })
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать на карте' }))
    expect(screen.getByRole('combobox', { name: /пункт получения/i })).toHaveValue(
      'MSK65 · ул. Динамовская, 1А, 110а',
    )
  })

  it('shows «Бесплатно» when the subtotal clears the free-shipping threshold', async () => {
    seedCart([
      {
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        slug: 'kit-b',
        name: 'Набор B',
        priceRub: 3500,
        quantity: 1,
      },
    ])
    render(<CheckoutPage />)
    await chooseCity()
    // 3500 ≥ 3000 → ПВЗ бесплатно
    expect(screen.getByRole('radio', { name: /пункт выдачи сдэк — бесплатно/i })).toBeChecked()
    expect(screen.getByTestId('summary-shipping')).toHaveTextContent(/бесплатно/i)
    expect(screen.getByTestId('summary-total')).toHaveTextContent('3 500')
  })

  it('передаёт ник Telegram покупателя в едином виде', async () => {
    const fetchMock = vi.fn(async () => okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()
    fireEvent.change(screen.getByLabelText(/telegram/i), { target: { value: 'maria_ivanova' } })

    submit()

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).customer).toEqual({
      name: 'Мария',
      phone: '+79123456789',
      telegram: '@maria_ivanova',
    })
  })

  it('reuses the same Idempotency-Key when retrying after a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(okCheckoutResponse())
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

    submit()
    expect(await screen.findByText(/не удалось связаться с сервером/i)).toBeInTheDocument()

    submit()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const firstKey = (fetchMock.mock.calls[0]![1].headers as Record<string, string>)[
      'Idempotency-Key'
    ]
    const secondKey = (fetchMock.mock.calls[1]![1].headers as Record<string, string>)[
      'Idempotency-Key'
    ]
    expect(secondKey).toBe(firstKey)
  })

  it('redirects to paymentUrl when the provider returns one', async () => {
    const fetchMock = vi.fn(async () =>
      okCheckoutResponse('XM-2026-00043', 'https://securepay.tinkoff.ru/pay/1'),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

    submit()

    await vi.waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith('https://securepay.tinkoff.ru/pay/1')
    })
    expect(mockPush).not.toHaveBeenCalled()
    expect(loadCart()).toEqual([])
  })

  it('shows the server message on 409 (availability changed)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'out_of_stock', message: 'Некоторые товары закончились' },
          }),
          { status: 409 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    seedCart(seed)
    render(<CheckoutPage />)
    await fillValidForm()

    submit()

    const alert = await screen.findByText(/некоторые товары закончились/i)
    expect(alert).toHaveTextContent(/обновите корзину/i)
    // Cart is preserved so the user can adjust it.
    expect(loadCart()).toHaveLength(1)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Убедиться, что падают**

Run: `npm test -w web -- lib/checkout.test.ts checkout/page.test.tsx`
Expected: FAIL — `validateCheckoutForm` ждёт `boolean`, на странице нет поля «Город».

- [ ] **Step 4: Проверка формы в `web/lib/checkout.ts`**

- импорт: `import type { DeliveryMethod } from '@ximi4ka-shop/shared'` оставить, добавить `import { isPostalCode } from './shipping'`;
- удалить `DELIVERY_LABELS` (строки 11–14): после этой задачи он нигде не используется;
- `CheckoutFormFields` — без `apartment` (квартира теперь в адресе курьера):

```ts
export interface CheckoutFormFields {
  name: string
  phone: string
  email: string
  telegram: string
  comment: string
}

export type CheckoutFormErrors = Partial<
  Record<
    | 'name'
    | 'phone'
    | 'email'
    | 'telegram'
    | 'city'
    | 'point'
    | 'street'
    | 'postalCode'
    | 'delivery',
    string
  >
>

// Что выбрано в блоке доставки — для проверки формы (спека §5.3).
export interface DeliveryFormState {
  city: { code: number } | null
  method: DeliveryMethod
  point: { code: string } | null
  courier: { street: string; postalCode: string }
  // Расчёт выбранного способа: оформить можно только с готовой ценой.
  quoteStatus: 'idle' | 'loading' | 'ready' | 'error'
}
```

- `validateCheckoutForm` заменить на:

```ts
// Client-side validation with Russian messages. Mirrors the zod schema on
// the server (checkout.schemas.ts) so a valid form never bounces off a 400.
// Доставка (§5.3): город, способ, пункт или улица с домом, готовая цена.
export function validateCheckoutForm(
  fields: CheckoutFormFields,
  delivery: DeliveryFormState,
): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {}
  if (fields.name.trim() === '') {
    errors.name = 'Укажите имя'
  }
  if (phoneDigits(fields.phone).length !== 11) {
    errors.phone = 'Укажите телефон полностью: +7 (XXX) XXX-XX-XX'
  }
  const email = fields.email.trim()
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Проверьте email — похоже, в нём опечатка'
  }
  if (fields.telegram.trim() !== '' && !normalizeTelegramHandle(fields.telegram)) {
    errors.telegram = 'Проверьте ник: 5–32 латинских букв, цифр или _'
  }
  if (!delivery.city) {
    errors.city = 'Укажите город'
  } else {
    if (delivery.method === 'cdek_pvz') {
      if (!delivery.point) errors.point = 'Выберите пункт получения'
    } else {
      if (delivery.courier.street.trim() === '') errors.street = 'Укажите улицу и дом'
      const postal = delivery.courier.postalCode.trim()
      if (postal !== '' && !isPostalCode(postal)) errors.postalCode = 'Индекс — 6 цифр'
    }
    if (delivery.quoteStatus === 'loading') {
      errors.delivery = 'Считаем доставку — подождите секунду'
    } else if (delivery.quoteStatus !== 'ready') {
      errors.delivery = 'Не удалось рассчитать доставку — нажмите «Повторить расчёт»'
    }
  }
  return errors
}
```

- [ ] **Step 5: Убрать старый `onChoose` из `web/lib/shipping.ts`**

Удалить `WidgetOfficeAddress`, `WidgetDoorAddress`, `WidgetTariff` и `destinationFromWidget` (все перегрузки). Комментарий над ними заменить на комментарий у `WidgetOffice` (Task 8). Остаются `WidgetOffice`, `widgetGoods`, `formatPeriod`, функции адреса из Task 7. В `web/lib/shipping.test.ts` удалить `describe('destinationFromWidget', …)` и `destinationFromWidget` из импорта.

Проверка: `grep -rn "destinationFromWidget\|WidgetDoorAddress\|WidgetOfficeAddress\|WidgetTariff\|DELIVERY_LABELS" web/app web/components web/lib` → пусто после Step 6.

- [ ] **Step 6: Новая страница целиком — `web/app/[locale]/(public)/checkout/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CheckoutRequest } from '@ximi4ka-shop/shared'
import { useCart } from '@/lib/cart'
import { ApiError, quoteShipping, submitCheckout, type ShippingQuoteResponse } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import { CdekDelivery } from '@/components/checkout/CdekDelivery'
import { ERROR_CLASS, FIELD_CLASS, LABEL_CLASS } from '@/components/checkout/fieldStyles'
import { useCdekDelivery } from '@/components/checkout/useCdekDelivery'
import {
  clearIdempotencyKey,
  formatPhoneInput,
  getOrCreateIdempotencyKey,
  normalizeTelegramHandle,
  phoneDigits,
  redirectTo,
  validateCheckoutForm,
  type CheckoutFormErrors,
  type CheckoutFormFields,
} from '@/lib/checkout'

const INITIAL_FIELDS: CheckoutFormFields = {
  name: '',
  phone: '',
  email: '',
  telegram: '',
  comment: '',
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clear } = useCart()
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  const [fields, setFields] = useState<CheckoutFormFields>(INITIAL_FIELDS)
  const [errors, setErrors] = useState<CheckoutFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Город, способ, пункт или адрес курьера и цены — в блоке доставки (спека §5).
  const delivery = useCdekDelivery(items)

  // Места отправления и тарифы — для карты СДЭК: по ним она считает цены на
  // пунктах. Не загрузились — карты нет, а список и курьер работают (§5.2).
  const [shipping, setShipping] = useState<ShippingQuoteResponse | null>(null)

  const cartKey = items.map((i) => `${i.productId}:${i.quantity}`).join(',')
  useEffect(() => {
    if (!hydrated || cartKey === '') return
    let cancelled = false
    quoteShipping({ items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) })
      .then((data) => {
        if (!cancelled) setShipping(data)
      })
      .catch(() => {
        // Без мест карта не покажется; цены способов считает блок доставки.
      })
    return () => {
      cancelled = true
    }
    // items меняются вместе с cartKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartKey])

  const quote = delivery.quote
  const shippingRub = quote?.customerPriceRub ?? 0
  const totalRub = subtotal + shippingRub

  function setField<K extends keyof CheckoutFormFields>(key: K, value: CheckoutFormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const validation = validateCheckoutForm(fields, {
      city: delivery.city,
      method: delivery.method,
      point: delivery.point,
      courier: delivery.courier,
      quoteStatus: delivery.quotes[delivery.method].status,
    })
    setErrors(validation)
    const destination = delivery.destination
    if (Object.keys(validation).length > 0 || !destination) return

    const email = fields.email.trim()
    const telegram = normalizeTelegramHandle(fields.telegram)
    const comment = fields.comment.trim()
    const payload: CheckoutRequest = {
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      customer: {
        name: fields.name.trim(),
        phone: `+${phoneDigits(fields.phone)}`,
        ...(email !== '' ? { email } : {}),
        ...(telegram ? { telegram } : {}),
      },
      delivery: {
        ...destination,
        ...(comment !== '' ? { comment } : {}),
      },
    }

    setSubmitting(true)
    setServerError(null)
    try {
      // The key survives failed attempts (sessionStorage): a retry re-sends
      // the same one, so the server never creates a duplicate order.
      const result = await submitCheckout(payload, getOrCreateIdempotencyKey())
      clearIdempotencyKey()
      clear()
      if (result.paymentUrl) {
        redirectTo(result.paymentUrl)
      } else {
        router.push(`/order/${result.orderNumber}?new=1`)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'delivery_point_unknown') {
          // Пункт закрылся, пока покупатель оформлял (§4.3): ошибка у поля
          // «Пункт получения», выбор сброшен, список города грузится заново.
          delivery.rejectPoint(err.message)
        } else if (err.status === 409) {
          // Наличие/доступность товаров изменились между корзиной и сабмитом.
          setServerError(`${err.message}. Обновите корзину и попробуйте ещё раз.`)
        } else {
          setServerError(`Не удалось оформить заказ: ${err.message}`)
        }
      } else {
        setServerError(
          'Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.',
        )
      }
      setSubmitting(false)
    }
  }

  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[80vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] mb-6 opacity-70">
          КОРЗИНА → ОФОРМЛЕНИЕ
        </p>

        <h1 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] tracking-[-0.045em] mb-12 text-[var(--color-lj-ink)]">
          Оформление заказа
        </h1>

        {!hydrated ? (
          <div className="min-h-[40vh]" />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-6">
            <p className="text-xl text-[var(--color-lj-ink)] opacity-70">Корзина пуста</p>
            <Link
              href="/categories"
              className="inline-flex items-center gap-3 px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright"
            >
              Открыть каталог →
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 items-start"
          >
            {/* ---- Левая колонка: данные покупателя и доставка ---- */}
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-name" className={LABEL_CLASS}>
                  Имя *
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  autoComplete="name"
                  value={fields.name}
                  onChange={(e) => setField('name', e.target.value)}
                  aria-invalid={errors.name ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.name && <p className={ERROR_CLASS}>{errors.name}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-phone" className={LABEL_CLASS}>
                  Телефон *
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7 (___) ___-__-__"
                  value={fields.phone}
                  onChange={(e) => setField('phone', formatPhoneInput(e.target.value))}
                  aria-invalid={errors.phone ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.phone && <p className={ERROR_CLASS}>{errors.phone}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-email" className={LABEL_CLASS}>
                  Email
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  value={fields.email}
                  onChange={(e) => setField('email', e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  className={FIELD_CLASS}
                />
                {errors.email && <p className={ERROR_CLASS}>{errors.email}</p>}
              </div>

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

              <CdekDelivery delivery={delivery} shipping={shipping} errors={errors} />

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-comment" className={LABEL_CLASS}>
                  Комментарий к заказу
                </label>
                <textarea
                  id="checkout-comment"
                  rows={3}
                  value={fields.comment}
                  onChange={(e) => setField('comment', e.target.value)}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </div>
            </div>

            {/* ---- Правая колонка: сводка заказа ---- */}
            <aside className="border border-[var(--color-lj-rule)] p-6 flex flex-col gap-5 lg:sticky lg:top-24">
              <h2 className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] opacity-70 m-0">
                Ваш заказ
              </h2>

              <ul className="list-none p-0 m-0 flex flex-col">
                {items.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-baseline justify-between gap-4 py-3 border-b border-[var(--color-lj-rule)]"
                  >
                    <span className="font-lj-body text-base text-[var(--color-lj-ink)] min-w-0 truncate">
                      {item.name}
                      <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] opacity-60">
                        {' '}
                        × {item.quantity}
                      </span>
                    </span>
                    <span className="font-lj-display font-[700] text-base tracking-[-0.02em] text-[var(--color-lj-ink)] whitespace-nowrap">
                      {formatRub(item.priceRub * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
                  <span>Подытог</span>
                  <span data-testid="summary-subtotal">{formatRub(subtotal)}</span>
                </div>
                <div className="flex justify-between font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
                  <span>Доставка</span>
                  <span data-testid="summary-shipping">
                    {quote ? (shippingRub === 0 ? 'Бесплатно' : formatRub(shippingRub)) : '—'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[var(--color-lj-rule)] pt-4 font-lj-display font-[900] text-2xl tracking-[-0.04em] text-[var(--color-lj-ink)]">
                  <span>Итого</span>
                  <span data-testid="summary-total">{formatRub(totalRub)}</span>
                </div>
              </div>

              {serverError && (
                <p role="alert" className={ERROR_CLASS}>
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || delivery.quoting}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Оформляем…' : 'Оформить заказ →'}
              </button>

              <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-50 m-0">
                Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных
              </p>
            </aside>
          </form>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Всё зелёное**

Run: `npm test -w web`
Expected: PASS (все файлы).
Run: `npm run typecheck -w web && npm run lint -w web` → без ошибок.
Run: `grep -rn "destinationFromWidget\|WidgetDoorAddress\|WidgetOfficeAddress\|WidgetTariff\|DELIVERY_LABELS" web/app web/components web/lib` → пусто.

- [ ] **Step 8: Коммит**

```bash
npx prettier --write web/lib/checkout.ts web/lib/checkout.test.ts web/lib/shipping.ts web/lib/shipping.test.ts "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx"
git add web/lib/checkout.ts web/lib/checkout.test.ts web/lib/shipping.ts web/lib/shipping.test.ts "web/app/[locale]/(public)/checkout/page.tsx" "web/app/[locale]/(public)/checkout/page.test.tsx"
git commit -m "feat(web): чекаут на списке ПВЗ и своих полях курьера

Форма требует город, способ, пункт или улицу с домом и готовую цену.
Отклонённый сервером пункт сбрасывается с ошибкой у поля. Весь путь
проходит и без карты.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Полная проверка, живой прогон в браузере, ревью

> Правила задачи: работать только в `$WT`; новых зависимостей не добавлять; не пушить. Из основного checkout — только чтение `api/.env`/`web/.env.local` и две новые записи в его `.claude/launch.json`.

**Files:** кода не меняет. Правки по итогам ревью — отдельными коммитами с тестом на каждую находку.

Почему прогон так огорожен. В основном checkout `api/.env` указывает на общую dev-базу `ximi4ka_shop` и содержит боевые ключи СДЭК, Telegram рабочего чата, Google Таблицу и ERP. `preview_start` читает `launch.json` из корня проекта сессии — это основной checkout, — и сервер с уже занятым именем (`api`, `web`) переиспользует. Такой api грузит `api/.env` основного checkout, и тестовый заказ уйдёт в общую базу и в рабочий чат. Поэтому серверы этой ветки — отдельные записи `pvz-api`/`pvz-web` на портах 3031/3030 со своей базой, в песочнице СДЭК, без внешних каналов. Перед первым заказом стоит жёсткая проверка. Значения секретов не печатать.

- [ ] **Step 1: Автоматические проверки**

Run: `TEST_DATABASE_URL=postgres://localhost:5432/ximi4ka_shop_test_pvz npm test` (все воркспейсы) → PASS.
Run: `npm run typecheck && npm run lint` → без ошибок.
Run: `git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx)$' | xargs grep -n "TODO\|FIXME\|\.only(\|\.skip(" ; true` → пусто.

- [ ] **Step 2: Файлы окружения worktree**

```bash
WT=/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list
MAIN=/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop
# Значения в .env — однострочные? Иначе построчный фильтр ниже оставит хвосты секретов.
awk '!/^[A-Za-z_][A-Za-z0-9_]*=/ && !/^[[:space:]]*#/ && !/^[[:space:]]*$/ {c++} END {print c+0}' "$MAIN/api/.env"
# ожидание: 0. Иначе — остановиться и разобрать вручную.

DEV_URL=$(grep '^DATABASE_URL=' "$MAIN/api/.env" | cut -d= -f2-)
LIVE_URL=$(printf '%s' "$DEV_URL" | sed -E 's#/ximi4ka_shop([?]|$)#/ximi4ka_shop_pvz_live\1#')
# Своя база — копия dev-базы: товары для корзины есть, чужой api её не видит.
if ! psql "$DEV_URL" -tAc "select 1 from pg_database where datname = 'ximi4ka_shop_pvz_live'" | grep -q 1; then
  psql "$DEV_URL" -c 'CREATE DATABASE ximi4ka_shop_pvz_live'
  pg_dump "$DEV_URL" | psql -q "$LIVE_URL"
fi

# api/.env worktree: своя база, порт 3031, песочница СДЭК с общей тестовой
# учёткой; Telegram, Google, ERP, боевые ключи СДЭК и оплата — вырезаны целиком.
# ERP_* сейчас не читает ни один модуль api, но строки всё равно убираем.
grep -Ev '^(DATABASE_URL|PORT|WEB_ORIGIN|CDEK_API_URL|CDEK_CLIENT[A-Z_]*|TELEGRAM[A-Z_]*|GOOGLE[A-Z_]*|ERP[A-Z_]*|PAYMENT_PROVIDER|TBANK[A-Z_]*)=' \
  "$MAIN/api/.env" > "$WT/api/.env"
printf 'DATABASE_URL=%s\nPORT=3031\nWEB_ORIGIN=http://localhost:3030\nCDEK_API_URL=https://api.edu.cdek.ru/v2\n' "$LIVE_URL" >> "$WT/api/.env"
# web/.env.local worktree: ключи Яндекса те же, api — на 3031.
grep -v '^NEXT_PUBLIC_API_URL=' "$MAIN/web/.env.local" > "$WT/web/.env.local"
echo 'NEXT_PUBLIC_API_URL=http://localhost:3031' >> "$WT/web/.env.local"
git -C "$WT" status --short   # пусто: .env-файлы в .gitignore
```

- [ ] **Step 3: Записи `pvz-api`/`pvz-web` в `launch.json` основного checkout**

`$MAIN/.claude/launch.json` в `.gitignore`. Существующие записи (`api`, `web`) не трогать: к ним подключается другой агент. Скрипт добавляет только `pvz-*`, а при повторном запуске заменяет их же. В команде api каналы и боевые ключи ещё раз обнулены переменными окружения: dotenv не перезаписывает уже заданные переменные, даже пустые.

```bash
node -e '
const fs = require("fs")
const [path, wt] = process.argv.slice(1)
const cfg = JSON.parse(fs.readFileSync(path, "utf8"))
const blank = "TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= GOOGLE_SERVICE_ACCOUNT_JSON= GOOGLE_SHEETS_ID= CDEK_CLIENT_ID= CDEK_CLIENT_SECRET= ERP_INBOUND_URL= ERP_SHARED_SECRET="
const web = (extra) => ["-c", `cd ${wt} && NEXT_PUBLIC_API_URL=http://localhost:3031 ${extra}exec npm run dev -w web -- -p 3030`]
const add = [
  { name: "pvz-api", runtimeExecutable: "sh", runtimeArgs: ["-c", `cd ${wt} && PORT=3031 WEB_ORIGIN=http://localhost:3030 CDEK_API_URL=https://api.edu.cdek.ru/v2 ${blank} exec npm run dev -w api`], port: 3031 },
  { name: "pvz-web", runtimeExecutable: "sh", runtimeArgs: web(""), port: 3030 },
  { name: "pvz-web-nomap", runtimeExecutable: "sh", runtimeArgs: web("NEXT_PUBLIC_YANDEX_MAPS_API_KEY= "), port: 3030 },
]
cfg.configurations = cfg.configurations.filter((c) => !add.some((a) => a.name === c.name)).concat(add)
fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n")
' "$MAIN/.claude/launch.json" "$WT"
node -p "require('$MAIN/.claude/launch.json').configurations.map((c) => c.name).join(' ')"
# ожидание: прежние записи без изменений (web, api и те, что добавил другой агент), в конце — pvz-api pvz-web pvz-web-nomap
lsof -nP -iTCP:3030 -iTCP:3031 -sTCP:LISTEN
# ожидание: пусто. Занято — не убивать чужое, выяснить, чьё это.
```

Поднять: `preview_start` с `name: "pvz-api"`, затем `name: "pvz-web"`. Не `api`/`web`.

- [ ] **Step 4: Жёсткая проверка перед первым заказом**

Не прошла любая строка — остановиться. Серверы `pvz-*` остановить (`preview_stop`), заказов не оформлять, сообщить.

```bash
# 1. На 3031 слушает api из worktree, а не из основного checkout.
lsof -a -p "$(lsof -t -iTCP:3031 -sTCP:LISTEN | paste -sd, -)" -d cwd -Fn | grep '^n'
# ожидание: n/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/cdek-pvz-list/api
lsof -a -p "$(lsof -t -iTCP:3030 -sTCP:LISTEN | paste -sd, -)" -d cwd -Fn | grep '^n'
# ожидание: n…/.claude/worktrees/cdek-pvz-list/web
# 2. Маршрут есть только в этой ветке — и песочница СДЭК отвечает.
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3031/api/public/cdek/cities?q=%D0%9C%D0%BE%D1%81%D0%BA'
# ожидание: 200
# 3. Внешние каналы, боевые ключи и оплата вырезаны.
grep -cE '^(TELEGRAM|GOOGLE|CDEK_CLIENT|ERP|PAYMENT_PROVIDER|TBANK)' "$WT/api/.env"
# ожидание: 0
grep -c '^DATABASE_URL=.*/ximi4ka_shop_pvz_live' "$WT/api/.env"
# ожидание: 1
# 4. Счётчики заказов — до первого заказа.
psql "$LIVE_URL" -tAc 'select count(*) from orders'
psql "$DEV_URL" -tAc 'select count(*) from orders'
```

Все тестовые заказы оформлять на имя вида `Проверка ПВЗ <HHMM>` — по нему заказ видно в базе. После **первого** заказа:

```bash
psql "$LIVE_URL" -tAc "select count(*) from orders where customer_name like 'Проверка ПВЗ%'"   # ≥ 1
psql "$DEV_URL" -tAc "select count(*) from orders where customer_name like 'Проверка ПВЗ%'"    # 0
psql "$LIVE_URL" -tAc 'select count(*) from orders'   # на 1 больше, чем до заказа
psql "$DEV_URL" -tAc 'select count(*) from orders'    # как до заказа
```

Счётчик dev-базы вырос, но заказов «Проверка ПВЗ» в ней нет — это заказ другого агента, не тревога. Хоть один «Проверка ПВЗ» в dev-базе — немедленно остановить `pvz-*` и сообщить: заказ ушёл в общую базу.

- [ ] **Step 5: API вживую (песочница)**

```bash
curl -s "http://localhost:3031/api/public/cdek/cities?q=%D0%9C%D0%BE%D1%81%D0%BA" | head -c 400
# ожидание: {"data":[{"code":44,"name":"Москва","fullName":"Москва, Россия"}, …]}
curl -s -o /dev/null -w '%{http_code} %{size_download}B %{time_total}s\n' "http://localhost:3031/api/public/cdek/points?cityCode=44"
curl -s -o /dev/null -w '%{http_code} %{size_download}B %{time_total}s\n' "http://localhost:3031/api/public/cdek/points?cityCode=44"
# ожидание: 200 оба раза; второй — заметно быстрее (кеш); размер — десятки КБ, не сотни
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3031/api/public/cdek/points?cityCode=abc"   # 400
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3031/api/public/cdek/cities?q=%D0%BC"      # 400
```

- [ ] **Step 6: Браузер, 1280 px**

`resize_window` 1280×900, `http://localhost:3030`, товар в корзину, `/checkout`. Проверить и снять скриншоты:

1. «Город»: «Моск» → через ~250 мс подсказки, «Москва» выбрана, под полем «Москва, Россия». В сети запросы `cities` отменяются при быстрой печати (статус `canceled`).
2. Радио «Пункт выдачи СДЭК — N ₽, …» и «Курьер СДЭК — N ₽, …» — цены пришли с сервера, сводка справа совпадает с выбранным способом.
3. «Пункт получения»: фокус — список до 50 строк и «Показаны 50 из N — уточните запрос»; запрос из двух слов адреса песочницы (например «динамовская 1») сужает список; стрелки, Enter и Esc работают; Enter не отправляет форму.
4. Выбор в списке — карта под списком центрируется на пункте и открывает его карточку в пределах 3 с. «Выбрать» на другом пункте карты — пункт появляется в поле списка. **Отдельно:** выбрать пункт в списке и сразу, в первые 3 с, покрутить колесо над картой и нажать `-`/`+` на карте. Карта не должна прыгать обратно к пункту на масштаб 17. Прыгает — значит, повтор `selectOffice` не остановился (события не дошли до слушателей на погружении у корня карты): разобрать, на каком элементе и каком событии, дописать тест в `CdekWidget.test.tsx`, поправить.
5. На карте нет вкладки «Курьер» и постаматов. Если постаматы или вкладка видны, `forceFilters`/`hideDeliveryOptions` не сработали: разобрать и поправить с тестом.
6. Сдвинуть карту в другой город, «Выбрать» пункт там — «Этот пункт в другом городе — смените город», поле пункта не меняется. Сразу после смены города, пока список грузится, «Выбрать» на карте — «Список ещё загружается — попробуйте через секунду».
7. Смена города: стереть «Москва» и ввести «Санкт-Петербург». Карта не пропадает и не перезагружается ни на первой букве, ни пока грузится список. Пункт сброшен, цены пересчитаны, карта уехала в Петербург.
8. Курьер: «Улица, дом», «Квартира/офис», «Индекс» (только цифры, до 6). После ввода адреса — «Курьер СДЭК — пересчитываем…», сводка «—», кнопка недоступна. Через полсекунды — цена по полному адресу, кнопка доступна. Оформить на имя «Проверка ПВЗ <HHMM>» → страница заказа. **Сразу — проверки Step 4 «после первого заказа».** Затем:

   ```bash
   psql "$LIVE_URL" -c "select order_number, delivery_method, shipping_rub,
     delivery_address->>'address' as address, delivery_address->>'postalCode' as postal,
     delivery_address->'quote'->>'source' as source
     from orders where customer_name like 'Проверка ПВЗ%' order by created_at desc limit 3"
   ```

   Ожидание: `cdek_courier`, адрес «Санкт-Петербург, <улица>, кв. <n>», индекс — введённый, `shipping_rub` равен цене курьера, которую показывал чекаут перед нажатием.

9. ПВЗ: оформить заказ с пунктом из списка. Тот же запрос плюс `delivery_address->>'deliveryPointCode'`: код пункта, адрес «город, адрес пункта», `shipping_rub` равен цене ПВЗ на чекауте.
10. Перезагрузить `/checkout` — город подставлен из прошлого визита, пункты загружены без ввода.
11. Консоль браузера — без ошибок React (`read_console_messages` с `onlyErrors`).

- [ ] **Step 7: Браузер, 375 px**

`resize_window` 375×812, перезагрузить `/checkout`:

1. Под «Пункт получения» — кнопка «Показать на карте». В сети нет запроса к `cdn.jsdelivr.net/npm/@cdek-it/widget` и к Яндексу, пока кнопку не нажали.
2. Весь путь до заказа — только списком (имя «Проверка ПВЗ <HHMM>»).
3. Нажать «Показать на карте» — карта грузится, синхронизация как на 1280. Сменить город — карта остаётся открытой, за кнопку не сворачивается.
4. Горизонтальной прокрутки нет: `document.documentElement.scrollWidth <= 375` (`javascript_tool`). Выпадающие списки не выходят за экран.

- [ ] **Step 8: Без карты**

`preview_stop` для `pvz-web`, `preview_start` с `name: "pvz-web-nomap"` (тот же порт 3030, ключ Яндекса обнулён переменной окружения; файлы не трогаем). На 1280: вместо карты «Карта недоступна — выберите пункт из списка». Оформить заказ через список (имя «Проверка ПВЗ <HHMM>») — проходит до страницы заказа, в `$LIVE_URL` он есть. Вернуть `pvz-web`: `preview_stop` для `pvz-web-nomap`, `preview_start` `pvz-web`.

- [ ] **Step 9: Ревью**

`/code-review` по всему диффу ветки и `/security-review`: новые публичные эндпоинты, прокси к договорному ключу СДЭК, `localStorage`, данные покупателя в заказе, логи ошибок СДЭК без пользовательских данных (спека §7). Найденное исправить отдельными коммитами, у каждой правки — свой тест.

- [ ] **Step 10: Уборка**

Остановить `pvz-api` и `pvz-web` (`preview_stop`). Удалить скриншоты и разовые файлы из скретчпада. Базу `ximi4ka_shop_pvz_live`, копии `.env` в worktree и записи `pvz-*` в `launch.json` основного checkout не удалять без согласия владельца: база — копия с данными покупателей, удаление необратимо, а записи нужны для повторного прогона. Перечислить их в отчёте.

- [ ] **Step 11: Выкатка — вне этого плана**

Не выполнять. Влить в `main` (push в `main` — автодеплой на прод) — только после отдельного «да» владельца и после слияния с `feat/cdek-orders` (раздел «Слияние»).
