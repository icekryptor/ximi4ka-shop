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

  it('создаёт все статьи черновиками', async () => {
    const drafts = await loadSeoBlogDrafts()
    const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    expect(result.created).toHaveLength(drafts.length)
    expect(result.skipped).toEqual([])

    const posts = await repo().find()
    expect(posts).toHaveLength(drafts.length)
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

  it('при создании записывает автора из данных', async () => {
    const drafts = await loadSeoBlogDrafts()
    await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    for (const post of await repo().find()) {
      expect(post.authorName).toBe('Василий Аистов')
      expect(post.authorJobTitle).toBeNull()
      expect(post.authorBio).toBeNull()
      expect(post.authorUrl).toBeNull()
      expect(post.authorPhotoUrl).toBeNull()
    }
  })

  it('повторный запуск ничего не создаёт', async () => {
    const drafts = await loadSeoBlogDrafts()
    await importSeoBlogDrafts(repo(), drafts, { dryRun: false })
    const second = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

    expect(second.created).toEqual([])
    expect(second.skipped).toHaveLength(drafts.length)
    expect(await repo().count()).toBe(drafts.length)
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

    expect(result.created).toHaveLength(drafts.length - 1)
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
    expect(result.created).toHaveLength(drafts.length - 1)
    const row = await repo().findOneOrFail({ where: { slug: target.slug }, withDeleted: true })
    expect(row.title).toBe('Удалена')
    expect(row.deletedAt).not.toBeNull()
  })

  it('--dry-run сообщает план, но ничего не записывает', async () => {
    const drafts = await loadSeoBlogDrafts()
    await repo().save(repo().create({ slug: drafts[0]!.slug, title: 'Уже есть' }))

    const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: true })

    expect(result.created).toHaveLength(drafts.length - 1)
    expect(result.skipped).toEqual([drafts[0]!.slug])
    expect(await repo().count()).toBe(1)
  })

  describe('--set-author-on-existing', () => {
    // Статья, импортированная до появления автора в данных.
    const saveWithoutAuthor = (slug: string, extra: Partial<BlogPost> = {}) =>
      repo().save(repo().create({ slug, title: 'Старая', blocks: [], ...extra }))

    it('по умолчанию существующим статьям автора не ставит', async () => {
      const drafts = await loadSeoBlogDrafts()
      await saveWithoutAuthor(drafts[0]!.slug)

      const result = await importSeoBlogDrafts(repo(), drafts, { dryRun: false })

      expect(result.authorFilled).toEqual([])
      const row = await repo().findOneByOrFail({ slug: drafts[0]!.slug })
      expect(row.authorName).toBeNull()
    })

    it('заполняет автора у существующих статей без автора', async () => {
      const drafts = await loadSeoBlogDrafts()
      await saveWithoutAuthor(drafts[0]!.slug)
      await saveWithoutAuthor(drafts[1]!.slug, { authorName: '' })

      const result = await importSeoBlogDrafts(repo(), drafts, {
        dryRun: false,
        setAuthorOnExisting: true,
      })

      expect(result.authorFilled.sort()).toEqual([drafts[0]!.slug, drafts[1]!.slug].sort())
      expect(result.created).toHaveLength(drafts.length - 2)
      for (const d of [drafts[0]!, drafts[1]!]) {
        const row = await repo().findOneByOrFail({ slug: d.slug })
        expect(row.authorName).toBe('Василий Аистов')
        // Остальное в статье не тронуто.
        expect(row.title).toBe('Старая')
        expect(row.isPublished).toBe(false)
      }
    })

    it('не перезаписывает заполненное и не трогает чужие статьи', async () => {
      const drafts = await loadSeoBlogDrafts()
      const filled = drafts[0]!.slug
      await saveWithoutAuthor(filled, { authorName: 'Другой Автор', authorBio: 'Своё био' })
      await saveWithoutAuthor('chuzhaya-statya')

      const result = await importSeoBlogDrafts(repo(), drafts, {
        dryRun: false,
        setAuthorOnExisting: true,
      })

      expect(result.authorFilled).toEqual([])
      const kept = await repo().findOneByOrFail({ slug: filled })
      expect(kept.authorName).toBe('Другой Автор')
      expect(kept.authorBio).toBe('Своё био')
      const foreign = await repo().findOneByOrFail({ slug: 'chuzhaya-statya' })
      expect(foreign.authorName).toBeNull()
    })

    it('заполняет только пустые поля автора, не задевая заполненные', async () => {
      const drafts = await loadSeoBlogDrafts()
      const target = { ...drafts[0]!, authorJobTitle: 'Основатель', authorBio: 'Био из данных' }
      await saveWithoutAuthor(target.slug, { authorBio: 'Био из админки' })

      const result = await importSeoBlogDrafts(repo(), [target], {
        dryRun: false,
        setAuthorOnExisting: true,
      })

      expect(result.authorFilled).toEqual([target.slug])
      const row = await repo().findOneByOrFail({ slug: target.slug })
      expect(row.authorName).toBe('Василий Аистов')
      expect(row.authorJobTitle).toBe('Основатель')
      expect(row.authorBio).toBe('Био из админки')
    })

    it('не трогает удалённые статьи', async () => {
      const drafts = await loadSeoBlogDrafts()
      const saved = await saveWithoutAuthor(drafts[0]!.slug)
      await repo().softDelete(saved.id)

      const result = await importSeoBlogDrafts(repo(), drafts, {
        dryRun: false,
        setAuthorOnExisting: true,
      })

      expect(result.authorFilled).toEqual([])
      const row = await repo().findOneOrFail({
        where: { slug: drafts[0]!.slug },
        withDeleted: true,
      })
      expect(row.authorName).toBeNull()
    })

    it('повторный запуск ничего не меняет', async () => {
      const drafts = await loadSeoBlogDrafts()
      await saveWithoutAuthor(drafts[0]!.slug)
      const opts = { dryRun: false, setAuthorOnExisting: true }
      await importSeoBlogDrafts(repo(), drafts, opts)
      const second = await importSeoBlogDrafts(repo(), drafts, opts)

      expect(second.created).toEqual([])
      expect(second.authorFilled).toEqual([])
      expect(await repo().count()).toBe(drafts.length)
    })

    it('--dry-run сообщает, у кого был бы заполнен автор, но ничего не пишет', async () => {
      const drafts = await loadSeoBlogDrafts()
      await saveWithoutAuthor(drafts[0]!.slug)

      const result = await importSeoBlogDrafts(repo(), drafts, {
        dryRun: true,
        setAuthorOnExisting: true,
      })

      expect(result.authorFilled).toEqual([drafts[0]!.slug])
      const row = await repo().findOneByOrFail({ slug: drafts[0]!.slug })
      expect(row.authorName).toBeNull()
    })
  })
})
