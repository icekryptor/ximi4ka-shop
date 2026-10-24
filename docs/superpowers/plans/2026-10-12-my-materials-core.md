# «Мои материалы» — ядро (этап 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** После оплаты покупатель получает электронные материалы (сначала три методички) на странице заказа и в разделе кабинета «Мои материалы»; файлы раздаются только через API.

**Architecture:** Каталог материалов и выдачи в БД (`learning_materials`, `learning_material_products`, `material_grants`). Выдача создаётся одной SQL-вставкой в `writeOrderStatusEvent` при переходе в `paid`. Файлы лежат на отдельном томе вне публичной статики и отдаются потоком через маршруты кабинета (сессия) и страницы заказа (токен заказа). Три текущие методички заводятся одноразовым apply-скриптом.

**Tech Stack:** Node/Express, TypeORM (миграции через raw SQL), Postgres, Vitest + supertest, Next.js (`web`), npm workspaces (`shared`, `api`, `web`).

**Spec:** `docs/superpowers/specs/2026-10-12-my-materials-core-design.md` (читать целиком до первой задачи).

## Global Constraints

- Мёрж в `main` = выкатка в прод. Ничего не мёржить, не ходить на прод-сервер и в прод-БД без явной команды владельца в чате. Коммитить в ветку `claude/my-materials-core` можно, пушить и открывать PR — только по команде.
- Схема БД меняется только миграциями (`synchronize: false`); тесты строят схему тем же `runMigrations()`.
- Новые таблицы и сущности называются `learning_materials`, `learning_material_products`, `material_grants` (префикс нужен, чтобы не пересечься с `material_leads`).
- Файлы материалов лежат в `MATERIALS_DIR` (по умолчанию `api/materials`, в проде `/app/api/materials`), вне `UPLOADS_DIR`; пути к файлам в ответах API не отдаются.
- Скачивание — только потоком через API: `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- Чужой, отозванный, неактивный материал и неверный uuid — `404`, а не `403`/`500`.
- Доступ после отмены или возврата сохраняется; автоматического отзыва нет.
- Тексты интерфейса — по-русски; название раздела кабинета — «Мои материалы».
- Перед PR: `npm run lint`, `npm run typecheck` (во всех workspace), тесты затронутых workspace, `npx prettier --check .` в корне. Next.js здесь не тот, что в обучающих данных — см. `web/AGENTS.md`; в этой работе используются только обычные клиентские компоненты и `next/link`.
- Тесты api идут на одноразовой БД (`TEST_DATABASE_URL`, по умолчанию `postgres://localhost:5432/ximi4ka_shop_test`), файлы тестов выполняются последовательно.
- Работа ведётся в ветке `claude/my-materials-core` (от `origin/main`). PDF в git не попадают.

## Review Focus

Спека молчит о следующих входах; для каждого есть тест в указанной задаче:

1. Покупатель с двумя заказами на одну методичку — в «Моих материалах» одна строка, не две (Task 5).
2. Гость купил без аккаунта, потом вошёл по тому же email — материалы появились после входа; аккаунты слиты — выдачи не потерялись (Task 4).
3. `file_key` с `../`, абсолютным путём или `\0` — файл не отдаётся, ответ `404` (Task 3).
4. Файл из каталога исчез с диска, а запись в БД есть — `404 material_file_missing`, не `500` и не пустой `200` (Task 3, Task 5).
5. В `:materialId` пришло не-uuid — `404`, а не `500` от Postgres (Task 5, Task 6).

---

## File Structure

| Файл                                                                                          | Ответственность                                                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `shared/src/types/materials.ts`                                                               | типы `MaterialKind`, `PublicOrderMaterial`, `AccountMaterial`                                        |
| `api/src/migrations/1790840000000-AddLearningMaterials.ts`                                    | три таблицы, индексы, CHECK                                                                          |
| `api/src/entities/LearningMaterial.ts`, `LearningMaterialProduct.ts`, `MaterialGrant.ts`      | сущности                                                                                             |
| `api/src/lib/materials/files.ts`                                                              | `materialsDir`, безопасный `resolveMaterialPath`, потоковая отдача `sendMaterialFile`                |
| `api/src/lib/materials/grants.ts`                                                             | `grantMaterialsForOrder`                                                                             |
| `api/src/lib/materials/queries.ts`                                                            | `isUuid`, `listCustomerMaterials`, `findCustomerMaterial`, `listOrderMaterials`, `findOrderMaterial` |
| `api/src/lib/materials/testUtils.ts`                                                          | фикстуры для тестов (как `routes/testUtils.ts`)                                                      |
| `api/src/routes/account/materials.ts`                                                         | `GET /api/account/materials`, `GET /api/account/materials/:materialId/download`                      |
| `api/src/routes/public/orders.ts`                                                             | `materials` в статусе заказа, скачивание по токену заказа                                            |
| `api/src/seeds/_lib/methodichki-materials.ts`, `api/src/seeds/apply-materials-methodichki.ts` | заведение трёх методичек и выдача уже оплаченным заказам                                             |
| `web/lib/materialUrls.ts`                                                                     | адреса скачивания (страница заказа, кабинет)                                                         |
| `web/components/MaterialsDownloads.tsx`                                                       | общий блок ссылок                                                                                    |
| `web/app/[locale]/(public)/account/_components/MaterialsList.tsx`, `MaterialsLink.tsx`        | список и ссылка в кабинете                                                                           |
| `web/app/[locale]/(public)/account/(authed)/materials/page.tsx`                               | страница «Мои материалы»                                                                             |
| `deploy/docker-compose.yml`, `deploy/app.env.example`, `deploy/MATERIALS.md`                  | том, переменная, памятка выкатки                                                                     |

---

### Task 1: Общие типы материалов

**Files:**

- Create: `shared/src/types/materials.ts`
- Create: `shared/src/types/materials.test.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/types/order.ts` (интерфейс `PublicOrderStatus`)

**Interfaces:**

- Consumes: ничего.
- Produces: `MaterialKind = 'file' | 'link'`; `PublicOrderMaterial { id; title; kind; url? }`; `AccountMaterial { id; title; kind; url?; fileName: string | null; sizeBytes: number | null; grantedAt: string }`; поле `PublicOrderStatus.materials?: PublicOrderMaterial[]`. Все типы экспортируются из `@ximi4ka-shop/shared`.

- [ ] **Step 1: Write the failing test**

Create `shared/src/types/materials.test.ts`:

```ts
import { expectTypeOf, test } from 'vitest'
import type {
  AccountMaterial,
  MaterialKind,
  PublicOrderMaterial,
  PublicOrderStatus,
} from '../index.js'

test('MaterialKind — файл или внешняя ссылка', () => {
  expectTypeOf<MaterialKind>().toEqualTypeOf<'file' | 'link'>()
})

test('PublicOrderMaterial не содержит путей к файлам', () => {
  expectTypeOf<keyof PublicOrderMaterial>().toEqualTypeOf<'id' | 'title' | 'kind' | 'url'>()
})

test('PublicOrderStatus.materials — необязательный список материалов заказа', () => {
  expectTypeOf<PublicOrderStatus['materials']>().toEqualTypeOf<PublicOrderMaterial[] | undefined>()
})

test('AccountMaterial: дата выдачи — строка ISO', () => {
  expectTypeOf<AccountMaterial['grantedAt']>().toEqualTypeOf<string>()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w shared`
Expected: FAIL — `tsc --noEmit` ругается: `Module '"../index.js"' has no exported member 'AccountMaterial'` (и `MaterialKind`, `PublicOrderMaterial`).

- [ ] **Step 3: Write minimal implementation**

Create `shared/src/types/materials.ts`:

```ts
// Электронные материалы, которые покупатель получает за покупку: файл на
// закрытом томе сервера или внешняя ссылка. Путей к файлам в типах нет —
// скачивание идёт по id через API.

export type MaterialKind = 'file' | 'link'

/** Материал на странице заказа. `url` есть только у kind = 'link'. */
export interface PublicOrderMaterial {
  id: string
  title: string
  kind: MaterialKind
  url?: string
}

/** Материал в разделе кабинета «Мои материалы». */
export interface AccountMaterial {
  id: string
  title: string
  kind: MaterialKind
  /** Только у kind = 'link'. */
  url?: string
  fileName: string | null
  sizeBytes: number | null
  /** Когда материал выдан впервые (ISO). */
  grantedAt: string
}
```

In `shared/src/index.ts` add (next to the other `export type` blocks):

```ts
export type { AccountMaterial, MaterialKind, PublicOrderMaterial } from './types/materials.js'
```

In `shared/src/types/order.ts` add the import at the top (after the existing imports):

```ts
import type { PublicOrderMaterial } from './materials.js'
```

and add the field at the end of `interface PublicOrderStatus` (after `shipment?`):

```ts
  /**
   * Только при верном секрете заказа (?t=): материалы, выданные этому заказу и
   * не отозванные. Выдачи появляются при оплате, поэтому до неё список пуст.
   */
  materials?: PublicOrderMaterial[]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w shared`
Expected: PASS (все тесты shared, включая 4 новых).

- [ ] **Step 5: Commit**

```bash
git add shared/src/types/materials.ts shared/src/types/materials.test.ts shared/src/index.ts shared/src/types/order.ts
git commit -m "feat(shared): типы материалов и поле materials в статусе заказа"
```

---

### Task 2: Миграция и сущности

**Files:**

- Create: `api/src/migrations/1790840000000-AddLearningMaterials.ts`
- Create: `api/src/entities/LearningMaterial.ts`, `api/src/entities/LearningMaterialProduct.ts`, `api/src/entities/MaterialGrant.ts`
- Modify: `api/src/config/dataSource.ts` (импорты и массив `entities`)
- Test: `api/src/entities/learningMaterials.test.ts`

**Interfaces:**

- Consumes: `MaterialKind` из Task 1; `seedOrder` из `api/src/routes/testUtils.ts`.
- Produces: сущности `LearningMaterial { id, title, kind, fileKey|null, fileName|null, mimeType|null, sizeBytes|null, externalUrl|null, isActive, createdAt, updatedAt }`, `LearningMaterialProduct { materialId, productId }`, `MaterialGrant { id, materialId, orderId|null, customerId|null, email|null, source: 'order'|'admin'|'link', revokedAt|null, createdAt }`; таблицы с теми же именами в snake_case; частичный уникальный индекс `UQ_material_grants_order_material`.

- [ ] **Step 1: Write the failing test**

Create `api/src/entities/learningMaterials.test.ts`:

