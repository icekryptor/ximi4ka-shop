# Блок оптового заказа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить страницу `/opt` и секцию на главной, где покупатель ищет товары, видит превью и оптовую цену и отправляет список в корзину; сервер считает те же скидки.

**Architecture:** Расширяем существующий движок скидок `wholesale.ts` в двух зеркальных копиях (api + web): добавляем процентные ступени для реагентов и оборудования и цены партий для пробирок и пипеток. Сервер считает сумму каждой строки (`wholesaleLineTotals`) и хранит её в новом поле `order_items.line_total_rub`. Витрина берёт ту же функцию для корзины и для блока; блок — клиентский компонент поверх расширенного `/api/public/search`.

**Tech Stack:** TypeScript, Express + TypeORM + Postgres (api), Next.js 16 / React 19 / Tailwind v4 (web), vitest + Testing Library, supertest.

**Spec:** [docs/superpowers/specs/2026-10-07-wholesale-order-block-design.md](../specs/2026-10-07-wholesale-order-block-design.md)

## Global Constraints

- Мёрж в `main` = прод. Не мёржить, не ходить на прод-сервер и в прод-БД без явной команды владельца в чате.
- Перед PR: `npm run lint`, `npm run typecheck`, тесты затронутых workspace, `npx prettier --check .` в корне.
- Тесты api идут на своей одноразовой БД через `TEST_DATABASE_URL`; нужен локальный Postgres.
- Next.js здесь версии 16: перед правкой страниц и маршрутов читать `web/AGENTS.md` и нужный гайд в `node_modules/next/dist/docs/`. `params` страницы — Promise.
- `api/src/lib/pricing/wholesale.ts` и `web/lib/wholesale.ts` остаются зеркалами: тело файла, начиная со строки `export interface WholesaleGroup`, одинаково (проверяет тест из Задачи 2); тесты обеих копий одинаковые, различается только суффикс импорта `.js`.
- Правила цен (дословно из спеки):
  - Наборы Химичка 3.0, Электрохимичка, ОГЭ (`himichka-30`, `elektrohimichka`, `bolshoi-nabor-dlya-oge`) — вместе: −299 / −399 / −499 / −599 ₽ с набора от 5 / 10 / 20 / 50 шт.
  - Мини-Химичка (`mini-himichka`): −199 / −299 / −399 / −499 ₽ от 5 / 10 / 20 / 50 шт.
  - Реагенты и оборудование (категории `reagents`, `equipment`): −15% / −20% / −25% / −30% на позицию от 5 / 10 / 20 / 50 шт.
  - Пробирки `probirka`: 2 шт — 39 ₽, 5 — 99, 10 — 169, 20 — 299, свыше 20 — 299 ₽ + 14 ₽ за каждую штуку сверх 20.
  - Пипетки `pipetka-pastera`: 2 шт — 29 ₽, 5 — 69, 10 — 119, 20 — 199, свыше 20 — 199 ₽ + 9 ₽ за каждую штуку сверх 20.
  - Партионная цена только на ступенях 2, 5, 10, 20 и выше 20; на прочих количествах — обычная цена. Применяется, только если ниже обычной цены × количество.
  - Пробирки и пипетки не получают процентной скидки «оборудования». Комбо и печатная продукция — без скидок. Сумма строки не ниже 1 ₽ за штуку.
- Лимит строки в корзине и API — 99 шт.
- Коммиты: сообщение в стиле репозитория (`feat(...)`, `test(...)`) и в конце строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Входы, о которых спека молчит и которые чаще всего ломают такую работу:

- Слаг товара совпадает со служебным именем объекта (`constructor`, `toString`): партионные таблицы лежат в `Map`, а не в объекте, чтобы такой слаг не подхватил чужое правило (Задача 1, тест `ignores prototype-like slugs`).
- Корзина старого формата без `categories`: цена в превью без процентной скидки, не падение; после докачки категорий цена обновляется (Задачи 7 и 9).
- Количество 1 у пробирок и пипеток и любое число между ступенями: обычная цена, не 0 и не NaN (Задача 1).
- Цена товара ниже партионной цены (`probirka` по 19 ₽ в сид-данных): партия не применяется, заказ не дороже обычной цены (Задача 1, Задача 4).
- Результаты поиска с `stockStatus: 'out_of_stock'`: в блок их добавить нельзя (Задача 9).
- Заказы без `line_total_rub` (старые): все читатели суммы строки берут `unitPriceRub × quantity` (Задача 5).

---

## Карта файлов

| Файл                                                                                                                               | Что делает                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `api/src/lib/pricing/wholesale.ts` (изм.)                                                                                          | Источник правил: ступени, партии, `wholesaleLineTotals`, `isPercentEligible` |
| `web/lib/wholesale.ts` (изм.)                                                                                                      | Зеркало                                                                      |
| `web/lib/wholesale.mirror.test.ts` (нов.)                                                                                          | Сверяет, что зеркала не разошлись                                            |
| `api/src/migrations/1790750000000-AddOrderItemLineTotal.ts` (нов.)                                                                 | Колонка `order_items.line_total_rub`                                         |
| `api/src/entities/OrderItem.ts`, `shared/src/types/order.ts`, `account.ts`                                                         | Поле `lineTotalRub`                                                          |
| `api/src/lib/shipping/cart.ts`, `api/src/routes/checkout.ts`                                                                       | Сервер считает суммы строк и сохраняет их                                    |
| `api/src/lib/account/orders.ts`, `api/src/lib/notifications/format.ts`, админка, `OrderDetails.tsx`                                | Читатели суммы строки                                                        |
| `api/src/routes/public/search.ts`, `products.ts`, `shared/src/types/search.ts`, `product.ts`                                       | Поиск с `scope=wholesale`, `categorySlugs`                                   |
| `web/lib/cart.ts` (изм.)                                                                                                           | `CartItem.categories`, суммы строк, докачка категорий                        |
| `web/lib/wholesaleStaging.ts` (нов.)                                                                                               | Чистая логика блока: шаги количества, цена списка, подсказки                 |
| `web/components/wholesale/WholesaleSearch.tsx`, `WholesaleOrder.tsx`, `WholesaleTiersTable.tsx`, `WholesaleHomeSection.tsx` (нов.) | UI блока                                                                     |
| `web/app/[locale]/(public)/opt/page.tsx` (нов.), `web/app/sitemap.ts`, главная                                                     | Страница, sitemap, секция на главной                                         |

---

### Task 1: Движок скидок на сервере

**Files:**

- Modify: `api/src/lib/pricing/wholesale.ts`
- Modify: `api/src/lib/pricing/wholesale.test.ts`

**Interfaces:**

- Consumes: существующие `WHOLESALE_GROUPS`, `wholesaleUnitDiscounts`, `WholesaleLine`.
- Produces (экспорты `api/src/lib/pricing/wholesale.ts`):
  - `WholesaleLine` получает необязательное `categories?: readonly string[]`;
  - `PERCENT_TIERS: readonly { minQty: number; percent: number }[]`, `PERCENT_CATEGORIES: readonly string[]`;
  - `interface BatchPricing { steps: readonly { qty: number; totalRub: number }[]; extraUnitRub: number }`;
  - `BATCH_PRICING: ReadonlyMap<string, BatchPricing>`;
  - `batchTotal(pricing: BatchPricing, quantity: number): number | null`;
  - `isPercentEligible(slug: string, categories: readonly string[] | undefined): boolean`;
  - `percentOff(quantity: number): number`;
  - `wholesaleLineTotals(lines: readonly WholesaleLine[]): Map<string, number>` — сумма строки в рублях по слагу.

- [ ] **Step 1: Write the failing tests**

В `api/src/lib/pricing/wholesale.test.ts` замените строку импорта и добавьте в конец файла новый блок:

```ts
import { wholesaleUnitDiscounts, wholesaleLineTotals } from './wholesale.js'
```

```ts
const rl = (slug: string, quantity: number, priceRub: number, categories: string[]) => ({
  slug,
  quantity,
  priceRub,
  categories,
})
const total = (l: { slug: string; quantity: number; priceRub: number; categories?: string[] }) =>
  wholesaleLineTotals([l]).get(l.slug)

describe('wholesaleUnitDiscounts: ОГЭ-набор', () => {
  it('counts Химичка 3.0, Электрохимичка и набор для ОГЭ вместе', () => {
    const d = wholesaleUnitDiscounts([line('himichka-30', 3), line('bolshoi-nabor-dlya-oge', 2)])
    expect(d.get('himichka-30')).toBe(299)
    expect(d.get('bolshoi-nabor-dlya-oge')).toBe(299)
  })
})

describe('wholesaleLineTotals', () => {
  describe('реагенты и оборудование: процент на позицию', () => {
    it.each([
      [4, 400],
      [5, 425],
      [9, 765],
      [10, 800],
      [19, 1520],
      [20, 1500],
      [49, 3675],
      [50, 3500],
    ])('реактив по 100 ₽ × %i → %i ₽', (qty, expected) => {
      expect(total(rl('copper-sulfate', qty, 100, ['reagents']))).toBe(expected)
    })

    it('оборудование считается так же, как реагенты', () => {
      expect(total(rl('beaker', 10, 100, ['equipment']))).toBe(800)
    })

    it('округляет сумму строки до рубля (80,75 → 81)', () => {
      expect(total(rl('beaker', 5, 19, ['equipment']))).toBe(81)
    })

    it('не складывает количества разных позиций', () => {
      const t = wholesaleLineTotals([rl('a', 3, 100, ['reagents']), rl('b', 3, 100, ['reagents'])])
      expect(t.get('a')).toBe(300)
      expect(t.get('b')).toBe(300)
    })

    it('не опускает цену ниже 1 ₽ за штуку', () => {
      expect(total(rl('cheap', 50, 1, ['reagents']))).toBe(50)
    })

    it('без категорий или с чужой категорией скидки нет', () => {
      expect(total(rl('x', 10, 100, []))).toBe(1000)
      expect(total({ slug: 'x', quantity: 10, priceRub: 100 })).toBe(1000)
      expect(total(rl('x', 10, 100, ['combo']))).toBe(1000)
      expect(total(rl('x', 10, 100, ['print']))).toBe(1000)
    })
  })

  describe('пробирки: цена партии', () => {
    it.each([
      [1, 29],
      [2, 39],
      [3, 87],
      [4, 116],
      [5, 99],
      [7, 203],
      [10, 169],
      [19, 551],
      [20, 299],
      [21, 313],
      [50, 719],
    ])('пробирка по 29 ₽ × %i → %i ₽', (qty, expected) => {
      expect(total(rl('probirka', qty, 29, ['equipment']))).toBe(expected)
    })

    it('не берёт процентную скидку оборудования', () => {
      expect(total(rl('probirka', 5, 29, ['equipment']))).toBe(99)
      expect(total(rl('probirka', 7, 29, ['equipment']))).toBe(203)
    })

    it('партия не применяется, если дороже обычной цены (19 ₽ за штуку)', () => {
      expect(total(rl('probirka', 2, 19, ['equipment']))).toBe(38)
      expect(total(rl('probirka', 5, 19, ['equipment']))).toBe(95)
      expect(total(rl('probirka', 10, 19, ['equipment']))).toBe(169)
      expect(total(rl('probirka', 20, 19, ['equipment']))).toBe(299)
    })
  })

  describe('пипетки: цена партии', () => {
    it.each([
      [1, 19],
      [2, 29],
      [3, 57],
      [5, 69],
      [10, 119],
      [20, 199],
      [21, 208],
      [50, 469],
    ])('пипетка по 19 ₽ × %i → %i ₽', (qty, expected) => {
      expect(total(rl('pipetka-pastera', qty, 19, ['equipment']))).toBe(expected)
    })
  })

  it('наборы считаются как раньше: сумма строки = (цена − скидка) × количество', () => {
    expect(total(rl('himichka-30', 5, 3099, ['kits']))).toBe(14000)
    expect(total(rl('mini-himichka', 5, 1699, ['kits']))).toBe(7500)
    expect(total(rl('himichka-30', 4, 3099, ['kits']))).toBe(12396)
  })

  it('комбо и печать без скидки, даже при больших количествах', () => {
    expect(total(rl('himichka-i-elektrohimichka', 10, 5678, ['combo']))).toBe(56780)
    expect(total(rl('poster', 50, 100, ['print']))).toBe(5000)
  })

  it('ignores prototype-like slugs', () => {
    expect(total(rl('constructor', 5, 100, []))).toBe(500)
    expect(total(rl('toString', 5, 100, []))).toBe(500)
  })

  it('считает смешанную корзину по строкам независимо', () => {
    const t = wholesaleLineTotals([
      rl('himichka-30', 3, 3099, ['kits']),
      rl('bolshoi-nabor-dlya-oge', 2, 3099, ['kits']),
      rl('copper-sulfate', 10, 100, ['reagents']),
      rl('probirka', 5, 29, ['equipment']),
    ])
    expect(t.get('himichka-30')).toBe(3 * 2800)
    expect(t.get('bolshoi-nabor-dlya-oge')).toBe(2 * 2800)
    expect(t.get('copper-sulfate')).toBe(800)
    expect(t.get('probirka')).toBe(99)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/lib/pricing/wholesale.test.ts`
