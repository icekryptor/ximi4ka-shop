import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { BlogPost } from './BlogPost.js'

describe('BlogPost entity', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize()
    }
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "blog_posts" RESTART IDENTITY CASCADE')
  })

  it('persists and retrieves a blog post round-trip', async () => {
    const repo = AppDataSource.getRepository(BlogPost)
    const created = repo.create({
      slug: 'pervyj-opyt',
      title: 'Первый опыт',
      excerpt: 'Краткое описание поста',
      coverImageUrl: '/uploads/blog/cover.jpg',
      rubric: 'Эксперименты',
      blocks: [{ type: 'text', content: 'Привет' }],
      isPublished: true,
      publishedAt: new Date('2026-01-15T10:00:00Z'),
      noindex: false,
      translations: {},
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.slug).toBe('pervyj-opyt')
    expect(found.title).toBe('Первый опыт')
    expect(found.excerpt).toBe('Краткое описание поста')
    expect(found.coverImageUrl).toBe('/uploads/blog/cover.jpg')
    expect(found.rubric).toBe('Эксперименты')
    expect(found.isPublished).toBe(true)
    expect(found.publishedAt).toBeInstanceOf(Date)
    expect(Array.isArray(found.blocks)).toBe(true)
    expect(found.blocks).toHaveLength(1)
  })

  it('defaults: unpublished, empty blocks, null published_at', async () => {
    const repo = AppDataSource.getRepository(BlogPost)
    const saved = await repo.save(repo.create({ slug: 'draft', title: 'Черновик' }))
    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.isPublished).toBe(false)
    expect(found.publishedAt).toBeNull()
    expect(found.blocks).toEqual([])
    expect(found.excerpt).toBeNull()
    expect(found.coverImageUrl).toBeNull()
    expect(found.rubric).toBeNull()
    expect(found.noindex).toBe(false)
  })
})