```ts
import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { seedOrder } from '../routes/testUtils.js'
import { LearningMaterial } from './LearningMaterial.js'
import { MaterialGrant } from './MaterialGrant.js'

const materials = () => AppDataSource.getRepository(LearningMaterial)
const grants = () => AppDataSource.getRepository(MaterialGrant)

const fileMaterial = (over: Partial<LearningMaterial> = {}) =>
  materials().save(
    materials().create({
      title: 'Методичка',
      kind: 'file',
      fileKey: 'a.pdf',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      ...over,
    }),
  )

describe('таблицы материалов', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE material_grants, learning_material_products, learning_materials, orders RESTART IDENTITY CASCADE',
    )
  })

  it('сохраняет файл и читает обратно со значениями по умолчанию', async () => {
    const m = await fileMaterial()
    const saved = await materials().findOneByOrFail({ id: m.id })
    expect(saved).toMatchObject({
      kind: 'file',
      fileKey: 'a.pdf',
      isActive: true,
      externalUrl: null,
      sizeBytes: 10,
    })
  })

  it('файл без file_key и ссылка без external_url отклоняются CHECK-ом', async () => {
    await expect(fileMaterial({ fileKey: null })).rejects.toThrow(/CHK_learning_materials_payload/)
    await expect(
      materials().save(materials().create({ title: 'Ссылка', kind: 'link', externalUrl: null })),
    ).rejects.toThrow(/CHK_learning_materials_payload/)
  })

  it('file_key уникален среди файлов, ссылки с пустым file_key не конфликтуют', async () => {
    await fileMaterial()
    await expect(fileMaterial()).rejects.toThrow(/UQ_learning_materials_file_key/)
    for (const n of [1, 2]) {
      await materials().save(
        materials().create({
          title: `Ссылка ${n}`,
          kind: 'link',
          externalUrl: `https://example.com/${n}`,
        }),
      )
    }
    expect(await materials().count()).toBe(3)
  })

  it('выдача за заказ уникальна по (заказ, материал); выдачи без заказа не конфликтуют', async () => {
    const m = await fileMaterial()
    const order = await seedOrder()
    const grant = (over: Partial<MaterialGrant>) =>
      grants().save(grants().create({ materialId: m.id, source: 'order', ...over }))

    await grant({ orderId: order.id })
    await expect(grant({ orderId: order.id })).rejects.toThrow(/UQ_material_grants_order_material/)

    await grant({ email: 'a@example.com', source: 'admin' })
    await grant({ email: 'a@example.com', source: 'admin' })
    expect(await grants().count()).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/entities/learningMaterials.test.ts`
Expected: FAIL — `Cannot find module './LearningMaterial.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/entities/LearningMaterial.ts`:

```ts
import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import type { MaterialKind } from '@ximi4ka-shop/shared'

// Электронный материал: файл на закрытом томе (file_key — имя файла внутри
// MATERIALS_DIR) или внешняя ссылка. Не путать с MaterialLead — заявки с /get_materials.
@Entity({ name: 'learning_materials' })
export class LearningMaterial {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  title!: string

  @Column({ type: 'varchar', length: 16 })
  kind!: MaterialKind

  @Column({ type: 'varchar', length: 255, name: 'file_key', nullable: true })
  fileKey!: string | null

  @Column({ type: 'varchar', length: 255, name: 'file_name', nullable: true })
  fileName!: string | null

  @Column({ type: 'varchar', length: 127, name: 'mime_type', nullable: true })
  mimeType!: string | null

  @Column({ type: 'integer', name: 'size_bytes', nullable: true })
  sizeBytes!: number | null

  @Column({ type: 'text', name: 'external_url', nullable: true })
  externalUrl!: string | null

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date
}
```

Create `api/src/entities/LearningMaterialProduct.ts`:

```ts
import 'reflect-metadata'
import { Entity, PrimaryColumn } from 'typeorm'

// Какой товар даёт какой материал при оплате.
@Entity({ name: 'learning_material_products' })
export class LearningMaterialProduct {
  @PrimaryColumn('uuid', { name: 'material_id' })
  materialId!: string

  @PrimaryColumn('uuid', { name: 'product_id' })
  productId!: string
}
```

Create `api/src/entities/MaterialGrant.ts`:

```ts
import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

export type MaterialGrantSource = 'order' | 'admin' | 'link'

// Выдача материала. Ключ доступа — customer_id; email нужен, чтобы выдача
// гостю привязалась к аккаунту при входе (claimOrdersByEmail).
@Entity({ name: 'material_grants' })
export class MaterialGrant {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'material_id' })
  materialId!: string

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId!: string | null

  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null

  @Column({ type: 'varchar', length: 16 })
  source!: MaterialGrantSource

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
```

Create `api/src/migrations/1790840000000-AddLearningMaterials.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Электронные материалы: каталог, связь «товар → материал» и выдачи покупателям.
// Выдача за заказ уникальна по (order_id, material_id), поэтому повторная
// оплата/сверка ничего не дублирует.
export class AddLearningMaterials1790840000000 implements MigrationInterface {
  name = 'AddLearningMaterials1790840000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "learning_materials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "kind" character varying(16) NOT NULL,
        "file_key" character varying(255),
        "file_name" character varying(255),
        "mime_type" character varying(127),
        "size_bytes" integer,
        "external_url" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_learning_materials" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_learning_materials_kind" CHECK ("kind" IN ('file', 'link')),
        CONSTRAINT "CHK_learning_materials_payload" CHECK (
          ("kind" = 'file' AND "file_key" IS NOT NULL)
          OR ("kind" = 'link' AND "external_url" IS NOT NULL)
        )
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_learning_materials_file_key"
       ON "learning_materials" ("file_key") WHERE "file_key" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE TABLE "learning_material_products" (
        "material_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_learning_material_products" PRIMARY KEY ("material_id", "product_id"),
        CONSTRAINT "FK_lmp_material" FOREIGN KEY ("material_id")
          REFERENCES "learning_materials"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lmp_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_lmp_product" ON "learning_material_products" ("product_id")`,
    )
    await queryRunner.query(
      `CREATE TABLE "material_grants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "order_id" uuid,
        "customer_id" uuid,
        "email" character varying(255),
        "source" character varying(16) NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_material_grants" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_material_grants_source" CHECK ("source" IN ('order', 'admin', 'link')),
        CONSTRAINT "FK_material_grants_material" FOREIGN KEY ("material_id")
          REFERENCES "learning_materials"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_material_grants_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_material_grants_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE SET NULL
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_material_grants_order_material"
       ON "material_grants" ("order_id", "material_id") WHERE "order_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_material_grants_customer" ON "material_grants" ("customer_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_material_grants_email" ON "material_grants" ("email")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "material_grants"`)
    await queryRunner.query(`DROP TABLE "learning_material_products"`)
    await queryRunner.query(`DROP TABLE "learning_materials"`)
  }
}
```

In `api/src/config/dataSource.ts` add imports next to the other entity imports:

```ts
import { LearningMaterial } from '../entities/LearningMaterial.js'
import { LearningMaterialProduct } from '../entities/LearningMaterialProduct.js'
import { MaterialGrant } from '../entities/MaterialGrant.js'
```

and add them to the `entities: [...]` array (after `MaterialLead,`):

```ts
    LearningMaterial,
    LearningMaterialProduct,
    MaterialGrant,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/entities/learningMaterials.test.ts && npm run typecheck`
Expected: PASS (4 теста), typecheck чистый. Миграция применяется автоматически через `globalSetup`.

- [ ] **Step 5: Commit**

```bash
git add api/src/migrations/1790840000000-AddLearningMaterials.ts api/src/entities/LearningMaterial.ts api/src/entities/LearningMaterialProduct.ts api/src/entities/MaterialGrant.ts api/src/config/dataSource.ts api/src/entities/learningMaterials.test.ts
git commit -m "feat(api): таблицы материалов, связей с товарами и выдач"
```

---

### Task 3: Закрытое хранилище и потоковая отдача файла

**Files:**

- Create: `api/src/lib/materials/files.ts`
- Test: `api/src/lib/materials/files.test.ts`

**Interfaces:**

- Consumes: сущность `LearningMaterial` из Task 2.
- Produces: `materialsDir(): string`; `resolveMaterialPath(fileKey: string): string | null` (абсолютный путь внутри `MATERIALS_DIR` или `null`); `sendMaterialFile(res: express.Response, material: LearningMaterial): Promise<boolean>` — `true`, если поток отправлен; `false` (ничего не записав в `res`), если файла нет или он недоступен.

- [ ] **Step 1: Write the failing test**

Create `api/src/lib/materials/files.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearningMaterial } from '../../entities/LearningMaterial.js'
import { materialsDir, resolveMaterialPath, sendMaterialFile } from './files.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
  vi.stubEnv('MATERIALS_DIR', dir)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

const material = (over: Partial<LearningMaterial> = {}) =>
  ({
    kind: 'file',
    fileKey: 'a.pdf',
    fileName: 'a.pdf',
    mimeType: 'application/pdf',
    ...over,
  }) as LearningMaterial

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

function appFor(m: LearningMaterial) {
  const app = express()
  app.get('/f', async (_req, res) => {
    if (!(await sendMaterialFile(res, m))) res.status(404).json({ ok: false })
  })
  return app
}

describe('materialsDir', () => {
  it('берёт каталог из MATERIALS_DIR', () => {
    expect(materialsDir()).toBe(dir)
  })
})

describe('resolveMaterialPath', () => {
  it('принимает обычное имя файла', () => {
    expect(resolveMaterialPath('a.pdf')).toBe(path.join(dir, 'a.pdf'))
  })

  it.each(['../a.pdf', 'a/b.pdf', '/etc/passwd', '..', '.hidden', '', 'a\0b'])(
    'отвергает %j',
    (key) => {
      expect(resolveMaterialPath(key)).toBeNull()
    },
  )
})

