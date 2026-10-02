// Идемпотентность сида CMS-страниц на локальной тестовой БД (как у других
// DB-тестов: TEST_DATABASE_URL, по умолчанию ximi4ka_shop_test).
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Page } from '../entities/Page.js'
import { createMissingPages, readCmsPages, type CmsPageEntry } from './_lib/cms-pages.js'

describe('createMissingPages', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "pages" RESTART IDENTITY CASCADE')
  })

  const repo = () => AppDataSource.getRepository(Page)

  it('создаёт отсутствующие страницы опубликованными и с noindex из данных', async () => {
    const entries = await readCmsPages()
    const result = await createMissingPages(repo(), entries)

    expect(result).toEqual({ created: entries.length, skipped: 0 })
    const policy = await repo().findOneByOrFail({ slug: 'policy' })
    expect(policy.isPublished).toBe(true)
    expect(policy.noindex).toBe(false)
    expect(policy.metaTitle).toContain('Химичка')
    expect(Array.isArray(policy.blocks) && policy.blocks.length > 0).toBe(true)

    const zhuk = await repo().findOneBy({ slug: 'zhuk' })
    if (zhuk) expect(zhuk.noindex).toBe(true)
  })

  it('повторный запуск ничего не меняет (идемпотентность)', async () => {
    const entries = await readCmsPages()
    await createMissingPages(repo(), entries)
    const before = await repo().find({ order: { slug: 'ASC' } })

    const result = await createMissingPages(repo(), entries)

    expect(result).toEqual({ created: 0, skipped: entries.length })
    const after = await repo().find({ order: { slug: 'ASC' } })
    expect(after.map((p) => [p.id, p.updatedAt.getTime()])).toEqual(
      before.map((p) => [p.id, p.updatedAt.getTime()]),
    )
  })

  it('не затирает правки из админки у существующей страницы', async () => {
    const entries = await readCmsPages()
    await repo().save(
      repo().create({
        slug: 'faq',
        title: 'Правка из админки',
        blocks: [{ type: 'paragraph', html: '<p>Мой текст</p>' }],
        isPublished: false,
        translations: {},
      }),
    )

    const result = await createMissingPages(repo(), entries)

    expect(result.skipped).toBe(1)
    expect(result.created).toBe(entries.length - 1)
    const faq = await repo().findOneByOrFail({ slug: 'faq' })
    expect(faq.title).toBe('Правка из админки')
    expect(faq.isPublished).toBe(false)
    expect(faq.blocks).toEqual([{ type: 'paragraph', html: '<p>Мой текст</p>' }])
  })

  it('не воскрешает страницу, удалённую в админке (soft-delete)', async () => {
    const entries = await readCmsPages()
    const gone = await repo().save(
      repo().create({ slug: 'cert', title: 'Удалена', blocks: [], translations: {} }),
    )
    await repo().softRemove(gone)

    const result = await createMissingPages(repo(), entries)

    expect(result.skipped).toBe(1)
    const row = await repo().findOne({ where: { slug: 'cert' }, withDeleted: true })
    expect(row?.deletedAt).not.toBeNull()
    expect(row?.title).toBe('Удалена')
  })

  it('сохраняет блоки как есть (jsonb round-trip)', async () => {
    const entry: CmsPageEntry = {
      sourceUrl: 'https://ximi4ka.ru/socials',
      slug: 'roundtrip',
      title: 'T',
      metaTitle: 'T — Химичка',
      metaDescription: 'D',
      noindex: false,
      blocks: [{ type: 'paragraph', html: '<p>a&nbsp;b</p>' }],
    }
    await createMissingPages(repo(), [entry])
    const row = await repo().findOneByOrFail({ slug: 'roundtrip' })
    expect(row.blocks).toEqual(entry.blocks)
  })
})
