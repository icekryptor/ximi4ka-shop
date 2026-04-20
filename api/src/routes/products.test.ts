import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
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
      'TRUNCATE products, product_images, product_category_links, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  describe('POST /api/admin/products', () => {
    it('creates a product with valid input', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
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
      const res = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
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
      await request(app)
        .post(`/api/admin/products/${id}/publish`)
        .set(authHeaders(auth))
        .send()
      const res = await request(app).get('/api/public/products')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].slug).toBe('hidden')
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
        await request(app)
          .post(`/api/admin/products/${id}/publish`)
          .set(authHeaders(auth))
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
      } = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'visible',
          name: 'V',
          priceRub: 100,
        })
      await request(app)
        .post(`/api/admin/products/${id}/publish`)
        .set(authHeaders(auth))
        .send()
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
      } = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
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

  describe('publish / unpublish', () => {
    it('publishes and unpublishes', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'toggle',
          name: 'T',
          priceRub: 100,
        })
      const p1 = await request(app)
        .post(`/api/admin/products/${id}/publish`)
        .set(authHeaders(auth))
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
      const res = await request(app)
        .get('/api/admin/products?q=юного')
        .set(authHeaders(auth))
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
      const res = await request(app)
        .get('/api/admin/products?q=sku-001')
        .set(authHeaders(auth))
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
      } = await request(app)
        .post('/api/admin/products')
        .set(authHeaders(auth))
        .send({
          slug: 'gone',
          name: 'G',
          priceRub: 100,
        })
      await request(app)
        .post(`/api/admin/products/${id}/publish`)
        .set(authHeaders(auth))
      const del = await request(app)
        .delete(`/api/admin/products/${id}`)
        .set(authHeaders(auth))
      expect(del.status).toBe(204)
      const pub = await request(app).get('/api/public/products')
      expect(pub.body.data).toHaveLength(0)
      const adm = await request(app)
        .get('/api/admin/products')
        .set(authHeaders(auth))
      expect(adm.body.data).toHaveLength(0)
    })
  })
})
