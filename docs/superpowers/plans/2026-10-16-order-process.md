# Блок «Заказ и доставка» на главной и страница `/order-process` — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить на главную компактный блок про оформление, оплату, отправку и сроки доставки СДЭК и подробную страницу `/order-process` со скриншотами интерфейса.

**Architecture:** Один модуль данных `web/lib/orderProcess.ts` (шаги, зоны с флагами, сроки СДЭК) питает и блок на главной, и страницу. Пороги РФ читаются из `SHIPPING_RULES` в момент вызова. Страница статическая и не обращается к API. Скриншоты снимаются Playwright'ом на локальном стенде и лежат в `web/public/img/order-process/`.

**Tech Stack:** Next.js (не тот, что в обучающих данных — читать `web/node_modules/next/dist/docs/` перед кодом), React, Tailwind (классы Lab Journal), Vitest + Testing Library, Playwright, `sharp` (уже есть в корневом `node_modules`), SVG-флаги из пакета `flag-icons` (MIT).

**Spec:** `docs/superpowers/specs/2026-10-16-order-process-design.md`

## Global Constraints

- Работа по `docs/seo/WORKFLOW.md`: ветка `claude/order-delivery-block-d72c75` от свежего `origin/main`; один PR; **мёрж в `main` = выкатка, только по явной команде владельца**; push и PR — тоже только после команды владельца.
- Факты не выдумывать (правило 4): страны и условия только из спеки. Пороги: Россия — от 3000 ₽ до пункта выдачи, курьером — от 5000 ₽; Беларусь — от 3000 ₽; Казахстан, Армения, Киргизия — от 5000 ₽; Узбекистан, Азербайджан, Таджикистан — доставка оплачивается отдельно; Молдовы нет.
- Сроки СДЭК: Москва и МО, Ленинградская область — 2–3 дня; европейская часть России, Кавказ — 3–5 дней; Сибирь, Забайкалье, Дальний Восток — 7–10 дней. Отправка со склада — в течение суток.
- Юридическая фраза на странице — дословно из существующей `/delivery`: «Риск случайной гибели или повреждения товара переходит к Покупателю с момента передачи товара службе доставки.» и ссылка на оферту `/oferta` (правило 5).
- `/delivery` и `/dostavka` не трогать. Цены и пороги в чекауте не менять.
- Стиль: Lab Journal (`LabSection`, `font-lj-*`, `--color-lj-*`), как в `HowItWorksStepLJ` и `WholesaleHomeSection`. Тексты только на русском.
- Перед PR (с реальным выводом): `npm run lint && npm run typecheck` (корень), `npm run test -w web`, `npx prettier --check .` (корень).
- Сообщения коммитов на русском в стиле `git log` (`feat(web): …`), последняя строка: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Скретчпад (временные файлы): `/private/tmp/claude-501/-Users-vasilijaistov-Desktop-continuum-ximi4ka-shop--claude-worktrees-articles-sya-audit-315de8/020cb5f9-ca76-47a6-b51b-0ccd8453a5fc/scratchpad` (далее `$SCRATCH`). Не использовать `/tmp`.

## Review Focus

- Порог РФ в `SHIPPING_RULES` изменили → блок и страница должны показать новые числа без правки текста (тест мутирует `SHIPPING_RULES`, Task 3).
- Английская локаль: `/en/order-process` отдаёт canonical и крошки с префиксом `/en`, а неизвестная локаль даёт 404 (Task 6).
- Узкий экран 375 px: нет горизонтальной прокрутки, таблица сроков и зон не вылезает (проверка в браузере, Task 7).
- Файл флага или скриншота пропал или переименован → тест падает, а не страница молча показывает пустое место (Task 3).
- Набор стран ровно из спеки (Молдовы и лишних стран нет); флаги декоративные (`alt=""`), название страны читается один раз (Tasks 3, 4).

---

### Task 1: Локальный стенд и четыре скриншота

Первой, потому что тут выясняется, что интерфейс реально показывает (тексты шагов 1–2 опираются на это), и потому что тест в Task 3 требует файлы на диске.

**Files:**
- Create: `web/public/img/order-process/{cart,checkout,order-page,account}.webp` (1200×750)
- Временно (не коммитить): `$SCRATCH/shots/{setup.sql,capture.cjs,convert.cjs}`, `$SCRATCH/shots/raw/*.png`, две записи в `.claude/launch.json`

**Interfaces:**
- Produces: четыре файла по путям выше; Task 3 ссылается на них как `/img/order-process/<имя>.webp`.

Стенд: scratch-БД `shots_scratch` в локальной Postgres 16, api на `:3021`, web на `:3020`, всё только на localhost. Ничего из прода не используется; платежи и СДЭК не нужны (`PAYMENT_PROVIDER=manual` по умолчанию, ответы СДЭК подменяет Playwright). Данные в кадре вымышленные.

- [ ] **Step 1: Создать БД, миграции и сид — только в scratch-БД**

```bash
cd /Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/articles-sya-audit-315de8
export DATABASE_URL=postgres://vasilijaistov@localhost:5432/shots_scratch
echo "$DATABASE_URL" | grep -q shots_scratch || { echo "СТОП: не scratch-БД"; exit 1; }
createdb -h /tmp shots_scratch
npm run migration:run -w api
npm run seed -w api
psql "$DATABASE_URL" -Atc "select slug, price_rub from products order by slug"
```

Expected: миграции применены без ошибок; в списке есть `nabor-yunogo-himika|2490` и `vulkan-lavy|1490`. Сид делает TRUNCATE — запускать только при `shots_scratch` в `DATABASE_URL` (проверка выше).

- [ ] **Step 2: Тестовые данные (картинки товаров, покупатель, сессия, оплаченный заказ с треком)**

Создать `$SCRATCH/shots/setup.sql`:

```sql
insert into product_images(product_id, url, alt, sort_order)
select id, '/img/promo/gift-box.webp', name, 0 from products;

insert into customers(id, email, name, phone)
values ('00000000-0000-0000-0000-0000000000c1', 'buyer@test.local', 'Иван Тестов', '+79001234567');

insert into customer_sessions(token_hash, customer_id, expires_at)
values (encode(sha256('shot-session-token-123'::bytea), 'hex'),
        '00000000-0000-0000-0000-0000000000c1', now() + interval '30 days');

insert into orders(order_number, status, customer_name, customer_phone, customer_email,
                   delivery_method, delivery_address, subtotal_rub, discount_rub, shipping_rub,
                   total_rub, payment_provider, paid_at, customer_id, placed_signed_in, public_token)
values ('XM-2026-90001', 'paid', 'Иван Тестов', '+79001234567', 'buyer@test.local',
        'cdek_pvz',
        '{"address":"Москва, ул. Тестовая, 1","comment":null,"cityCode":44,"deliveryPointCode":"MSK310"}',
        3980, 0, 0, 3980, 'manual', now(), '00000000-0000-0000-0000-0000000000c1', true,
        'testtoken0123456789abcdef01234567');

insert into order_items(order_id, product_id, product_snapshot, quantity, unit_price_rub, line_total_rub)
select o.id, p.id,
       jsonb_build_object('name', p.name, 'sku', null, 'priceRub', p.price_rub),
       1, p.price_rub, p.price_rub
from orders o, products p
where o.order_number = 'XM-2026-90001' and p.slug in ('nabor-yunogo-himika', 'vulkan-lavy');

insert into cdek_shipments(order_id, state, cdek_number, cdek_uuid, submitted_at)
select id, 'created', '1234567890', '11111111-1111-1111-1111-111111111111', now()
from orders where order_number = 'XM-2026-90001';
```

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRATCH/shots/setup.sql"
psql "$DATABASE_URL" -Atc "select order_number, status, total_rub from orders"
```

Expected: `XM-2026-90001|paid|3980`. Если вставка упала на имени колонки — сверить с `\d <таблица>` и поправить SQL (схема из отчёта разведки, не проверена запуском).

- [ ] **Step 3: Запустить api и web через preview_start**

Добавить в `.claude/launch.json` две конфигурации (по образцу существующих `sh -c`):

```json
    {
      "name": "shots-api",
      "runtimeExecutable": "sh",
      "runtimeArgs": [
        "-c",
        "DATABASE_URL=postgres://vasilijaistov@localhost:5432/shots_scratch PORT=3021 WEB_ORIGIN=http://localhost:3020 TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= GOOGLE_SERVICE_ACCOUNT_JSON= GOOGLE_SHEETS_ID= ERP_INBOUND_URL= ERP_SHARED_SECRET= CDEK_ORDERS_ENABLED= CDEK_CLIENT_ID= CDEK_CLIENT_SECRET= exec npm run dev -w api"
      ],
      "port": 3021
    },
    {
      "name": "shots-web",
      "runtimeExecutable": "sh",
      "runtimeArgs": [
        "-c",
        "API_URL=http://localhost:3021 NEXT_PUBLIC_API_URL=http://localhost:3021 NEXT_PUBLIC_SITE_URL=http://localhost:3020 NEXT_PUBLIC_YANDEX_MAPS_API_KEY= exec npm run dev -w web -- -p 3020"
      ],
      "port": 3020
    }