describe('sendMaterialFile', () => {
  it('отдаёт файл с заголовками закрытой раздачи', async () => {
    await writeFile(path.join(dir, 'a.pdf'), '%PDF-1.4 test')
    const res = await request(appFor(material({ fileName: 'Методичка.pdf' })))
      .get('/f')
      .buffer(true)
      .parse(binary)

    expect(res.status).toBe(200)
    expect(res.body.toString()).toBe('%PDF-1.4 test')
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-length']).toBe('13')
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    const cd = res.headers['content-disposition'] as string
    expect(cd).toMatch(/^attachment; filename="[^"]*\.pdf"; filename\*=UTF-8''/)
    expect(decodeURIComponent(cd.split("filename*=UTF-8''")[1])).toBe('Методичка.pdf')
  })

  it('без mime_type отдаёт application/octet-stream', async () => {
    await writeFile(path.join(dir, 'a.pdf'), 'x')
    const res = await request(appFor(material({ mimeType: null })))
      .get('/f')
      .buffer(true)
      .parse(binary)
    expect(res.headers['content-type']).toBe('application/octet-stream')
  })

  it('файла нет на диске — false, ничего не отправлено', async () => {
    const res = await request(appFor(material())).get('/f')
    expect(res.status).toBe(404)
    expect(res.headers['content-disposition']).toBeUndefined()
  })

  it('запись без file_key (ссылка) — false', async () => {
    const res = await request(appFor(material({ kind: 'link', fileKey: null }))).get('/f')
    expect(res.status).toBe(404)
  })

  it('file_key с выходом за каталог не отдаётся, даже если файл существует', async () => {
    await writeFile(path.join(path.dirname(dir), 'outside-secret.txt'), 'secret')
    try {
      const res = await request(appFor(material({ fileKey: '../outside-secret.txt' }))).get('/f')
      expect(res.status).toBe(404)
      expect(res.text).not.toContain('secret')
    } finally {
      await rm(path.join(path.dirname(dir), 'outside-secret.txt'), { force: true })
    }
  })

  it('вместо файла каталог — false', async () => {
    await mkdir(path.join(dir, 'a.pdf'))
    const res = await request(appFor(material())).get('/f')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/lib/materials/files.test.ts`
Expected: FAIL — `Cannot find module './files.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/lib/materials/files.ts`:

```ts
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import type { Response } from 'express'
import type { LearningMaterial } from '../../entities/LearningMaterial.js'

// Закрытое хранилище материалов — отдельно от UPLOADS_DIR, который раздаётся
// публично через express.static. Каталог читаем на каждый вызов (а не при
// загрузке модуля), чтобы тесты могли подменить MATERIALS_DIR.
const thisDir = path.dirname(fileURLToPath(import.meta.url))

export function materialsDir(): string {
  const fromEnv = process.env.MATERIALS_DIR
  // src/lib/materials/ → src/lib/ → src/ → api/. +/materials
  return fromEnv ? path.resolve(fromEnv) : path.resolve(thisDir, '../../..', 'materials')
}

/**
 * Абсолютный путь файла внутри каталога материалов или null. file_key — только
 * базовое имя: без каталогов, без «..», без скрытых файлов и NUL-байтов.
 */
export function resolveMaterialPath(fileKey: string): string | null {
  if (!fileKey || fileKey.includes('\0')) return null
  if (fileKey !== path.basename(fileKey) || fileKey.startsWith('.')) return null
  const root = materialsDir()
  const full = path.resolve(root, fileKey)
  return full.startsWith(root + path.sep) ? full : null
}

// RFC 5987: encodeURIComponent не трогает ' ( ) * — а в значении filename* их нельзя.
function encodeRfc5987(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

// Запасное имя для клиентов без filename*: только печатный ASCII без кавычек.
function asciiFallback(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
}

/**
 * Отдаёт файл материала потоком. true — поток отправлен; false — файла нет или
 * он недоступен, и в `res` при этом ничего не записано (вызывающий отвечает 404).
 */
export async function sendMaterialFile(
  res: Response,
  material: LearningMaterial,
): Promise<boolean> {
  const full = material.fileKey ? resolveMaterialPath(material.fileKey) : null
  if (!full) return false
  let size: number
  try {
    const info = await stat(full)
    if (!info.isFile()) return false
    size = info.size
  } catch {
    return false
  }
  const name = material.fileName ?? material.fileKey ?? 'material'
  res.setHeader('Content-Type', material.mimeType ?? 'application/octet-stream')
  res.setHeader('Content-Length', String(size))
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`,
  )
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    await pipeline(createReadStream(full), res)
  } catch {
    // Клиент оборвал загрузку — заголовки уже ушли, отвечать нечем.
  }
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/lib/materials/files.test.ts && npm run typecheck`
Expected: PASS (все тесты файла), typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/materials/files.ts api/src/lib/materials/files.test.ts
git commit -m "feat(api): закрытое хранилище материалов и потоковая отдача файла"
```

---

### Task 4: Выдача при оплате, привязка по email, слияние аккаунтов

**Files:**

- Create: `api/src/lib/materials/grants.ts`
- Create: `api/src/lib/materials/testUtils.ts`
- Modify: `api/src/lib/notifications/outbox.ts` (импорт и вызов в `writeOrderStatusEvent`)
- Modify: `api/src/lib/account/customers.ts` (`claimOrdersByEmail`, `mergeCustomers`)
- Test: `api/src/lib/materials/grants.test.ts`

**Interfaces:**

- Consumes: сущности из Task 2; `seedOrder`, `loginAsCustomer`, `customerHeaders` из `api/src/routes/testUtils.ts`; `saveOrderWithStatusEvent` из `outbox.ts`.
- Produces: `grantMaterialsForOrder(em: EntityManager, order: Order): Promise<void>`; фикстуры `resetMaterialTables()`, `seedProduct(slug, priceRub?)`, `seedMaterial({ title, fileKey?, kind?, externalUrl?, isActive?, products? })`, `addOrderItem(orderId, product, opts?)` из `lib/materials/testUtils.ts` — их используют Task 5–7.

- [ ] **Step 1: Write the fixtures and the failing test**

Create `api/src/lib/materials/testUtils.ts`:

```ts
import { AppDataSource } from '../../config/dataSource.js'
import { LearningMaterial } from '../../entities/LearningMaterial.js'
import { LearningMaterialProduct } from '../../entities/LearningMaterialProduct.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { Product } from '../../entities/Product.js'

// Фикстуры тестов материалов (как routes/testUtils.ts: лежит рядом с кодом,
// в тестах не используется ничего, кроме репозиториев и SQL).

export async function resetMaterialTables(): Promise<void> {
  await AppDataSource.query(
    'TRUNCATE material_grants, learning_material_products, learning_materials, products RESTART IDENTITY CASCADE',
  )
}

export async function seedProduct(slug: string, priceRub = 1500): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug,
      name: slug,
      priceRub,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
    }),
  )
}

export interface SeedMaterialOptions {
  title: string
  fileKey?: string
  kind?: 'file' | 'link'
  externalUrl?: string
  isActive?: boolean
  products?: Product[]
}

export async function seedMaterial(opts: SeedMaterialOptions): Promise<LearningMaterial> {
  const repo = AppDataSource.getRepository(LearningMaterial)
  const kind = opts.kind ?? 'file'
  const fileKey = opts.fileKey ?? `${opts.title}.pdf`
  const material = await repo.save(
    repo.create(
      kind === 'file'
        ? {
            title: opts.title,
            kind,
            fileKey,
            fileName: fileKey,
            mimeType: 'application/pdf',
            sizeBytes: 5,
            isActive: opts.isActive ?? true,
          }
        : {
            title: opts.title,
            kind,
            externalUrl: opts.externalUrl ?? 'https://example.com/material',
            isActive: opts.isActive ?? true,
          },
    ),
  )
  for (const p of opts.products ?? []) {
    await AppDataSource.getRepository(LearningMaterialProduct).save({
      materialId: material.id,
      productId: p.id,
    })
  }
  return material
}

export async function addOrderItem(
  orderId: string,
  product: Product,
  opts: { isGift?: boolean } = {},
): Promise<OrderItem> {
  return AppDataSource.getRepository(OrderItem).save({
    orderId,
    productId: product.id,
    productSnapshot: { name: product.name, sku: null, priceRub: product.priceRub },
    quantity: 1,
    unitPriceRub: product.priceRub,
    isGift: opts.isGift ?? false,
  })
}
```

Create `api/src/lib/materials/grants.test.ts`:

```ts
import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { MaterialGrant } from '../../entities/MaterialGrant.js'
import { Order } from '../../entities/Order.js'
import { loginAsCustomer, resetAccountTables, seedOrder } from '../../routes/testUtils.js'
import { claimOrdersByEmail, mergeCustomers } from '../account/customers.js'
import { saveOrderWithStatusEvent } from '../notifications/outbox.js'
import { grantMaterialsForOrder } from './grants.js'
import { addOrderItem, resetMaterialTables, seedMaterial, seedProduct } from './testUtils.js'

const grants = () => AppDataSource.getRepository(MaterialGrant)
const grantRows = () => grants().find({ order: { createdAt: 'ASC' } })

describe('выдача материалов', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
  })

  describe('grantMaterialsForOrder', () => {
    it('выдаёт материалы товаров заказа, подарочные позиции тоже; один материал — одна выдача', async () => {
      const kit = await seedProduct('himichka-30')
      const mini = await seedProduct('mini-himichka')
      const gift = await seedProduct('elektrometodichka')
      const himichka = await seedMaterial({ title: 'Химичка', products: [kit, mini] })
      const electro = await seedMaterial({ title: 'Электро', products: [gift] })
      const order = await seedOrder({ customerEmail: ' Buyer@Example.COM ' })
      await addOrderItem(order.id, kit)
      await addOrderItem(order.id, mini)
      await addOrderItem(order.id, gift, { isGift: true })

      await grantMaterialsForOrder(AppDataSource.manager, order)

      const rows = await grantRows()
      expect(rows.map((r) => r.materialId).sort()).toEqual([himichka.id, electro.id].sort())
      expect(rows[0]).toMatchObject({
        orderId: order.id,
        customerId: null,
        email: 'buyer@example.com',
        source: 'order',
        revokedAt: null,
      })
    })

    it('идемпотентна: повторный вызов ничего не добавляет', async () => {
      const kit = await seedProduct('himichka-30')
      await seedMaterial({ title: 'Химичка', products: [kit] })
      const order = await seedOrder()
      await addOrderItem(order.id, kit)

      await grantMaterialsForOrder(AppDataSource.manager, order)
      await grantMaterialsForOrder(AppDataSource.manager, order)

      expect(await grants().count()).toBe(1)
    })

    it('неактивный материал и заказ без материалов выдач не создают', async () => {
      const kit = await seedProduct('himichka-30')
      const plain = await seedProduct('reagent-x')
      await seedMaterial({ title: 'Выключен', isActive: false, products: [kit] })
      const order = await seedOrder()
      await addOrderItem(order.id, kit)
      await addOrderItem(order.id, plain)

      await grantMaterialsForOrder(AppDataSource.manager, order)

      expect(await grants().count()).toBe(0)
    })

    it('заказ покупателя с аккаунтом несёт customer_id; пустой email сохраняется как NULL', async () => {
      const kit = await seedProduct('himichka-30')
      await seedMaterial({ title: 'Химичка', products: [kit] })
      const customer = await AppDataSource.getRepository(Customer).save({ email: 'c@example.com' })
      const order = await seedOrder({ customerId: customer.id, customerEmail: '' })
      await addOrderItem(order.id, kit)

      await grantMaterialsForOrder(AppDataSource.manager, order)

      expect(await grantRows()).toMatchObject([{ customerId: customer.id, email: null }])
    })
  })

  describe('единая точка оплаты saveOrderWithStatusEvent', () => {
    const PAID_AT = new Date('2026-10-12T10:00:00.000Z')

    function markPaid(order: Order, by: 'tbank' | 'admin' | 'reconcile') {
      const from = order.status
      order.status = 'paid'
      order.paidAt = PAID_AT
      order.statusHistory = [
        ...order.statusHistory,
        { from, to: 'paid', at: PAID_AT.toISOString(), by },
      ]
      return from
    }

    async function pendingOrderWithKit() {
      const kit = await seedProduct('himichka-30')
      const material = await seedMaterial({ title: 'Химичка', products: [kit] })
      const order = await seedOrder({ status: 'pending' })
      await addOrderItem(order.id, kit)
      return { order, material }
    }

    it.each(['tbank', 'reconcile', 'admin'] as const)(
      'оплата (%s) выдаёт материал той же транзакцией',
      async (by) => {
        const { order, material } = await pendingOrderWithKit()

        await saveOrderWithStatusEvent(order, markPaid(order, by))

        expect(await grantRows()).toMatchObject([{ materialId: material.id, orderId: order.id }])
      },
    )

    it('paid → shipped и повторное сохранение paid новых выдач не создают', async () => {
      const { order } = await pendingOrderWithKit()
      await saveOrderWithStatusEvent(order, markPaid(order, 'tbank'))
      await AppDataSource.query('DELETE FROM material_grants')

      await saveOrderWithStatusEvent(order, 'paid')
      order.status = 'shipped'
      await saveOrderWithStatusEvent(order, 'paid')

      expect(await grants().count()).toBe(0)
    })

    it('отмена оплаченного заказа выдачу не отзывает', async () => {
      const { order } = await pendingOrderWithKit()
      await saveOrderWithStatusEvent(order, markPaid(order, 'tbank'))

      order.status = 'cancelled'
      await saveOrderWithStatusEvent(order, 'paid')

      expect(await grantRows()).toMatchObject([{ revokedAt: null }])
    })
  })

  describe('привязка гостевых выдач к аккаунту', () => {
    async function guestGrant(email: string) {
      const kit = await seedProduct('himichka-30')
      const material = await seedMaterial({ title: 'Химичка', products: [kit] })
      await grants().save(
        grants().create({ materialId: material.id, email, source: 'admin', customerId: null }),
      )
      return material
    }

    it('claimOrdersByEmail привязывает выдачи с этим email и не трогает чужие', async () => {
      await guestGrant('buyer@example.com')
      const material = await seedMaterial({ title: 'Другая' })
      await grants().save(
        grants().create({
          materialId: material.id,
          email: 'other@example.com',
          source: 'admin',
          customerId: null,
        }),
      )
      const customer = await AppDataSource.getRepository(Customer).save({
        email: 'buyer@example.com',
      })

      await claimOrdersByEmail(AppDataSource.manager, customer.id, 'buyer@example.com')

      const rows = await grants().find()
      expect(rows.find((r) => r.email === 'buyer@example.com')?.customerId).toBe(customer.id)
      expect(rows.find((r) => r.email === 'other@example.com')?.customerId).toBeNull()
    })

    it('реальный вход по email привязывает выдачу — материал появляется в кабинете', async () => {
      await guestGrant('buyer@test.local')
      const app = createApp()

      const auth = await loginAsCustomer(app, 'buyer@test.local')

      const customer = await AppDataSource.getRepository(Customer).findOneByOrFail({
        email: 'buyer@test.local',
      })
      expect(auth.cookie).toContain('ximi4ka_customer_session')
      expect(await grants().findOneByOrFail({ email: 'buyer@test.local' })).toMatchObject({
        customerId: customer.id,
      })
    })

    it('слияние аккаунтов переносит выдачи удаляемого на оставшегося', async () => {
      const kit = await seedProduct('himichka-30')
      const material = await seedMaterial({ title: 'Химичка', products: [kit] })
      const customers = AppDataSource.getRepository(Customer)
      const keep = await customers.save({ email: 'keep@example.com' })
      const drop = await customers.save({ email: 'drop@example.com' })
      await grants().save(
        grants().create({ materialId: material.id, customerId: drop.id, source: 'admin' }),
      )

      await mergeCustomers(AppDataSource.manager, keep.id, drop.id)

      expect(await grants().find()).toMatchObject([{ customerId: keep.id }])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/lib/materials/grants.test.ts`
Expected: FAIL — `Cannot find module './grants.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/lib/materials/grants.ts`:

```ts
import type { EntityManager } from 'typeorm'
import type { Order } from '../../entities/Order.js'

// Выдаёт заказу материалы, привязанные к его товарам (подарочные позиции тоже).
// Один INSERT … SELECT, чтобы не усложнять денежный путь: вызывается в той же
// транзакции, что и запись оплаты (writeOrderStatusEvent). Идемпотентна —
// уникальный индекс (order_id, material_id) и DO NOTHING.
export async function grantMaterialsForOrder(em: EntityManager, order: Order): Promise<void> {
  const email = order.customerEmail ? order.customerEmail.trim().toLowerCase() : ''
  await em.query(
    `INSERT INTO material_grants (material_id, order_id, customer_id, email, source)
     SELECT DISTINCT lmp.material_id, $1::uuid, $2::uuid, NULLIF($3::text, ''), 'order'
     FROM order_items oi
     JOIN learning_material_products lmp ON lmp.product_id = oi.product_id
     JOIN learning_materials lm ON lm.id = lmp.material_id AND lm.is_active
     WHERE oi.order_id = $1::uuid
     ON CONFLICT (order_id, material_id) WHERE order_id IS NOT NULL DO NOTHING`,
    [order.id, order.customerId ?? null, email],
  )
}
```

In `api/src/lib/notifications/outbox.ts` add the import (after the metrika import):

```ts
import { grantMaterialsForOrder } from '../materials/grants.js'
```

and in `writeOrderStatusEvent`, inside the `if (order.status === 'paid' && previousStatus !== 'paid')` block, after `await enqueueMetrikaConversion(em, order)`:

```ts
await grantMaterialsForOrder(em, order)
```

Also update the comment above the function: replace «заказ в очередь СДЭК» with «заказ в очередь СДЭК и выдачу материалов» (одна фраза, смысл не меняется).

In `api/src/lib/account/customers.ts`, extend `claimOrdersByEmail` (after the `UPDATE orders …` query, inside the same function):

```ts
// Выдачи материалов гостю по тому же email (спека «Мои материалы»).
await em.query(
  `UPDATE material_grants SET customer_id = $1
     WHERE customer_id IS NULL AND email = $2`,
  [customerId, email],
)
```

and in `mergeCustomers`, right after the `UPDATE orders SET customer_id = $1 WHERE customer_id = $2` query:

```ts
await em.query('UPDATE material_grants SET customer_id = $1 WHERE customer_id = $2', [
  keepId,
  dropId,
])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/lib/materials/grants.test.ts src/lib/metrika/queue.test.ts && npm run typecheck`
Expected: grants — PASS (все); `queue.test.ts` — не хуже, чем до изменения: если часть его тестов падает из-за устаревшей локальной БД (`MetrikaConversion.claimed_at`), это не регрессия, но число падающих тестов вырасти не должно (сверить с прогоном до правки `outbox.ts`). typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/materials/grants.ts api/src/lib/materials/grants.test.ts api/src/lib/materials/testUtils.ts api/src/lib/notifications/outbox.ts api/src/lib/account/customers.ts
git commit -m "feat(api): выдача материалов при оплате, привязка по email и перенос при слиянии"
```

---

### Task 5: Раздел кабинета — API списка и скачивания

**Files:**

- Create: `api/src/lib/materials/queries.ts`
- Create: `api/src/routes/account/materials.ts`
- Modify: `api/src/routes/account/index.ts`
- Test: `api/src/routes/account-materials.test.ts`

**Interfaces:**

- Consumes: `sendMaterialFile` (Task 3); фикстуры (Task 4); `requireCustomerAuth`, `requireCustomerCsrf`; `notFound(code, message)` из `routes/errors.js`; `rateLimit({ limit, windowMs })`.
- Produces: из `queries.ts` — `isUuid(v: string): boolean`; `listCustomerMaterials(customerId): Promise<AccountMaterial[]>`; `findCustomerMaterial(customerId, materialId): Promise<LearningMaterial | null>`; `listOrderMaterials(orderId): Promise<PublicOrderMaterial[]>`; `findOrderMaterial(orderId, materialId): Promise<LearningMaterial | null>` (последние два используются в Task 6). Маршруты `GET /api/account/materials` → `{ data: AccountMaterial[] }`; `GET /api/account/materials/:materialId/download`.

- [ ] **Step 1: Write the failing test**

Create `api/src/routes/account-materials.test.ts`:

```ts
import 'reflect-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { AppDataSource } from '../config/dataSource.js'
import { Customer } from '../entities/Customer.js'
import { MaterialGrant } from '../entities/MaterialGrant.js'
import { setMailerForTests } from '../lib/mail/mailer.js'
import { resetMaterialTables, seedMaterial } from '../lib/materials/testUtils.js'
import { customerHeaders, loginAsCustomer, resetAccountTables } from './testUtils.js'

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

describe('материалы в кабинете', () => {
  let app: ReturnType<typeof createApp>
  let dir: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
    dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
    vi.stubEnv('MATERIALS_DIR', dir)
    app = createApp()
  })
  afterEach(async () => {
    setMailerForTests(null)
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  const me = () =>
    AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'buyer@test.local' })
  const grant = (materialId: string, over: Partial<MaterialGrant>) =>
    AppDataSource.getRepository(MaterialGrant).save(
      AppDataSource.getRepository(MaterialGrant).create({ materialId, source: 'order', ...over }),
    )

  describe('GET /api/account/materials', () => {
    it('без сессии — 401', async () => {
      expect((await request(app).get('/api/account/materials')).status).toBe(401)
    })

    it('отдаёт свои действующие материалы; файл без url, ссылка с url; путей к файлам нет', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const file = await seedMaterial({ title: 'Методичка', fileKey: 'm.pdf' })
      const link = await seedMaterial({
        title: 'Видео',
        kind: 'link',
        externalUrl: 'https://example.com/v',
      })
      await grant(file.id, { customerId: c.id })
      await grant(link.id, { customerId: c.id })

      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.status).toBe(200)
      const byTitle = new Map(res.body.data.map((m: { title: string }) => [m.title, m]))
      expect(byTitle.get('Методичка')).toMatchObject({
        id: file.id,
        kind: 'file',
        fileName: 'm.pdf',
        sizeBytes: 5,
      })
      expect(byTitle.get('Методичка')).not.toHaveProperty('url')
      expect(byTitle.get('Видео')).toMatchObject({ kind: 'link', url: 'https://example.com/v' })
      expect(typeof (byTitle.get('Методичка') as { grantedAt: string }).grantedAt).toBe('string')
      expect(JSON.stringify(res.body)).not.toContain('file_key')
      expect(JSON.stringify(res.body)).not.toContain('fileKey')
    })

    it('чужие, отозванные и неактивные материалы не показываются', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const stranger = await AppDataSource.getRepository(Customer).save({ email: 'x@y.ru' })
      const mine = await seedMaterial({ title: 'Моя', fileKey: 'a.pdf' })
      const foreign = await seedMaterial({ title: 'Чужая', fileKey: 'b.pdf' })
      const revoked = await seedMaterial({ title: 'Отозванная', fileKey: 'c.pdf' })
      const off = await seedMaterial({ title: 'Выключена', fileKey: 'd.pdf', isActive: false })
      await grant(mine.id, { customerId: c.id })
      await grant(foreign.id, { customerId: stranger.id })
      await grant(revoked.id, { customerId: c.id, revokedAt: new Date() })
      await grant(off.id, { customerId: c.id })

      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.body.data.map((m: { title: string }) => m.title)).toEqual(['Моя'])
    })

    it('один материал из двух заказов — одна строка', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const m = await seedMaterial({ title: 'Методичка', fileKey: 'a.pdf' })
      await grant(m.id, { customerId: c.id, email: 'a@x.ru' })
      await grant(m.id, { customerId: c.id, email: 'b@x.ru', source: 'admin' })

      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.body.data).toHaveLength(1)
    })

    it('выдача по email без аккаунта появляется после входа с этим email', async () => {
      const m = await seedMaterial({ title: 'Методичка', fileKey: 'a.pdf' })
      await grant(m.id, { email: 'buyer@test.local', source: 'admin' })

      const auth = await loginAsCustomer(app, 'buyer@test.local')
      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.body.data.map((x: { id: string }) => x.id)).toEqual([m.id])
    })
  })

  describe('GET /api/account/materials/:materialId/download', () => {
    async function granted(over: { isActive?: boolean; revoked?: boolean } = {}) {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const m = await seedMaterial({
        title: 'Методичка',
        fileKey: 'a.pdf',
        isActive: over.isActive,
      })
      await grant(m.id, { customerId: c.id, ...(over.revoked ? { revokedAt: new Date() } : {}) })
      return { auth, m }
    }

    it('без сессии — 401', async () => {
      const m = await seedMaterial({ title: 'Методичка', fileKey: 'a.pdf' })
      expect((await request(app).get(`/api/account/materials/${m.id}/download`)).status).toBe(401)
    })

    it('владельцу отдаёт файл с заголовками закрытой раздачи', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-owner')
      const { auth, m } = await granted()

      const res = await request(app)
        .get(`/api/account/materials/${m.id}/download`)
        .set(customerHeaders(auth))
        .buffer(true)
        .parse(binary)

      expect(res.status).toBe(200)
      expect(res.body.toString()).toBe('%PDF-owner')
      expect(res.headers['content-disposition']).toMatch(/^attachment;/)
      expect(res.headers['cache-control']).toBe('private, no-store')
    })

    it('чужой покупатель — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-owner')
      const { m } = await granted()
      const other = await loginAsCustomer(app, 'other@test.local')

      const res = await request(app)
        .get(`/api/account/materials/${m.id}/download`)
        .set(customerHeaders(other))

      expect(res.status).toBe(404)
      expect(res.text).not.toContain('PDF-owner')
    })

    it('отозванная выдача и неактивный материал — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), 'x')
      for (const over of [{ revoked: true }, { isActive: false }]) {
        await resetMaterialTables()
        const { auth, m } = await granted(over)
        const res = await request(app)
          .get(`/api/account/materials/${m.id}/download`)
          .set(customerHeaders(auth))
        expect(res.status).toBe(404)
      }
    })

    it('не-uuid в пути — 404, а не 500', async () => {
      const auth = await loginAsCustomer(app)
      const res = await request(app)
        .get('/api/account/materials/not-a-uuid/download')
        .set(customerHeaders(auth))
      expect(res.status).toBe(404)
    })

    it('файл исчез с диска — 404 material_file_missing', async () => {
      const { auth, m } = await granted()

      const res = await request(app)
        .get(`/api/account/materials/${m.id}/download`)
        .set(customerHeaders(auth))

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('material_file_missing')
    })

    it('материал-ссылка скачивания не имеет — 404', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const link = await seedMaterial({ title: 'Видео', kind: 'link' })
      await grant(link.id, { customerId: c.id })

      const res = await request(app)
        .get(`/api/account/materials/${link.id}/download`)
        .set(customerHeaders(auth))

      expect(res.status).toBe(404)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/routes/account-materials.test.ts`
Expected: FAIL — запросы к `/api/account/materials` возвращают `404`/ошибку вместо `200`; «без сессии — 401» может пройти.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/lib/materials/queries.ts`:

```ts
import type { AccountMaterial, PublicOrderMaterial } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { LearningMaterial } from '../../entities/LearningMaterial.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Неверный uuid в пути иначе дошёл бы до Postgres и вернул 500.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

interface ListRow {
  id: string
  title: string
  kind: 'file' | 'link'
  external_url: string | null
  file_name: string | null
  size_bytes: number | null
  granted_at: Date
}

/** Материалы покупателя: действующие выдачи, по одной строке на материал. */
export async function listCustomerMaterials(customerId: string): Promise<AccountMaterial[]> {
  const rows: ListRow[] = await AppDataSource.query(
    `SELECT lm.id, lm.title, lm.kind, lm.external_url, lm.file_name, lm.size_bytes,
            min(g.created_at) AS granted_at
     FROM material_grants g
     JOIN learning_materials lm ON lm.id = g.material_id
     WHERE g.customer_id = $1 AND g.revoked_at IS NULL AND lm.is_active
     GROUP BY lm.id
     ORDER BY min(g.created_at) DESC, lm.title`,
    [customerId],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    ...(r.kind === 'link' && r.external_url ? { url: r.external_url } : {}),
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    grantedAt: r.granted_at.toISOString(),
  }))
}

/** Материал, выданный покупателю (не отозван, активен), иначе null. */
export async function findCustomerMaterial(
  customerId: string,
  materialId: string,
): Promise<LearningMaterial | null> {
  return AppDataSource.getRepository(LearningMaterial)
    .createQueryBuilder('m')
    .where('m.id = :materialId AND m.is_active = true', { materialId })
    .andWhere(
      `EXISTS (SELECT 1 FROM material_grants g
               WHERE g.material_id = m.id AND g.customer_id = :customerId AND g.revoked_at IS NULL)`,
      { customerId },
    )
    .getOne()
}

/** Материалы заказа для страницы «спасибо»: без путей к файлам. */
export async function listOrderMaterials(orderId: string): Promise<PublicOrderMaterial[]> {
  const rows: Pick<ListRow, 'id' | 'title' | 'kind' | 'external_url'>[] = await AppDataSource.query(
    `SELECT DISTINCT lm.id, lm.title, lm.kind, lm.external_url
       FROM material_grants g
       JOIN learning_materials lm ON lm.id = g.material_id
       WHERE g.order_id = $1 AND g.revoked_at IS NULL AND lm.is_active
       ORDER BY lm.title`,
    [orderId],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    ...(r.kind === 'link' && r.external_url ? { url: r.external_url } : {}),
  }))
}

/** Материал, выданный заказу (не отозван, активен), иначе null. */
export async function findOrderMaterial(
  orderId: string,
  materialId: string,
): Promise<LearningMaterial | null> {
  return AppDataSource.getRepository(LearningMaterial)
    .createQueryBuilder('m')
    .where('m.id = :materialId AND m.is_active = true', { materialId })
    .andWhere(
      `EXISTS (SELECT 1 FROM material_grants g
               WHERE g.material_id = m.id AND g.order_id = :orderId AND g.revoked_at IS NULL)`,
      { orderId },
    )
    .getOne()
}
```

Create `api/src/routes/account/materials.ts`:

```ts
import { Router } from 'express'
import { sendMaterialFile } from '../../lib/materials/files.js'
import { findCustomerMaterial, isUuid, listCustomerMaterials } from '../../lib/materials/queries.js'
import { notFound } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'

// «Мои материалы»: список выданного и закрытое скачивание. Всё требует сессии
// покупателя; чужой, отозванный и неактивный материал для него просто 404.
export function createAccountMaterialsRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.get('/materials', async (req, res, next) => {
    try {
      res.json({ data: await listCustomerMaterials(req.customer!.id) })
    } catch (err) {
      next(err)
    }
  })

  router.get(
    '/materials/:materialId/download',
    rateLimit({ limit: 60, windowMs: 60_000 }),
    async (req, res, next) => {
      try {
        const { materialId } = req.params
        const material = isUuid(materialId)
          ? await findCustomerMaterial(req.customer!.id, materialId)
          : null
        if (!material || material.kind !== 'file') {
          throw notFound('material_not_found', 'Материал не найден')
        }
        if (!(await sendMaterialFile(res, material))) {
          throw notFound('material_file_missing', 'Файл временно недоступен')
        }
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
```

In `api/src/routes/account/index.ts` add the import `import { createAccountMaterialsRouter } from './materials.js'` and mount it after the profile router:

```ts
router.use(createAccountProfileRouter())
router.use(createAccountMaterialsRouter())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/routes/account-materials.test.ts src/routes/account-profile.test.ts && npm run typecheck`
Expected: PASS (все тесты обоих файлов), typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/materials/queries.ts api/src/routes/account/materials.ts api/src/routes/account/index.ts api/src/routes/account-materials.test.ts
git commit -m "feat(api): список материалов и закрытое скачивание в кабинете"
```

---

### Task 6: Страница заказа — материалы в статусе и скачивание по токену

**Files:**

- Modify: `api/src/routes/public/orders.ts`
- Test: `api/src/routes/public/orderMaterials.test.ts`

**Interfaces:**

- Consumes: `listOrderMaterials`, `findOrderMaterial`, `isUuid` (Task 5); `sendMaterialFile` (Task 3); фикстуры (Task 4); существующая `tokenMatches` в `orders.ts`.
- Produces: поле `materials` в ответе `GET /api/public/orders/:number/status` (только при верном `?t=`); `GET /api/public/orders/:number/materials/:materialId/download?t=`.

- [ ] **Step 1: Write the failing test**

Create `api/src/routes/public/orderMaterials.test.ts`:

```ts
import 'reflect-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.js'
import { AppDataSource } from '../../config/dataSource.js'
import { MaterialGrant } from '../../entities/MaterialGrant.js'
import { grantMaterialsForOrder } from '../../lib/materials/grants.js'
import {
  addOrderItem,
  resetMaterialTables,
  seedMaterial,
  seedProduct,
} from '../../lib/materials/testUtils.js'
import { resetAccountTables, seedOrder } from '../testUtils.js'

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

describe('материалы на странице заказа', () => {
  const app = createApp()
  let dir: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
    dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
    vi.stubEnv('MATERIALS_DIR', dir)
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  // Заказ с набором; выдача создаётся так же, как при оплате.
  async function orderWithMaterial(opts: { paid: boolean }) {
    const kit = await seedProduct('himichka-30')
    const material = await seedMaterial({ title: 'Химичка', fileKey: 'a.pdf', products: [kit] })
    const order = await seedOrder({
      status: opts.paid ? 'paid' : 'pending',
      paymentProvider: 'tbank',
    })
    await addOrderItem(order.id, kit)
    if (opts.paid) await grantMaterialsForOrder(AppDataSource.manager, order)
    return { order, material }
  }

  const status = (number: string, t?: string) =>
    request(app)
      .get(`/api/public/orders/${number}/status`)
      .query(t ? { t } : {})

  describe('статус заказа', () => {
    it('с верным токеном отдаёт материалы оплаченного заказа без путей к файлам', async () => {
      const { order, material } = await orderWithMaterial({ paid: true })

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.status).toBe(200)
      expect(res.body.data.materials).toEqual([{ id: material.id, title: 'Химичка', kind: 'file' }])
      expect(JSON.stringify(res.body)).not.toContain('a.pdf')
    })

    it('без токена и с чужим токеном поля materials нет', async () => {
      const { order } = await orderWithMaterial({ paid: true })

      const bare = await status(order.orderNumber)
      const wrong = await status(order.orderNumber, 'x'.repeat(order.publicToken.length))

      expect(bare.body.data).not.toHaveProperty('materials')
      expect(wrong.body.data).not.toHaveProperty('materials')
    })

    it('неоплаченный заказ: список пуст', async () => {
      const { order } = await orderWithMaterial({ paid: false })

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials).toEqual([])
    })

    it('после отмены оплаченного заказа материалы остаются', async () => {
      const { order, material } = await orderWithMaterial({ paid: true })
      await AppDataSource.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [order.id])

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials.map((m: { id: string }) => m.id)).toEqual([material.id])
    })

    it('отозванная выдача не показывается', async () => {
      const { order } = await orderWithMaterial({ paid: true })
      await AppDataSource.getRepository(MaterialGrant).update(
        { orderId: order.id },
        { revokedAt: new Date() },
      )

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials).toEqual([])
    })

    it('материал-ссылка приходит с url', async () => {
      const kit = await seedProduct('himichka-30')
      await seedMaterial({
        title: 'Видео',
        kind: 'link',
        externalUrl: 'https://example.com/v',
        products: [kit],
      })
      const order = await seedOrder({ status: 'paid', paymentProvider: 'tbank' })
      await addOrderItem(order.id, kit)
      await grantMaterialsForOrder(AppDataSource.manager, order)

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials).toMatchObject([
        { kind: 'link', url: 'https://example.com/v' },
      ])
    })
  })

  describe('скачивание по токену заказа', () => {
    const url = (number: string, materialId: string) =>
      `/api/public/orders/${number}/materials/${materialId}/download`

    it('верный токен и выдача — отдаёт файл', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-guest')
      const { order, material } = await orderWithMaterial({ paid: true })

      const res = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: order.publicToken })
        .buffer(true)
        .parse(binary)

      expect(res.status).toBe(200)
      expect(res.body.toString()).toBe('%PDF-guest')
      expect(res.headers['content-disposition']).toMatch(/^attachment;/)
      expect(res.headers['cache-control']).toBe('private, no-store')
    })

    it('без токена и с чужим токеном — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-guest')
      const { order, material } = await orderWithMaterial({ paid: true })

      const bare = await request(app).get(url(order.orderNumber, material.id))
      const wrong = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: 'x'.repeat(order.publicToken.length) })

      expect(bare.status).toBe(404)
      expect(wrong.status).toBe(404)
    })

    it('неоплаченный заказ (выдачи нет) — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), 'x')
      const { order, material } = await orderWithMaterial({ paid: false })

      const res = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: order.publicToken })

      expect(res.status).toBe(404)
    })

    it('материал из чужого заказа — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), 'x')
      const { material } = await orderWithMaterial({ paid: true })
      const other = await seedOrder({ status: 'paid', paymentProvider: 'tbank' })

      const res = await request(app)
        .get(url(other.orderNumber, material.id))
        .query({ t: other.publicToken })

      expect(res.status).toBe(404)
    })

    it('не-uuid — 404, файл исчез с диска — 404 material_file_missing', async () => {
      const { order, material } = await orderWithMaterial({ paid: true })

      const bad = await request(app)
        .get(url(order.orderNumber, 'not-a-uuid'))
        .query({ t: order.publicToken })
      const missing = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: order.publicToken })

      expect(bad.status).toBe(404)
      expect(missing.status).toBe(404)
      expect(missing.body.error.code).toBe('material_file_missing')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/routes/public/orderMaterials.test.ts`
Expected: FAIL — в ответе статуса нет `materials`; маршрут скачивания отвечает `404` на корректный запрос.

- [ ] **Step 3: Write minimal implementation**

In `api/src/routes/public/orders.ts` add imports next to the existing ones:

```ts
import { sendMaterialFile } from '../../lib/materials/files.js'
import { findOrderMaterial, isUuid, listOrderMaterials } from '../../lib/materials/queries.js'
```

In the status handler, after the `shipment` spread line, add:

```ts
          ...(withSecret ? { materials: await listOrderMaterials(order.id) } : {}),
