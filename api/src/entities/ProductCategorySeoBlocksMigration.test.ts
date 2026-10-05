import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { AddProductCategorySeoBlocks1790740000000 } from '../migrations/1790740000000-AddProductCategorySeoBlocks.js'

// Миграция колонки seo_blocks проверяется на тестовой базе (globalSetup уже
// накатил её вместе с остальными). Тест лежит не в src/migrations: оттуда
// TypeORM подхватывает все *.ts как миграции.
interface ColumnInfo {
  data_type: string
  is_nullable: string
  column_default: string | null
}

const EXPECTED: ColumnInfo = { data_type: 'jsonb', is_nullable: 'YES', column_default: null }

async function seoBlocksColumn(): Promise<ColumnInfo | undefined> {
  const rows: ColumnInfo[] = await AppDataSource.query(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'product_categories' AND column_name = 'seo_blocks'`,
  )
  return rows[0]
}

describe('миграция AddProductCategorySeoBlocks', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  it('down снимает колонку, up возвращает её jsonb, nullable, без значения по умолчанию и без потери данных', async () => {
    const migration = new AddProductCategorySeoBlocks1790740000000()
    const qr = AppDataSource.createQueryRunner()
    try {
      await AppDataSource.query('TRUNCATE TABLE "product_categories" RESTART IDENTITY CASCADE')
      await AppDataSource.query(
        `INSERT INTO "product_categories" ("slug", "name") VALUES ('old', 'Старая')`,
      )

      expect(await seoBlocksColumn()).toEqual(EXPECTED)

      await migration.down(qr)
      expect(await seoBlocksColumn()).toBeUndefined()

      await migration.up(qr)
      expect(await seoBlocksColumn()).toEqual(EXPECTED)

      const [row] = await AppDataSource.query(
        `SELECT slug, seo_blocks FROM "product_categories" WHERE slug = 'old'`,
      )
      expect(row).toEqual({ slug: 'old', seo_blocks: null })
    } finally {
      // Любой исход оставляет базу в состоянии «миграция применена».
      await migration.up(qr)
      await qr.release()
      await AppDataSource.query('TRUNCATE TABLE "product_categories" RESTART IDENTITY CASCADE')
    }
  })

  it('up идемпотентна: повторный накат (или ручной ALTER до деплоя) не падает', async () => {
    const migration = new AddProductCategorySeoBlocks1790740000000()
    const qr = AppDataSource.createQueryRunner()
    try {
      await migration.up(qr)
      await migration.up(qr)
      expect(await seoBlocksColumn()).toEqual(EXPECTED)
    } finally {
      await qr.release()
    }
  })
})