```

Вызвать `preview_start` с `name: "shots-api"`, затем `"shots-web"`. Проверить:

```bash
curl -s "http://localhost:3021/api/public/products?limit=2" | head -c 300
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3020/ru/catalog
```

Expected: JSON с товарами сида и `200`. Если web падает — `preview_logs`.

- [ ] **Step 4: Скрипт съёмки**

Создать `$SCRATCH/shots/capture.cjs`:

```js
const path = require('node:path')
const fs = require('node:fs')

const WEB_DIR =
  '/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/articles-sya-audit-315de8/web'
const { chromium } = require(require.resolve('@playwright/test', { paths: [WEB_DIR] }))

const WEB = 'http://localhost:3020'
const API = 'http://localhost:3021'
const OUT = path.join(__dirname, 'raw')
fs.mkdirSync(OUT, { recursive: true })

const cors = {
  'access-control-allow-origin': WEB,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}
const reply = (route, data) =>
  route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: cors,
        body: JSON.stringify({ data }),
      })

const POINTS = [
  ['MSK310', 'Пункт выдачи СДЭК (тест 1)', 'Москва, ул. Тестовая, 1', [37.62, 55.75]],
  ['MSK311', 'Пункт выдачи СДЭК (тест 2)', 'Москва, ул. Тестовая, 2', [37.64, 55.76]],
  ['MSK312', 'Пункт выдачи СДЭК (тест 3)', 'Москва, ул. Тестовая, 3', [37.6, 55.74]],
].map(([code, name, address, location]) => ({ code, name, address, location, workTime: 'пн-вс 10-20' }))

async function mockCdek(context, subtotal) {
  await context.route(/\/api\/public\/cdek\/cities/, (r) =>
    reply(r, [{ code: 44, name: 'Москва', fullName: 'Москва, Москва, Россия' }]),
  )
  await context.route(/\/api\/public\/cdek\/points/, (r) =>
    reply(r, { city: { code: 44, name: 'Москва', location: [37.6176, 55.7558] }, points: POINTS }),
  )
  await context.route(/\/api\/public\/shipping\/quote/, (r) => {
    if (r.request().method() === 'OPTIONS') return reply(r, null)
    const dest = JSON.parse(r.request().postData() || '{}').destination
    const pvz = dest?.method === 'cdek_pvz'
    reply(r, {
      subtotalRub: subtotal,
      discountRub: 0,
      packages: [
        { box: 'small', weightG: 800, lengthCm: 20, widthCm: 15, heightCm: 10, estimated: false, items: [] },
      ],
      quote: dest
        ? {
            method: dest.method,
            tariffCode: pvz ? 136 : 137,
            customerPriceRub: pvz && subtotal >= 3000 ? 0 : pvz ? 350 : 500,
            cdekPriceRub: pvz ? 350 : 500,
            periodMin: 2,
            periodMax: 3,
            free: pvz && subtotal >= 3000,
            source: 'cdek',
          }
        : null,
      tariffs: { pvz: 136, courier: 137 },
    })
  })
}

async function newContext(browser, { cart, city, session } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
  })
  // Только localhost: внешние скрипты (счётчики, карты) режем.
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => route.abort(),
  )
  await context.addInitScript(
    ({ cart, city }) => {
      try {
        if (cart) localStorage.setItem('ximi4ka-shop-cart', JSON.stringify(cart))
        if (city) localStorage.setItem('ximi4ka-checkout-city', JSON.stringify(city))
      } catch {}
    },
    { cart, city },
  )
  if (session) {
    await context.addCookies([
      { name: 'ximi4ka_customer_session', value: session, domain: 'localhost', path: '/' },
    ])
  }
  return context
}

async function shot(page, name) {
  // Индикатор dev-режима Next не должен попасть в кадр.
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log('снято', name)
}

;(async () => {
  const res = await fetch(`${API}/api/public/products?limit=20`)
  const products = (await res.json()).data
  const bySlug = (slug) => products.find((p) => p.slug === slug)
  const item = (p, quantity) => ({
    productId: p.id,
    slug: p.slug,
    name: p.name,
    priceRub: p.priceRub,
    quantity,
    categories: [],
    image: p.images?.[0]?.url,
  })
  const kit = bySlug('nabor-yunogo-himika')
  const volcano = bySlug('vulkan-lavy')

  const browser = await chromium.launch()

  // 1. Корзина: 2490 ₽ — до бесплатной доставки осталось 510 ₽.
  {
    const ctx = await newContext(browser, { cart: [item(kit, 1)] })
    const page = await ctx.newPage()
    await page.goto(`${WEB}/ru/catalog`)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-cart')))
    await page.waitForSelector('[data-testid=free-shipping-progress]')
    await page.waitForTimeout(800)
    await shot(page, 'cart')
    await ctx.close()
  }

  // 2. Оформление заказа: Москва, выбран пункт СДЭК, доставка бесплатно (3980 ₽).
  {
    const ctx = await newContext(browser, {
      cart: [item(kit, 1), item(volcano, 1)],
      city: { code: 44, name: 'Москва', fullName: 'Москва, Москва, Россия' },
    })
    await mockCdek(ctx, 3980)
    const page = await ctx.newPage()
    await page.goto(`${WEB}/ru/checkout`)
    const combo = page.getByRole('combobox', { name: 'Пункты выдачи' })
    await combo.click()
    await page.getByRole('option').first().click()
    await combo.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -260))
    await shot(page, 'checkout')
    await ctx.close()
  }

  // 3. Страница заказа после оплаты: статус, сумма, трек СДЭК.
  {
    const ctx = await newContext(browser)
    const page = await ctx.newPage()
    await page.goto(`${WEB}/ru/order/XM-2026-90001?new=1#t=testtoken0123456789abcdef01234567`)
    await page.waitForSelector('[data-testid=order-track-number]')
    await shot(page, 'order-page')
    await ctx.close()
  }

  // 4. Личный кабинет: раскрытый заказ с доставкой и ссылкой на трек.
  {
    const ctx = await newContext(browser, { session: 'shot-session-token-123' })
    const page = await ctx.newPage()
    await page.goto(`${WEB}/ru/account`)
    await page.locator('button[aria-expanded]').first().click()
    await page.getByText('Отследить посылку').waitFor()
    await shot(page, 'account')
    await ctx.close()
  }

  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 5: Снять кадры и осмотреть каждый**

```bash
node "$SCRATCH/shots/capture.cjs"
ls -la "$SCRATCH/shots/raw"
```

Expected: четыре строки `снято …` и четыре PNG. Скрипт опирается на непроверенные детали интерфейса (роль combobox «Пункты выдачи», `data-testid`, `button[aria-expanded]`); при падении — `read_page` на нужной странице через браузерные инструменты, поправить селектор, повторить.

Открыть каждый PNG через Read и проверить глазами: (а) виден нужный элемент (полоска «осталось 510 ₽»; выбран пункт и «бесплатно»; блок «Трек СДЭК» и «Отследить на cdek.ru»; раскрытый заказ с адресом, ПВЗ СДЭК и «Отследить посылку»); (б) нет баннера cookies, оверлея ошибки Next, индикатора dev-режима, реальных персональных данных (в кадре только «Иван Тестов», `buyer@test.local`, «ул. Тестовая»). Если мешает баннер или лишний оверлей — спрятать его через `addStyleTag` в `shot()` и переснять.