```

At the end of the file, add the download route:

```ts
// Скачивание материала со страницы заказа: только с секретом заказа и только
// материал, выданный этому заказу. Любой отказ — 404, чтобы по ответу нельзя
// было отличить «нет заказа» от «неверный токен».
publicOrdersRouter.get(
  '/:number/materials/:materialId/download',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    try {
      const order = await AppDataSource.getRepository(Order).findOneBy({
        orderNumber: req.params.number,
      })
      if (!order || !tokenMatches(req.query.t, order.publicToken)) {
        throw notFound('order_not_found', 'Заказ не найден')
      }
      const { materialId } = req.params
      const material = isUuid(materialId) ? await findOrderMaterial(order.id, materialId) : null
      if (!material || material.kind !== 'file') {
        throw notFound('material_not_found', 'Материал не найден')
      }
      if (!(await sendMaterialFile(res, material))) {
        throw notFound('material_file_missing', 'Файл временно недоступен')
      }
    } catch (err) {
      next(err)
    }
  },
)
```

Also update the doc comment above the status route: add one sentence «Материалы (методички и т. п.) — тоже только с секретом заказа.»

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/routes/public/orderMaterials.test.ts && npm run typecheck`
Expected: PASS (все тесты файла), typecheck чистый.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/public/orders.ts api/src/routes/public/orderMaterials.test.ts
git commit -m "feat(api): материалы в статусе заказа и скачивание по токену заказа"
```

---

### Task 7: Скрипт заведения трёх методичек

**Files:**

- Create: `api/src/seeds/_lib/methodichki-materials.ts`
- Create: `api/src/seeds/apply-materials-methodichki.ts`
- Modify: `api/package.json` (скрипт `apply:materials-methodichki`)
- Modify: `.gitignore` (каталог `api/materials/`)
- Test: `api/src/seeds/_lib/methodichki-materials.test.ts`

**Interfaces:**

- Consumes: таблицы Task 2; `materialsDir()` (Task 3); фикстуры `seedProduct`, `addOrderItem`, `resetMaterialTables` (Task 4); `seedOrder`, `resetAccountTables`.
- Produces: `METHODICHKI: MethodichkaSpec[]`; `applyMethodichkiMaterials(ds: DataSource, opts: { dryRun: boolean; materialsDir: string }): Promise<ApplyReport>`, где `ApplyReport = { materials: number; links: number; missingFiles: string[]; missingSlugs: string[]; backfilled: number }`.

- [ ] **Step 1: Write the failing test**

Create `api/src/seeds/_lib/methodichki-materials.test.ts`:

```ts
import 'reflect-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { LearningMaterial } from '../../entities/LearningMaterial.js'
import { MaterialGrant } from '../../entities/MaterialGrant.js'
import { addOrderItem, resetMaterialTables, seedProduct } from '../../lib/materials/testUtils.js'
import { resetAccountTables, seedOrder } from '../../routes/testUtils.js'
import { applyMethodichkiMaterials, METHODICHKI } from './methodichki-materials.js'

