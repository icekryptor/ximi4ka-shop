import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { EntityRevision } from '../entities/EntityRevision.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'

describe('Product routes', () => {
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
      'TRUNCATE products, product_images, product_categories, product_category_links, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  describe('POST /api/admin/products', () => {
    it('creates a product with valid input', async () => {
      const res = await request(app).post('/api/admin/products').set(authHeaders(auth)).send({
        slug: 'test-kit',
        name: 'Test Kit',
        priceRub: 1500,
      })
      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        slug: 'test-kit',
        name: 'Test Kit',
        priceRub: 1500,
        isPublished: false,
      })
      expect(res.body.data.id).toBeTruthy()
    })
    it('rejects invalid slug (400 validation_error)', async () => {
      const res = await request(app).post('/api/admin/products').set(authHeaders(auth)).send({
        slug: 'Invalid Slug!',
        name: 'X',
        priceRub: 100,
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
    it('rejects duplicate slug (409 slug_conflict)', async () => {
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'dup', name: 'A', priceRub: 100 })
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'dup', name: 'B', priceRub: 200 })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('slug_conflict')
    })
  })

  describe('GET /api/public/products', () => {
    it('returns only published products', async () => {
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'pub', name: 'P', priceRub: 100 })
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'hidden', name: 'H', priceRub: 200 })
      await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth)).send()
      const res = await request(app).get('/api/public/products')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].slug).toBe('hidden')
    })
    it('returns categoryIds when include=categories is passed', async () => {
      // Create two categories and a published product linked to both.
      const catA = await request(app)
        .post('/api/admin/categories')
        .set(authHeaders(auth))
        .send({ slug: 'cat-a', name: 'A' })
      const catB = await request(app)
        .post('/api/admin/categories')
        .set(authHeaders(auth))
        .send({ slug: 'cat-b', name: 'B' })
      expect(catA.status).toBe(201)
      expect(catB.status).toBe(201)

      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'linked', name: 'L', priceRub: 100 })

      // The admin uses the categories PATCH endpoint to set links; but
      // since this test doesn't care about the HTTP surface we write the
      // join row directly.
      await AppDataSource.query(
        `INSERT INTO product_category_links (category_id, product_id) VALUES ($1, $2), ($3, $2)`,
        [catA.body.data.id, id, catB.body.data.id],
      )
      await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth)).send()

      const withInclude = await request(app).get('/api/public/products?include=categories')
      expect(withInclude.status).toBe(200)
      expect(withInclude.body.data[0]).toHaveProperty('categoryIds')
      expect(withInclude.body.data[0].categoryIds).toEqual(
        expect.arrayContaining([catA.body.data.id, catB.body.data.id]),
      )

      // Without the flag, response stays backwards-compatible.
      const noInclude = await request(app).get('/api/public/products')
      expect(noInclude.status).toBe(200)
      expect(noInclude.body.data[0]).not.toHaveProperty('categoryIds')
    })

    it('paginates with limit and offset', async () => {
      for (let i = 0; i < 25; i++) {
        const {
          body: {
            data: { id },
          },
        } = await request(app)
          .post('/api/admin/products')
          .set(authHeaders(auth))
          .send({
            slug: `p-${i}`,
            name: `P${i}`,
            priceRub: 100,
          })
        await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth))
      }
      const res = await request(app).get('/api/public/products?limit=10&offset=5')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(10)
      expect(res.body.pagination).toEqual({ limit: 10, offset: 5, total: 25 })
    })
  })

  describe('GET /api/public/products/:slug', () => {
    it('returns a published product', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/products').set(authHeaders(auth)).send({
        slug: 'visible',
        name: 'V',
        priceRub: 100,
      })
      await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth)).send()
      const res = await request(app).get('/api/public/products/visible')
      expect(res.status).toBe(200)
      expect(res.body.data.slug).toBe('visible')
    })
    it('returns 404 for unpublished', async () => {
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'private', name: 'X', priceRub: 100 })
      const res = await request(app).get('/api/public/products/private')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('product_not_found')
    })
    it('returns 404 for missing', async () => {
      const res = await request(app).get('/api/public/products/nope')
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/admin/products/:id', () => {
    it('updates fields', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/products').set(authHeaders(auth)).send({
        slug: 'upd',
        name: 'Orig',
        priceRub: 100,
      })
      const res = await request(app)
        .patch(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
        .send({ name: 'Updated', priceRub: 200 })
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Updated')
      expect(res.body.data.priceRub).toBe(200)
      expect(res.body.data.slug).toBe('upd')
    })
    it('returns 404 for missing id', async () => {
      const res = await request(app)
        .patch('/api/admin/products/00000000-0000-0000-0000-000000000000')
        .set(authHeaders(auth))
        .send({ name: 'X' })
      expect(res.status).toBe(404)
    })
  })

  describe('shipping fields', () => {
    it('stores weight and boxes on create and returns them from GET /:id', async () => {
      const created = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'ship',
          name: 'Ship',
          priceRub: 100,
          weightG: 250,
          shipBoxes: ['medium', 'small'],
          looseUnits: 3,
          minBox: 'medium',
        })
      expect(created.status).toBe(201)
      expect(created.body.data).toMatchObject({
        weightG: 250,
        shipBoxes: ['medium', 'small'],
        looseUnits: 3,
        minBox: 'medium',
      })
      const got = await request(app)
        .get(`/api/admin/products/${created.body.data.id}`)
        .set(authHeaders(auth))
      expect(got.body.data).toMatchObject({ weightG: 250, minBox: 'medium', looseUnits: 3 })
    })

    it('clears weight and minBox with null on PATCH', async () => {
      const created = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'ship2', name: 'S', priceRub: 100, weightG: 250, minBox: 'large' })
      const res = await request(app)
        .patch(`/api/admin/products/${created.body.data.id}`)
        .set(authHeaders(auth))
        .send({ weightG: null, minBox: null })
      expect(res.status).toBe(200)
      expect(res.body.data.weightG).toBeNull()
      expect(res.body.data.minBox).toBeNull()
    })

    it('rejects an unknown box', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'ship3', name: 'S', priceRub: 100, shipBoxes: ['huge'] })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
  })

  describe('category assignment', () => {
    async function makeCategory(slug: string): Promise<string> {
      const res = await request(app)
        .post('/api/admin/categories')
        .set(authHeaders(auth))
        .send({ slug, name: slug })
      expect(res.status).toBe(201)
      return res.body.data.id as string
    }

    async function linkedCategoryIds(productId: string): Promise<string[]> {
      const rows: Array<{ category_id: string }> = await AppDataSource.query(
        'SELECT category_id FROM product_category_links WHERE product_id = $1',
        [productId],
      )
      return rows.map((r) => r.category_id).sort()
    }

    it('links categories on create and returns categoryIds', async () => {
      const a = await makeCategory('cat-a')
      const b = await makeCategory('cat-b')
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'with-cats', name: 'W', priceRub: 100, categoryIds: [a, b] })
      expect(res.status).toBe(201)
      expect([...res.body.data.categoryIds].sort()).toEqual([a, b].sort())
      expect(res.body.data).not.toHaveProperty('categories')
      expect(await linkedCategoryIds(res.body.data.id)).toEqual([a, b].sort())
    })

    it('returns categoryIds from GET /:id and an empty list when there are none', async () => {
      const a = await makeCategory('cat-a')
      const withCat = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p1', name: 'P1', priceRub: 100, categoryIds: [a] })
      const bare = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p2', name: 'P2', priceRub: 100 })
      const got1 = await request(app)
        .get(`/api/admin/products/${withCat.body.data.id}`)
        .set(authHeaders(auth))
      const got2 = await request(app)
        .get(`/api/admin/products/${bare.body.data.id}`)
        .set(authHeaders(auth))
      expect(got1.body.data.categoryIds).toEqual([a])
      expect(got2.body.data.categoryIds).toEqual([])
    })

    it('replaces links on PATCH, keeps them when categoryIds is omitted, clears with []', async () => {
      const a = await makeCategory('cat-a')
      const b = await makeCategory('cat-b')
      const created = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p', name: 'P', priceRub: 100, categoryIds: [a] })
      const id = created.body.data.id as string

      const replaced = await request(app)
        .patch(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
        .send({ categoryIds: [b] })
      expect(replaced.status).toBe(200)
      expect(replaced.body.data.categoryIds).toEqual([b])
      expect(await linkedCategoryIds(id)).toEqual([b])

      const untouched = await request(app)
        .patch(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
        .send({ name: 'Renamed' })
      expect(untouched.body.data.categoryIds).toEqual([b])
      expect(await linkedCategoryIds(id)).toEqual([b])

      const cleared = await request(app)
        .patch(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
        .send({ categoryIds: [] })
      expect(cleared.body.data.categoryIds).toEqual([])
      expect(await linkedCategoryIds(id)).toEqual([])
    })

    it('rejects an unknown category id and leaves the product unchanged', async () => {
      const a = await makeCategory('cat-a')
      const created = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p', name: 'P', priceRub: 100, categoryIds: [a] })
      const id = created.body.data.id as string
      const res = await request(app)
        .patch(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
        .send({ name: 'Should not apply', categoryIds: ['00000000-0000-4000-8000-000000000000'] })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('unknown_category')
      const got = await request(app).get(`/api/admin/products/${id}`).set(authHeaders(auth))
      expect(got.body.data.name).toBe('P')
      expect(got.body.data.categoryIds).toEqual([a])

      const onCreate = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'p-new',
          name: 'N',
          priceRub: 100,
          categoryIds: ['00000000-0000-4000-8000-000000000000'],
        })
      expect(onCreate.status).toBe(400)
      const list = await request(app).get('/api/admin/products?q=p-new').set(authHeaders(auth))
      expect(list.body.data).toHaveLength(0)
    })

    it('keeps categoryIds in publish and unpublish responses', async () => {
      const a = await makeCategory('cat-a')
      const created = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p', name: 'P', priceRub: 100, categoryIds: [a] })
      const id = created.body.data.id as string
      const pub = await request(app)
        .post(`/api/admin/products/${id}/publish`)
        .set(authHeaders(auth))
      expect(pub.body.data.categoryIds).toEqual([a])
      expect(pub.body.data).not.toHaveProperty('categories')
      const unpub = await request(app)
        .post(`/api/admin/products/${id}/unpublish`)
        .set(authHeaders(auth))
      expect(unpub.body.data.categoryIds).toEqual([a])
      expect(await linkedCategoryIds(id)).toEqual([a])
    })

    it('rejects a non-uuid category id', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p', name: 'P', priceRub: 100, categoryIds: ['not-a-uuid'] })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })

    it('restores category links from a revision', async () => {
      const a = await makeCategory('cat-a')
      const b = await makeCategory('cat-b')
      const created = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'p', name: 'P', priceRub: 100, categoryIds: [a] })
      const id = created.body.data.id as string
      await request(app)
        .patch(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
        .send({ categoryIds: [b] })
      // The t=0 revision written on create holds the state with [a].
      const revs = await AppDataSource.getRepository(EntityRevision).find({
        where: { entityType: 'product', entityId: id },
        order: { editedAt: 'ASC' },
      })
      const restore = await request(app)
        .post(`/api/admin/revisions/${revs[0].id}/restore`)
        .set(authHeaders(auth))
      expect(restore.status).toBe(200)
      expect(await linkedCategoryIds(id)).toEqual([a])
    })
  })

  describe('publish / unpublish', () => {
    it('publishes and unpublishes', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/products').set(authHeaders(auth)).send({
        slug: 'toggle',
        name: 'T',
        priceRub: 100,
      })
      const p1 = await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth))
      expect(p1.status).toBe(200)
      expect(p1.body.data.isPublished).toBe(true)
      const p2 = await request(app)
        .post(`/api/admin/products/${id}/unpublish`)
        .set(authHeaders(auth))
      expect(p2.status).toBe(200)
      expect(p2.body.data.isPublished).toBe(false)
    })
  })

  describe('GET /api/admin/products?q=', () => {
    it('matches by name case-insensitively', async () => {
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'a', name: 'Набор Юного Химика', priceRub: 100 })
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'b', name: 'Что-то другое', priceRub: 200 })
      const res = await request(app).get('/api/admin/products?q=юного').set(authHeaders(auth))
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].slug).toBe('a')
    })
    it('matches by sku', async () => {
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'c', name: 'Thing', sku: 'SKU-001', priceRub: 100 })
      await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({ slug: 'd', name: 'Other', sku: 'OTHER-999', priceRub: 100 })
      const res = await request(app).get('/api/admin/products?q=sku-001').set(authHeaders(auth))
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].slug).toBe('c')
    })
  })

  describe('DELETE /api/admin/products/:id', () => {
    it('soft-deletes and removes from both public and admin lists', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/products').set(authHeaders(auth)).send({
        slug: 'gone',
        name: 'G',
        priceRub: 100,
      })
      await request(app).post(`/api/admin/products/${id}/publish`).set(authHeaders(auth))
      const del = await request(app).delete(`/api/admin/products/${id}`).set(authHeaders(auth))
      expect(del.status).toBe(204)
      const pub = await request(app).get('/api/public/products')
      expect(pub.body.data).toHaveLength(0)
      const adm = await request(app).get('/api/admin/products').set(authHeaders(auth))
      expect(adm.body.data).toHaveLength(0)
    })
  })

  describe('translations validation', () => {
    it('accepts a well-formed translations blob for a non-default locale', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'kit-tr',
          name: 'Набор',
          priceRub: 1000,
          translations: {
            en: {
              name: 'Kit',
              metaTitle: 'Kit | Ximi4ka',
              metaDescription: 'A kit.',
            },
          },
        })
      expect(res.status).toBe(201)
      expect(res.body.data.translations.en.name).toBe('Kit')
    })

    it('rejects translations with an unsupported locale key', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'kit-bad-loc',
          name: 'Набор',
          priceRub: 1000,
          translations: { fr: { name: 'Kit' } },
        })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })

    it('rejects translations with wrong field types', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'kit-bad-type',
          name: 'Набор',
          priceRub: 1000,
          // `name` must be a string; passing a number should fail validation.
          translations: { en: { name: 123 } },
        })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
  })
})