- [ ] **Step 6: Проверить утверждения шагов 1–2 по кадрам**

Сверить кадры с текстами в Task 3 (`ORDER_STEPS`): корзина показывает полоску до бесплатной доставки; оформление — выбор СДЭК и пункта; страница заказа — статус, сумма, трек СДЭК и ссылка «Отследить на cdek.ru» (способа и адреса доставки на ней нет — тексты Task 3 это учитывают); кабинет — состав, способ, адрес, ссылка «Отследить посылку». Если кадр опровергает текст — править текст в Task 3, а не кадр.

- [ ] **Step 7: Сжать до 1200×750 WebP**

Создать `$SCRATCH/shots/convert.cjs`:

```js
const path = require('node:path')
const fs = require('node:fs')

const ROOT =
  '/Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/articles-sya-audit-315de8'
const sharp = require(require.resolve('sharp', { paths: [path.join(ROOT, 'web')] }))
const OUT_DIR = path.join(ROOT, 'web/public/img/order-process')
fs.mkdirSync(OUT_DIR, { recursive: true })

;(async () => {
  for (const name of ['cart', 'checkout', 'order-page', 'account']) {
    const dest = path.join(OUT_DIR, `${name}.webp`)
    await sharp(path.join(__dirname, 'raw', `${name}.png`))
      .resize(1200, 750, { fit: 'cover', position: 'top' })
      .webp({ quality: 82 })
      .toFile(dest)
    const meta = await sharp(dest).metadata()
    const kb = Math.round(fs.statSync(dest).size / 1024)
    console.log(name, `${meta.width}x${meta.height}`, `${kb} KB`)
    if (meta.width !== 1200 || meta.height !== 750) throw new Error(`${name}: неверный размер`)
  }
})()
```

```bash
node "$SCRATCH/shots/convert.cjs"
```

Expected: четыре строки `… 1200x750 … KB`, каждая до ~150 KB. Открыть один `.webp` через Read и убедиться, что читается.

- [ ] **Step 8: Уборка стенда**

Сначала `preview_stop` для `shots-web` и `shots-api` (id из `preview_list`), затем:

```bash
cd /Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/articles-sya-audit-315de8
dropdb -h /tmp shots_scratch
git status --short .claude/launch.json
```

Если `.claude/launch.json` отслеживается git и показан как изменённый — `git checkout .claude/launch.json`. Удалить `$SCRATCH/shots/raw` и `$SCRATCH/shots/setup.sql`.

- [ ] **Step 9: Commit**

```bash
git add web/public/img/order-process
git status --short
git commit -m "feat(web): скриншоты оформления заказа для страницы /order-process

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: в коммит попали только четыре `.webp`.

### Task 2: Флаги стран

**Files:**
- Create: `web/public/img/flags/{ru,by,kz,am,kg,uz,az,tj}.svg`, `web/public/img/flags/LICENSE-flag-icons.txt`

**Interfaces:**
- Produces: файлы `/img/flags/<код>.svg`, коды `ru|by|kz|am|kg|uz|az|tj` (используются `Flag`, Task 4).

Тест на наличие и отсутствие скриптов в SVG добавляется в Task 3 (там же данные); здесь проверка вручную.

- [ ] **Step 1: Скачать пакет в отдельный пустой каталог (скачивание одобрено в спеке)**

```bash
cd "$SCRATCH" && rm -rf flagpkg && mkdir flagpkg && cd flagpkg
npm pack flag-icons@7.2.3 --silent && tar -xzf flag-icons-7.2.3.tgz
ls package/flags/4x3/ | grep -E '^(ru|by|kz|am|kg|uz|az|tj)\.svg$' | wc -l
```

Expected: `8`. Если версии 7.2.3 нет, взять любую `7.x`, опубликованную больше двух недель назад.

- [ ] **Step 2: Проверить SVG и скопировать только нужные**

```bash
cd "$SCRATCH/flagpkg"
grep -l -i -E '<script|[[:space:]]on[a-z]+=|href="http' package/flags/4x3/{ru,by,kz,am,kg,uz,az,tj}.svg || echo "чисто"
```

Expected: `чисто` (ни скриптов, ни обработчиков событий, ни внешних ссылок). Если что-то нашлось — не копировать этот файл, сообщить владельцу.

```bash
cd /Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/articles-sya-audit-315de8
mkdir -p web/public/img/flags
for c in ru by kz am kg uz az tj; do cp "$SCRATCH/flagpkg/package/flags/4x3/$c.svg" "web/public/img/flags/$c.svg"; done
cp "$SCRATCH/flagpkg/package/LICENSE" web/public/img/flags/LICENSE-flag-icons.txt
ls web/public/img/flags | wc -l
```

Expected: `9`.

- [ ] **Step 3: Визуально проверить один флаг**

Открыть `web/public/img/flags/kg.svg` через Read (изображение) — виден красный флаг с солнцем.

- [ ] **Step 4: Commit**

```bash
git add web/public/img/flags
git commit -m "feat(web): флаги стран для блока доставки (flag-icons, MIT)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Модуль данных `orderProcess.ts`

**Files:**
- Create: `web/lib/orderProcess.ts`
- Test: `web/lib/orderProcess.test.ts`

**Interfaces:**
- Consumes: `SHIPPING_RULES` из `@/lib/checkout` (`{ cdek_pvz: { freeFromRub }, cdek_courier: { freeFromRub } }`), `formatRub(value: number): string` из `@/lib/stockLabel`, `DEFAULT_LOCALE`, `Locale` из `@/lib/i18n`; файлы Task 1 (скриншоты) и Task 2 (флаги).
- Produces (используют Tasks 4–6):
  - `type FlagCode = 'ru'|'by'|'kz'|'am'|'kg'|'uz'|'az'|'tj'`
  - `interface Screenshot { src: string; alt: string; caption: string; width: number; height: number }`
  - `interface OrderStep { index: 1|2|3|4; title: string; summary: string; details: string[]; screenshots: Screenshot[] }`
  - `interface DeliveryCountry { code: FlagCode; name: string }`
  - `interface DeliveryZone { id: 'ru'|'by'|'eaeu'|'cis'; label: string; countries: DeliveryCountry[]; condition: string }`
  - `interface CdekTerm { region: string; days: string }`
  - `const SCREEN_SIZE = { width: 1200, height: 750 }`
  - `const ORDER_PROCESS_PATH = '/order-process'`
  - `const ORDER_STEPS: OrderStep[]`, `const CDEK_TERMS: CdekTerm[]`
  - `function buildDeliveryZones(): DeliveryZone[]`
  - `function orderProcessPath(locale: Locale): string`

- [ ] **Step 1: Write the failing test**

