import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { BlogPost } from '../entities/BlogPost.js'
import { EntityRevision } from '../entities/EntityRevision.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'

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

describe('Admin blog routes', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE blog_posts, entity_revisions, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  describe('POST /api/admin/blog', () => {
    it('creates a post with valid input', async () => {
      const res = await request(app).post('/api/admin/blog').set(authHeaders(auth)).send({
        slug: 'pervyj-post',
        title: 'Первый пост',
        excerpt: 'Анонс',
        rubric: 'Эксперименты',
      })
      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        slug: 'pervyj-post',
        title: 'Первый пост',
        excerpt: 'Анонс',
        rubric: 'Эксперименты',
        isPublished: false,
        publishedAt: null,
      })
      expect(res.body.data.id).toBeTruthy()
    })
    it('rejects invalid slug (400)', async () => {
      const res = await request(app).post('/api/admin/blog').set(authHeaders(auth)).send({
        slug: 'BAD SLUG!',
        title: 'T',
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
    it('rejects duplicate slug (409 slug_conflict)', async () => {
      await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'dup', title: 'A' })
      const res = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'dup', title: 'B' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('slug_conflict')
    })
    it('accepts valid translations and rejects unknown locale keys', async () => {
      const ok = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({
          slug: 'with-en',
          title: 'С переводом',
          translations: { en: { title: 'Translated', metaTitle: 'Meta' } },
        })
      expect(ok.status).toBe(201)
      expect(ok.body.data.translations).toEqual({
        en: { title: 'Translated', metaTitle: 'Meta' },
      })

      const bad = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({
          slug: 'with-de',
          title: 'X',
          translations: { de: { title: 'Nein' } },
        })
      expect(bad.status).toBe(400)
      expect(bad.body.error.code).toBe('validation_error')
    })
  })

  describe('GET /api/admin/blog', () => {
    it('lists posts including drafts', async () => {
      await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'a', title: 'A' })
      await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'b', title: 'B' })
      const res = await request(app).get('/api/admin/blog').set(authHeaders(auth))
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.pagination.total).toBe(2)
    })

    it('filters by q (matches title or slug, case-insensitive)', async () => {
      await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'o-nas', title: 'О нас' })
      await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'himiya-doma', title: 'Химия дома' })
      const bySlug = await request(app)
        .get('/api/admin/blog?q=HIMIYA')
        .set(authHeaders(auth))
      expect(bySlug.status).toBe(200)
      expect(bySlug.body.data).toHaveLength(1)
      expect(bySlug.body.data[0].slug).toBe('himiya-doma')
      const byTitle = await request(app)
        .get('/api/admin/blog?q=%D0%A5%D0%B8%D0%BC%D0%B8%D1%8F') // "Химия"
        .set(authHeaders(auth))
      expect(byTitle.body.data).toHaveLength(1)
      expect(byTitle.body.data[0].slug).toBe('himiya-doma')
      const none = await request(app).get('/api/admin/blog?q=missing').set(authHeaders(auth))
      expect(none.body.data).toHaveLength(0)
    })
  })

  describe('GET /api/admin/blog/:id', () => {
    it('returns by id', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 's', title: 'S' })
      const res = await request(app).get(`/api/admin/blog/${id}`).set(authHeaders(auth))
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(id)
    })
    it('404 for missing', async () => {
      const res = await request(app)
        .get('/api/admin/blog/00000000-0000-0000-0000-000000000000')
        .set(authHeaders(auth))
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/admin/blog/:id', () => {
    it('updates fields', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'u', title: 'Orig' })
      const res = await request(app)
        .patch(`/api/admin/blog/${id}`)
        .set(authHeaders(auth))
        .send({ title: 'Updated', rubric: 'Новости' })
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe('Updated')
      expect(res.body.data.rubric).toBe('Новости')
    })
    it('404 for missing', async () => {
      const res = await request(app)
        .patch('/api/admin/blog/00000000-0000-0000-0000-000000000000')
        .set(authHeaders(auth))
        .send({ title: 'X' })
      expect(res.status).toBe(404)
    })
  })

  describe('publish / unpublish', () => {
    it('publish sets published_at on first publish and keeps it afterwards', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 't', title: 'T' })

      const p1 = await request(app).post(`/api/admin/blog/${id}/publish`).set(authHeaders(auth))
      expect(p1.status).toBe(200)
      expect(p1.body.data.isPublished).toBe(true)
      expect(p1.body.data.publishedAt).toBeTruthy()
      const firstPublishedAt = p1.body.data.publishedAt

      const u = await request(app).post(`/api/admin/blog/${id}/unpublish`).set(authHeaders(auth))
      expect(u.status).toBe(200)
      expect(u.body.data.isPublished).toBe(false)
      // Unpublish keeps the original date — republishing must not bump it.
      expect(u.body.data.publishedAt).toBe(firstPublishedAt)

      const p2 = await request(app).post(`/api/admin/blog/${id}/publish`).set(authHeaders(auth))
      expect(p2.status).toBe(200)
      expect(p2.body.data.isPublished).toBe(true)
      expect(p2.body.data.publishedAt).toBe(firstPublishedAt)
    })
    it('published post becomes visible publicly', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'vidimyj', title: 'V' })
      const before = await request(app).get('/api/public/blog/vidimyj')
      expect(before.status).toBe(404)
      await request(app).post(`/api/admin/blog/${id}/publish`).set(authHeaders(auth))
      const after = await request(app).get('/api/public/blog/vidimyj')
      expect(after.status).toBe(200)
      expect(after.body.data.slug).toBe('vidimyj')
    })
    it('404 for missing id', async () => {
      const res = await request(app)
        .post('/api/admin/blog/00000000-0000-0000-0000-000000000000/publish')
        .set(authHeaders(auth))
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/admin/blog/:id', () => {
    it('soft-deletes and removes from both public and admin lists', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'gone', title: 'G' })
      await request(app).post(`/api/admin/blog/${id}/publish`).set(authHeaders(auth))
      const del = await request(app).delete(`/api/admin/blog/${id}`).set(authHeaders(auth))
      expect(del.status).toBe(204)
      const pub = await request(app).get('/api/public/blog/gone')
      expect(pub.status).toBe(404)
      const adm = await request(app).get('/api/admin/blog').set(authHeaders(auth))
      expect(adm.body.data).toHaveLength(0)
      // Soft delete: the row is still in the table with deleted_at set.
      const raw = await AppDataSource.query(
        'SELECT deleted_at FROM blog_posts WHERE id = $1',
        [id],
      )
      expect(raw).toHaveLength(1)
      expect(raw[0].deleted_at).toBeTruthy()
    })
    it('404 for missing', async () => {
      const del = await request(app)
        .delete('/api/admin/blog/00000000-0000-0000-0000-000000000000')
        .set(authHeaders(auth))
      expect(del.status).toBe(404)
    })
  })

  describe('revisions', () => {
    it('records a revision on create and update (entity_type=blog_post)', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'rev-b', title: 'Orig' })
      await request(app)
        .patch(`/api/admin/blog/${id}`)
        .set(authHeaders(auth))
        .send({ title: 'Updated' })

      const revs = await AppDataSource.getRepository(EntityRevision).find({
        where: { entityType: 'blog_post', entityId: id },
        order: { editedAt: 'ASC' },
      })
      expect(revs).toHaveLength(2)
      expect(revs[0].editedBy).toBeTruthy()
      expect(revs[0].snapshot).toMatchObject({ title: 'Orig' })
      // Second revision = prior state captured before the update.
      expect(revs[1].snapshot).toMatchObject({ title: 'Orig' })
    })

    it('restores a blog post to an older revision', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'rev-restore', title: 'Alpha' })
      await request(app)
        .patch(`/api/admin/blog/${id}`)
        .set(authHeaders(auth))
        .send({ title: 'Beta' })

      const revRepo = AppDataSource.getRepository(EntityRevision)
      const [firstRev] = await revRepo.find({
        where: { entityType: 'blog_post', entityId: id },
        order: { editedAt: 'ASC' },
      })
      const restoreRes = await request(app)
        .post(`/api/admin/revisions/${firstRev.id}/restore`)
        .set(authHeaders(auth))
      expect(restoreRes.status).toBe(200)
      expect(restoreRes.body.data).toEqual({ entityType: 'blog_post', entityId: id })

      const getRes = await request(app).get(`/api/admin/blog/${id}`).set(authHeaders(auth))
      expect(getRes.body.data.title).toBe('Alpha')
    })

    it('lists blog_post revisions via the revisions endpoint', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/blog')
        .set(authHeaders(auth))
        .send({ slug: 'rev-list', title: 'T' })
      const res = await request(app)
        .get(`/api/admin/revisions/entity/blog_post/${id}`)
        .set(authHeaders(auth))
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].editorEmail).toBe('admin@test.local')
    })
  })

  describe('auth', () => {
    it('requires auth (401 without cookie)', async () => {
      const res = await request(app).get('/api/admin/blog')
      expect(res.status).toBe(401)
    })
    it('requires CSRF on mutations (403 without X-CSRF-Token)', async () => {
      const res = await request(app)
        .post('/api/admin/blog')
        .set({ Cookie: `${auth.sessionCookie}; ${auth.csrfCookie}` })
        .send({ slug: 'x', title: 'X' })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('csrf_failed')
    })
  })
})
