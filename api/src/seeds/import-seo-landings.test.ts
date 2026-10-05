// Поведение сида посадочных страниц на тестовой БД: создаёт только
// отсутствующие страницы по slug, всегда неопубликованными, черновики —
// только с includeDrafts, существующие и удалённые не трогает.
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Page } from '../entities/Page.js'
import { importSeoLandings, loadSeoLandings } from './_lib/seo-landings.js'

describe('importSeoLandings', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE pages RESTART IDENTITY CASCADE')
  })

  const repo = () => AppDataSource.getRepository(Page)

  it('создаёт три страницы неопубликованными, поля и блоки переживают круг через jsonb', async () => {
    const landings = await loadSeoLandings()
    const result = await importSeoLandings(repo(), landings, { dryRun: false, includeDrafts: true })

    expect(result.created).toHaveLength(3)
    expect(result.skipped).toEqual([])
    expect(result.draftsHeld).toEqual([])

    const pages = await repo().find()
    expect(pages).toHaveLength(3)
    for (const page of pages) {
      expect(page.isPublished).toBe(false)
      expect(page.noindex).toBe(false)
      expect(page.deletedAt).toBeNull()
    }
    for (const landing of landings) {
      const saved = await repo().findOneByOrFail({ slug: landing.slug })
      expect(saved.title).toBe(landing.title)
      expect(saved.metaTitle).toBe(landing.metaTitle)
      expect(saved.metaDescription).toBe(landing.metaDescription)
      // jsonb переставляет ключи: сравниваем структурно, не через JSON.stringify.
      expect(saved.blocks).toEqual(landing.blocks)
    }
  })

  it('черновики (draft: true) без includeDrafts не создаются и попадают в draftsHeld', async () => {
    const landings = await loadSeoLandings()
    expect(landings.every((l) => l.draft)).toBe(true)

    const result = await importSeoLandings(repo(), landings, {
      dryRun: false,
      includeDrafts: false,
    })

    expect(result.created).toEqual([])
    expect(result.draftsHeld).toHaveLength(3)
    expect(await repo().count()).toBe(0)
  })

  it('запись без draft создаётся и без includeDrafts, но всё равно неопубликованной', async () => {
    const [first] = await loadSeoLandings()
    const reviewed = { ...first!, draft: false }

    const result = await importSeoLandings(repo(), [reviewed], { dryRun: false })

    expect(result.created).toEqual([reviewed.slug])
    const saved = await repo().findOneByOrFail({ slug: reviewed.slug })
    expect(saved.isPublished).toBe(false)
  })

  it('повторный запуск ничего не создаёт', async () => {
    const landings = await loadSeoLandings()
    await importSeoLandings(repo(), landings, { dryRun: false, includeDrafts: true })
    const second = await importSeoLandings(repo(), landings, { dryRun: false, includeDrafts: true })

    expect(second.created).toEqual([])
    expect(second.skipped).toHaveLength(3)
    expect(await repo().count()).toBe(3)
  })

  it('не трогает существующие страницы: ни опубликованные, ни правленные в админке', async () => {
    const landings = await loadSeoLandings()
    const target = landings[0]!
    await repo().save(
      repo().create({
        slug: target.slug,
        title: 'Правка из админки',
        metaTitle: 'Свой title',
        isPublished: true,
        noindex: true,
        blocks: [],
        translations: {},
      }),
    )

    const result = await importSeoLandings(repo(), landings, { dryRun: false, includeDrafts: true })

    expect(result.skipped).toEqual([target.slug])
    expect(result.created).toHaveLength(2)
    const kept = await repo().findOneByOrFail({ slug: target.slug })
    expect(kept.title).toBe('Правка из админки')
    expect(kept.metaTitle).toBe('Свой title')
    expect(kept.isPublished).toBe(true)
    expect(kept.noindex).toBe(true)
    expect(kept.blocks).toEqual([])
  })

  it('не восстанавливает и не пересоздаёт мягко удалённую страницу', async () => {
    const landings = await loadSeoLandings()
    const target = landings[0]!
    const saved = await repo().save(
      repo().create({ slug: target.slug, title: 'Удалена', blocks: [], translations: {} }),
    )
    await repo().softDelete({ id: saved.id })

    const result = await importSeoLandings(repo(), landings, { dryRun: false, includeDrafts: true })

    expect(result.skipped).toEqual([target.slug])
    expect(await repo().count()).toBe(2)
    const stillDeleted = await repo().findOneOrFail({
      where: { slug: target.slug },
      withDeleted: true,
    })
    expect(stillDeleted.deletedAt).not.toBeNull()
    expect(stillDeleted.title).toBe('Удалена')
  })

  it('dry-run сообщает, что было бы создано, и ничего не пишет', async () => {
    const landings = await loadSeoLandings()
    const result = await importSeoLandings(repo(), landings, { dryRun: true, includeDrafts: true })

    expect(result.created).toHaveLength(3)
    expect(await repo().count()).toBe(0)
  })
})