describe('applyMethodichkiMaterials', () => {
  let dir: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
    dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const writeAll = async () => {
    for (const [i, spec] of METHODICHKI.entries()) {
      await writeFile(path.join(dir, spec.fileKey), 'x'.repeat(10 * (i + 1)))
    }
  }
  const run = (dryRun = false) =>
    applyMethodichkiMaterials(AppDataSource, { dryRun, materialsDir: dir })
  const counts = async () => ({
    materials: await AppDataSource.getRepository(LearningMaterial).count(),
    links: Number(
      (await AppDataSource.query('SELECT count(*) AS n FROM learning_material_products'))[0].n,
    ),
    grants: await AppDataSource.getRepository(MaterialGrant).count(),
  })

  it('заводит три материала с размером с диска и привязывает к найденным товарам', async () => {
    await writeAll()
    for (const slug of [
      'himichka-30',
      'elektrohimichka',
      'bolshoi-nabor-dlya-oge',
      'vse-tri-nabora',
    ]) {
      await seedProduct(slug)
    }

    const report = await run()

    expect(report).toMatchObject({ materials: 3, links: 5, missingFiles: [], backfilled: 0 })
    expect([...report.missingSlugs].sort()).toEqual(
      [
        'elektrometodichka',
        'himichka-i-elektrohimichka',
        'himichka-metodichka',
        'mini-himichka',
        'vse-chetyre-nabora',
      ].sort(),
    )
    const rows = await AppDataSource.getRepository(LearningMaterial).find({
      order: { fileKey: 'ASC' },
    })
    expect(rows.map((r) => [r.fileKey, r.sizeBytes, r.kind, r.isActive])).toEqual([
      ['elektrohimichka.pdf', 20, 'file', true],
      ['himichka.pdf', 10, 'file', true],
      ['oge-2026.pdf', 30, 'file', true],
    ])
    expect(rows.every((r) => r.mimeType === 'application/pdf')).toBe(true)
  })

  it('идемпотентен: повторный запуск ничего не дублирует', async () => {
    await writeAll()
    await seedProduct('himichka-30')

    await run()
    const before = await counts()
    const second = await run()

    expect(await counts()).toEqual(before)
    expect(second.links).toBe(0)
  })

  it('нет файла в каталоге — материал пропущен и назван в отчёте', async () => {
    await writeAll()
    await rm(path.join(dir, 'oge-2026.pdf'))
    await seedProduct('bolshoi-nabor-dlya-oge')

    const report = await run()

    expect(report.missingFiles).toEqual(['oge-2026.pdf'])
    expect(report.materials).toBe(2)
    expect(
      await AppDataSource.getRepository(LearningMaterial).countBy({ fileKey: 'oge-2026.pdf' }),
    ).toBe(0)
  })

  it('выдаёт материалы уже оплаченным и отправленным заказам, неоплаченным — нет', async () => {
    await writeAll()
    const kit = await seedProduct('himichka-30')
    const electro = await seedProduct('elektrohimichka')
    const paid = await seedOrder({ status: 'paid', customerEmail: 'Paid@Example.com' })
    const shipped = await seedOrder({ status: 'shipped' })
    const pending = await seedOrder({ status: 'pending' })
    await addOrderItem(paid.id, kit)
    await addOrderItem(shipped.id, electro)
    await addOrderItem(pending.id, kit)

    const report = await run()

    expect(report.backfilled).toBe(2)
    const rows = await AppDataSource.getRepository(MaterialGrant).find()
    expect(rows.map((r) => r.orderId).sort()).toEqual([paid.id, shipped.id].sort())
    expect(rows.find((r) => r.orderId === paid.id)?.email).toBe('paid@example.com')

    await run()
    expect(await AppDataSource.getRepository(MaterialGrant).count()).toBe(2)
  })

  it('dry-run считает, но ничего не пишет', async () => {
    await writeAll()
    await seedProduct('himichka-30')

    const report = await run(true)

    expect(report.materials).toBe(3)
    expect(await counts()).toEqual({ materials: 0, links: 0, grants: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/seeds/_lib/methodichki-materials.test.ts`
Expected: FAIL — `Cannot find module './methodichki-materials.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `api/src/seeds/_lib/methodichki-materials.ts`:

```ts
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { DataSource } from 'typeorm'

// Три электронные методички, которые раньше планировались как публичные PDF:
// какой файл (в MATERIALS_DIR) каким товарам соответствует. Комбо «Химичка и
// Электрохимичка» и «Три набора» получают методички своих наборов;
// `vse-chetyre-nabora` пока нет в каталоге — слаг попадёт в отчёт как отсутствующий.
export interface MethodichkaSpec {
  fileKey: string
  title: string
  fileName: string
  slugs: string[]
}

export const METHODICHKI: MethodichkaSpec[] = [
  {
    fileKey: 'himichka.pdf',
    title: 'Методичка «Химичка 3.0 / Мини-Химичка»',
    fileName: 'himichka-metodichka.pdf',
    slugs: [
      'himichka-30',
      'mini-himichka',
      'himichka-metodichka',
      'himichka-i-elektrohimichka',
      'vse-tri-nabora',
      'vse-chetyre-nabora',
    ],
  },
  {
    fileKey: 'elektrohimichka.pdf',
    title: 'Методичка «Электрохимичка»',
    fileName: 'elektrometodichka.pdf',
    slugs: [
      'elektrohimichka',
      'elektrometodichka',
      'himichka-i-elektrohimichka',
      'vse-tri-nabora',
      'vse-chetyre-nabora',
    ],
  },
  {
    fileKey: 'oge-2026.pdf',
    title: 'Методичка «Химичка ОГЭ»',
    fileName: 'metodichka-oge-2026.pdf',
    slugs: ['bolshoi-nabor-dlya-oge', 'vse-chetyre-nabora'],
  },
]

export interface ApplyReport {
  /** Сколько материалов обработано (создано или обновлено). */
  materials: number
  /** Сколько новых связей «товар → материал» добавлено. */
  links: number
  missingFiles: string[]
  missingSlugs: string[]
  /** Сколько выдач добавлено уже оплаченным заказам. */
  backfilled: number
}

class DryRunRollback extends Error {}

async function fileSize(fullPath: string): Promise<number | null> {
  try {
    const info = await stat(fullPath)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

const UPSERT_SQL = `INSERT INTO learning_materials (title, kind, file_key, file_name, mime_type, size_bytes, is_active)
  VALUES ($1, 'file', $2, $3, 'application/pdf', $4, true)
  ON CONFLICT (file_key) WHERE file_key IS NOT NULL DO UPDATE
    SET title = EXCLUDED.title, file_name = EXCLUDED.file_name,
        size_bytes = EXCLUDED.size_bytes, updated_at = now()
  RETURNING id`

const BACKFILL_SQL = `INSERT INTO material_grants (material_id, order_id, customer_id, email, source)
  SELECT DISTINCT lmp.material_id, o.id, o.customer_id, NULLIF(lower(trim(o.customer_email)), ''), 'order'
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN learning_material_products lmp ON lmp.product_id = oi.product_id
  JOIN learning_materials lm ON lm.id = lmp.material_id AND lm.is_active AND lm.file_key = ANY($1)
  WHERE o.status IN ('paid', 'shipped')
  ON CONFLICT (order_id, material_id) WHERE order_id IS NOT NULL DO NOTHING
  RETURNING 1`

/**
 * Заводит методички из MATERIALS_DIR, привязывает к товарам и выдаёт
 * уже оплаченным заказам. Идемпотентна; всё в одной транзакции, dry-run её
 * откатывает, оставляя честный отчёт.
 */
export async function applyMethodichkiMaterials(
  ds: DataSource,
  opts: { dryRun: boolean; materialsDir: string },
): Promise<ApplyReport> {
  const report: ApplyReport = {
    materials: 0,
    links: 0,
    missingFiles: [],
    missingSlugs: [],
    backfilled: 0,
  }
  try {
    await ds.transaction(async (em) => {
      const fileKeys: string[] = []
      for (const spec of METHODICHKI) {
        const size = await fileSize(path.join(opts.materialsDir, spec.fileKey))
        if (size === null) {
          report.missingFiles.push(spec.fileKey)
          continue
        }
        const [{ id }]: { id: string }[] = await em.query(UPSERT_SQL, [
          spec.title,
          spec.fileKey,
          spec.fileName,
          size,
        ])
        report.materials += 1
        fileKeys.push(spec.fileKey)

        const products: { id: string; slug: string }[] = await em.query(
          'SELECT id, slug FROM products WHERE slug = ANY($1)',
          [spec.slugs],
        )
        const found = new Set(products.map((p) => p.slug))
        for (const slug of spec.slugs) {
          if (!found.has(slug) && !report.missingSlugs.includes(slug))
            report.missingSlugs.push(slug)
        }
        for (const p of products) {
          const inserted: unknown[] = await em.query(
            `INSERT INTO learning_material_products (material_id, product_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
            [id, p.id],
          )
          report.links += inserted.length
        }
      }
      if (fileKeys.length > 0) {
        const granted: unknown[] = await em.query(BACKFILL_SQL, [fileKeys])
        report.backfilled = granted.length
      }
      if (opts.dryRun) throw new DryRunRollback()
    })
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err
  }
  return report
}
```

Create `api/src/seeds/apply-materials-methodichki.ts`:

```ts
// Одноразовое заведение трёх электронных методичек в каталог материалов
// (learning_materials) и выдача их уже оплаченным заказам. Идемпотентно.
// Файлы himichka.pdf, elektrohimichka.pdf, oge-2026.pdf должны лежать в
// MATERIALS_DIR (на проде — том ximishop-materials, см. deploy/MATERIALS.md).
//
// Flags:
//   --dry-run  делает всё в транзакции и откатывает: печатает отчёт, ничего не пишет.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-materials-methodichki' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-materials-methodichki.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyMethodichkiMaterials } = await import('./_lib/methodichki-materials.js')
  const { materialsDir } = await import('../lib/materials/files.js')

  await AppDataSource.initialize()
  try {
    const dir = materialsDir()
    const report = await applyMethodichkiMaterials(AppDataSource, { dryRun, materialsDir: dir })
    logger.info(
      { dir, report },
      dryRun ? 'dry-run — в БД ничего не записано' : 'материалы заведены',
    )
    if (report.missingFiles.length > 0) {
      logger.warn(
        { missingFiles: report.missingFiles },
        'файлов нет в каталоге — эти материалы пропущены',
      )
      process.exitCode = 1
    }
    if (report.missingSlugs.length > 0) {
      logger.warn({ missingSlugs: report.missingSlugs }, 'товаров с такими slug нет в каталоге')
    }
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-materials-methodichki failed')
  process.exit(1)
})
```

In `api/package.json`, add to `scripts` (next to the other `apply:*` entries):

```json
    "apply:materials-methodichki": "tsx src/seeds/apply-materials-methodichki.ts",