Создать `web/lib/orderProcess.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SHIPPING_RULES } from '@/lib/checkout'
import {
  CDEK_TERMS,
  ORDER_PROCESS_PATH,
  ORDER_STEPS,
  SCREEN_SIZE,
  buildDeliveryZones,
  orderProcessPath,
} from './orderProcess'

const publicFile = (path: string) => fileURLToPath(new URL(`../public${path}`, import.meta.url))

describe('buildDeliveryZones', () => {
  const pvz = SHIPPING_RULES.cdek_pvz.freeFromRub
  const courier = SHIPPING_RULES.cdek_courier.freeFromRub

  afterEach(() => {
    SHIPPING_RULES.cdek_pvz.freeFromRub = pvz
    SHIPPING_RULES.cdek_courier.freeFromRub = courier
  })

  it('отдаёт четыре зоны в порядке РФ, Беларусь, ЕАЭС, СНГ', () => {
    expect(buildDeliveryZones().map((z) => z.id)).toEqual(['ru', 'by', 'eaeu', 'cis'])
  })

  it('содержит ровно страны из спеки, Молдовы нет', () => {
    const names = buildDeliveryZones().flatMap((z) => z.countries.map((c) => c.name))
    expect(names).toEqual([
      'Россия',
      'Беларусь',
      'Казахстан',
      'Армения',
      'Киргизия',
      'Узбекистан',
      'Азербайджан',
      'Таджикистан',
    ])
    expect(names).not.toContain('Молдова')
  })

  it('сопоставляет страны с кодами флагов', () => {
    const codes = buildDeliveryZones().flatMap((z) => z.countries.map((c) => c.code))
    expect(codes).toEqual(['ru', 'by', 'kz', 'am', 'kg', 'uz', 'az', 'tj'])
  })

  it('пишет пороги: РФ 3000/5000, Беларусь 3000, ЕАЭС 5000, СНГ отдельно', () => {
    const [ru, by, eaeu, cis] = buildDeliveryZones()
    expect(ru.condition).toMatch(/от 3\D000\D*₽ до пункта выдачи, курьером — от 5\D000\D*₽/u)
    expect(by.condition).toMatch(/^Бесплатно от 3\D000\D*₽$/u)
    expect(eaeu.condition).toMatch(/^Бесплатно от 5\D000\D*₽$/u)
    expect(cis.condition).toBe('Доставка оплачивается отдельно')
  })

  it('порог РФ следует за SHIPPING_RULES без правки текста', () => {
    SHIPPING_RULES.cdek_pvz.freeFromRub = 3500
    SHIPPING_RULES.cdek_courier.freeFromRub = 6000
    const [ru] = buildDeliveryZones()
    expect(ru.condition).toMatch(/от 3\D500\D*₽ до пункта выдачи, курьером — от 6\D000\D*₽/u)
  })
})

describe('CDEK_TERMS', () => {
  it('содержит три региона со сроками из спеки', () => {
    expect(CDEK_TERMS).toEqual([
      { region: 'Москва и Московская область, Ленинградская область', days: '2–3 дня' },
      { region: 'Европейская часть России, Кавказ', days: '3–5 дней' },
      { region: 'Сибирь, Забайкалье, Дальний Восток', days: '7–10 дней' },
    ])
  })
})

describe('ORDER_STEPS', () => {
  it('содержит четыре шага с номерами 1–4 и непустыми текстами', () => {
    expect(ORDER_STEPS.map((s) => s.index)).toEqual([1, 2, 3, 4])
    for (const s of ORDER_STEPS) {
      expect(s.title).not.toBe('')
      expect(s.summary).not.toBe('')
      expect(s.details.length).toBeGreaterThan(0)
    }
  })

  it('шаг 3 говорит про отправку в течение суток', () => {
    expect(ORDER_STEPS[2].summary).toMatch(/в течение суток/)
  })

  it('четыре скриншота: два у шага 1, два у шага 2', () => {
    expect(ORDER_STEPS.map((s) => s.screenshots.length)).toEqual([2, 2, 0, 0])
  })
})

describe('файлы на диске', () => {
  const flagCodes = buildDeliveryZones().flatMap((z) => z.countries.map((c) => c.code))

  it.each(flagCodes)('флаг %s есть и не содержит скриптов', (code) => {
    const file = publicFile(`/img/flags/${code}.svg`)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).not.toMatch(/<script|\son[a-z]+=/i)
  })

  const shots = ORDER_STEPS.flatMap((s) => s.screenshots)

  it.each(shots)('скриншот $src есть на диске', (shot) => {
    expect(existsSync(publicFile(shot.src))).toBe(true)
  })

  it.each(shots)('у скриншота $src есть alt, подпись и размер 1200×750', (shot) => {
    expect(shot.alt.length).toBeGreaterThan(20)
    expect(shot.caption).not.toBe('')
    expect({ width: shot.width, height: shot.height }).toEqual(SCREEN_SIZE)
  })
})

describe('orderProcessPath', () => {
  it('для русской локали без префикса, для английской с префиксом', () => {
    expect(ORDER_PROCESS_PATH).toBe('/order-process')
    expect(orderProcessPath('ru')).toBe('/order-process')
    expect(orderProcessPath('en')).toBe('/en/order-process')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/orderProcess.test.ts`
Expected: FAIL — `Failed to resolve import "./orderProcess"`.

- [ ] **Step 3: Write minimal implementation**

Создать `web/lib/orderProcess.ts`:

```ts
import { SHIPPING_RULES } from '@/lib/checkout'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { formatRub } from '@/lib/stockLabel'

// Содержание блока «Заказ и доставка» (главная) и страницы /order-process.
// Условия и сроки — от владельца (16.10.2026), в спеке
// docs/superpowers/specs/2026-10-16-order-process-design.md. Порог РФ читаем из
// SHIPPING_RULES в момент вызова, чтобы текст не разошёлся с чекаутом.

export type FlagCode = 'ru' | 'by' | 'kz' | 'am' | 'kg' | 'uz' | 'az' | 'tj'

export interface Screenshot {
  src: string
  alt: string
  caption: string
  width: number
  height: number
}

export interface OrderStep {
  index: 1 | 2 | 3 | 4
  title: string
  /** Короткий текст для карточки на главной. */
  summary: string
  /** Абзацы для страницы. */
  details: string[]
  screenshots: Screenshot[]
}

export interface DeliveryCountry {
  code: FlagCode
  name: string
}

export interface DeliveryZone {
  id: 'ru' | 'by' | 'eaeu' | 'cis'
  label: string
  countries: DeliveryCountry[]
  condition: string
}

export interface CdekTerm {
  region: string
  days: string
}

/** Все скриншоты снимаются и сжимаются до этого размера (Task 1). */
export const SCREEN_SIZE = { width: 1200, height: 750 } as const

export const ORDER_PROCESS_PATH = '/order-process'

// Беларусь — как Россия до пункта выдачи, прочие страны ЕАЭС — как курьер по России.
const BELARUS_FREE_FROM_RUB = 3000
const EAEU_FREE_FROM_RUB = 5000

export function orderProcessPath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? ORDER_PROCESS_PATH : `/${locale}${ORDER_PROCESS_PATH}`
}

export function buildDeliveryZones(): DeliveryZone[] {
  const pvz = formatRub(SHIPPING_RULES.cdek_pvz.freeFromRub)
  const courier = formatRub(SHIPPING_RULES.cdek_courier.freeFromRub)
  return [
    {
      id: 'ru',
      label: 'Россия',
      countries: [{ code: 'ru', name: 'Россия' }],
      condition: `Бесплатно от ${pvz} до пункта выдачи, курьером — от ${courier}`,
    },
    {
      id: 'by',
      label: 'Беларусь',
      countries: [{ code: 'by', name: 'Беларусь' }],
      condition: `Бесплатно от ${formatRub(BELARUS_FREE_FROM_RUB)}`,
    },
    {
      id: 'eaeu',
      label: 'Другие страны ЕАЭС',
      countries: [
        { code: 'kz', name: 'Казахстан' },
        { code: 'am', name: 'Армения' },
        { code: 'kg', name: 'Киргизия' },
      ],
      condition: `Бесплатно от ${formatRub(EAEU_FREE_FROM_RUB)}`,
    },
    {
      id: 'cis',
      label: 'СНГ',
      countries: [
        { code: 'uz', name: 'Узбекистан' },
        { code: 'az', name: 'Азербайджан' },
        { code: 'tj', name: 'Таджикистан' },
      ],
      condition: 'Доставка оплачивается отдельно',
    },
  ]
}

export const CDEK_TERMS: CdekTerm[] = [
  { region: 'Москва и Московская область, Ленинградская область', days: '2–3 дня' },
  { region: 'Европейская часть России, Кавказ', days: '3–5 дней' },
  { region: 'Сибирь, Забайкалье, Дальний Восток', days: '7–10 дней' },
]

const SHOT = { ...SCREEN_SIZE }

export const ORDER_STEPS: OrderStep[] = [
  {
    index: 1,
    title: 'Соберите корзину, оформите заказ и оплатите',
    summary: 'Бесплатная доставка зависит от страны и суммы заказа: условия ниже.',
    details: [
      'Добавьте наборы и реактивы в корзину. Полоска в корзине показывает, сколько осталось до бесплатной доставки.',
      'В оформлении заказа выберите пункт выдачи СДЭК или курьера, укажите адрес и оплатите заказ онлайн.',
      'Условия бесплатной доставки зависят от страны:',
    ],
    screenshots: [
      {
        src: '/img/order-process/cart.webp',
        alt: 'Корзина магазина Химичка: список товаров и полоска «До бесплатной доставки осталось»',
        caption: 'Корзина: полоска до бесплатной доставки',
        ...SHOT,
      },
      {
        src: '/img/order-process/checkout.webp',
        alt: 'Оформление заказа: выбор способа доставки СДЭК, пункта выдачи и стоимость доставки',
        caption: 'Оформление заказа: способ доставки и пункт выдачи СДЭК',
        ...SHOT,
      },
    ],
  },
  {
    index: 2,
    title: 'Данные о доставке — на странице заказа и в кабинете',
    summary: 'После оплаты трек СДЭК виден на странице заказа, а способ, адрес и трек — в личном кабинете.',
    details: [
      'Сразу после оплаты откроется страница заказа: статус, сумма и трек-номер СДЭК со ссылкой «Отследить на cdek.ru». Трек появляется, как только заказ передан в СДЭК.',
      'В личном кабинете, в истории заказов, у каждого заказа видны состав, способ и адрес доставки и ссылка «Отследить посылку».',
    ],
    screenshots: [
      {
        src: '/img/order-process/order-page.webp',
        alt: 'Страница заказа после оплаты: статус «Оплачен», сумма и трек-номер СДЭК со ссылкой на отслеживание',
        caption: 'Страница заказа после оплаты',
        ...SHOT,
      },
      {
        src: '/img/order-process/account.webp',
        alt: 'Личный кабинет: история заказов с раскрытым заказом, адресом доставки и ссылкой на отслеживание',
        caption: 'Личный кабинет: заказ с данными о доставке',
        ...SHOT,
      },
    ],
  },
  {
    index: 3,
    title: 'Отправляем в течение суток',
    summary: 'Товары, которые есть на складе, мы передаём в службу доставки в течение суток.',
    details: [
      'Товары, которые есть на складе, мы передаём в службу доставки в течение суток после оформления заказа.',
    ],
    screenshots: [],
  },
  {
    index: 4,
    title: 'Средние сроки доставки СДЭК',
    summary: 'От двух до десяти дней в зависимости от региона.',
    details: [
      'Сроки средние. Точный срок до вашего города покажет оформление заказа, когда вы выберете доставку.',
    ],
    screenshots: [],
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/orderProcess.test.ts`
Expected: PASS — все тесты зелёные, **при условии что Task 1 уже положил четыре скриншота** (иначе красные только `скриншот … есть на диске`). Порядок задач: Task 1 → 2 → 3.

