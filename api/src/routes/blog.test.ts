import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { BlogPost } from '../entities/BlogPost.js'

// Public blog routes. Content is seeded straight through the repository —
// these tests exercise only the storefront-facing read contract.
describe('Public blog routes', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE blog_posts RESTART IDENTITY CASCADE')
  })

  async function seedPost(overrides: Partial<BlogPost> & { slug: string }): Promise<BlogPost> {
    const repo = AppDataSource.getRepository(BlogPost)
    return repo.save(
      repo.create({
        title: overrides.slug.toUpperCase(),
        ...overrides,
      }),
    )
  }

  describe('GET /api/public/blog', () => {
    it('returns only published + non-deleted posts, newest published first', async () => {
      await seedPost({
        slug: 'staryj',
        isPublished: true,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
      })
      await seedPost({
        slug: 'novyj',
        isPublished: true,
        publishedAt: new Date('2026-02-01T00:00:00Z'),
      })
      await seedPost({ slug: 'draft', isPublished: false })
      await seedPost({
        slug: 'udalyonnyj',
        isPublished: true,
        publishedAt: new Date('2026-03-01T00:00:00Z'),
        deletedAt: new Date(),
      })

      const res = await request(app).get('/api/public/blog')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.data.map((p: { slug: string }) => p.slug)).toEqual(['novyj', 'staryj'])
      expect(res.body.pagination).toMatchObject({ total: 2 })
    })

    it('supports pagination (page/limit)', async () => {
      for (let i = 1; i <= 3; i++) {
        await seedPost({
          slug: `post-${i}`,
          isPublished: true,
          publishedAt: new Date(`2026-0${i}-01T00:00:00Z`),
        })
      }
      const page1 = await request(app).get('/api/public/blog?page=1&limit=2')
      expect(page1.status).toBe(200)
      expect(page1.body.data).toHaveLength(2)
      expect(page1.body.data.map((p: { slug: string }) => p.slug)).toEqual(['post-3', 'post-2'])
      expect(page1.body.pagination).toMatchObject({ limit: 2, offset: 0, total: 3 })

      const page2 = await request(app).get('/api/public/blog?page=2&limit=2')
      expect(page2.body.data).toHaveLength(1)
      expect(page2.body.data[0].slug).toBe('post-1')
      expect(page2.body.pagination).toMatchObject({ limit: 2, offset: 2, total: 3 })
    })

    it('rejects invalid pagination input (400 validation_error)', async () => {
      const res = await request(app).get('/api/public/blog?page=0')
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
  })

  describe('GET /api/public/blog/:slug', () => {
    it('returns a published post by slug', async () => {
      await seedPost({
        slug: 'opyty-doma',
        title: 'Опыты дома',
        isPublished: true,
        publishedAt: new Date(),
      })
      const res = await request(app).get('/api/public/blog/opyty-doma')
      expect(res.status).toBe(200)
      expect(res.body.data.slug).toBe('opyty-doma')
      expect(res.body.data.title).toBe('Опыты дома')
    })
    it('returns 404 for unpublished', async () => {
      await seedPost({ slug: 'private', isPublished: false })
      const res = await request(app).get('/api/public/blog/private')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('blog_post_not_found')
    })
    it('returns 404 for soft-deleted', async () => {
      await seedPost({
        slug: 'gone',
        isPublished: true,
        publishedAt: new Date(),
        deletedAt: new Date(),
      })
      const res = await request(app).get('/api/public/blog/gone')
      expect(res.status).toBe(404)
    })
    it('returns 404 for missing', async () => {
      const res = await request(app).get('/api/public/blog/nope')
      expect(res.status).toBe(404)
    })
  })
})