```

In the root `.gitignore`: run `grep -n "uploads" .gitignore`, then add under the same section a line `api/materials/` with the comment `# закрытые материалы (локально; в проде — том ximishop-materials)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/seeds/_lib/methodichki-materials.test.ts && npm run typecheck`
Expected: PASS (5 тестов), typecheck чистый. Затем smoke-запуск скрипта на тестовой БД не нужен — логика покрыта тестами библиотеки.

- [ ] **Step 5: Commit**

```bash
git add api/src/seeds/_lib/methodichki-materials.ts api/src/seeds/_lib/methodichki-materials.test.ts api/src/seeds/apply-materials-methodichki.ts api/package.json .gitignore
git commit -m "feat(api): скрипт заведения трёх методичек и выдачи оплаченным заказам"
```

---

### Task 8: Web — адреса скачивания, блок материалов, страница заказа

**Files:**

- Create: `web/lib/materialUrls.ts`, `web/lib/materialUrls.test.ts`
- Create: `web/components/MaterialsDownloads.tsx`, `web/components/MaterialsDownloads.test.tsx`
- Modify: `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx`
- Modify: `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx`

**Interfaces:**

- Consumes: `PublicOrderMaterial`, `AccountMaterial`, `MaterialKind` из `@ximi4ka-shop/shared` (Task 1); API Task 5–6.
- Produces: `orderMaterialDownloadUrl(orderNumber, materialId, token): string`; `accountMaterialDownloadUrl(materialId): string`; компонент `<MaterialsDownloads items hrefFor tone? heading? />` с `data-testid="materials"`, где `items: { id; title; kind; url? }[]`, `hrefFor: (id: string) => string`, `tone: 'dark' | 'light'` (по умолчанию `'dark'`), `heading: string | null` (по умолчанию «Ваши материалы»).

