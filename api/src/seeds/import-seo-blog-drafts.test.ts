// Поведение сида SEO-черновиков на тестовой БД: создаёт только отсутствующие
// статьи, ничего не публикует и не трогает уже существующие записи.
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { BlogPost } from '../entities/BlogPost.js'
import { importSeoBlogDrafts, loadSeoBlogDrafts } from './_lib/seo-blog-drafts.js'

describe('importSeoBlogDrafts', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE blog_posts RESTART IDENTITY CASCADE')
  })

  const repo = () => AppDataSource.getRepository(BlogPost)

  it('создаёт все 10 статей черновиками', async () => {
    const drafts = await loadSeoBlogDrafts()
    const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    expect(result.created).toHaveLength(10)
    expect(result.skipped).toEqual([])

    const posts = await repo().find()
    expect(posts).toHaveLength(10)
    for (const post of posts) {
      expect(post.isPublished).toBe(false)
      expect(post.publishedAt).toBeNull()
      expect(post.coverImageUrl).toBeNull()
      expect(post.deletedAt).toBeNull()
    }
    const first = drafts[0]!
    const saved = await repo().findOneByOrFail({ slug: first.slug })
    expect(saved.title).toBe(first.title)
    expect(saved.metaTitle).toBe(first.metaTitle)
    expect(saved.metaDescription).toBe(first.metaDescription)
    expect(saved.excerpt).toBe(first.excerpt)
    expect(saved.rubric).toBe(first.rubric)
    expect(saved.blocks).toEqual(first.blocks)
  })

  it('повторный запуск ничего не создаёт', async () => {
    const drafts = await loadSeoBlogDrafts()
    await importSeoBlogDrafts(repo(), drafts, { dryRun: false })
    const second = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    expect(second.created).toEqual([])
    expect(second.skipped).toHaveLength(10)
    expect(await repo().count()).toBe(10)
  })

  it('не трогает существующие статьи — ни опубликованные, ни правленные в админке', async () => {
    const drafts = await loadSeoBlogDrafts()
    const target = drafts[0]!
    const publishedAt = new Date('2026-09-01T00:00:00Z')
    await repo().save(
      repo().create({
        slug: target.slug,
        title: 'Правка из админки',
        isPublished: true,
        publishedAt,
        blocks: [],
      }),
    )

    const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    expect(result.created).toHaveLength(9)
    expect(result.skipped).toEqual([target.slug])
    const kept = await repo().findOneByOrFail({ slug: target.slug })
    expect(kept.title).toBe('Правка из админки')
    expect(kept.isPublished).toBe(true)
    expect(kept.publishedAt?.toISOString()).toBe(publishedAt.toISOString())
    expect(kept.blocks).toEqual([])
  })

  it('не восстанавливает и не дублирует удалённые статьи', async () => {
    const drafts = await loadSeoBlogDrafts()
    const target = drafts[1]!
    const saved = await repo().save(repo().create({ slug: target.slug, title: 'Удалена' }))
    await repo().softDelete(saved.id)

    const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    expect(result.skipped).toEqual([target.slug])
    expect(result.created).toHaveLength(9)
    const row = await repo().findOneOrFail({ where: { slug: target.slug }, withDeleted: true })
    expect(row.title).toBe('Удалена')
    expect(row.deletedAt).not.toBeNull()
  })

  it('--dry-run сообщает план, но ничего не записывает', async () => {
    const drafts = await loadSeoBlogDrafts()
    await repo().save(repo().create({ slug: drafts[0]!.slug, title: 'Уже есть' }))

    const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: true })

    expect(result.created).toHaveLength(9)
    expect(result.skipped).toEqual([drafts[0]!.slug])
    expect(await repo().count()).toBe(1)
  })
})
