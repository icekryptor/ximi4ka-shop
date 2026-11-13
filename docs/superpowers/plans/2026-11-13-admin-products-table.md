# Админка: таблица товаров с правкой на месте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** закреплённый сайдбар, правка цены/старой цены/наличия/порядка/публикации прямо в таблице, фильтр по категории.

**Architecture:** API получает безопасный частичный PATCH и параметр `categoryId` в админском списке; web-страница
остаётся серверной, строки рендерит клиентский `ProductsTable`, который шлёт PATCH одного поля.

**Tech Stack:** Express + TypeORM + zod 4 (api), Next.js 16 + React 19 + Tailwind 4 + Vitest (web).

**Spec:** `docs/superpowers/specs/2026-11-13-admin-products-table-design.md`

## Global Constraints

- PATCH одного поля не меняет другие поля товара.
- Фильтр — точное совпадение категории, как на витрине (без подкатегорий).
- Потолок `limit` админского списка категорий — 500.
- Перед PR: `npm run lint`, `npm run typecheck`, тесты api и web, `npx prettier --check .`.

## Review Focus

- Пустое поле «Старая цена» → `null` (снять зачёркнутую цену), а не 0.
- Нецелое/отрицательное число в цене → ошибка в строке, значение откатывается, запрос не уходит.
- Значение не изменилось → запрос не уходит.
- Ошибка API (400/500) → сообщение в строке, значение откатывается к сохранённому.
- `?category=` с мусором → API 400; страница не должна падать: web передаёт только uuid из списка категорий.

---

### Task 1: PATCH товара без значений по умолчанию

**Files:** Modify `api/src/routes/admin/products.schemas.ts`; Test `api/src/routes/products.test.ts`

- [ ] Тест «PATCH одного поля не сбрасывает остальные»: создать товар с `longDescriptionBlocks:[{type:'p'}]`,
      `stockStatus:'preorder'`, `sortOrder:7`, `noindex:true`, `translations:{en:{name:'E'}}`; `PATCH {priceRub:300}`;
      все пять полей прежние, `priceRub` 300.
- [ ] Прогнать — FAIL.
- [ ] `ProductBaseSchema` без `.default()`; `CreateProductSchema = ProductBaseSchema.extend({...с default})`;
      `UpdateProductSchema = ProductBaseSchema.partial()`.
- [ ] Прогнать — PASS. Commit.

### Task 2: лимит категорий и фильтр `categoryId`

**Files:** Modify `api/src/routes/admin/categories.schemas.ts`, `products.schemas.ts` (`ListQuerySchema.categoryId:
z.uuid().optional()`), `products.ts` (`EXISTS (SELECT 1 FROM product_category_links pcl WHERE pcl.product_id = p.id
AND pcl.category_id = :categoryId)`); Test `products.test.ts`, `categories-and-pages.test.ts`

- [ ] Тесты: `GET /api/admin/categories?limit=200` → 200; `GET /api/admin/products?categoryId=<A>` возвращает только
      товары A, `total` соответствует; `categoryId=bad` → 400.
- [ ] FAIL → реализация → PASS. Commit.

### Task 3: закреплённый сайдбар

**Files:** Modify `web/components/admin/AdminShell.tsx`; Test `AdminShell.test.tsx`

- [ ] Тест: `aside` имеет классы `sticky`, `top-0`, `h-screen`.
- [ ] `aside`: `sticky top-0 h-screen overflow-y-auto shrink-0`. PASS. Commit.

### Task 4: таблица с правкой и фильтр

**Files:** Create `web/app/admin/(authed)/products/ProductsTable.tsx`, `ProductsCategoryFilter.tsx`, тесты рядом;
Modify `page.tsx`, `web/lib/adminApi.ts` (`adminPublishProduct`/`adminUnpublishProduct` — использовать имеющиеся)

**Interfaces:** `ProductsTable({ products: Product[], emptyText: string })`;
`ProductsCategoryFilter({ categories: ProductCategory[], value: string })` пишет `?category=` (сохраняет `q`, сбрасывает
`offset`); `parsePriceInput(raw: string, nullable: boolean): number | null | 'invalid'`.

- [ ] Тесты `parsePriceInput`: `'1 200'`→1200, `''`→null при nullable, `''`→'invalid' иначе, `'-5'`/`'1.5'`→'invalid'.
- [ ] Тест `ProductsTable`: смена цены + Enter → `adminUpdateProduct(id, {priceRub})` ровно с одним полем; Esc —
      без вызова; без изменений — без вызова; ошибка API → текст ошибки и откат.
- [ ] Тест фильтра: выбор категории → `router.push('/admin/products?q=x&category=<id>')`.
- [ ] Реализация, `page.tsx` грузит категории (`limit=500`) и передаёт `categoryId`. PASS. Commit.

### Task 5: проверка

- [ ] lint, typecheck, тесты api/web, prettier; локальный dev — скриншот таблицы с фильтром и правкой.