- [ ] **Step 1: Write the failing tests**

Create `web/lib/materialUrls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { accountMaterialDownloadUrl, orderMaterialDownloadUrl } from './materialUrls'

describe('materialUrls', () => {
  it('адрес скачивания со страницы заказа: номер, id и токен экранируются', () => {
    expect(orderMaterialDownloadUrl('XM-1', 'm 1', 't/k')).toMatch(
      /\/api\/public\/orders\/XM-1\/materials\/m%201\/download\?t=t%2Fk$/,
    )
  })

  it('адрес скачивания из кабинета', () => {
    expect(accountMaterialDownloadUrl('abc')).toMatch(/\/api\/account\/materials\/abc\/download$/)
  })
})
```

Create `web/components/MaterialsDownloads.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MaterialsDownloads } from './MaterialsDownloads'

afterEach(cleanup)

const hrefFor = (id: string) => `/dl/${id}`

describe('<MaterialsDownloads>', () => {
  it('без материалов не рисует ничего', () => {
    const { container } = render(<MaterialsDownloads items={[]} hrefFor={hrefFor} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('файл — ссылка на скачивание через hrefFor, с заголовком по умолчанию', () => {
    render(
      <MaterialsDownloads
        items={[{ id: 'm1', title: 'Методичка «Химичка»', kind: 'file' }]}
        hrefFor={hrefFor}
      />,
    )
    expect(screen.getByTestId('materials')).toHaveTextContent('Ваши материалы')
    expect(screen.getByRole('link', { name: /Методичка «Химичка»/ })).toHaveAttribute(
      'href',
      '/dl/m1',
    )
  })

  it('внешняя ссылка ведёт на url и открывается в новой вкладке', () => {
    render(
      <MaterialsDownloads
        items={[{ id: 'm2', title: 'Видео', kind: 'link', url: 'https://example.com/v' }]}
        hrefFor={hrefFor}
      />,
    )
    const link = screen.getByRole('link', { name: /Видео/ })
    expect(link).toHaveAttribute('href', 'https://example.com/v')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('heading = null убирает заголовок', () => {
    render(
      <MaterialsDownloads
        items={[{ id: 'm1', title: 'Методичка', kind: 'file' }]}
        hrefFor={hrefFor}
        heading={null}
      />,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
```

Add to `web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx`, inside `describe('<OrderStatusView>', …)` before the polling test `it('keeps polling a paid order until CDEK assigns the track number', …)`:

```tsx
it('shows download links for the materials of an order', async () => {
  vi.stubGlobal(
    'fetch',
    fetchReturning(
      statusPayload({
        status: 'paid',
        paymentProvider: 'tbank',
        paidAt: '2026-07-02T08:30:00.000Z',
        materials: [{ id: 'm1', title: 'Методичка «Химичка ОГЭ»', kind: 'file' }],
      }),
    ),
  )
  render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="t" />)

  const link = await screen.findByRole('link', { name: /Методичка «Химичка ОГЭ»/ })
  expect(link.getAttribute('href')).toContain(
    '/api/public/orders/XM-2026-00042/materials/m1/download?t=t',
  )
})

it('shows no materials block when the list is empty or absent', async () => {
  vi.stubGlobal('fetch', fetchReturning(statusPayload({ paymentProvider: 'tbank', materials: [] })))
  render(<OrderStatusView orderNumber="XM-2026-00042" celebrate={false} token="t" />)
  await screen.findByTestId('order-status-label')
  expect(screen.queryByTestId('materials')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run lib/materialUrls.test.ts components/MaterialsDownloads.test.tsx "app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx"`
Expected: FAIL — `Cannot find module './materialUrls'` / `'./MaterialsDownloads'`; тест страницы заказа не находит ссылку.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/materialUrls.ts`:

```ts
// Адреса скачивания материалов для ссылок в браузере (как PUBLIC_API_BASE в
// lib/api.ts и API_BASE в lib/accountApi.ts: NEXT_PUBLIC_API_URL).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

/** Скачивание со страницы заказа: доступ по секрету заказа (?t=). */
export function orderMaterialDownloadUrl(
  orderNumber: string,
  materialId: string,
  token: string,
): string {
  return `${API_BASE}/api/public/orders/${encodeURIComponent(orderNumber)}/materials/${encodeURIComponent(materialId)}/download?t=${encodeURIComponent(token)}`
}

/** Скачивание из кабинета: доступ по cookie сессии покупателя. */
export function accountMaterialDownloadUrl(materialId: string): string {
  return `${API_BASE}/api/account/materials/${encodeURIComponent(materialId)}/download`
}
```

Create `web/components/MaterialsDownloads.tsx`:

```tsx
import type { MaterialKind } from '@ximi4ka-shop/shared'

export interface MaterialItem {
  id: string
  title: string
  kind: MaterialKind
  url?: string
}

