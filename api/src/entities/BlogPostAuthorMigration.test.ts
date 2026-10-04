import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { AddBlogPostAuthor1790730000000 } from '../migrations/1790730000000-AddBlogPostAuthor.js'

// Миграция полей автора проверяется на тестовой базе (globalSetup уже накатил
// её вместе с остальными). Тест лежит не в src/migrations: оттуда TypeORM
// подхватывает все *.ts как миграции.
const AUTHOR_COLUMNS = [
  'author_bio',
  'author_job_title',
  'author_name',
  'author_photo_url',
  'author_url',
]

async function authorColumns(): Promise<string[]> {
  const rows: Array<{ column_name: string }> = await AppDataSource.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'blog_posts' AND column_name LIKE 'author_%'
     ORDER BY column_name`,
  )
  return rows.map((r) => r.column_name)
}

describe('миграция AddBlogPostAuthor', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  it('down снимает колонки, up возвращает их nullable и без потери данных', async () => {
    const migration = new AddBlogPostAuthor1790730000000()
    const qr = AppDataSource.createQueryRunner()
    try {
      await AppDataSource.query('TRUNCATE TABLE "blog_posts" RESTART IDENTITY CASCADE')
      await AppDataSource.query(
        `INSERT INTO "blog_posts" ("slug", "title") VALUES ('old', 'Старый')`,
      )

      expect(await authorColumns()).toEqual(AUTHOR_COLUMNS)

      await migration.down(qr)
      expect(await authorColumns()).toEqual([])

      await migration.up(qr)
      expect(await authorColumns()).toEqual(AUTHOR_COLUMNS)

      const nullable: Array<{ is_nullable: string }> = await AppDataSource.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'blog_posts' AND column_name LIKE 'author_%'`,
      )
      expect(nullable.every((c) => c.is_nullable === 'YES')).toBe(true)

      const [row] = await AppDataSource.query(
        `SELECT slug, author_name FROM "blog_posts" WHERE slug = 'old'`,
      )
      expect(row).toEqual({ slug: 'old', author_name: null })
    } finally {
      // Любой исход оставляет базу в состоянии «миграция применена».
      await migration.up(qr)
      await qr.release()
      await AppDataSource.query('TRUNCATE TABLE "blog_posts" RESTART IDENTITY CASCADE')
    }
  })

  it('up идемпотентна: повторный накат (или ручной ALTER до деплоя) не падает', async () => {
    const migration = new AddBlogPostAuthor1790730000000()
    const qr = AppDataSource.createQueryRunner()
    try {
      await migration.up(qr)
      await migration.up(qr)
      expect(await authorColumns()).toEqual(AUTHOR_COLUMNS)
    } finally {
      await qr.release()
    }
  })
})