Expected: FAIL — `wholesaleLineTotals is not a function` (и падает тест про ОГЭ: у `bolshoi-nabor-dlya-oge` скидка 0).

- [ ] **Step 3: Implement**

В `api/src/lib/pricing/wholesale.ts`:

1. Замените первые четыре строки комментария:

```ts
// Оптовые скидки на наборы (решение владельца, 27.09.2026): скидка в рублях
// с каждого набора, ступень — по количеству наборов группы в заказе.
// Химичка 3.0 и Электрохимичка считаются вместе, у Мини-Химички своя шкала.
// Комбо и прочие товары в акции не участвуют.
```

на

```ts
// Оптовые скидки (решения владельца, 27.09.2026 и 07.10.2026):
// — наборы: скидка в рублях с каждого набора, ступень — по количеству наборов
//   группы в заказе (Химичка 3.0, Электрохимичка и набор для ОГЭ вместе, у
//   Мини-Химички своя шкала);
// — реагенты и оборудование: процент на позицию по её количеству;
// — пробирки и пипетки: цена всей партии по таблице.
// Комбо и прочие товары в акции не участвуют.
```

2. В первой группе слагов добавьте ОГЭ:

```ts
    slugs: ['himichka-30', 'elektrohimichka', 'bolshoi-nabor-dlya-oge'],
```

3. В `WholesaleLine` добавьте поле:

```ts
export interface WholesaleLine {
  slug: string
  quantity: number
  priceRub: number
  /** Слаги категорий товара; по ним определяется процентная скидка. */
  categories?: readonly string[]
}
```

4. В конец файла добавьте:

```ts
/** Процентная скидка реагентов и оборудования; по убыванию порога. */
export const PERCENT_TIERS: readonly { minQty: number; percent: number }[] = [
  { minQty: 50, percent: 30 },
  { minQty: 20, percent: 25 },
  { minQty: 10, percent: 20 },
  { minQty: 5, percent: 15 },
]

/** Категории, на которые действует процентная скидка. */
export const PERCENT_CATEGORIES: readonly string[] = ['reagents', 'equipment']

export interface BatchPricing {
  /** Цена всей партии на точном количестве, по возрастанию qty. */
  steps: readonly { qty: number; totalRub: number }[]
  /** Цена каждой штуки сверх последней ступени. */
  extraUnitRub: number
}

// Map, а не объект: слаг вроде `constructor` не должен находить чужое правило.
export const BATCH_PRICING: ReadonlyMap<string, BatchPricing> = new Map<string, BatchPricing>([
  [
    'probirka',
    {
      steps: [
        { qty: 2, totalRub: 39 },
        { qty: 5, totalRub: 99 },
        { qty: 10, totalRub: 169 },
        { qty: 20, totalRub: 299 },
      ],
      extraUnitRub: 14,
    },
  ],
  [
    'pipetka-pastera',
    {
      steps: [
        { qty: 2, totalRub: 29 },
        { qty: 5, totalRub: 69 },
        { qty: 10, totalRub: 119 },
        { qty: 20, totalRub: 199 },
      ],
      extraUnitRub: 9,
    },
  ],
])

/** Сумма партии: на ступени и выше последней; на прочих количествах — null. */
export function batchTotal(pricing: BatchPricing, quantity: number): number | null {
  const last = pricing.steps[pricing.steps.length - 1]
  if (quantity > last.qty) return last.totalRub + (quantity - last.qty) * pricing.extraUnitRub
  return pricing.steps.find((s) => s.qty === quantity)?.totalRub ?? null
}

/** Процентная скидка у реагентов и оборудования, кроме товаров с ценой партии. */
export function isPercentEligible(
  slug: string,
  categories: readonly string[] | undefined,
): boolean {
  if (BATCH_PRICING.has(slug)) return false
  return (categories ?? []).some((c) => PERCENT_CATEGORIES.includes(c))
}

/** Процент скидки для количества позиции (0 — ниже первой ступени). */
export function percentOff(quantity: number): number {
  return PERCENT_TIERS.find((t) => quantity >= t.minQty)?.percent ?? 0
}

/**
 * Сумма каждой строки со всеми оптовыми скидками, ₽ (ключ — слаг товара).
 * Не больше обычной цены × количество и не меньше 1 ₽ за штуку.
 */
export function wholesaleLineTotals(lines: readonly WholesaleLine[]): Map<string, number> {
  const unitOff = wholesaleUnitDiscounts(lines)
  const result = new Map<string, number>()
  for (const l of lines) {
    const list = l.priceRub * l.quantity
    const floor = l.quantity
    let total = list - (unitOff.get(l.slug) ?? 0) * l.quantity
    const batch = BATCH_PRICING.get(l.slug)
    if (batch) {
      const batchRub = batchTotal(batch, l.quantity)
      if (batchRub !== null && batchRub < list) total = Math.max(batchRub, floor)
    } else if (isPercentEligible(l.slug, l.categories)) {
      const percent = percentOff(l.quantity)
      if (percent > 0) total = Math.max(Math.round((list * (100 - percent)) / 100), floor)
    }
    result.set(l.slug, total)
  }
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx vitest run src/lib/pricing/wholesale.test.ts`
Expected: PASS (все тесты файла, включая старые).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/pricing/wholesale.ts api/src/lib/pricing/wholesale.test.ts
git commit -m "feat(api): оптовый движок — проценты на реагенты, партии пробирок и пипеток, ОГЭ в группе наборов

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Зеркало движка на витрине

**Files:**

- Modify: `web/lib/wholesale.ts`
- Modify: `web/lib/wholesale.test.ts`
- Create: `web/lib/wholesale.mirror.test.ts`

**Interfaces:**

- Consumes: всё, что произвела Задача 1.
- Produces: те же экспорты в `web/lib/wholesale.ts` (импортируются как `@/lib/wholesale` или `./wholesale`).

- [ ] **Step 1: Write the failing mirror test**

Создайте `web/lib/wholesale.mirror.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Тело двух копий движка (всё, начиная с первого экспорта) должно совпадать
// посимвольно: цену на экране и в заказе считают разные процессы.
const MARKER = 'export interface WholesaleGroup'
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const body = (src: string) => src.slice(src.indexOf(MARKER))

describe('wholesale mirror', () => {
  it('web/lib/wholesale.ts совпадает с api/src/lib/pricing/wholesale.ts', () => {
    const web = read('./wholesale.ts')
    const api = read('../../api/src/lib/pricing/wholesale.ts')
    expect(web).toContain(MARKER)
    expect(api).toContain(MARKER)
    expect(body(web)).toBe(body(api))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run lib/wholesale.mirror.test.ts`
Expected: FAIL — тела различаются (в web ещё старая версия).

- [ ] **Step 3: Copy the engine and the tests**

```bash
cp api/src/lib/pricing/wholesale.ts web/lib/wholesale.ts
sed -i '' 's#Зеркало — web/lib/wholesale.ts#Зеркало — api/src/lib/pricing/wholesale.ts#' web/lib/wholesale.ts
sed 's#\./wholesale\.js#./wholesale#' api/src/lib/pricing/wholesale.test.ts > web/lib/wholesale.test.ts
git diff --stat web/lib
```

Expected: в `web/lib/wholesale.ts` отличается от `api`-версии только строка с «Зеркало — …».

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/wholesale.mirror.test.ts lib/wholesale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/wholesale.ts web/lib/wholesale.test.ts web/lib/wholesale.mirror.test.ts
git commit -m "feat(web): зеркало оптового движка и тест на их совпадение

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Поле суммы строки в заказе

**Files:**

- Create: `api/src/migrations/1790750000000-AddOrderItemLineTotal.ts`
- Modify: `api/src/entities/OrderItem.ts:35-36`
- Modify: `shared/src/types/order.ts:26`
- Modify: `shared/src/types/account.ts:46`

**Interfaces:**

- Produces:
  - колонка `order_items.line_total_rub integer NULL`;
  - `OrderItem.lineTotalRub: number | null` (entity и `shared`);
  - `AccountOrderSummary['items'][number].lineTotalRub: number`.

- [ ] **Step 1: Create the migration**

`api/src/migrations/1790750000000-AddOrderItemLineTotal.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Сумма строки заказа с оптовой скидкой. Цена партии (5 пробирок за 99 ₽) не
// делится на целые рубли за штуку, поэтому unit_price_rub остаётся округлённой
// ценой для читателей, а точная сумма живёт здесь. У старых заказов NULL —
// читатели берут unit_price_rub × quantity.
export class AddOrderItemLineTotal1790750000000 implements MigrationInterface {
  name = 'AddOrderItemLineTotal1790750000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN "line_total_rub" integer`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "line_total_rub"`)
  }
}
```

- [ ] **Step 2: Add the entity column**

В `api/src/entities/OrderItem.ts` после `unitPriceRub` добавьте:

```ts

  // Сумма строки с оптовой скидкой, ₽. NULL у заказов до оптовых партий:
  // тогда сумма — unitPriceRub × quantity.
  @Column({ type: 'integer', name: 'line_total_rub', nullable: true })
  lineTotalRub!: number | null
```

- [ ] **Step 3: Add the shared types**

В `shared/src/types/order.ts`, в интерфейс `OrderItem` после `unitPriceRub: number`:

```ts
/** Сумма строки с оптовой скидкой; null у старых заказов (тогда unitPriceRub × quantity). */
lineTotalRub: number | null
```

В `shared/src/types/account.ts`, в тип позиции после `unitPriceRub: number`:

```ts
/** Сумма строки (с учётом оптовой скидки). */
lineTotalRub: number
```

- [ ] **Step 4: Typecheck and run migration through tests**

Run: `npm run typecheck -w api`
Expected: ошибка в `api/src/lib/account/orders.ts` (нет `lineTotalRub` в объекте позиции). Её чинит Задача 5; сейчас важно, что других ошибок нет.

Run: `cd api && npx vitest run src/routes/checkout.test.ts -t "creates a pending order"`
Expected: PASS (глобальная настройка прогоняет миграции, колонка создаётся).

- [ ] **Step 5: Commit**

```bash
git add api/src/migrations/1790750000000-AddOrderItemLineTotal.ts api/src/entities/OrderItem.ts shared/src/types/order.ts shared/src/types/account.ts
git commit -m "feat(api): поле order_items.line_total_rub для суммы строки с оптовой скидкой

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Сервер считает и сохраняет суммы строк

**Files:**

- Modify: `api/src/lib/shipping/cart.ts`
- Modify: `api/src/routes/checkout.ts:149-164`
- Modify: `api/src/routes/checkout.test.ts`

**Interfaces:**

- Consumes: `wholesaleLineTotals` (Задача 1), `OrderItem.lineTotalRub` (Задача 3).
- Produces: `CartLine.lineTotalRub: number`; `LoadedCart.discountRub` теперь включает все виды оптовых скидок.

- [ ] **Step 1: Write the failing tests**

В `api/src/routes/checkout.test.ts`:

1. Добавьте импорт `import { ProductCategory } from '../entities/ProductCategory.js'` рядом с остальными.
2. После `seedProduct` добавьте:

```ts
async function seedCategory(slug: string, products: Product[]): Promise<ProductCategory> {
  const repo = AppDataSource.getRepository(ProductCategory)
  return repo.save(repo.create({ slug, name: slug, translations: {}, products }))
}
```

3. В `beforeEach` замените запрос на
   `'TRUNCATE orders, order_items, products, product_categories RESTART IDENTITY CASCADE'`.
4. В существующем тесте про наборы после проверки `unitPriceRub` добавьте:

```ts
expect(byProduct.get(big.id)!.lineTotalRub).toBe(3 * 2800)
expect(byProduct.get(mini.id)!.lineTotalRub).toBe(4 * 1699)
```

5. После него добавьте три теста:

```ts
it('applies the percent discount per reagent position and stores the line total', async () => {
  const reagent = await seedProduct({ slug: 'copper-sulfate', priceRub: 100, sku: 'CU-1' })
  const other = await seedProduct({ slug: 'soda', priceRub: 100, sku: 'NA-1' })
  await seedCategory('reagents', [reagent, other])

  const res = await request(app)
    .post('/api/checkout')
    .send(
      checkoutBody([
        { productId: reagent.id, quantity: 10 },
        { productId: other.id, quantity: 4 },
      ]),
    )

  expect(res.status).toBe(201)
  const order = await AppDataSource.getRepository(Order).findOneOrFail({
    where: { orderNumber: res.body.data.orderNumber },
    relations: { items: true },
  })
  // 10 шт → −20% (800 ₽), 4 шт — ниже порога (400 ₽): позиции не складываются.
  expect(order.subtotalRub).toBe(1400)
  expect(order.discountRub).toBe(200)
  expect(order.totalRub).toBe(order.subtotalRub - order.discountRub + order.shippingRub)
  const byProduct = new Map(order.items.map((i) => [i.productId, i]))
  expect(byProduct.get(reagent.id)!.lineTotalRub).toBe(800)
  expect(byProduct.get(reagent.id)!.unitPriceRub).toBe(80)
  expect(byProduct.get(other.id)!.lineTotalRub).toBe(400)
})