// Ссылки на электронные материалы. Файл скачивается через API (hrefFor), внешняя
// ссылка открывается в новой вкладке. `dark` — страница заказа на тёмном фоне,
// `light` — раздел кабинета.
export function MaterialsDownloads({
  items,
  hrefFor,
  tone = 'dark',
  heading = 'Ваши материалы',
}: Readonly<{
  items: MaterialItem[]
  hrefFor: (id: string) => string
  tone?: 'dark' | 'light'
  heading?: string | null
}>) {
  if (items.length === 0) return null
  const dark = tone === 'dark'
  return (
    <section data-testid="materials" className="flex flex-col gap-3">
      {heading && (
        <h2
          className={`m-0 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] ${
            dark ? 'text-[var(--color-lj-bone-mute)]' : 'opacity-60'
          }`}
        >
          {heading}
        </h2>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((m) => {
          const external = m.kind === 'link' && Boolean(m.url)
          return (
            <li key={m.id}>
              <a
                href={external ? m.url : hrefFor(m.id)}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 ${
                  dark
                    ? 'font-lj-mono uppercase tracking-[0.06em] lj-cta-bright'
                    : 'border border-[var(--color-lj-rule)] hover:bg-[var(--color-lj-cream-shade)]'
                }`}
              >
                <span aria-hidden="true">{external ? '↗' : '↓'}</span>
                {m.title}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

In `OrderStatusView.tsx` add imports (next to the other `@/` imports):

```tsx
import { MaterialsDownloads } from '@/components/MaterialsDownloads'
import { orderMaterialDownloadUrl } from '@/lib/materialUrls'
```

and insert the block right before `<div aria-live="polite" className="flex flex-col gap-3">` (after the CDEK tracking link block):

```tsx
{
  token && order.materials && order.materials.length > 0 && (
    <div className="mb-8">
      <MaterialsDownloads
        items={order.materials}
        hrefFor={(id) => orderMaterialDownloadUrl(orderNumber, id, token)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run lib/materialUrls.test.ts components/MaterialsDownloads.test.tsx "app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx" && npm run typecheck && npm run lint`
Expected: PASS (все), typecheck чистый, lint без ошибок (предупреждения в чужих файлах допустимы).

- [ ] **Step 5: Commit**

```bash
git add web/lib/materialUrls.ts web/lib/materialUrls.test.ts web/components/MaterialsDownloads.tsx web/components/MaterialsDownloads.test.tsx "web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.tsx" "web/app/[locale]/(public)/order/[number]/_components/OrderStatusView.test.tsx"
git commit -m "feat(web): блок материалов на странице заказа"
```

---

### Task 9: Web — раздел кабинета «Мои материалы»

**Files:**

- Modify: `web/lib/accountApi.ts` (`getMaterials`)
- Create: `web/app/[locale]/(public)/account/_components/MaterialsList.tsx`, `MaterialsList.test.tsx`
- Create: `web/app/[locale]/(public)/account/_components/MaterialsLink.tsx`, `MaterialsLink.test.tsx`
- Create: `web/app/[locale]/(public)/account/(authed)/materials/page.tsx`
- Modify: `web/app/[locale]/(public)/account/(authed)/page.tsx`

**Interfaces:**

- Consumes: `AccountMaterial` (Task 1); `MaterialsDownloads` и `accountMaterialDownloadUrl` (Task 8); `ERROR_CLASS` из `@/components/checkout/fieldStyles`.
- Produces: `getMaterials(): Promise<AccountMaterial[]>` в `accountApi.ts`; `<MaterialsList />` (клиентский: загрузка, ошибка, пусто, список); `<MaterialsLink />` (ссылка на `/account/materials`); страница `/account/materials`.

- [ ] **Step 1: Write the failing tests**

Create `web/app/[locale]/(public)/account/_components/MaterialsList.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AccountMaterial } from '@ximi4ka-shop/shared'
import { MaterialsList } from './MaterialsList'

const getMaterials = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ getMaterials }))

afterEach(() => {
  cleanup()
  getMaterials.mockReset()
})

const material = (extra: Partial<AccountMaterial> = {}): AccountMaterial => ({
  id: 'm1',
  title: 'Методичка «Химичка»',
  kind: 'file',
  fileName: 'himichka.pdf',
  sizeBytes: 1000,
  grantedAt: '2026-10-12T10:00:00.000Z',
  ...extra,
})

describe('MaterialsList', () => {
  it('пока грузится — показывает «Загружаем…»', () => {
    getMaterials.mockReturnValue(new Promise(() => {}))
    render(<MaterialsList />)
    expect(screen.getByText('Загружаем…')).toBeInTheDocument()
  })

  it('нет материалов — подсказка', async () => {
    getMaterials.mockResolvedValue([])
    render(<MaterialsList />)
    expect(await screen.findByTestId('materials-empty')).toHaveTextContent('после покупки набора')
  })

  it('список материалов — ссылки на скачивание через API кабинета', async () => {
    getMaterials.mockResolvedValue([material()])
    render(<MaterialsList />)
    const link = await screen.findByRole('link', { name: /Методичка «Химичка»/ })
    expect(link.getAttribute('href')).toMatch(/\/api\/account\/materials\/m1\/download$/)
  })

  it('ошибка загрузки — сообщение', async () => {
    getMaterials.mockRejectedValue(new Error('boom'))
    render(<MaterialsList />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить материалы')
  })
})
```

Create `web/app/[locale]/(public)/account/_components/MaterialsLink.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MaterialsLink } from './MaterialsLink'

afterEach(cleanup)

describe('MaterialsLink', () => {
  it('ведёт в раздел «Мои материалы»', () => {
    render(<MaterialsLink />)
    expect(screen.getByRole('link', { name: /Мои материалы/ })).toHaveAttribute(
      'href',
      '/account/materials',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run "app/[locale]/(public)/account/_components/MaterialsList.test.tsx" "app/[locale]/(public)/account/_components/MaterialsLink.test.tsx"`
Expected: FAIL — `Cannot find module './MaterialsList'` / `'./MaterialsLink'`.

- [ ] **Step 3: Write minimal implementation**

In `web/lib/accountApi.ts` add `AccountMaterial` to the type import list at the top:

```ts
import type {
  AccountMaterial,
  AccountOrdersPage,
  ...
```

and, after `getOrders`, add:

```ts
export const getMaterials = () => call<AccountMaterial[]>('/api/account/materials')
```

Create `web/app/[locale]/(public)/account/_components/MaterialsList.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { AccountMaterial } from '@ximi4ka-shop/shared'
import { getMaterials } from '@/lib/accountApi'
import { accountMaterialDownloadUrl } from '@/lib/materialUrls'
import { MaterialsDownloads } from '@/components/MaterialsDownloads'
import { ERROR_CLASS } from '@/components/checkout/fieldStyles'

// Список материалов покупателя («Мои материалы»): выданное за покупки и вручную.
export function MaterialsList() {
  const [items, setItems] = useState<AccountMaterial[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMaterials()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <p role="alert" className={ERROR_CLASS}>
        Не удалось загрузить материалы. Обновите страницу.
      </p>
    )
  }
  if (items === null) return <p className="m-0 opacity-60">Загружаем…</p>
  if (items.length === 0) {
    return (
      <p data-testid="materials-empty" className="m-0 opacity-70">
        Пока здесь пусто. Электронные материалы появятся после покупки набора.
      </p>
    )
  }
  return (
    <MaterialsDownloads
      items={items}
      hrefFor={accountMaterialDownloadUrl}
      tone="light"
      heading={null}
    />
  )
}
```

Create `web/app/[locale]/(public)/account/_components/MaterialsLink.tsx`:

```tsx
import Link from 'next/link'

// Вход в раздел «Мои материалы» с главной страницы кабинета.
export function MaterialsLink() {
  return (
    <Link
      href="/account/materials"
      className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-lj-rule)] bg-white px-5 py-4 font-lj-display font-[900] text-xl tracking-[-0.03em] text-[var(--color-lj-ink)] transition hover:bg-[var(--color-lj-cream-shade)]"
    >
      <span>Мои материалы</span>
      <span aria-hidden="true">→</span>
    </Link>
  )
}
```

Create `web/app/[locale]/(public)/account/(authed)/materials/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { MaterialsList } from '../../_components/MaterialsList'

export const metadata: Metadata = {
  title: 'Мои материалы — Химичка',
  robots: { index: false, follow: false },
}

export default function AccountMaterialsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-lj-display font-[900] text-2xl tracking-[-0.03em] text-[var(--color-lj-ink)]">
        Мои материалы
      </h2>
      <MaterialsList />
      <p className="m-0">
        <Link
          href="/account"
          className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-70 hover:opacity-100"
        >
          ← В личный кабинет
        </Link>
      </p>
    </div>
  )
}
```

In `web/app/[locale]/(public)/account/(authed)/page.tsx` add `import { MaterialsLink } from '../_components/MaterialsLink'` and render `<MaterialsLink />` between `<ProfileCard />` and the orders `<section>`:

```tsx
      <ProfileCard />
      <MaterialsLink />
      <section aria-labelledby="account-orders-heading" className="flex flex-col gap-4">
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run && npm run typecheck && npm run lint`
Expected: весь набор `web` PASS (в т. ч. новые тесты и существующие тесты кабинета), typecheck чистый, lint без ошибок.

- [ ] **Step 5: Commit**

```bash
git add web/lib/accountApi.ts "web/app/[locale]/(public)/account/_components/MaterialsList.tsx" "web/app/[locale]/(public)/account/_components/MaterialsList.test.tsx" "web/app/[locale]/(public)/account/_components/MaterialsLink.tsx" "web/app/[locale]/(public)/account/_components/MaterialsLink.test.tsx" "web/app/[locale]/(public)/account/(authed)/materials/page.tsx" "web/app/[locale]/(public)/account/(authed)/page.tsx"
git commit -m "feat(web): раздел кабинета «Мои материалы»"
```

---

### Task 10: Деплой, памятка и финальная проверка

**Files:**

- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/app.env.example`
- Create: `deploy/MATERIALS.md`

**Interfaces:**

- Consumes: всё из Task 1–9.
- Produces: том `ximishop-materials`, переменная `MATERIALS_DIR`, памятка выкатки.

- [ ] **Step 1: Том и переменная окружения**

In `deploy/docker-compose.yml`, in the api service `volumes:` (рядом с `ximishop-uploads:/app/api/uploads`) add:

```yaml
# Закрытые материалы (PDF методичек и т. п.): вне /uploads, наружу не раздаются.
- ximishop-materials:/app/api/materials
```

and in the top-level `volumes:` block add `ximishop-materials:` after `ximishop-uploads:`.

Append to `deploy/app.env.example` (в конец, отдельным блоком):

```dotenv

# --- Закрытые материалы («Мои материалы») ---
# Каталог файлов материалов внутри контейнера api; том ximishop-materials.
# По умолчанию (если не задан) — api/materials рядом с кодом.
MATERIALS_DIR=/app/api/materials
```

- [ ] **Step 2: Памятка**

Create `deploy/MATERIALS.md`:

````markdown
# Материалы («Мои материалы»): файлы и первая загрузка

Файлы материалов лежат на томе `ximishop-materials` (в контейнере api — `/app/api/materials`,
переменная `MATERIALS_DIR`). Из интернета они недоступны напрямую: только через API с проверкой
выдачи (сессия кабинета или секрет заказа). Каталог материалов — таблица `learning_materials`.

## Первая выкатка (три методички)

Порядок важен: пока скрипт не запущен, каталог пуст и оплаты ничего не выдают.

1. Деплой кода (мёрж в `main`) — миграция `AddLearningMaterials` применяется при старте.
2. Положить файлы в том. Имена фиксированы: `himichka.pdf`, `elektrohimichka.pdf`, `oge-2026.pdf`.

```bash
cd /opt/ximishop/app
C="docker compose --env-file deploy/web.env -f deploy/docker-compose.yml"

# каталог с тремя PDF лежит на сервере, например /root/materials-src
docker run --rm -v ximishop_ximishop-materials:/m -v /root/materials-src:/src:ro alpine \
  sh -c 'cp /src/himichka.pdf /src/elektrohimichka.pdf /src/oge-2026.pdf /m/ && chmod 644 /m/*.pdf && ls -l /m'
```

3. Dry-run, затем запись (скрипт идемпотентен; в отчёте — сколько материалов заведено, какие файлы
   и slug не найдены, сколько выдач добавлено уже оплаченным заказам):

```bash
$C exec -T ximishop-api node api/dist/seeds/apply-materials-methodichki.js --dry-run 2>&1 | tee -a /root/backups/card-seeds.log
$C exec -T ximishop-api node api/dist/seeds/apply-materials-methodichki.js 2>&1 | tee -a /root/backups/card-seeds.log
```

Ожидаемое предупреждение: `vse-chetyre-nabora` нет в каталоге — это нормально, пока товар не заведён.

4. Проверка в БД:

```bash
docker exec -i supabase-db psql -U supabase_admin -d ximi4ka_shop -At \
  -c "SELECT file_key, size_bytes, is_active FROM learning_materials ORDER BY file_key;" \
  -c "SELECT count(*) FROM material_grants;"
```

5. Проверка вживую: открыть страницу оплаченного заказа со ссылкой `#t=…` (блок «Ваши материалы»)
   и кабинет `/account/materials`; файл должен скачиваться, прямой адрес `/uploads/...` не существует.

## Откат

Удаление материала каскадом убирает его связи и выдачи:

```sql
DELETE FROM learning_materials WHERE file_key IN ('himichka.pdf', 'elektrohimichka.pdf', 'oge-2026.pdf');
```

Файлы на томе остаются; повторный запуск скрипта вернёт материалы и выдачи.

## Бэкап

Том `ximishop-materials` нужно бэкапить так же, как `ximishop-uploads` (см. `deploy/README.md`).
````

- [ ] **Step 3: Полная проверка**

Run (из корня репозитория, по очереди; каждая команда должна завершиться без ошибок):

```bash
npm run typecheck -w shared && npm run typecheck -w api && npm run typecheck -w web
npm run lint -w web
npm test -w shared
(cd web && npx vitest run)
(cd api && npx vitest run src/entities/learningMaterials.test.ts src/lib/materials src/routes/account-materials.test.ts src/routes/public/orderMaterials.test.ts src/seeds/_lib/methodichki-materials.test.ts src/routes/account-profile.test.ts)
npx prettier --check .
```

Expected: всё PASS. Затем один полный прогон `cd api && npx vitest run` и сверка числа падений с `origin/main`: падения, не связанные с материалами (например, `MetrikaConversion.claimed_at` из-за устаревшей локальной БД), не считаются регрессией, но перечислить их в отчёте. Если `prettier --check` ругается — `npx prettier --write` на указанные файлы.

- [ ] **Step 4: Проверка в браузере (мок API)**

`web` — через `preview_start` `{name: "web"}` (порт 3020). API — маленький node-сервер на порту 3001 (адрес по умолчанию), который возвращает `GET /api/public/orders/XM-2026-00042/status` с `materials: [{ id: 'm1', title: 'Методичка «Химичка 3.0 / Мини-Химичка»', kind: 'file' }]` и `status: 'paid'`, а для `XM-2026-00043` — `status: 'pending'`, `materials: []`; заголовки `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: content-type`, `OPTIONS` → 204. Проверить:

- `http://localhost:3020/order/XM-2026-00042#t=abc` (жёсткая перезагрузка, если URL тот же): виден блок «Ваши материалы», ссылка ведёт на `/api/public/orders/XM-2026-00042/materials/m1/download?t=abc`;
- `…/order/XM-2026-00043#t=abc`: блока нет;
- мобильная ширина (`resize_window` preset mobile): нет горизонтального скролла, кнопка помещается.

Страницу кабинета в браузере проверить нельзя (серверный layout требует настоящую сессию) — она покрыта тестами Task 9. Мок-скрипт и сервер остановить, вьюпорт вернуть (`preset: desktop`), скрипт удалить из scratchpad.

- [ ] **Step 5: Security review и коммит**

Run: навык `/security-review` по ветке (токены заказа, закрытая раздача, защита от обхода пути, выдача при оплате). Исправить найденное отдельными коммитами с тестами.

```bash
git add deploy/docker-compose.yml deploy/app.env.example deploy/MATERIALS.md
git commit -m "docs(deploy): том ximishop-materials и памятка первой выкатки материалов"
```

После коммита — отчёт владельцу: что сделано, результаты проверок, предупреждения. Пуш и PR — только по его команде; мёрж в `main` = выкатка в прод.

---

## Self-Review

**Spec coverage** (по разделам спеки):

- Данные (три таблицы, CHECK, индексы) → Task 2. `integer` для `size_bytes` — правка спеки (внесена).
- Выдача при оплате (`writeOrderStatusEvent`, один INSERT…SELECT, идемпотентно, подарочные позиции) → Task 4.
- Привязка гостевых выдач (`claimOrdersByEmail`, `attachEmail` вызывает его же) и слияние (`mergeCustomers`) → Task 4.
- Закрытая раздача (том, поток, заголовки, проверка пути) → Task 3 (+ Task 10 — том).
- Кабинет: список и скачивание → Task 5; страница заказа: статус и скачивание → Task 6.
- Web: страница «Мои материалы», ссылка с главной, блок на странице заказа → Task 8–9; блока внутри заказов кабинета нет (не трогаем `OrderDetails`/`AccountOrderSummary`).
- Три текущие методички (скрипт, привязка по slug, выдача оплаченным) → Task 7.
- Деплой (том, env, порядок выкатки) → Task 10.
- Тесты (идемпотентность, пути оплаты, claim, доступ, web) → Task 3–9; `/security-review` → Task 10.
- Не входит в этап 1 (админка, личные ссылки, отзыв, уведомления) — задач нет, колонки `revoked_at`/`source` заложены в Task 2.

**Placeholder scan:** нет «TBD/TODO/добавить обработку ошибок»; во всех шагах с кодом код приведён целиком. В Task 4 Step 4 и Task 10 Step 3 сверка «падений не стало больше» описана конкретными действиями, а не «по возможности».

**Type consistency:** `PublicOrderMaterial`/`AccountMaterial` (Task 1) используются в `queries.ts` (Task 5), `OrderStatusView` и `MaterialsList` (Task 8–9); `sendMaterialFile(res, material): Promise<boolean>` (Task 3) вызывается одинаково в Task 5 и 6; `listOrderMaterials`/`findOrderMaterial`/`isUuid` определены в Task 5 и используются в Task 6; фикстуры `seedProduct`, `seedMaterial`, `addOrderItem`, `resetMaterialTables` определены в Task 4 и используются в Task 5–7 с теми же сигнатурами; `applyMethodichkiMaterials`/`METHODICHKI` — Task 7 тест и реализация согласованы; `MaterialsDownloads` props (`items`, `hrefFor`, `tone`, `heading`) одинаковы в Task 8 и 9.

**Review Focus:** все пять пунктов покрыты тестами (1 — Task 5 «один материал из двух заказов»; 2 — Task 4 «реальный вход» и «слияние»; 3 — Task 3 «отвергает …» и «file_key с выходом за каталог»; 4 — Task 3 «файла нет на диске», Task 5/6 «material_file_missing»; 5 — Task 5/6 «не-uuid»).