- [ ] **Step 5: Commit**

```bash
git add web/lib/orderProcess.ts web/lib/orderProcess.test.ts
git commit -m "feat(web): данные блока «Заказ и доставка» — шаги, зоны, сроки СДЭК

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Компоненты `Flag`, `DeliveryZones`, `CdekTerms`

**Files:**
- Create: `web/components/marketing/Flag.tsx`, `web/components/marketing/DeliveryZones.tsx`, `web/components/marketing/CdekTerms.tsx`
- Test: `web/components/marketing/Flag.test.tsx`, `web/components/marketing/DeliveryZones.test.tsx`, `web/components/marketing/CdekTerms.test.tsx`

**Interfaces:**
- Consumes: `FlagCode`, `buildDeliveryZones`, `CDEK_TERMS` (Task 3).
- Produces: `<Flag code={FlagCode} className?={string} />`, `<DeliveryZones />` (без пропсов), `<CdekTerms />` (без пропсов).

- [ ] **Step 1: Write the failing tests**

`web/components/marketing/Flag.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Flag } from './Flag'

describe('<Flag>', () => {
  it('рисует svg-флаг из /img/flags и прячет его от скринридеров (страна названа рядом)', () => {
    const { container } = render(<Flag code="kz" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/img/flags/kz.svg')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('width', '24')
    expect(img).toHaveAttribute('height', '18')
  })

  it('принимает дополнительный класс', () => {
    const { container } = render(<Flag code="ru" className="extra" />)
    expect(container.querySelector('img')).toHaveClass('extra')
  })
})
```

`web/components/marketing/DeliveryZones.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DeliveryZones } from './DeliveryZones'