it('prices tubes by batch: 5 pcs cost 99 ₽ in total, not a whole ₽ per piece', async () => {
  const tube = await seedProduct({ slug: 'probirka', priceRub: 29, sku: 'T-1' })
  await seedCategory('equipment', [tube])

  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: tube.id, quantity: 5 }]))

  expect(res.status).toBe(201)
  const order = await AppDataSource.getRepository(Order).findOneOrFail({
    where: { orderNumber: res.body.data.orderNumber },
    relations: { items: true },
  })
  expect(order.subtotalRub).toBe(145)
  expect(order.discountRub).toBe(46)
  expect(order.items[0].lineTotalRub).toBe(99)
  expect(order.items[0].unitPriceRub).toBe(20)
})

it('does not charge more than the regular price when the batch price is higher', async () => {
  const tube = await seedProduct({ slug: 'probirka', priceRub: 19, sku: 'T-2' })
  await seedCategory('equipment', [tube])

  const res = await request(app)
    .post('/api/checkout')
    .send(checkoutBody([{ productId: tube.id, quantity: 2 }]))

  expect(res.status).toBe(201)
  const order = await AppDataSource.getRepository(Order).findOneOrFail({
    where: { orderNumber: res.body.data.orderNumber },
    relations: { items: true },
  })
  expect(order.discountRub).toBe(0)
  expect(order.items[0].lineTotalRub).toBe(38)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx vitest run src/routes/checkout.test.ts`
Expected: FAIL — `lineTotalRub` равен `null`/`undefined`, у реагента нет скидки.

- [ ] **Step 3: Implement `loadCart`**

В `api/src/lib/shipping/cart.ts`:

1. Импорт: `import { wholesaleLineTotals } from '../pricing/wholesale.js'` (вместо `wholesaleUnitDiscounts`).
2. Интерфейсы:

```ts
export interface CartLine {
  product: Product
  quantity: number
  /** Сумма строки с оптовой скидкой, ₽ — то, что платит покупатель за позицию. */
  lineTotalRub: number
  /** Цена за штуку для читателей, которым нужна целая цена: сумма строки / количество, округлённая. */
  unitPriceRub: number
}

export interface LoadedCart {
  lines: CartLine[]
  /** Сумма товаров по обычным ценам. */
  subtotalRub: number
  /** Оптовая скидка (наборы, проценты, партии); к оплате за товары — subtotalRub − discountRub. */
  discountRub: number
  packLines: PackLine[]
}
```

3. В запросе товаров добавьте категории:

```ts
const products = await AppDataSource.getRepository(Product).find({
  where: { id: In(productIds), deletedAt: IsNull() },
  relations: { categories: true },
})
```

4. Замените блок от `const unitOff = …` до `const discountRub = …` на:

```ts
const lineTotals = wholesaleLineTotals(
  productIds.map((id) => {
    const p = productById.get(id)!
    return {
      slug: p.slug,
      quantity: qtyByProduct.get(id)!,
      priceRub: p.priceRub,
      categories: (p.categories ?? []).map((c) => c.slug),
    }
  }),
)
const lines = productIds.map((id) => {
  const product = productById.get(id)!
  const quantity = qtyByProduct.get(id)!
  const lineTotalRub = lineTotals.get(product.slug)!
  return { product, quantity, lineTotalRub, unitPriceRub: Math.round(lineTotalRub / quantity) }
})
const subtotalRub = lines.reduce((sum, l) => sum + l.product.priceRub * l.quantity, 0)
const discountRub = lines.reduce(
  (sum, l) => sum + (l.product.priceRub * l.quantity - l.lineTotalRub),
  0,
)
```

- [ ] **Step 4: Persist the line total in checkout**

В `api/src/routes/checkout.ts` в блоке сохранения позиций:

```ts
          lines.map(({ product: p, quantity, unitPriceRub, lineTotalRub }) =>
            itemRepo.create({
              orderId: created.id,
              productId: p.id,
              productSnapshot: { name: p.name, sku: p.sku, priceRub: p.priceRub },
              quantity,
              // Со скидкой: по ней СДЭК объявляет ценность, её видят бот и таблица.
              // Обычная цена остаётся в productSnapshot.priceRub.
              unitPriceRub,
              // Точная сумма строки: цена партии не делится на целые рубли за штуку.
              lineTotalRub,
            }),
          ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npx vitest run src/routes/checkout.test.ts src/routes/public`
Expected: PASS (вместе с тестами доставки, которые используют `loadCart`).

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/shipping/cart.ts api/src/routes/checkout.ts api/src/routes/checkout.test.ts
git commit -m "feat(api): сервер считает суммы строк с оптовыми скидками и сохраняет их в заказе

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Читатели суммы строки

**Files:**

- Modify: `api/src/lib/account/orders.ts:146`
- Modify: `api/src/lib/notifications/format.ts:20-24,112-117`
- Modify: `api/src/lib/notifications/format.test.ts`
- Modify: `web/app/[locale]/(public)/account/_components/OrderDetails.tsx:59`
- Modify: `web/app/admin/(authed)/orders/[id]/page.tsx:89`

**Interfaces:**

- Consumes: `OrderItem.lineTotalRub` (Задача 3).
- Produces: везде, где показывается сумма строки, она равна `lineTotalRub ?? unitPriceRub × quantity`.

- [ ] **Step 1: Write the failing test**

В `api/src/lib/notifications/format.test.ts`, внутри того же `describe`, где проверяется карточка (рядом с тестом «оптовая скидка — отдельной частью итоговой строки»), добавьте:

```ts
it('позиция с ценой партии: «5 шт — 99 ₽», если сумма не делится на количество без остатка', () => {
  const card = telegramCard({
    ...order,
    items: [
      {
        productSnapshot: { name: 'Пробирка', sku: 'T-1', priceRub: 29 },
        quantity: 5,
        unitPriceRub: 20,
        lineTotalRub: 99,
      },
    ],
  })
  expect(card).toContain('— Пробирка · T-1 · 5 шт — 99 ₽')
})

it('позиция без остатка в цене остаётся «N × цена»', () => {
  const card = telegramCard({
    ...order,
    items: [
      {
        productSnapshot: { name: 'Реактив', sku: null, priceRub: 100 },
        quantity: 10,
        unitPriceRub: 80,
        lineTotalRub: 800,
      },
    ],
  })
  expect(card).toContain('— Реактив · 10 × 80 ₽')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd api && npx vitest run src/lib/notifications/format.test.ts`
Expected: FAIL — для первой позиции выводится «5 × 20 ₽».

- [ ] **Step 3: Implement the notification format**

В `api/src/lib/notifications/format.ts`:

```ts
  items: {
    productSnapshot: { name: string; sku: string | null; priceRub: number }
    quantity: number
    unitPriceRub: number
    /** Сумма строки; нет у заказов до оптовых партий. */
    lineTotalRub?: number | null
  }[]
```

```ts
function itemLine(item: NotifiableOrder['items'][number]): string {
  const parts = [item.productSnapshot.name]
  if (item.productSnapshot.sku) parts.push(item.productSnapshot.sku)
  // Цена партии не делится на целые рубли за штуку: тогда честнее назвать сумму.
  const exact = item.lineTotalRub != null && item.lineTotalRub !== item.unitPriceRub * item.quantity
  parts.push(
    exact
      ? `${item.quantity} шт — ${rub(item.lineTotalRub!)}`
      : `${item.quantity} × ${rub(item.unitPriceRub)}`,
  )
  return parts.join(' · ')
}
```

- [ ] **Step 4: Update the other readers**

`api/src/lib/account/orders.ts` (в объект позиции после `unitPriceRub`):

```ts
        lineTotalRub: i.lineTotalRub ?? i.unitPriceRub * i.quantity,
```

`web/app/[locale]/(public)/account/_components/OrderDetails.tsx` — вместо `{formatRub(i.unitPriceRub * i.quantity)}`:

```tsx
{
  formatRub(i.lineTotalRub)
}
```

`web/app/admin/(authed)/orders/[id]/page.tsx` — колонка суммы строки:

```tsx
{
  formatRub(item.lineTotalRub ?? item.unitPriceRub * item.quantity)
}
```

- [ ] **Step 5: Run the tests and fix fixtures**

Run: `cd api && npx vitest run src/lib/notifications src/lib/account`
Expected: PASS. Если тесты кабинета сравнивают позиции через `toEqual`, добавьте в ожидаемые объекты `lineTotalRub: <цена за штуку × количество>`.

Run: `npm run typecheck -w api && npm run typecheck -w web`
Expected: ошибки типов только в фикстурах `AccountOrderSummary` веб-тестов (нет `lineTotalRub`). Найти: `grep -rn "unitPriceRub" web --include='*.test.tsx' --include='*.test.ts' -l --exclude-dir=node_modules`; добавьте в каждую фикстуру позиции `lineTotalRub`, равный `unitPriceRub × quantity`.

Run: `cd web && npx vitest run "app/[locale]/(public)/account"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A api/src web
git commit -m "feat: суммы строк заказа читаются из line_total_rub (кабинет, админка, Telegram)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Поиск и категории товара в API

**Files:**

- Modify: `shared/src/types/search.ts`
- Modify: `shared/src/types/product.ts`
- Modify: `api/src/routes/public/search.ts`
- Modify: `api/src/routes/public/search.test.ts`
- Modify: `api/src/routes/public/products.ts:44-62`
- Create: `api/src/routes/public/products.categorySlugs.test.ts`
- Modify: `web/lib/api.ts:185-194`
- Modify: `web/components/search/HeaderSearch.test.tsx`

**Interfaces:**

- Produces:
  - `SearchProductResult` = `{ id: string; slug: string; name: string; priceRub: number; image: string | null; stockStatus: StockStatus; categories: string[] }`;
  - `GET /api/public/search?q=…&scope=wholesale` — только товары из категорий `kits`, `reagents`, `equipment`, до 8 штук;
  - `Product.categorySlugs?: string[]` в ответе `GET /api/public/products/:slug`;
  - `searchCatalog(q, { signal?, scope? })`.

- [ ] **Step 1: Write the failing tests**

В `api/src/routes/public/search.test.ts`:

1. Импорт: `import { ProductCategory } from '../../entities/ProductCategory.js'`.
2. Хелпер после `seedProduct`:

```ts
async function seedCategory(slug: string, products: Product[]): Promise<ProductCategory> {
  const repo = AppDataSource.getRepository(ProductCategory)
  return repo.save(repo.create({ slug, name: slug, translations: {}, products }))
}
```

3. В `beforeEach` добавьте таблицу: `'TRUNCATE product_images, products, blog_posts, product_categories RESTART IDENTITY CASCADE'`.
4. Новые тесты в конце `describe`:

```ts
it('returns id, stockStatus and category slugs for every product', async () => {
  const p = await seedProduct({ name: 'Сульфат меди', slug: 'cu', stockStatus: 'out_of_stock' })
  await seedCategory('reagents', [p])

  const res = await request(app).get('/api/public/search').query({ q: 'сульфат' })

  expect(res.body.data.products[0]).toMatchObject({
    id: p.id,
    slug: 'cu',
    stockStatus: 'out_of_stock',
    categories: ['reagents'],
  })
})

it('scope=wholesale keeps only kits, reagents and equipment', async () => {
  const reagent = await seedProduct({ name: 'Набор реактивов А', slug: 'a' })
  const kit = await seedProduct({ name: 'Набор реактивов Б', slug: 'b' })
  const combo = await seedProduct({ name: 'Набор реактивов В', slug: 'c' })
  await seedProduct({ name: 'Набор реактивов Г', slug: 'd' }) // без категории
  await seedCategory('reagents', [reagent])
  await seedCategory('kits', [kit])
  await seedCategory('combo', [combo])

  const res = await request(app)
    .get('/api/public/search')
    .query({ q: 'набор реактивов', scope: 'wholesale' })

  const slugs = res.body.data.products.map((p: { slug: string }) => p.slug).sort()
  expect(slugs).toEqual(['a', 'b'])
})

it('without scope the search is unchanged (combo is still found)', async () => {
  const combo = await seedProduct({ name: 'Комбо-набор', slug: 'combo-1' })
  await seedCategory('combo', [combo])

  const res = await request(app).get('/api/public/search').query({ q: 'комбо' })

  expect(res.body.data.products).toHaveLength(1)
})

it('rejects an unknown scope', async () => {
  const res = await request(app).get('/api/public/search').query({ q: 'набор', scope: 'x' })
  expect(res.status).toBe(400)
})
```

5. Создайте `api/src/routes/public/products.categorySlugs.test.ts`:

```ts
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { createApp } from '../../app.js'

describe('GET /api/public/products/:slug — categorySlugs', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE product_images, products, product_categories RESTART IDENTITY CASCADE',
    )
  })

  it('returns the slugs of the product categories, not the category objects', async () => {
    const products = AppDataSource.getRepository(Product)
    const product = await products.save(
      products.create({
        slug: 'probirka',
        name: 'Пробирка',
        sku: 'T-1',
        priceRub: 29,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )
    const categories = AppDataSource.getRepository(ProductCategory)
    await categories.save(
      categories.create({
        slug: 'equipment',
        name: 'Оборудование',
        translations: {},
        products: [product],
      }),
    )

    const res = await request(app).get('/api/public/products/probirka')

    expect(res.status).toBe(200)
    expect(res.body.data.categorySlugs).toEqual(['equipment'])
    expect(res.body.data.categories).toBeUndefined()
  })

  it('returns an empty list for a product without categories', async () => {
    const products = AppDataSource.getRepository(Product)
    await products.save(
      products.create({
        slug: 'bare',
        name: 'Без категорий',
        sku: null,
        priceRub: 10,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )

    const res = await request(app).get('/api/public/products/bare')

    expect(res.body.data.categorySlugs).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && npx vitest run src/routes/public/search.test.ts src/routes/public/products.categorySlugs.test.ts`
Expected: FAIL — нет `id`/`categories` в результатах, `scope` игнорируется, нет `categorySlugs`.

- [ ] **Step 3: Implement shared types**

`shared/src/types/search.ts`:

```ts
import type { StockStatus } from './product.js'

export interface SearchProductResult {
  id: string
  slug: string
  name: string
  priceRub: number
  image: string | null
  stockStatus: StockStatus
  /** Слаги категорий: по ним оптовый блок считает процентную скидку. */
  categories: string[]
}
```

(остальное содержимое файла не меняется; импорт — первой строкой после комментария.)

`shared/src/types/product.ts`, в `Product` после `images`:

```ts
  /** Слаги категорий. Есть в ответе карточки товара (`/api/public/products/:slug`). */
  categorySlugs?: string[]
```

- [ ] **Step 4: Implement the search route**

В `api/src/routes/public/search.ts`:

```ts
const PRODUCT_LIMIT = 6
const WHOLESALE_PRODUCT_LIMIT = 8
const POST_LIMIT = 3
// Категории, в которых у товаров есть оптовое правило (комбо и печать — без скидок).
const WHOLESALE_CATEGORIES = ['kits', 'reagents', 'equipment']

const QuerySchema = z.object({
  q: z.string().trim().default(''),
  scope: z.enum(['wholesale']).optional(),
})
```

В обработчике: `const { q, scope } = QuerySchema.parse(req.query)` и запрос товаров заменить на:

```ts
const productRepo = AppDataSource.getRepository(Product)
const productQuery = productRepo
  .createQueryBuilder('product')
  .leftJoinAndSelect('product.images', 'image')
  .leftJoinAndSelect('product.categories', 'category')
  // ILIKE = case-insensitive; works for Cyrillic. Match across the three
  // fields a shopper is most likely to search by.
  .where('product.isPublished = true')
  .andWhere('product.deletedAt IS NULL')
  .andWhere(
    '(product.name ILIKE :pattern OR product.sku ILIKE :pattern OR product.shortDescription ILIKE :pattern)',
    { pattern },
  )
if (scope === 'wholesale') {
  productQuery.andWhere(
    `EXISTS (SELECT 1 FROM product_category_links l
           JOIN product_categories c ON c.id = l.category_id
          WHERE l.product_id = product.id AND c.slug IN (:...wholesaleCategories))`,
    { wholesaleCategories: WHOLESALE_CATEGORIES },
  )
}
const products = await productQuery
  .orderBy('product.sortOrder', 'ASC')
  .addOrderBy('product.createdAt', 'DESC')
  .take(scope === 'wholesale' ? WHOLESALE_PRODUCT_LIMIT : PRODUCT_LIMIT)
  .getMany()
```

и в маппинге результата:

```ts
      products: products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        priceRub: p.priceRub,
        image: [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null,
        stockStatus: p.stockStatus,
        categories: (p.categories ?? []).map((c) => c.slug),
      })),
```

Комментарий вверху файла («Deliberately compact…») дополните одной строкой: «Поля id, stockStatus и categories нужны оптовому блоку, чтобы положить товар в корзину.»

- [ ] **Step 5: Implement `categorySlugs` on the product route**

В `api/src/routes/public/products.ts`, обработчик `/:slug`: `relations: { images: true, categories: true }` и ответ:

```ts
if (!product) throw notFound('product_not_found', 'Product not found')
// Наружу — только слаги категорий: объекты категорий (SEO-блоки и т.д.) карточке не нужны.
const { categories, ...rest } = product
res.json({ data: { ...rest, categorySlugs: (categories ?? []).map((c) => c.slug) } })
```

- [ ] **Step 6: Web API client and fixtures**

`web/lib/api.ts`:

```ts
export async function searchCatalog(
  q: string,
  opts: { signal?: AbortSignal; scope?: 'wholesale' } = {},
): Promise<SearchResult> {
  const scope = opts.scope ? `&scope=${opts.scope}` : ''
  const body = await request<DataEnvelope<SearchResult>>(
    `/api/public/search?q=${encodeURIComponent(q)}${scope}`,
    { cache: 'no-store', signal: opts.signal },
  )
  return body.data
}
```

В `web/components/search/HeaderSearch.test.tsx` в `sample.products` добавьте новые поля:

```ts
    {
      id: 'p1',
      slug: 'himichka-30',
      name: 'Химичка 3.0',
      priceRub: 1500,
      image: 'https://cdn/x.png',
      stockStatus: 'in_stock',
      categories: ['kits'],
    },
    {
      id: 'p2',
      slug: 'slizi',
      name: 'Слаймы',
      priceRub: 490,
      image: null,
      stockStatus: 'in_stock',
      categories: [],
    },
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd api && npx vitest run src/routes/public`
Expected: PASS.

Run: `npm run typecheck -w api && npm run typecheck -w web && cd web && npx vitest run components/search`
Expected: PASS. Если typecheck укажет другие фикстуры `SearchResult` (`grep -rn "SearchResult" web --include='*.test.tsx' -l --exclude-dir=node_modules`), добавьте в них `id`, `stockStatus`, `categories`.

- [ ] **Step 8: Commit**

```bash
git add -A api/src shared/src web/lib web/components
git commit -m "feat(api): поиск с scope=wholesale и категориями, categorySlugs в карточке товара

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Корзина витрины: категории и суммы строк

**Files:**

- Modify: `web/lib/cart.ts`
- Modify: `web/lib/cart.test.ts`
- Create: `web/lib/cartBackfill.test.ts`
- Modify: `web/components/CartDrawer.tsx:17-30`

**Interfaces:**

- Consumes: `wholesaleLineTotals` (Задача 2), `getPublishedProduct(slug)` с `categorySlugs` (Задача 6).
- Produces:
  - `CartItem.categories?: string[]`;
  - `cartTotals` считает оптовую скидку по `wholesaleLineTotals`;
  - `backfillCartCategories(): Promise<void>` — докачивает категории позициям без них.

- [ ] **Step 1: Write the failing tests**

В `web/lib/cart.test.ts`, в блок `describe('cartTotals', …)` добавьте:

```ts
it('applies the percent discount to reagents with known categories', () => {
  const t = cartTotals([
    kit('sulfate', 10, { priceRub: 100, categories: ['reagents'] }),
    kit('soda', 4, { priceRub: 100, categories: ['reagents'] }),
  ])
  expect(t.subtotalRub).toBe(1400)
  expect(t.wholesaleRub).toBe(200)
  expect(t.totalRub).toBe(1200)
})

it('gives no percent discount while categories are unknown (старая корзина)', () => {
  const t = cartTotals([kit('sulfate', 10, { priceRub: 100 })])
  expect(t.wholesaleRub).toBe(0)
  expect(t.totalRub).toBe(1000)
})

it('prices a tube batch by the table (5 × 29 ₽ → 99 ₽)', () => {
  const t = cartTotals([kit('probirka', 5, { priceRub: 29, categories: ['equipment'] })])
  expect(t.subtotalRub).toBe(145)
  expect(t.wholesaleRub).toBe(46)
  expect(t.totalRub).toBe(99)
})
```

И добавьте в `describe`, где тестируются `addToCart`/`loadCart` (рядом с проверкой повторного добавления; используются `itemA` и хелперы файла), два теста:

```ts
it('keeps categories when the same product is added again without them', () => {
  const withCats = { ...itemA, categories: ['reagents'] }
  const once = addToCart([], withCats, 1)
  const twice = addToCart(once, itemA, 2)
  expect(twice[0].categories).toEqual(['reagents'])
  expect(twice[0].quantity).toBe(3)
})

it('restores categories from localStorage and drops invalid values', () => {
  window.localStorage.setItem(
    'ximi4ka-shop-cart',
    JSON.stringify([
      { ...itemA, quantity: 1, categories: ['reagents', 'equipment'] },
      { ...itemB, quantity: 1, categories: [1, 2] },
    ]),
  )
  const items = loadCart()
  expect(items[0].categories).toEqual(['reagents', 'equipment'])
  expect(items[1].categories).toBeUndefined()
})
```

Убедитесь, что в начале `cart.test.ts` импортируются `addToCart` и `loadCart` (если нет — добавьте в существующий импорт из `./cart`).

Создайте `web/lib/cartBackfill.test.ts`:

```ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

const getPublishedProduct = vi.fn()
vi.mock('./api', () => ({ getPublishedProduct: (slug: string) => getPublishedProduct(slug) }))

import { backfillCartCategories, loadCart, saveCart, type CartItem } from './cart'

const item = (slug: string, extra: Partial<CartItem> = {}): CartItem => ({
  productId: `id-${slug}`,
  slug,
  name: slug,
  priceRub: 100,
  quantity: 5,
  ...extra,
})

beforeEach(() => {
  window.localStorage.clear()
  getPublishedProduct.mockReset()
})
afterEach(() => {
  window.localStorage.clear()
})

describe('backfillCartCategories', () => {
  it('fetches categories for items that lack them and saves them in the cart', async () => {
    saveCart([item('sulfate'), item('soda', { categories: ['reagents'] })])
    getPublishedProduct.mockResolvedValue({ categorySlugs: ['reagents'] })

    await backfillCartCategories()

    expect(getPublishedProduct).toHaveBeenCalledTimes(1)
    expect(getPublishedProduct).toHaveBeenCalledWith('sulfate')
    expect(loadCart().find((i) => i.slug === 'sulfate')?.categories).toEqual(['reagents'])
  })

  it('does not request the same slug twice', async () => {
    saveCart([item('once')])
    getPublishedProduct.mockResolvedValue({ categorySlugs: [] })

    await Promise.all([backfillCartCategories(), backfillCartCategories()])

    expect(getPublishedProduct).toHaveBeenCalledTimes(1)
  })

  it('survives a failed request and keeps the item as is', async () => {
    saveCart([item('broken')])
    getPublishedProduct.mockRejectedValue(new Error('offline'))

    await expect(backfillCartCategories()).resolves.toBeUndefined()

    expect(loadCart()[0].categories).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run lib/cart.test.ts lib/cartBackfill.test.ts`
Expected: FAIL — `backfillCartCategories` не экспортирован, `categories` не читается, процентной скидки нет.

- [ ] **Step 3: Implement in `web/lib/cart.ts`**

1. Импорты:

```ts
import { wholesaleLineTotals } from './wholesale'
import { getPublishedProduct } from './api'
```

(строку `import { wholesaleUnitDiscounts } from './wholesale'` заменить первой из них.)

2. В `CartItem` после `compareAtPriceRub`:

```ts
  /**
   * Слаги категорий товара — по ним считается процентная оптовая скидка.
   * Optional: корзины, сохранённые до введения поля, его не имеют;
   * backfillCartCategories докачивает категории по слагу.
   */
  categories?: string[]
```

3. В `normalizeCartItem` перед `return item`:

```ts
if (Array.isArray(v.categories) && v.categories.every((c) => typeof c === 'string')) {
  item.categories = v.categories as string[]
}
```

4. В `addToCart` ветка `existing` — не терять категории:

```ts
if (existing) {
  // Повторное добавление обновляет снимок цены — в корзине актуальная.
  // Категории переносим из старой записи, если новая их не принесла.
  const categories = fresh.categories ?? existing.categories
  return items.map((i) =>
    i.productId === item.productId
      ? { ...fresh, ...(categories ? { categories } : {}), quantity: i.quantity + qty }
      : i,
  )
}
```

5. Замените `cartTotals` и поправьте комментарий поля:

```ts
/** Оптовая скидка: наборы, проценты на реагенты, партии (web/lib/wholesale.ts, зеркало сервера). */
wholesaleRub: number
```

```ts
export function cartTotals(items: CartItem[]): CartTotals {
  const lineTotals = wholesaleLineTotals(items)
  let goodsRub = 0
  let subtotalRub = 0
  let wholesaleRub = 0
  for (const i of items) {
    const listRub = i.priceRub * i.quantity
    goodsRub += (i.compareAtPriceRub ?? i.priceRub) * i.quantity
    subtotalRub += listRub
    wholesaleRub += listRub - (lineTotals.get(i.slug) ?? listRub)
  }
  const totalRub = subtotalRub - wholesaleRub
  return { goodsRub, subtotalRub, wholesaleRub, discountRub: goodsRub - totalRub, totalRub }
}
```

6. После `clearCart` добавьте:

```ts
// Слаги, по которым категории уже запрошены: функцию зовут из нескольких мест,
// без этого одна и та же позиция уходила бы в сеть повторно.
const categoryRequests = new Set<string>()

/**
 * Докачивает категории позициям корзины, у которых их нет (корзины старого
 * формата). Нет сети или товар снят — позиция остаётся как есть: в превью не
 * будет процентной скидки, а сервер при оформлении посчитает сам.
 */
export async function backfillCartCategories(): Promise<void> {
  const missing = loadCart().filter(
    (i) => i.categories === undefined && !categoryRequests.has(i.slug),
  )
  await Promise.all(
    missing.map(async (item) => {
      categoryRequests.add(item.slug)
      try {
        const product = await getPublishedProduct(item.slug)
        const categories = product.categorySlugs ?? []
        saveCart(loadCart().map((i) => (i.productId === item.productId ? { ...i, categories } : i)))
      } catch {
        // см. комментарий выше: тихо остаёмся без категорий.
      }
    }),
  )
}
```

- [ ] **Step 4: Mount the backfill in the global drawer**

В `web/components/CartDrawer.tsx`: импорт `backfillCartCategories` из `@/lib/cart` и сразу после `const router = useRouter()` (перед первым `useEffect`) добавьте:

```ts
// Корзины старого формата без категорий: докачиваем, чтобы процентная
// скидка попала в итог. Дроссель (не более одного запроса на слаг) — в самой функции.
useEffect(() => {
  if (items.some((i) => i.categories === undefined)) void backfillCartCategories()
}, [items])
```

- [ ] **Step 5: Run the web tests**

Run: `cd web && npx vitest run lib components/CartDrawer.test.tsx components/cart "app/[locale]/(public)/cart" "app/[locale]/(public)/checkout"`
Expected: PASS. В тестах корзины позиции без категорий вызовут сетевой запрос из `backfillCartCategories`; ошибка сети проглатывается, тесты не должны меняться. Если какой-то тест падает из-за «unhandled rejection» или `fetch`, добавьте в его начало `vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), getPublishedProduct: vi.fn().mockResolvedValue({ categorySlugs: [] }) }))`.

- [ ] **Step 6: Commit**

```bash
git add web/lib/cart.ts web/lib/cart.test.ts web/lib/cartBackfill.test.ts web/components/CartDrawer.tsx
git commit -m "feat(web): корзина считает оптовые суммы строк и докачивает категории товаров

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Чистая логика блока оптового заказа

**Files:**

- Create: `web/lib/wholesaleStaging.ts`
- Create: `web/lib/wholesaleStaging.test.ts`

**Interfaces:**

- Consumes: `BATCH_PRICING`, `PERCENT_TIERS`, `WHOLESALE_GROUPS`, `isPercentEligible`, `wholesaleLineTotals` (`@/lib/wholesale`), `SearchProductResult`.
- Produces:
  - `MAX_QTY = 99`;
  - `interface StagedLine { productId; slug; name; priceRub; image: string | null; categories: string[]; stockStatus; quantity }`;
  - `toStagedLine(p: SearchProductResult): StagedLine` (количество — `initialQuantity`);
  - `initialQuantity(slug: string): number`;
  - `stepQuantity(slug: string, current: number, direction: 1 | -1): number`;
  - `priceStaged(lines: readonly StagedLine[]): { lines: PricedLine[]; listRub: number; totalRub: number; savingsRub: number }`, где `PricedLine = StagedLine & { listRub: number; totalRub: number }`;
  - `nextTierHint(line: StagedLine, all: readonly StagedLine[]): string | null`;
  - `wholesaleBadge(slug: string, categories: readonly string[]): string | null`.

- [ ] **Step 1: Write the failing tests**

`web/lib/wholesaleStaging.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  MAX_QTY,
  initialQuantity,
  nextTierHint,
  priceStaged,
  stepQuantity,
  toStagedLine,
  wholesaleBadge,
  type StagedLine,
} from './wholesaleStaging'

const line = (
  slug: string,
  quantity: number,
  priceRub: number,
  categories: string[],
): StagedLine => ({
  productId: `id-${slug}`,
  slug,
  name: slug,
  priceRub,
  image: null,
  categories,
  stockStatus: 'in_stock',
  quantity,
})

describe('initialQuantity', () => {
  it('партии начинаются с первой ступени (2), остальное — с 5', () => {
    expect(initialQuantity('probirka')).toBe(2)
    expect(initialQuantity('pipetka-pastera')).toBe(2)
    expect(initialQuantity('himichka-30')).toBe(5)
    expect(initialQuantity('copper-sulfate')).toBe(5)
  })

  it('toStagedLine кладёт стартовое количество и поля товара', () => {
    const staged = toStagedLine({
      id: 'p1',
      slug: 'probirka',
      name: 'Пробирка',
      priceRub: 29,
      image: 'x.png',
      stockStatus: 'in_stock',
      categories: ['equipment'],
    })
    expect(staged).toMatchObject({ productId: 'p1', quantity: 2, image: 'x.png' })
  })
})

describe('stepQuantity', () => {
  it('пробирки идут по ступеням 2 → 5 → 10 → 20 → 21 → 22', () => {
    expect(stepQuantity('probirka', 2, 1)).toBe(5)
    expect(stepQuantity('probirka', 5, 1)).toBe(10)
    expect(stepQuantity('probirka', 10, 1)).toBe(20)
    expect(stepQuantity('probirka', 20, 1)).toBe(21)
    expect(stepQuantity('probirka', 21, 1)).toBe(22)
  })

  it('и назад: 22 → 21 → 20 → 10 → 5 → 2, ниже 2 не опускается', () => {
    expect(stepQuantity('probirka', 22, -1)).toBe(21)
    expect(stepQuantity('probirka', 21, -1)).toBe(20)
    expect(stepQuantity('probirka', 20, -1)).toBe(10)
    expect(stepQuantity('probirka', 10, -1)).toBe(5)
    expect(stepQuantity('probirka', 5, -1)).toBe(2)
    expect(stepQuantity('probirka', 2, -1)).toBe(2)
  })

  it('не выходит за 99', () => {
    expect(stepQuantity('probirka', MAX_QTY, 1)).toBe(MAX_QTY)
    expect(stepQuantity('copper-sulfate', MAX_QTY, 1)).toBe(MAX_QTY)
  })

  it('остальные товары — по одному, от 1 до 99', () => {
    expect(stepQuantity('copper-sulfate', 5, 1)).toBe(6)
    expect(stepQuantity('copper-sulfate', 5, -1)).toBe(4)
    expect(stepQuantity('copper-sulfate', 1, -1)).toBe(1)
  })
})

describe('priceStaged', () => {
  it('считает строки, итог и экономию тем же движком, что корзина', () => {
    const priced = priceStaged([
      line('probirka', 5, 29, ['equipment']),
      line('copper-sulfate', 5, 100, ['reagents']),
    ])
    expect(priced.lines.map((l) => [l.slug, l.listRub, l.totalRub])).toEqual([
      ['probirka', 145, 99],
      ['copper-sulfate', 500, 425],
    ])
    expect(priced.listRub).toBe(645)
    expect(priced.totalRub).toBe(524)
    expect(priced.savingsRub).toBe(121)
  })

  it('наборы Химичка/Электро/ОГЭ считаются вместе', () => {
    const priced = priceStaged([
      line('himichka-30', 3, 3099, ['kits']),
      line('bolshoi-nabor-dlya-oge', 2, 3099, ['kits']),
    ])
    expect(priced.totalRub).toBe(5 * 2800)
  })

  it('пустой список — нули', () => {
    expect(priceStaged([])).toEqual({ lines: [], listRub: 0, totalRub: 0, savingsRub: 0 })
  })
})

describe('nextTierHint', () => {
  it('реактив: сколько штук до следующей ступени', () => {
    const l = line('copper-sulfate', 5, 100, ['reagents'])
    expect(nextTierHint(l, [l])).toBe('ещё 5 шт — и цена станет ниже')
  })

  it('наборы: количество суммируется по группе', () => {
    const a = line('himichka-30', 3, 3099, ['kits'])
    const b = line('bolshoi-nabor-dlya-oge', 4, 3099, ['kits'])
    expect(nextTierHint(a, [a, b])).toBe('ещё 3 шт — и цена станет ниже')
  })

  it('партия: следующая ступень таблицы', () => {
    const l = line('probirka', 2, 29, ['equipment'])
    expect(nextTierHint(l, [l])).toBe('ещё 3 шт — и цена станет ниже')
  })

  it('на верхней ступени подсказки нет', () => {
    const l = line('copper-sulfate', 50, 100, ['reagents'])
    expect(nextTierHint(l, [l])).toBeNull()
    const t = line('probirka', 21, 29, ['equipment'])
    expect(nextTierHint(t, [t])).toBeNull()
  })
})

describe('wholesaleBadge', () => {
  it('описывает правило товара коротко', () => {
    expect(wholesaleBadge('himichka-30', ['kits'])).toBe('от 5 шт: −299 ₽ с набора')
    expect(wholesaleBadge('mini-himichka', ['kits'])).toBe('от 5 шт: −199 ₽ с набора')
    expect(wholesaleBadge('copper-sulfate', ['reagents'])).toBe('от 5 шт: −15%')
    expect(wholesaleBadge('probirka', ['equipment'])).toBe('партиями от 2 шт')
    expect(wholesaleBadge('poster', ['print'])).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run lib/wholesaleStaging.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Implement `web/lib/wholesaleStaging.ts`**

```ts
import type { SearchProductResult } from '@ximi4ka-shop/shared'
import {
  BATCH_PRICING,
  PERCENT_TIERS,
  WHOLESALE_GROUPS,
  isPercentEligible,
  wholesaleLineTotals,
} from './wholesale'

// Логика оптового блока без React: шаги количества, цена списка, подсказки.
// Цены считает тот же движок, что корзина и сервер (./wholesale).

export const MAX_QTY = 99

export interface StagedLine {
  productId: string
  slug: string
  name: string
  priceRub: number
  image: string | null
  categories: string[]
  stockStatus: SearchProductResult['stockStatus']
  quantity: number
}

export type PricedLine = StagedLine & { listRub: number; totalRub: number }

/** Стартовое количество: у партий — первая ступень, у остальных — первая ступень скидки. */
export function initialQuantity(slug: string): number {
  const batch = BATCH_PRICING.get(slug)
  return batch ? batch.steps[0].qty : 5
}

export function toStagedLine(p: SearchProductResult): StagedLine {
  return {
    productId: p.id,
    slug: p.slug,
    name: p.name,
    priceRub: p.priceRub,
    image: p.image,
    categories: p.categories,
    stockStatus: p.stockStatus,
    quantity: initialQuantity(p.slug),
  }
}

/** Шаг количества: у пробирок и пипеток по ступеням таблицы, выше последней — по одному. */
export function stepQuantity(slug: string, current: number, direction: 1 | -1): number {
  const batch = BATCH_PRICING.get(slug)
  if (!batch) return Math.min(MAX_QTY, Math.max(1, current + direction))

  const ladder = batch.steps.map((s) => s.qty)
  const top = ladder[ladder.length - 1]
  if (direction > 0) {
    if (current >= top) return Math.min(MAX_QTY, current + 1)
    return ladder.find((q) => q > current) ?? top
  }
  if (current > top) return current - 1
  const lower = [...ladder].reverse().find((q) => q < current)
  return lower ?? ladder[0]
}

export function priceStaged(lines: readonly StagedLine[]): {
  lines: PricedLine[]
  listRub: number
  totalRub: number
  savingsRub: number
} {
  const totals = wholesaleLineTotals(lines)
  const priced = lines.map((l) => {
    const listRub = l.priceRub * l.quantity
    return { ...l, listRub, totalRub: totals.get(l.slug) ?? listRub }
  })
  const listRub = priced.reduce((sum, l) => sum + l.listRub, 0)
  const totalRub = priced.reduce((sum, l) => sum + l.totalRub, 0)
  return { lines: priced, listRub, totalRub, savingsRub: listRub - totalRub }
}

function ascendingThresholds(slug: string, categories: readonly string[]): number[] {
  const batch = BATCH_PRICING.get(slug)
  if (batch) return batch.steps.map((s) => s.qty)
  const group = WHOLESALE_GROUPS.find((g) => g.slugs.includes(slug))
  if (group) return group.tiers.map((t) => t.minQty).reverse()
  if (isPercentEligible(slug, categories)) return PERCENT_TIERS.map((t) => t.minQty).reverse()
  return []
}

/** «ещё N шт — и цена станет ниже»; null, если следующей ступени нет. */
export function nextTierHint(line: StagedLine, all: readonly StagedLine[]): string | null {
  // Наборы одной группы копят ступень вместе.
  const group = WHOLESALE_GROUPS.find((g) => g.slugs.includes(line.slug))
  const quantity = group
    ? all.filter((l) => group.slugs.includes(l.slug)).reduce((sum, l) => sum + l.quantity, 0)
    : line.quantity
  const next = ascendingThresholds(line.slug, line.categories).find((t) => t > quantity)
  return next === undefined ? null : `ещё ${next - quantity} шт — и цена станет ниже`
}

/** Короткое описание оптового правила товара для карточки в подсказках; null — правила нет. */
export function wholesaleBadge(slug: string, categories: readonly string[]): string | null {
  const batch = BATCH_PRICING.get(slug)
  if (batch) return `партиями от ${batch.steps[0].qty} шт`
  const group = WHOLESALE_GROUPS.find((g) => g.slugs.includes(slug))
  if (group) {
    const first = group.tiers[group.tiers.length - 1]
    return `от ${first.minQty} шт: −${first.offRub} ₽ с набора`
  }
  if (isPercentEligible(slug, categories)) {
    const first = PERCENT_TIERS[PERCENT_TIERS.length - 1]
    return `от ${first.minQty} шт: −${first.percent}%`
  }
  return null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && npx vitest run lib/wholesaleStaging.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/wholesaleStaging.ts web/lib/wholesaleStaging.test.ts
git commit -m "feat(web): логика оптового блока — шаги количества, цена списка, подсказки

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Компоненты `WholesaleSearch` и `WholesaleOrder`

**Files:**

- Create: `web/components/wholesale/WholesaleSearch.tsx`
- Create: `web/components/wholesale/WholesaleOrder.tsx`
- Create: `web/components/wholesale/WholesaleOrder.test.tsx`

**Interfaces:**

- Consumes: `searchCatalog(q, { scope: 'wholesale', signal })` (Задача 6), логика `@/lib/wholesaleStaging` (Задача 8), `useCart().add`, `openCartDrawer` (`@/lib/cart`), `formatRub`.
- Produces: `WholesaleSearch({ onPick })`, `WholesaleOrder()` (без пропсов).

**Отступление от спеки:** в спеке были «два варианта» `full` и `compact`. Таблица скидок вынесена из компонента на страницу `/opt`, поэтому сам блок на странице и на главной одинаков и варианта не имеет.

- [ ] **Step 1: Write the failing test**

`web/components/wholesale/WholesaleOrder.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SearchResult } from '@ximi4ka-shop/shared'
import { formatRub } from '@/lib/stockLabel'
import { loadCart, OPEN_CART_EVENT } from '@/lib/cart'
import { WholesaleOrder } from './WholesaleOrder'

const mockSearch = vi.fn<(q: string, opts?: unknown) => Promise<SearchResult>>()
vi.mock('@/lib/api', () => ({
  searchCatalog: (q: string, opts?: unknown) => mockSearch(q, opts),
  getPublishedProduct: vi.fn(),
}))

const tube = {
  id: 'p-tube',
  slug: 'probirka',
  name: 'Пробирка',
  priceRub: 29,
  image: null,
  stockStatus: 'in_stock' as const,
  categories: ['equipment'],
}
const reagent = {
  id: 'p-r',
  slug: 'copper-sulfate',
  name: 'Сульфат меди',
  priceRub: 100,
  image: null,
  stockStatus: 'in_stock' as const,
  categories: ['reagents'],
}
const soldOut = {
  ...reagent,
  id: 'p-x',
  slug: 'rare',
  name: 'Редкий реактив',
  stockStatus: 'out_of_stock' as const,
}

function type(value: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

async function pick(query: string, name: RegExp) {
  type(query)
  const option = await screen.findByRole('option', { name })
  fireEvent.click(option)
}

beforeEach(() => {
  window.localStorage.clear()
  mockSearch.mockReset()
  mockSearch.mockResolvedValue({ products: [tube, reagent, soldOut], posts: [] })
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('WholesaleOrder', () => {
  it('ищет с scope=wholesale и показывает карточки с описанием скидки', async () => {
    render(<WholesaleOrder />)
    type('про')
    await screen.findByRole('option', { name: /Пробирка/ })
    expect(mockSearch).toHaveBeenCalledWith('про', expect.objectContaining({ scope: 'wholesale' }))
    expect(screen.getByRole('option', { name: /партиями от 2 шт/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /от 5 шт: −15%/ })).toBeInTheDocument()
  })

  it('товар «нет в наличии» добавить нельзя', async () => {
    render(<WholesaleOrder />)
    type('ре')
    const option = await screen.findByRole('option', { name: /Редкий реактив/ })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(option)
    expect(screen.queryAllByTestId('wholesale-line')).toHaveLength(0)
  })

  it('добавляет позицию со стартовым количеством и ценой с оптовой скидкой', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    const row = screen.getByTestId('wholesale-line')
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(row).toHaveTextContent(formatRub(39))
  })

  it('кнопка «+» у пробирок прыгает по ступеням и пересчитывает итог', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество' }))
    const row = screen.getByTestId('wholesale-line')
    expect(within(row).getByText('5')).toBeInTheDocument()
    expect(row).toHaveTextContent(formatRub(99))
  })

  it('итог: без скидки, скидка и к оплате по всему списку', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество' }))
    await pick('сул', /Сульфат меди/)
    expect(screen.getByTestId('wholesale-list-total')).toHaveTextContent(formatRub(645))
    expect(screen.getByTestId('wholesale-savings')).toHaveTextContent(formatRub(121))
    expect(screen.getByTestId('wholesale-total')).toHaveTextContent(formatRub(524))
  })

  it('повторный выбор того же товара не дублирует строку', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    await pick('про', /Пробирка/)
    expect(screen.getAllByTestId('wholesale-line')).toHaveLength(1)
  })

  it('«Добавить в корзину» кладёт позиции с категориями, открывает корзину и очищает список', async () => {
    const opened = vi.fn()
    window.addEventListener(OPEN_CART_EVENT, opened)
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить количество' }))
    await pick('сул', /Сульфат меди/)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить в корзину' }))

    const items = loadCart()
    expect(items.find((i) => i.slug === 'probirka')).toMatchObject({
      productId: 'p-tube',
      quantity: 5,
      categories: ['equipment'],
    })
    expect(items.find((i) => i.slug === 'copper-sulfate')).toMatchObject({
      quantity: 5,
      categories: ['reagents'],
    })
    expect(opened).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByTestId('wholesale-line')).toHaveLength(0)
    window.removeEventListener(OPEN_CART_EVENT, opened)
  })

  it('пустой список: кнопка отправки неактивна', () => {
    render(<WholesaleOrder />)
    expect(screen.getByRole('button', { name: 'Добавить в корзину' })).toBeDisabled()
  })

  it('убирает позицию из списка', async () => {
    render(<WholesaleOrder />)
    await pick('про', /Пробирка/)
    fireEvent.click(screen.getByRole('button', { name: /Убрать Пробирка/ }))
    expect(screen.queryAllByTestId('wholesale-line')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run components/wholesale`
Expected: FAIL — компонентов нет.

- [ ] **Step 3: Implement `WholesaleSearch.tsx`**

```tsx
'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { SearchProductResult } from '@ximi4ka-shop/shared'
import { searchCatalog } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import { wholesaleBadge } from '@/lib/wholesaleStaging'

const DEBOUNCE_MS = 250
const MIN_QUERY = 2

interface Props {
  onPick: (product: SearchProductResult) => void
}

/**
 * Поле поиска оптового блока: подсказки с карточками товаров (фото, цена,
 * короткое описание скидки). Запросы — с scope=wholesale, поэтому в выдаче
 * только товары, у которых есть оптовое правило. Устроено как HeaderSearch.
 */
export function WholesaleSearch({ onPick }: Props) {
  const listboxId = useId()
  const optionIdBase = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<SearchProductResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const hasQuery = query.trim().length >= MIN_QUERY

  // Дебаунс и отмена: устаревший ответ не перезапишет свежий. loading и сброс
  // короткого запроса ставятся в onChange — setState прямо в эффекте даёт каскад.
  useEffect(() => {
    if (!hasQuery) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchCatalog(query.trim(), { scope: 'wholesale', signal: controller.signal })
        .then((res) => {
          setProducts(res.products)
          setActiveIndex(-1)
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name !== 'AbortError') setProducts([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, hasQuery])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const showList = open && hasQuery
  const showEmpty = showList && !loading && products.length === 0

  const choose = (product: SearchProductResult) => {
    if (product.stockStatus === 'out_of_stock') return
    onPick(product)
    setQuery('')
    setProducts([])
    setOpen(false)
    setActiveIndex(-1)
  }

  const onChange = (value: string) => {
    setQuery(value)
    setOpen(true)
    const long = value.trim().length >= MIN_QUERY
    setLoading(long)
    if (!long) setProducts([])
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!showList || products.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % products.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? products.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      choose(products[activeIndex])
    }
  }

  const optionId = (i: number) => `${optionIdBase}-opt-${i}`

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Начните вводить название: набор, реактив, пробирка…"
        aria-label="Найти товар для оптового заказа"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showList}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        autoComplete="off"
        className="w-full rounded-full border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] px-5 py-3.5 font-lj-body text-base text-[var(--color-lj-ink)] outline-none transition-colors placeholder:opacity-55 focus:border-[var(--color-lj-brand)]"
      />
      {loading && hasQuery ? (
        <span role="status" aria-label="Загрузка" className="sr-only">
          Загрузка
        </span>
      ) : null}

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Результаты поиска"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[70vh] overflow-y-auto rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-1 shadow-[var(--shadow-lj-bright)]"
        >
          {showEmpty ? (
            <li
              role="presentation"
              className="px-3 py-4 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-65"
            >
              Ничего не найдено
            </li>
          ) : (
            products.map((p, i) => {
              const soldOut = p.stockStatus === 'out_of_stock'
              const badge = wholesaleBadge(p.slug, p.categories)
              return (
                <li key={p.id} role="presentation">
                  <button
                    type="button"
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    aria-disabled={soldOut}
                    onClick={() => choose(p)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-lj-bright-sm)] px-2.5 py-2 text-left transition-colors ${
                      i === activeIndex ? 'bg-[var(--color-lj-cream-shade)]' : ''
                    } ${soldOut ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--color-lj-cream-shade)]'}`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white">
                      {p.image ? (
                        // Plain <img>: миниатюры лежат на разных CDN, которых нет в
                        // белом списке next/image; 48px-превью не нужен конвейер оптимизации.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] opacity-50">
                          Х
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-lj-body text-sm text-[var(--color-lj-ink)]">
                        {p.name}
                      </span>
                      <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] text-[var(--color-lj-brand-deep)]">
                        {soldOut ? 'Нет в наличии' : badge}
                      </span>
                    </span>
                    <span className="shrink-0 font-lj-mono text-[length:var(--text-lj-mono-sm)]">
                      {formatRub(p.priceRub)}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Implement `WholesaleOrder.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import type { SearchProductResult } from '@ximi4ka-shop/shared'
import { openCartDrawer, useCart } from '@/lib/cart'
import { formatRub } from '@/lib/stockLabel'
import {
  nextTierHint,
  priceStaged,
  stepQuantity,
  toStagedLine,
  type StagedLine,
} from '@/lib/wholesaleStaging'
import { WholesaleSearch } from './WholesaleSearch'

const STEP_BTN =
  'inline-flex size-8 items-center justify-center rounded-full font-lj-mono leading-none text-[var(--color-lj-ink)] transition-colors hover:bg-[var(--color-lj-rule-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)]'

const SUMMARY_ROW =
  'flex justify-between gap-4 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em]'

/**
 * Блок оптового заказа: найти позиции, выбрать количества, увидеть цену с
 * оптовой скидкой и одним кликом отправить список в обычную корзину. Список
 * живёт в памяти страницы. Цены считает тот же движок, что корзина и сервер.
 */
export function WholesaleOrder() {
  const { add } = useCart()
  const [lines, setLines] = useState<StagedLine[]>([])
  const priced = useMemo(() => priceStaged(lines), [lines])

  const pick = (product: SearchProductResult) =>
    setLines((cur) =>
      cur.some((l) => l.productId === product.id) ? cur : [...cur, toStagedLine(product)],
    )

  const step = (productId: string, direction: 1 | -1) =>
    setLines((cur) =>
      cur.map((l) =>
        l.productId === productId
          ? { ...l, quantity: stepQuantity(l.slug, l.quantity, direction) }
          : l,
      ),
    )

  const remove = (productId: string) =>
    setLines((cur) => cur.filter((l) => l.productId !== productId))

  const addAll = () => {
    for (const l of lines) {
      add(
        {
          productId: l.productId,
          slug: l.slug,
          name: l.name,
          priceRub: l.priceRub,
          image: l.image ?? undefined,
          categories: l.categories,
        },
        l.quantity,
      )
    }
    setLines([])
    openCartDrawer()
  }

  return (
    <div className="flex flex-col gap-6">
      <WholesaleSearch onPick={pick} />

      {lines.length === 0 ? (
        <p className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-65">
          Найдите товар — он появится здесь с оптовой ценой
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {priced.lines.map((l) => {
            const hint = nextTierHint(l, lines)
            const discounted = l.totalRub < l.listRub
            return (
              <li
                key={l.productId}
                data-testid="wholesale-line"
                className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-3"
              >
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-lj-mono text-xs opacity-50">Х</span>
                  )}
                </span>
                <span className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
                  <span className="font-lj-body text-sm text-[var(--color-lj-ink)]">{l.name}</span>
                  {hint ? (
                    <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] text-[var(--color-lj-brand-deep)]">
                      {hint}
                    </span>
                  ) : null}
                </span>
                <span
                  role="group"
                  aria-label={`Количество: ${l.name}`}
                  className="inline-flex h-10 items-center rounded-full border-[0.5px] border-[var(--color-lj-ink)] px-0.5"
                >
                  <button
                    type="button"
                    className={STEP_BTN}
                    aria-label="Уменьшить количество"
                    onClick={() => step(l.productId, -1)}
                  >
                    −
                  </button>
                  <span
                    aria-live="polite"
                    className="w-8 text-center font-lj-mono text-[0.9375rem] tabular-nums"
                  >
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    className={STEP_BTN}
                    aria-label="Увеличить количество"
                    onClick={() => step(l.productId, 1)}
                  >
                    +
                  </button>
                </span>
                <span className="flex min-w-[6rem] flex-col items-end font-lj-mono">
                  <span className="text-[length:var(--text-lj-mono-sm)]">
                    {formatRub(l.totalRub)}
                  </span>
                  {discounted ? (
                    <span className="text-[length:var(--text-lj-mono-xs)] line-through opacity-55">
                      {formatRub(l.listRub)}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={STEP_BTN}
                  aria-label={`Убрать ${l.name}`}
                  onClick={() => remove(l.productId)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-[var(--color-lj-rule)] pt-4">
        <div className={`${SUMMARY_ROW} opacity-70`}>
          <span>Без скидки</span>
          <span data-testid="wholesale-list-total">{formatRub(priced.listRub)}</span>
        </div>
        {priced.savingsRub > 0 && (
          <div className={`${SUMMARY_ROW} text-[var(--color-lj-brand-deep)]`}>
            <span>Скидка</span>
            <span data-testid="wholesale-savings">−{formatRub(priced.savingsRub)}</span>
          </div>
        )}
        <div className={`${SUMMARY_ROW} font-bold`}>
          <span>К оплате</span>
          <span data-testid="wholesale-total">{formatRub(priced.totalRub)}</span>
        </div>
        <button
          type="button"
          onClick={addAll}
          disabled={lines.length === 0}
          className="lj-btn lj-btn-primary mt-2 self-start rounded-[4px] px-7 py-4 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Добавить в корзину
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && npx vitest run components/wholesale`
Expected: PASS. Если `getByText('2')` находит несколько элементов, сузьте проверку до `within(row).getByText('2', { selector: '[aria-live]' })`.

- [ ] **Step 6: Lint and typecheck the new files**

Run: `cd web && npx eslint components/wholesale lib/wholesaleStaging.ts && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add web/components/wholesale
git commit -m "feat(web): блок оптового заказа — поиск с карточками, список, итог, отправка в корзину

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Страница `/opt`, таблица скидок, sitemap

**Files:**

- Create: `web/components/wholesale/WholesaleTiersTable.tsx`
- Create: `web/components/wholesale/WholesaleTiersTable.test.tsx`
- Create: `web/app/[locale]/(public)/opt/page.tsx`
- Create: `web/app/[locale]/(public)/opt/page.test.tsx`
- Modify: `web/app/sitemap.ts`
- Modify: `web/app/sitemap.test.ts`

**Interfaces:**

- Consumes: `WHOLESALE_GROUPS`, `PERCENT_TIERS`, `BATCH_PRICING` (`@/lib/wholesale`), `WholesaleOrder` (Задача 9), `buildMetadata`, `Breadcrumbs`, `JsonLd`, `breadcrumbJsonLd`, `LabSection`.
- Produces: маршрут `/opt` (и `/en/opt` по правилам middleware), запись в sitemap.

- [ ] **Step 0: Read the SEO workflow**

Прочитайте `docs/seo/WORKFLOW.md` целиком (требование `CLAUDE.md`) и `web/AGENTS.md`. Новая индексируемая страница: title, description, canonical через `buildMetadata`, запись в sitemap. Если WORKFLOW требует ещё что-то для новых страниц (например, строку в `llms.txt`), добавьте это в этой же задаче.

- [ ] **Step 1: Write the failing tests**

`web/components/wholesale/WholesaleTiersTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WholesaleTiersTable } from './WholesaleTiersTable'

describe('WholesaleTiersTable', () => {
  it('показывает ступени наборов из движка', () => {
    render(<WholesaleTiersTable />)
    const kits = screen.getByRole('table', { name: 'Наборы' })
    expect(kits).toHaveTextContent('−299 ₽')
    expect(kits).toHaveTextContent('−599 ₽')
    expect(kits).toHaveTextContent('−199 ₽')
    expect(kits).toHaveTextContent('−499 ₽')
    expect(kits).toHaveTextContent('набор для ОГЭ')
  })

  it('показывает проценты для реагентов и оборудования', () => {
    render(<WholesaleTiersTable />)
    const reagents = screen.getByRole('table', { name: 'Реагенты и оборудование' })
    for (const percent of ['15%', '20%', '25%', '30%']) {
      expect(reagents).toHaveTextContent(percent)
    }
  })

  it('показывает цены партий и цену за штуку сверх 20', () => {
    render(<WholesaleTiersTable />)
    const batches = screen.getByRole('table', { name: 'Пробирки и пипетки' })
    expect(batches).toHaveTextContent('39 ₽')
    expect(batches).toHaveTextContent('299 ₽')
    expect(batches).toHaveTextContent('29 ₽')
    expect(batches).toHaveTextContent('199 ₽')
    expect(screen.getByText(/сверх 20 шт\./)).toHaveTextContent('14 ₽')
    expect(screen.getByText(/сверх 20 шт\./)).toHaveTextContent('9 ₽')
  })
})
```

`web/app/[locale]/(public)/opt/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/wholesale/WholesaleOrder', () => ({
  WholesaleOrder: () => <div data-testid="wholesale-order" />,
}))

import OptPage, { generateMetadata } from './page'

describe('OptPage', () => {
  it('is an async Server Component', () => {
    expect(OptPage.constructor.name).toBe('AsyncFunction')
  })

  it('отдаёт title с брендом и canonical на /opt', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })
    expect(meta.title).toBe('Оптовый заказ наборов, реактивов и оборудования — Химичка')
    expect(String(meta.alternates?.canonical)).toContain('/opt')
  })

  it('выводит h1, таблицу скидок и блок заказа', async () => {
    render(await OptPage({ params: Promise.resolve({ locale: 'ru' }) }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Оптом')
    expect(screen.getByRole('table', { name: 'Наборы' })).toBeInTheDocument()
    expect(screen.getByTestId('wholesale-order')).toBeInTheDocument()
  })
})
```

В `web/app/sitemap.test.ts` добавьте тест (рядом с первым; ему нужны те же моки с пустыми ответами, поэтому скопируйте подготовку из соседнего теста, где `listCategories`, `listPages`, `listBlogPosts` отдают пустые страницы):

```ts
it('lists /opt as a static page', async () => {
  vi.mocked(listPublishedProducts).mockResolvedValue({
    data: [],
    pagination: { limit: 1000, offset: 0, page: 1, total: 0 },
  })
  vi.mocked(listCategories).mockResolvedValue({
    data: [],
    pagination: { limit: 1000, offset: 0, page: 1, total: 0 },
  })
  vi.mocked(listPages).mockResolvedValue({
    data: [],
    pagination: { limit: 1000, offset: 0, page: 1, total: 0 },
  })
  vi.mocked(listBlogPosts).mockResolvedValue(emptyBlogResponse())

  const entries = await sitemap()

  expect(entries.map((e) => e.url)).toContain('https://new.ximi4ka.ru/opt')
})
```

Базовый URL без `NEXT_PUBLIC_SITE_URL` в этом файле — `https://new.ximi4ka.ru` (см. соседние проверки).

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run components/wholesale/WholesaleTiersTable.test.tsx "app/[locale]/(public)/opt" app/sitemap.test.ts`
Expected: FAIL — компонента, страницы и записи в sitemap нет.

- [ ] **Step 3: Implement `WholesaleTiersTable.tsx`**

```tsx
import { BATCH_PRICING, PERCENT_TIERS, WHOLESALE_GROUPS } from '@/lib/wholesale'
import { formatRub } from '@/lib/stockLabel'

// Таблица читает ступени из того же движка, по которому считают корзина и
// сервер, — цифры на странице не могут разойтись с реальными ценами.

const KIT_TITLES: Record<string, string> = {
  'himichka-30': 'Химичка 3.0, Электрохимичка, набор для ОГЭ (считаются вместе)',
  'mini-himichka': 'Мини-Химичка',
}

const TABLE = 'w-full border-collapse text-left font-lj-body text-sm'
const TH =
  'border-b border-[var(--color-lj-rule)] px-3 py-2 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70'
const TD = 'border-b border-[var(--color-lj-rule-soft)] px-3 py-3 tabular-nums'

export function WholesaleTiersTable() {
  const kitThresholds = [...WHOLESALE_GROUPS[0].tiers].reverse().map((t) => t.minQty)
  const percentTiers = [...PERCENT_TIERS].reverse()
  const batchSteps = BATCH_PRICING.get('probirka')!.steps.map((s) => s.qty)

  return (
    <div className="flex flex-col gap-12">
      <table className={TABLE} aria-label="Наборы">
        <thead>
          <tr>
            <th className={TH}>Набор</th>
            {kitThresholds.map((q) => (
              <th key={q} className={TH}>
                от {q} шт
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WHOLESALE_GROUPS.map((group) => (
            <tr key={group.slugs[0]}>
              <td className={TD}>{KIT_TITLES[group.slugs[0]] ?? group.slugs[0]}</td>
              {[...group.tiers].reverse().map((t) => (
                <td key={t.minQty} className={TD}>
                  −{formatRub(t.offRub)} с набора
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <table className={TABLE} aria-label="Реагенты и оборудование">
        <thead>
          <tr>
            <th className={TH}>Позиция</th>
            {percentTiers.map((t) => (
              <th key={t.minQty} className={TH}>
                от {t.minQty} шт
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={TD}>Каждая позиция отдельно</td>
            {percentTiers.map((t) => (
              <td key={t.minQty} className={TD}>
                −{t.percent}%
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div>
        <table className={TABLE} aria-label="Пробирки и пипетки">
          <thead>
            <tr>
              <th className={TH}>Товар</th>
              {batchSteps.map((q) => (
                <th key={q} className={TH}>
                  {q} шт
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Пробирки', 'probirka'],
              ['Пипетки', 'pipetka-pastera'],
            ].map(([title, slug]) => (
              <tr key={slug}>
                <td className={TD}>{title}</td>
                {BATCH_PRICING.get(slug)!.steps.map((s) => (
                  <td key={s.qty} className={TD}>
                    {formatRub(s.totalRub)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 font-lj-body text-sm opacity-70">
          Цена указана за всю партию. Свыше 20 шт. — каждая следующая пробирка по{' '}
          {formatRub(BATCH_PRICING.get('probirka')!.extraUnitRub)}, пипетка по{' '}
          {formatRub(BATCH_PRICING.get('pipetka-pastera')!.extraUnitRub)}. Партионная цена действует
          при количествах 2, 5, 10, 20 и больше 20 шт.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the page**

`web/app/[locale]/(public)/opt/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { LabSection } from '@/components/ui/LabSection'
import { JsonLd } from '@/components/seo/JsonLd'
import { WholesaleOrder } from '@/components/wholesale/WholesaleOrder'
import { WholesaleTiersTable } from '@/components/wholesale/WholesaleTiersTable'
import { buildMetadata } from '@/lib/metadata'
import { breadcrumbJsonLd, type BreadcrumbItem } from '@/lib/jsonLd'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n'

interface Props {
  params: Promise<{ locale: string }>
}

function pathForLocale(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '/opt' : `/${locale}/opt`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const alternatesByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((loc) => [loc, pathForLocale(loc)]),
  ) as Record<Locale, string>
  return buildMetadata({
    title: 'Оптовый заказ наборов, реактивов и оборудования — Химичка',
    metaDescription:
      'Закажите наборы Химичка, реактивы, оборудование, пробирки и пипетки оптом со скидкой: найдите позиции, выберите количество и сразу увидьте цену.',
    pathname: pathForLocale(locale),
    type: 'website',
    locale,
    alternatesByLocale,
  })
}

export default async function OptPage({ params }: Props) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale

  const homePath = locale === DEFAULT_LOCALE ? '/' : `/${locale}`
  const crumbs: BreadcrumbItem[] = [
    { name: 'Главная', href: homePath },
    { name: 'Оптом', href: pathForLocale(locale) },
  ]

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} variant="catalog" />

      <LabSection variant="cream" className="px-6 pt-12 pb-24">
        <div className="mx-auto flex max-w-[var(--max-lj-content)] flex-col gap-16">
          <header className="flex max-w-[48rem] flex-col gap-4">
            <h1 className="font-lj-display text-[clamp(2.25rem,5vw,4rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
              Оптом дешевле
            </h1>
            <p className="font-lj-body text-lg opacity-80">
              Школам, онлайн-школам и магазинам: соберите список, посмотрите цену с оптовой скидкой
              и отправьте его в корзину.
            </p>
          </header>

          <section aria-labelledby="opt-order" className="flex flex-col gap-6">
            <h2 id="opt-order" className="font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Собрать заказ
            </h2>
            <WholesaleOrder />
          </section>

          <section aria-labelledby="opt-tiers" className="flex flex-col gap-6">
            <h2 id="opt-tiers" className="font-lj-display text-2xl font-[700] tracking-[-0.03em]">
              Как считается скидка
            </h2>
            <WholesaleTiersTable />
            <p className="font-lj-body text-sm opacity-70">
              Для реагентов и оборудования скидка считается на каждую позицию отдельно. Наборы
              Химичка 3.0, Электрохимичка и для ОГЭ считаются вместе.
            </p>
          </section>

          <p className="font-lj-body text-base">
            Нужен заказ крупнее или счёт для организации?{' '}
            <Link href="/collab" className="underline underline-offset-4">
              Напишите нам о сотрудничестве
            </Link>
            .
          </p>
        </div>
      </LabSection>
    </>
  )
}
```

Проверьте, что маршрут CMS-страницы «Сотрудничество» действительно `/collab` (`grep -n '"slug": "collab"' api/data/cms-pages.json`). Если слаг другой, поправьте ссылку.

- [ ] **Step 5: Add `/opt` to the sitemap**

В `web/app/sitemap.ts` после записи `/catalog` добавьте:

```ts
    {
      url: `${base}/opt`,
      changeFrequency: 'monthly',
      priority: 0.7,
      alternates: { languages: alternatesFor('/opt', base) },
    },
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd web && npx vitest run components/wholesale "app/[locale]/(public)/opt" app/sitemap.test.ts`
Expected: PASS. Если тест `/opt` падает на `Breadcrumbs` (ему нужен роутер или контекст), замокайте его по образцу `catalog/page.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add web/components/wholesale web/app
git commit -m "feat(web): страница /opt с блоком заказа и таблицей скидок, запись в sitemap

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Секция на главной

**Files:**

- Create: `web/components/wholesale/WholesaleHomeSection.tsx`
- Create: `web/components/wholesale/WholesaleHomeSection.test.tsx`
- Modify: `web/app/[locale]/(public)/page.tsx` (после секции «Как это работает», до отзывов, около строки 372)

**Interfaces:**

- Consumes: `WholesaleOrder` (Задача 9), `LabSection`.
- Produces: `WholesaleHomeSection({ href }: { href: string })` — секция со сводкой скидок, блоком заказа и ссылкой «Все условия опта».

- [ ] **Step 1: Write the failing test**

`web/components/wholesale/WholesaleHomeSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./WholesaleOrder', () => ({ WholesaleOrder: () => <div data-testid="wholesale-order" /> }))

import { WholesaleHomeSection } from './WholesaleHomeSection'

describe('WholesaleHomeSection', () => {
  it('содержит сводку скидок, блок заказа и ссылку на /opt', () => {
    render(<WholesaleHomeSection href="/opt" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Оптом')
    expect(screen.getByText(/до −30%/)).toBeInTheDocument()
    expect(screen.getByTestId('wholesale-order')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Все условия опта' })).toHaveAttribute('href', '/opt')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run components/wholesale/WholesaleHomeSection.test.tsx`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Implement the section**

`web/components/wholesale/WholesaleHomeSection.tsx`:

```tsx
import Link from 'next/link'
import { LabSection } from '@/components/ui/LabSection'
import { WholesaleOrder } from './WholesaleOrder'

interface Props {
  /** Путь страницы /opt с учётом локали. */
  href: string
}

const HIGHLIGHTS = [
  'Наборы — до −599 ₽ с каждого',
  'Реагенты и оборудование — до −30%',
  'Пробирки и пипетки — цена партии',
]

/** Короткая секция главной: сводка скидок и тот же блок заказа, что на /opt. */
export function WholesaleHomeSection({ href }: Props) {
  return (
    <LabSection variant="cream" id="wholesale" className="px-6 py-32">
      <div className="mx-auto grid max-w-[var(--max-lj-content)] gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <h2 className="font-lj-display text-[clamp(2rem,4vw,3.5rem)] font-[900] leading-[0.95] tracking-[-0.045em]">
            Оптом дешевле
          </h2>
          <ul className="flex flex-col gap-2 font-lj-body text-base">
            {HIGHLIGHTS.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <Link href={href} className="font-lj-body text-base underline underline-offset-4">
            Все условия опта
          </Link>
        </div>
        <WholesaleOrder />
      </div>
    </LabSection>
  )
}
```

- [ ] **Step 4: Mount it on the home page**

В `web/app/[locale]/(public)/page.tsx` добавьте импорт

```tsx
import { WholesaleHomeSection } from '@/components/wholesale/WholesaleHomeSection'
```

и после закрывающего `</LabSection>` секции «Как это работает» (перед комментарием `{/* 6. Что говорят родители …`) вставьте:

```tsx
{
  /* 5б. Оптом (LAB CREAM) — тот же блок заказа, что на /opt */
}
;<WholesaleHomeSection href={locale === DEFAULT_LOCALE ? '/opt' : `/${locale}/opt`} />
```

Если в функции страницы нет переменной `locale`, возьмите ту, которой пользуются соседние секции для путей (например, `homePath`/`locale`), либо передайте `'/opt'`.

- [ ] **Step 5: Run to verify it passes**

Run: `cd web && npx vitest run components/wholesale/WholesaleHomeSection.test.tsx "app/[locale]/(public)/page.test.tsx"`
Expected: PASS. Если тест главной проверяет число секций или фиксирует список заголовков и теперь падает, обновите ожидание: добавилась одна секция «Оптом дешевле».

- [ ] **Step 6: Commit**

```bash
git add web/components/wholesale web/app
git commit -m "feat(web): секция «Оптом дешевле» на главной

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Проверка перед PR

**Files:** без изменений кода, если проверки зелёные.

- [ ] **Step 1: Full checks**

Run, из корня репозитория:

```bash
npm run lint
npm run typecheck
npm run test
npx prettier --check .
```

Expected: всё зелёное. Если `prettier --check` падает на новых файлах, выполните `npx prettier --write <файлы>` и закоммитьте как `style: prettier`.

- [ ] **Step 2: Scan for placeholders in the diff**

Run: `git diff main...HEAD -U0 | grep -nE "TODO|FIXME|\.skip|\.only|not implemented"`
Expected: пусто. Иначе — реализовать или явно сообщить о блокере.

- [ ] **Step 3: Check the block in the browser**

Запустите витрину и api из `.claude/launch.json` через `preview_start`; открыть `/opt` и главную. Проверить:

- ввод «про» показывает карточки; «+» у пробирки идёт 2 → 5 → 10 → 20 → 21;
- итог «К оплате» совпадает с таблицей (5 пробирок по 29 ₽ = 99 ₽);
- «Добавить в корзину» открывает корзину, итог корзины совпадает с итогом блока;
- на ширине 375 px нет горизонтальной прокрутки; тёмная тема не нужна (на сайте её нет);
- консоль без ошибок.

Если на локальной базе нет товаров с нужными слагами, посеять их скриптом `npm run import:tilda-catalog -w api` на локальной базе.

- [ ] **Step 4: Security review**

Запустить `/security-review` на ветке (затронуты цены, заказы, публичный поиск). Разобрать замечания; повторять шаги 1–3 после правок.

- [ ] **Step 5: Hand off**

Сообщить владельцу: что сделано, результаты проверок, открытые вопросы (цены `probirka` и `pipetka-pastera` на проде, права на таблицу `order_items` при миграции). Мёрж в `main` — только по явной команде.

---

## Self-review

**Покрытие спеки:** §3 правила цен — Задача 1 (+ОГЭ, правка спеки); §4 движок и зеркало — Задачи 1–2; §5 сервер и заказ — Задачи 3–5; §5 витрина — Задача 7; §6 поиск — Задача 6; §7 блок, `/opt`, главная — Задачи 8–11; §8 тесты — в каждой задаче, §9 выкатка — Задача 12. Пробел: в спеке «два варианта компонента», в плане один (отмечено в Задаче 9).

**Типы:** `wholesaleLineTotals`, `isPercentEligible`, `BATCH_PRICING` (Map), `StagedLine`, `stepQuantity`, `priceStaged`, `SearchProductResult` (id, stockStatus, categories), `CartItem.categories`, `lineTotalRub` — имена одинаковы во всех задачах.