describe('<DeliveryZones>', () => {
  it('выводит список из четырёх зон с условиями', () => {
    render(<DeliveryZones />)
    const list = screen.getByRole('list', { name: 'Условия бесплатной доставки по странам' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Россия')
    expect(items[0]).toHaveTextContent(/до пункта выдачи, курьером — от 5\D000\D*₽/u)
    expect(items[1]).toHaveTextContent('Беларусь')
    expect(items[2]).toHaveTextContent('Казахстан, Армения, Киргизия')
    expect(items[3]).toHaveTextContent('Узбекистан, Азербайджан, Таджикистан')
    expect(items[3]).toHaveTextContent('Доставка оплачивается отдельно')
  })

  it('показывает восемь декоративных флагов и не упоминает Молдову', () => {
    const { container } = render(<DeliveryZones />)
    const flags = container.querySelectorAll('img[src^="/img/flags/"]')
    expect(flags).toHaveLength(8)
    flags.forEach((f) => expect(f).toHaveAttribute('alt', ''))
    expect(container).not.toHaveTextContent('Молдов')
  })
})
```

`web/components/marketing/CdekTerms.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CdekTerms } from './CdekTerms'

describe('<CdekTerms>', () => {
  it('выводит таблицу сроков с тремя регионами', () => {
    render(<CdekTerms />)
    const table = screen.getByRole('table', { name: 'Средние сроки доставки СДЭК' })
    const rows = within(table).getAllByRole('row')
    // шапка + три региона
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('Москва и Московская область, Ленинградская область')
    expect(rows[1]).toHaveTextContent('2–3 дня')
    expect(rows[2]).toHaveTextContent('Европейская часть России, Кавказ')
    expect(rows[2]).toHaveTextContent('3–5 дней')
    expect(rows[3]).toHaveTextContent('Сибирь, Забайкалье, Дальний Восток')
    expect(rows[3]).toHaveTextContent('7–10 дней')
  })

  it('размечает заголовки столбцов', () => {
    render(<CdekTerms />)
    expect(screen.getByRole('columnheader', { name: 'Регион' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Срок' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run components/marketing/Flag.test.tsx components/marketing/DeliveryZones.test.tsx components/marketing/CdekTerms.test.tsx`
Expected: FAIL — `Failed to resolve import "./Flag"` и т. д.

- [ ] **Step 3: Write minimal implementation**

`web/components/marketing/Flag.tsx`:

```tsx
import type { FlagCode } from '@/lib/orderProcess'

interface Props {
  code: FlagCode
  className?: string
}

// Флаг страны из /img/flags (flag-icons, MIT). Emoji-флаги в Windows не
// рисуются, поэтому картинка. alt пустой: страна всегда названа текстом рядом.
export function Flag({ code, className = '' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 24px SVG: next/image для SVG ничего не оптимизирует
    <img
      src={`/img/flags/${code}.svg`}
      alt=""
      width={24}
      height={18}
      loading="lazy"
      className={`inline-block h-[18px] w-6 shrink-0 rounded-[2px] border border-[var(--color-lj-rule)] object-cover ${className}`.trim()}
    />
  )
}
```

`web/components/marketing/DeliveryZones.tsx`:

```tsx
import { buildDeliveryZones } from '@/lib/orderProcess'
import { Flag } from './Flag'

// Условия бесплатной доставки по странам: флаги, названия, порог.
// Общий для блока на главной и страницы /order-process.
export function DeliveryZones() {
  const zones = buildDeliveryZones()
  return (
    <ul
      aria-label="Условия бесплатной доставки по странам"
      className="m-0 flex list-none flex-col p-0"
    >
      {zones.map((zone) => (
        <li
          key={zone.id}
          className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2 font-lj-body text-base">
            <span className="flex items-center gap-2">
              {zone.countries.map((c) => (
                <Flag key={c.code} code={c.code} />
              ))}
            </span>
            <span className="font-[600]">{zone.countries.map((c) => c.name).join(', ')}</span>
          </span>
          <span className="font-lj-body text-[0.9375rem] opacity-80 sm:max-w-[20rem] sm:text-right">
            {zone.condition}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

`web/components/marketing/CdekTerms.tsx`:

```tsx
import { CDEK_TERMS } from '@/lib/orderProcess'

// Средние сроки доставки СДЭК по регионам. Общая для главной и /order-process.
export function CdekTerms() {
  return (
    <table
      aria-label="Средние сроки доставки СДЭК"
      className="w-full border-collapse text-left font-lj-body text-base"
    >
      <thead>
        <tr className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-70">
          <th scope="col" className="pb-3 pr-4 font-normal">
            Регион
          </th>
          <th scope="col" className="pb-3 text-right font-normal">
            Срок
          </th>
        </tr>
      </thead>
      <tbody>
        {CDEK_TERMS.map((t) => (
          <tr key={t.region} className="border-t border-[var(--color-lj-rule)]">
            <td className="py-3 pr-4">{t.region}</td>
            <td className="whitespace-nowrap py-3 text-right font-[700]">{t.days}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run components/marketing/Flag.test.tsx components/marketing/DeliveryZones.test.tsx components/marketing/CdekTerms.test.tsx`
Expected: PASS (6 тестов).

- [ ] **Step 5: Lint**

Run: `cd web && npx eslint components/marketing/Flag.tsx components/marketing/DeliveryZones.tsx components/marketing/CdekTerms.tsx`
Expected: без ошибок (комментарий `eslint-disable-next-line` в `Flag` нужен и не должен давать «unused directive»).

- [ ] **Step 6: Commit**

```bash
git add web/components/marketing/Flag.tsx web/components/marketing/DeliveryZones.tsx web/components/marketing/CdekTerms.tsx web/components/marketing/Flag.test.tsx web/components/marketing/DeliveryZones.test.tsx web/components/marketing/CdekTerms.test.tsx
git commit -m "feat(web): компоненты Flag, DeliveryZones и CdekTerms

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Блок `OrderProcessSection` на главной

**Files:**
- Create: `web/components/marketing/OrderProcessSection.tsx`
- Test: `web/components/marketing/OrderProcessSection.test.tsx`
- Modify: `web/app/[locale]/(public)/page.tsx` (импорт рядом со строкой 18; вставка между блоками «5. Как это работает» и «5б. Оптом», сейчас перед строкой 369)
- Test: `web/app/[locale]/(public)/page.test.tsx` (новый `describe` в конец файла)

**Interfaces:**
- Consumes: `ORDER_STEPS`, `orderProcessPath` (Task 3); `DeliveryZones`, `CdekTerms` (Task 4); `LabSection` из `@/components/ui/LabSection`.
- Produces: `<OrderProcessSection href={string} />` — `href` с учётом локали (как у `WholesaleHomeSection`).

- [ ] **Step 1: Write the failing component test**

`web/components/marketing/OrderProcessSection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { OrderProcessSection } from './OrderProcessSection'

describe('<OrderProcessSection>', () => {
  it('выводит заголовок секции и четыре шага по порядку', () => {
    render(<OrderProcessSection href="/order-process" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Заказ и доставка' })).toBeInTheDocument()
    const steps = within(screen.getByRole('list', { name: 'Шаги заказа' })).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(steps[0]).toHaveTextContent('01')
    expect(steps[0]).toHaveTextContent('Соберите корзину, оформите заказ и оплатите')
    expect(steps[2]).toHaveTextContent('Отправляем в течение суток')
    expect(steps[3]).toHaveTextContent('Средние сроки доставки СДЭК')
  })

  it('содержит условия по странам и таблицу сроков СДЭК', () => {
    render(<OrderProcessSection href="/order-process" />)
    expect(
      screen.getByRole('list', { name: 'Условия бесплатной доставки по странам' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Средние сроки доставки СДЭК' })).toBeInTheDocument()
  })

  it('ведёт на подробную страницу по переданному href', () => {
    render(<OrderProcessSection href="/en/order-process" />)
    expect(screen.getByRole('link', { name: 'Подробнее о заказе и доставке' })).toHaveAttribute(
      'href',
      '/en/order-process',
    )
  })

  it('имеет якорь #order-process', () => {
    const { container } = render(<OrderProcessSection href="/order-process" />)
    expect(container.querySelector('section#order-process')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run components/marketing/OrderProcessSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./OrderProcessSection"`.

- [ ] **Step 3: Write the component**

`web/components/marketing/OrderProcessSection.tsx`:

```tsx
import Link from 'next/link'
import { LabSection } from '@/components/ui/LabSection'
import { ORDER_STEPS } from '@/lib/orderProcess'
import { CdekTerms } from './CdekTerms'
import { DeliveryZones } from './DeliveryZones'

interface Props {
  /** Путь страницы /order-process с учётом локали. */
  href: string
}

/** Короткий блок главной: четыре шага заказа, условия по странам и сроки СДЭК. */
export function OrderProcessSection({ href }: Props) {
  return (
    <LabSection
      variant="cream"
      id="order-process"
      className="border-b border-[var(--color-lj-rule)] px-6 py-32"
    >
      <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-16">
        <h2 className="font-lj-display font-[900] text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.92] tracking-[-0.045em]">
          Заказ и <em className="italic text-[var(--color-lj-brand)] font-[900]">доставка</em>
        </h2>

        <ol
          aria-label="Шаги заказа"
          className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-4"
        >
          {ORDER_STEPS.map((step) => (
            <li
              key={step.index}
              className="flex flex-col gap-4 border border-[var(--color-lj-rule)] p-5"
            >
              <span className="font-lj-mazzard text-sm font-bold leading-[1.18] text-[var(--color-lj-brand)]">
                {String(step.index).padStart(2, '0')}
              </span>
              <h3 className="m-0 font-lj-mazzard text-[1.125rem] leading-[1.15] tracking-[-0.02em]">
                {step.title}
              </h3>
              <p className="m-0 font-lj-body text-[0.9375rem] leading-[1.5] opacity-80">
                {step.summary}
              </p>
            </li>
          ))}
        </ol>

        <div className="grid gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h3 className="m-0 font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Бесплатная доставка
            </h3>
            <DeliveryZones />
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="m-0 font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Сроки СДЭК
            </h3>
            <CdekTerms />
          </div>
        </div>

        <Link href={href} className="font-lj-body text-base underline underline-offset-4">
          Подробнее о заказе и доставке
        </Link>
      </div>
    </LabSection>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run components/marketing/OrderProcessSection.test.tsx`
Expected: PASS (4 теста).

- [ ] **Step 5: Write the failing home-page test**

Открыть `web/app/[locale]/(public)/page.test.tsx`. Тяжёлые дети главной мокаем, чтобы не тянуть jsdom-несовместимое. Делаются две вставки.

**Вставка 1 — в самый конец файла** (новый `describe`):

```tsx
describe('HomePage: блок «Заказ и доставка»', () => {
  it('показывает блок между «Как это работает» и «Оптом» со ссылкой на /order-process', async () => {
    const { render, screen } = await import('@testing-library/react')
    vi.spyOn(api, 'getPage').mockRejectedValue(new Error('down'))
    vi.spyOn(api, 'listPublishedProducts').mockRejectedValue(new Error('down'))
    vi.spyOn(api, 'getPublicSettings').mockRejectedValue(new Error('down'))
    vi.spyOn(api, 'listCategories').mockRejectedValue(new Error('down'))

    render(await HomePage({ params: Promise.resolve({ locale: 'ru' }) }))

    expect(screen.getByRole('heading', { level: 2, name: 'Заказ и доставка' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Подробнее о заказе и доставке' })).toHaveAttribute(
      'href',
      '/order-process',
    )
    const how = document.getElementById('how-it-works')
    const order = document.getElementById('order-process')
    const wholesale = document.getElementById('wholesale')
    expect(how && order && wholesale).toBeTruthy()
    // how-it-works → order-process → wholesale
    expect(how!.compareDocumentPosition(order!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order!.compareDocumentPosition(wholesale!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
```

**Вставка 2 — в верх файла**, сразу после существующего блока `vi.mock('@/lib/api', …)` (он заканчивается перед строкой `import HomePage, …`): моки тяжёлых компонентов.

```tsx
vi.mock('@/components/marketing', async () => {
  const actual = await vi.importActual<typeof import('@/components/marketing')>(
    '@/components/marketing',
  )
  return { ...actual, Hero: () => null, Manifesto: () => null, PreFooterCta: () => null }
})
vi.mock('@/components/ProductCard', () => ({ ProductCard: () => null }))
vi.mock('@/components/wholesale/WholesaleHomeSection', () => ({
  WholesaleHomeSection: () => <section id="wholesale" />,
}))
vi.mock('@/components/ui', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui')>('@/components/ui')
  return { ...actual, Ticker: () => null }
})
```

(`.tsx` в этом файле уже есть — JSX в моках допустим. Если файл имеет расширение `.test.tsx`, ничего не переименовывать.)

- [ ] **Step 6: Run to verify it fails**

Run: `cd web && npx vitest run "app/[locale]/(public)/page.test.tsx"`
Expected: FAIL в новом тесте — `Unable to find … heading … «Заказ и доставка»`; старые тесты остаются зелёными (если красные из-за моков — поправить моки, не код главной).

- [ ] **Step 7: Wire the section into the home page**

В `web/app/[locale]/(public)/page.tsx`:

1. После строки `import { HowItWorksStepLJ } from '@/components/marketing/HowItWorksStepLJ'` добавить:

```tsx
import { OrderProcessSection } from '@/components/marketing/OrderProcessSection'
import { orderProcessPath } from '@/lib/orderProcess'
```

2. Между закрывающим `</LabSection>` блока «5. Как это работает» и комментарием `{/* 5б. Оптом … */}` вставить:

```tsx
      {/* 5а. Заказ и доставка (LAB CREAM) — шаги, условия по странам, сроки СДЭК */}
      <OrderProcessSection href={orderProcessPath(locale)} />

```

- [ ] **Step 8: Run to verify it passes**

Run: `cd web && npx vitest run "app/[locale]/(public)/page.test.tsx" components/marketing/OrderProcessSection.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/components/marketing/OrderProcessSection.tsx web/components/marketing/OrderProcessSection.test.tsx "web/app/[locale]/(public)/page.tsx" "web/app/[locale]/(public)/page.test.tsx"
git commit -m "feat(web): блок «Заказ и доставка» на главной

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Страница `/order-process`, sitemap, подвал

**Files:**
- Create: `web/app/[locale]/(public)/order-process/page.tsx`
- Test: `web/app/[locale]/(public)/order-process/page.test.tsx`
- Modify: `web/app/sitemap.ts` (запись после `/opt`, строки ~97–102)
- Test: `web/app/sitemap.test.ts` (новый тест рядом со строкой 209; правка теста про пустой API, строки ~229–243)
- Modify: `web/components/Footer.tsx` (массив `ROW_STRANITSY`, после `доставка`)
- Test: `web/components/Footer.test.tsx` (новый тест после строки ~58)

**Interfaces:**
- Consumes: `ORDER_STEPS`, `ORDER_PROCESS_PATH`, `orderProcessPath` (Task 3); `DeliveryZones`, `CdekTerms` (Task 4); `Breadcrumbs`, `JsonLd`, `LabSection`, `buildMetadata`, `breadcrumbJsonLd`, `BreadcrumbItem`, `isLocale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE` — как в `opt/page.tsx`.
- Produces: маршрут `/order-process` (и `/en/order-process`), запись в sitemap, ссылка в подвале.

- [ ] **Step 1: Write the failing page test**

`web/app/[locale]/(public)/order-process/page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import OrderProcessPage, { generateMetadata } from './page'

const ru = { params: Promise.resolve({ locale: 'ru' }) }

describe('OrderProcessPage', () => {
  it('is an async Server Component', () => {
    expect(OrderProcessPage.constructor.name).toBe('AsyncFunction')
  })

  it('отдаёт title с брендом, описание до 160 символов и canonical на /order-process', async () => {
    const meta = await generateMetadata(ru)
    expect(meta.title).toBe('Как проходит заказ и доставка — Химичка')
    expect(String(meta.description).length).toBeGreaterThan(80)
    expect(String(meta.description).length).toBeLessThanOrEqual(160)
    expect(String(meta.alternates?.canonical)).toMatch(/\/order-process$/)
  })

  it('для английской локали canonical с префиксом /en', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(String(meta.alternates?.canonical)).toMatch(/\/en\/order-process$/)
  })

  it('неизвестная локаль даёт 404', async () => {
    await expect(OrderProcessPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
    await expect(generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow()
  })

  it('выводит один h1, крошки и четыре раздела шагов', async () => {
    render(await OrderProcessPage(ru))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Как проходит заказ')
    const crumbs = screen.getByRole('navigation', { name: /хлебные крошки|breadcrumb/i })
    expect(within(crumbs).getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/')
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(h2[0]).toMatch(/^1\./)
    expect(h2.filter((t) => /^[1-4]\./.test(t))).toHaveLength(4)
  })

  it('показывает четыре скриншота с alt и подписью, условия по странам и сроки СДЭК', async () => {
    const { container } = render(await OrderProcessPage(ru))
    const shots = container.querySelectorAll('figure img')
    expect(shots).toHaveLength(4)
    shots.forEach((img) => expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(20))
    expect(container.querySelectorAll('figure figcaption')).toHaveLength(4)
    expect(
      screen.getByRole('list', { name: 'Условия бесплатной доставки по странам' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Средние сроки доставки СДЭК' })).toBeInTheDocument()
  })

  it('содержит юридическую оговорку дословно и ссылку на оферту', async () => {
    render(await OrderProcessPage(ru))
    expect(
      screen.getByText(
        /Риск случайной гибели или повреждения товара переходит к Покупателю с момента передачи товара службе доставки\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'публичной оферте' })).toHaveAttribute(
      'href',
      '/oferta',
    )
  })

  it('добавляет JSON-LD крошек и ведёт в каталог', async () => {
    const { container } = render(await OrderProcessPage(ru))
    const ld = container.querySelector('script[type="application/ld+json"]')
    expect(ld?.textContent).toContain('BreadcrumbList')
    expect(ld?.textContent).toContain('Как проходит заказ и доставка')
    expect(screen.getByRole('link', { name: 'Открыть каталог' })).toHaveAttribute(
      'href',
      '/categories',
    )
  })
})
```

Перед запуском проверить, как `Breadcrumbs` называет `<nav>` (`aria-label`): `grep -n "aria-label" web/components/Breadcrumbs.tsx`. Если подпись другая, поправить регулярку в тесте под реальную.

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run "app/[locale]/(public)/order-process/page.test.tsx"`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Write the page**

Прочитать в `web/node_modules/next/dist/docs/` разделы про `next/image` и про `generateMetadata`, убедиться, что API в этой версии совпадает с использованием в `opt/page.tsx` и `BlogAuthorBox.tsx`.

`web/app/[locale]/(public)/order-process/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CdekTerms } from '@/components/marketing/CdekTerms'
import { DeliveryZones } from '@/components/marketing/DeliveryZones'
import { JsonLd } from '@/components/seo/JsonLd'
import { LabSection } from '@/components/ui/LabSection'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { buildMetadata } from '@/lib/metadata'
import { ORDER_STEPS, orderProcessPath } from '@/lib/orderProcess'

interface Props {
  params: Promise<{ locale: string }>
}

const PAGE_TITLE = 'Как проходит заказ и доставка'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, orderProcessPath(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: `${PAGE_TITLE} — Химичка`,
    metaDescription:
      'Как оформить заказ, оплатить и получить: условия бесплатной доставки в Россию, Беларусь и страны ЕАЭС, отправка в течение суток и сроки СДЭК по регионам.',
    pathname: orderProcessPath(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

export default async function OrderProcessPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: PAGE_TITLE, href: orderProcessPath(locale) },
  ]

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} variant="catalog" />

      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-20">
          <header className="flex max-w-[48rem] flex-col gap-4">
            <h1 className="font-lj-display text-[clamp(2.25rem,5vw,4rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
              Как проходит заказ и доставка
            </h1>
            <p className="font-lj-body text-lg opacity-80">
              От корзины до посылки в руках: четыре шага, условия бесплатной доставки по странам и
              средние сроки СДЭК.
            </p>
          </header>

          {ORDER_STEPS.map((step) => (
            <section
              key={step.index}
              aria-labelledby={`step-${step.index}`}
              className="flex flex-col gap-6"
            >
              <h2
                id={`step-${step.index}`}
                className="font-lj-display text-2xl font-[700] tracking-[-0.03em]"
              >
                {step.index}. {step.title}
              </h2>
              <div className="flex max-w-[48rem] flex-col gap-4 font-lj-body text-base leading-[1.6]">
                {step.details.map((p) => (
                  <p key={p} className="m-0">
                    {p}
                  </p>
                ))}
              </div>

              {step.index === 1 && <DeliveryZones />}
              {step.index === 4 && <CdekTerms />}

              {step.screenshots.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  {step.screenshots.map((shot) => (
                    <figure key={shot.src} className="m-0 flex flex-col gap-2">
                      <Image
                        src={shot.src}
                        alt={shot.alt}
                        width={shot.width}
                        height={shot.height}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="h-auto w-full border border-[var(--color-lj-rule)]"
                      />
                      <figcaption className="font-lj-mono text-[length:var(--text-lj-mono-sm)] tracking-[0.04em] opacity-70">
                        {shot.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          ))}

          <p className="max-w-[48rem] font-lj-body text-base">
            Риск случайной гибели или повреждения товара переходит к Покупателю с момента передачи
            товара службе доставки. Полные условия покупки — в{' '}
            <Link href="/oferta" className="underline underline-offset-4">
              публичной оферте
            </Link>
            .
          </p>

          <p>
            <Link
              href="/categories"
              className="inline-flex rounded-full bg-[var(--color-lj-ink)] px-6 py-3 font-lj-body text-base font-[600] text-[var(--color-lj-bone)]"
            >
              Открыть каталог
            </Link>
          </p>
        </div>
      </LabSection>
    </>
  )
}
```

Замечание про `section` с `aria-labelledby`: тест ищет `h2` по порядку; убедиться, что внутри `DeliveryZones`/`CdekTerms` нет `h2`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run "app/[locale]/(public)/order-process/page.test.tsx"`
Expected: PASS (8 тестов). Если красный тест про `figure img`: `next/image` в jsdom даёт `<img>` — проверить, что `alt` и `src` пробрасываются.

- [ ] **Step 5: Write the failing sitemap and footer tests**

В `web/app/sitemap.test.ts` после теста `lists /opt as a static page` добавить:

```ts
  it('lists /order-process as a static page with hreflang alternates', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listPages).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listBlogPosts).mockResolvedValue(emptyBlogResponse())

    const entry = (await sitemap()).find((e) => e.url.endsWith('/order-process'))

    expect(entry?.url).toBe('https://new.ximi4ka.ru/order-process')
    expect(entry?.alternates?.languages).toMatchObject({
      ru: 'https://new.ximi4ka.ru/order-process',
      en: 'https://new.ximi4ka.ru/en/order-process',
    })
  })
```

В тесте `degrades to an empty-but-valid sitemap when the API is down`: после строки `expect(urls).toContain('https://new.ximi4ka.ru/opt')` добавить `expect(urls).toContain('https://new.ximi4ka.ru/order-process')`, строку `expect(out.length).toBe(5)` заменить на `expect(out.length).toBe(6)`, комментарий выше дополнить словами `+ order-process`.

В `web/components/Footer.test.tsx` после теста `links оптом …` добавить:

```tsx
  it('links «как проходит заказ» to the order process page in the СТРАНИЦЫ row', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'как проходит заказ' })).toHaveAttribute(
      'href',
      '/order-process',
    )
  })
```

- [ ] **Step 6: Run to verify they fail**

Run: `cd web && npx vitest run app/sitemap.test.ts components/Footer.test.tsx`
Expected: FAIL — три теста (`order-process` не найден, длина 5 вместо 6, нет ссылки в подвале).

- [ ] **Step 7: Implement sitemap and footer**

В `web/app/sitemap.ts` сразу после записи `/opt` добавить:

```ts
    {
      url: `${base}/order-process`,
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: { languages: alternatesFor('/order-process', base) },
    },
```

В `web/components/Footer.tsx`, в `ROW_STRANITSY`, сразу после `{ label: 'доставка', href: '/delivery' },` добавить:

```ts
  { label: 'как проходит заказ', href: '/order-process' },
```

- [ ] **Step 8: Run to verify they pass**

Run: `cd web && npx vitest run app/sitemap.test.ts components/Footer.test.tsx "app/[locale]/(public)/order-process/page.test.tsx"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "web/app/[locale]/(public)/order-process" web/app/sitemap.ts web/app/sitemap.test.ts web/components/Footer.tsx web/components/Footer.test.tsx
git commit -m "feat(web): страница /order-process, запись в sitemap и ссылка в подвале

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Проверка, независимое ревью, подготовка PR

**Files:** без новых файлов; правки по замечаниям проверок.

**Interfaces:**
- Consumes: всё из Tasks 1–6.
- Produces: зелёные проверки с реальным выводом, готовый (не отправленный) PR-текст.

- [ ] **Step 1: Проверки из WORKFLOW 6.1 шаг 4**

```bash
cd /Users/vasilijaistov/Desktop/continuum/ximi4ka-shop/.claude/worktrees/articles-sya-audit-315de8
npm run lint && npm run typecheck
npm run test -w web
npx prettier --check .
```

Expected: всё зелёное. Если `prettier --check` красный — `npx prettier --write <файлы из вывода>`, повторить проверку и закоммитить `style: prettier`. Не использовать `test.skip`/`.only`, не оставлять `TODO`: `git diff origin/main --stat` и `git diff origin/main | grep -n -E "test\.skip|\.only\(|TODO|FIXME"` → пусто.

- [ ] **Step 2: Проверка в браузере (десктоп и 375 px)**

Запустить web-сервер через `preview_start` (имя из `.claude/launch.json`; если API не нужен для проверки, главная и `/order-process` откроются без данных). Затем:

1. `/ru`: прокрутить до `#order-process`; блок стоит между «Как это работает» и «Оптом», флаги видны, ссылка «Подробнее…» ведёт на `/order-process`. Скриншот.
2. `/ru/order-process`: четыре раздела, четыре картинки грузятся (статус 200 в `read_network_requests`), нет ошибок в `read_console_messages`. Скриншот.
3. `resize_window` 375×812: на обеих страницах `document.documentElement.scrollWidth <= window.innerWidth` (через `javascript_tool`), таблица сроков и список зон не вылезают. Скриншот. Вернуть `preset: desktop`.
4. `/en/order-process` отдаёт 200 и canonical с `/en/`.

Если «Заказ и доставка» сливается с соседним кремовым «Оптом» — поправить отступы/границу в `OrderProcessSection` и перепройти шаг 2.

- [ ] **Step 3: Независимое ревью отдельным проходом**

Запустить агента `code-reviewer` (не автор кода) на диффе `git diff origin/main` с указанием: сверить со спекой `docs/superpowers/specs/2026-10-16-order-process-design.md`, искать выдуманные факты в текстах (правило 4 WORKFLOW), расхождения порогов с `SHIPPING_RULES`, проблемы доступности (alt, заголовки, подписи таблиц), расхождения типов между задачами. Критичные и важные замечания исправить, повторить Step 1.

- [ ] **Step 4: Подготовить текст PR (не отправлять)**

Файл `$SCRATCH/pr-body.md`: **Что** — блок на главной и страница `/order-process`, флаги, 4 скриншота. **Зачем** — покупатель до заказа видит условия и сроки. **Как проверено** — вывод команд Step 1 и результаты Step 2. **Что не вошло** — `/delivery` и `/dostavka` не менялись, пороги чекаута не менялись. **Что сделать владельцу после мёржа** — вычитать тексты (правило 8, факты из сообщения владельца 16.10.2026), добавить `https://ximi4ka.ru/order-process` в Яндекс.Вебмастер («Переобход страниц») и GSC. Последняя строка: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 5: Уборка и итог**

Остановить dev-серверы (`preview_stop`), удалить локальную одноразовую БД и временные файлы стенда (команды — в Task 1, Step «Уборка»), очистить `$SCRATCH` от скриншотов и скриптов, кроме `pr-body.md`. Push и создание PR **не выполнять** до команды владельца. Сообщить владельцу: ветка готова, проверки зелёные (с выводом), PR-текст лежит в `$SCRATCH/pr-body.md`, ждём команду на push/PR.
