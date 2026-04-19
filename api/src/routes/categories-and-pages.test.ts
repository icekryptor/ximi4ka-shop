import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'

describe('Category routes', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE products, product_images, product_categories, product_category_links, pages RESTART IDENTITY CASCADE',
    )
  })

  describe('POST /api/admin/categories', () => {
    it('creates a category with valid input', async () => {
      const res = await request(app).post('/api/admin/categories').send({
        slug: 'kits',
        name: 'Kits',
      })
      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({ slug: 'kits', name: 'Kits' })
      expect(res.body.data.id).toBeTruthy()
    })
    it('rejects invalid slug (400 validation_error)', async () => {
      const res = await request(app).post('/api/admin/categories').send({
        slug: 'Not Valid!',
        name: 'X',
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
    it('rejects duplicate slug (409 slug_conflict)', async () => {
      await request(app).post('/api/admin/categories').send({ slug: 'dup', name: 'A' })
      const res = await request(app)
        .post('/api/admin/categories')
        .send({ slug: 'dup', name: 'B' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('slug_conflict')
    })
  })

  describe('GET /api/admin/categories', () => {
    it('lists all categories', async () => {
      await request(app).post('/api/admin/categories').send({ slug: 'a', name: 'A' })
      await request(app).post('/api/admin/categories').send({ slug: 'b', name: 'B' })
      const res = await request(app).get('/api/admin/categories')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.pagination.total).toBe(2)
    })
  })

  describe('GET /api/public/categories', () => {
    it('returns all categories (flat)', async () => {
      await request(app).post('/api/admin/categories').send({ slug: 'a', name: 'A' })
      await request(app).post('/api/admin/categories').send({ slug: 'b', name: 'B' })
      const res = await request(app).get('/api/public/categories')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
    })
  })

  describe('GET /api/public/categories/:slug', () => {
    it('returns a category by slug', async () => {
      await request(app).post('/api/admin/categories').send({ slug: 'chemistry', name: 'Chem' })
      const res = await request(app).get('/api/public/categories/chemistry')
      expect(res.status).toBe(200)
      expect(res.body.data.slug).toBe('chemistry')
    })
    it('returns 404 for missing', async () => {
      const res = await request(app).get('/api/public/categories/nope')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('category_not_found')
    })
  })

  describe('GET /api/public/categories/:slug/products', () => {
    it('returns products linked to the category', async () => {
      const cat = await request(app)
        .post('/api/admin/categories')
        .send({ slug: 'kits', name: 'Kits' })
      const p1 = await request(app)
        .post('/api/admin/products')
        .send({ slug: 'kit-one', name: 'Kit One', priceRub: 100 })
      const p2 = await request(app)
        .post('/api/admin/products')
        .send({ slug: 'kit-two', name: 'Kit Two', priceRub: 200 })
      await request(app).post(`/api/admin/products/${p1.body.data.id}/publish`)
      await request(app).post(`/api/admin/products/${p2.body.data.id}/publish`)
      await AppDataSource.query(
        'INSERT INTO product_category_links (category_id, product_id) VALUES ($1, $2), ($1, $3)',
        [cat.body.data.id, p1.body.data.id, p2.body.data.id],
      )
      const res = await request(app).get('/api/public/categories/kits/products')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      const slugs = res.body.data.map((p: { slug: string }) => p.slug).sort()
      expect(slugs).toEqual(['kit-one', 'kit-two'])
      expect(res.body.pagination).toMatchObject({ limit: 20, offset: 0, total: 2 })
    })
    it('returns empty data when category has no products', async () => {
      await request(app)
        .post('/api/admin/categories')
        .send({ slug: 'empty', name: 'Empty' })
      const res = await request(app).get('/api/public/categories/empty/products')
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
      expect(res.body.pagination).toMatchObject({ limit: 20, offset: 0, total: 0 })
    })
    it('returns 404 when category does not exist', async () => {
      const res = await request(app).get('/api/public/categories/missing/products')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('category_not_found')
    })
    it('excludes unpublished products', async () => {
      const cat = await request(app)
        .post('/api/admin/categories')
        .send({ slug: 'mix', name: 'Mix' })
      const pub = await request(app)
        .post('/api/admin/products')
        .send({ slug: 'published', name: 'Pub', priceRub: 100 })
      const unpub = await request(app)
        .post('/api/admin/products')
        .send({ slug: 'unpublished', name: 'Unpub', priceRub: 100 })
      await request(app).post(`/api/admin/products/${pub.body.data.id}/publish`)
      await AppDataSource.query(
        'INSERT INTO product_category_links (category_id, product_id) VALUES ($1, $2), ($1, $3)',
        [cat.body.data.id, pub.body.data.id, unpub.body.data.id],
      )
      const res = await request(app).get('/api/public/categories/mix/products')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].slug).toBe('published')
    })
  })

  describe('GET /api/admin/categories/:id', () => {
    it('returns by id', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/categories').send({ slug: 's', name: 'S' })
      const res = await request(app).get(`/api/admin/categories/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(id)
    })
    it('404 for missing id', async () => {
      const res = await request(app).get(
        '/api/admin/categories/00000000-0000-0000-0000-000000000000',
      )
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/admin/categories/:id', () => {
    it('updates fields', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/categories').send({ slug: 'u', name: 'Orig' })
      const res = await request(app)
        .patch(`/api/admin/categories/${id}`)
        .send({ name: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Updated')
    })
    it('404 for missing id', async () => {
      const res = await request(app)
        .patch('/api/admin/categories/00000000-0000-0000-0000-000000000000')
        .send({ name: 'X' })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/admin/categories/:id', () => {
    it('hard-deletes when no products linked', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/categories').send({ slug: 'gone', name: 'G' })
      const del = await request(app).delete(`/api/admin/categories/${id}`)
      expect(del.status).toBe(204)
      const list = await request(app).get('/api/admin/categories')
      expect(list.body.data).toHaveLength(0)
    })
    it('blocks delete if category has linked products', async () => {
      const cat = await request(app)
        .post('/api/admin/categories')
        .send({ slug: 'c', name: 'C' })
      const prod = await request(app)
        .post('/api/admin/products')
        .send({ slug: 'p', name: 'P', priceRub: 100 })
      await AppDataSource.query(
        'INSERT INTO product_category_links (category_id, product_id) VALUES ($1, $2)',
        [cat.body.data.id, prod.body.data.id],
      )
      const del = await request(app).delete(`/api/admin/categories/${cat.body.data.id}`)
      expect(del.status).toBe(409)
      expect(del.body.error.code).toBe('category_has_products')
    })
    it('404 for missing id', async () => {
      const del = await request(app).delete(
        '/api/admin/categories/00000000-0000-0000-0000-000000000000',
      )
      expect(del.status).toBe(404)
    })
  })
})

describe('Page routes', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE products, product_images, product_categories, product_category_links, pages RESTART IDENTITY CASCADE',
    )
  })

  describe('POST /api/admin/pages', () => {
    it('creates a page with valid input', async () => {
      const res = await request(app).post('/api/admin/pages').send({
        slug: 'home',
        title: 'Home',
      })
      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        slug: 'home',
        title: 'Home',
        isPublished: false,
      })
    })
    it('rejects invalid slug (400)', async () => {
      const res = await request(app).post('/api/admin/pages').send({
        slug: 'BAD SLUG!',
        title: 'T',
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })
    it('rejects duplicate slug (409 slug_conflict)', async () => {
      await request(app).post('/api/admin/pages').send({ slug: 'dup', title: 'A' })
      const res = await request(app).post('/api/admin/pages').send({ slug: 'dup', title: 'B' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('slug_conflict')
    })
  })

  describe('GET /api/admin/pages', () => {
    it('lists pages', async () => {
      await request(app).post('/api/admin/pages').send({ slug: 'a', title: 'A' })
      await request(app).post('/api/admin/pages').send({ slug: 'b', title: 'B' })
      const res = await request(app).get('/api/admin/pages')
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.pagination.total).toBe(2)
    })
  })

  describe('GET /api/admin/pages/:id', () => {
    it('returns by id', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/pages').send({ slug: 's', title: 'S' })
      const res = await request(app).get(`/api/admin/pages/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(id)
    })
    it('404 for missing', async () => {
      const res = await request(app).get(
        '/api/admin/pages/00000000-0000-0000-0000-000000000000',
      )
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/public/pages/:slug', () => {
    it('returns a published page', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/pages').send({ slug: 'home', title: 'H' })
      await request(app).post(`/api/admin/pages/${id}/publish`).send()
      const res = await request(app).get('/api/public/pages/home')
      expect(res.status).toBe(200)
      expect(res.body.data.slug).toBe('home')
    })
    it('returns 404 for unpublished', async () => {
      await request(app).post('/api/admin/pages').send({ slug: 'private', title: 'P' })
      const res = await request(app).get('/api/public/pages/private')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('page_not_found')
    })
    it('returns 404 for missing', async () => {
      const res = await request(app).get('/api/public/pages/nope')
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/admin/pages/:id', () => {
    it('updates fields', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/pages').send({ slug: 'u', title: 'Orig' })
      const res = await request(app)
        .patch(`/api/admin/pages/${id}`)
        .send({ title: 'Updated' })
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe('Updated')
    })
    it('404 for missing', async () => {
      const res = await request(app)
        .patch('/api/admin/pages/00000000-0000-0000-0000-000000000000')
        .send({ title: 'X' })
      expect(res.status).toBe(404)
    })
  })

  describe('publish / unpublish', () => {
    it('publishes and unpublishes', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/pages').send({ slug: 't', title: 'T' })
      const p1 = await request(app).post(`/api/admin/pages/${id}/publish`)
      expect(p1.status).toBe(200)
      expect(p1.body.data.isPublished).toBe(true)
      const p2 = await request(app).post(`/api/admin/pages/${id}/unpublish`)
      expect(p2.status).toBe(200)
      expect(p2.body.data.isPublished).toBe(false)
    })
  })

  describe('DELETE /api/admin/pages/:id', () => {
    it('soft-deletes and removes from both public and admin lists', async () => {
      const {
        body: {
          data: { id },
        },
      } = await request(app).post('/api/admin/pages').send({ slug: 'gone', title: 'G' })
      await request(app).post(`/api/admin/pages/${id}/publish`)
      const del = await request(app).delete(`/api/admin/pages/${id}`)
      expect(del.status).toBe(204)
      const pub = await request(app).get('/api/public/pages/gone')
      expect(pub.status).toBe(404)
      const adm = await request(app).get('/api/admin/pages')
      expect(adm.body.data).toHaveLength(0)
    })
    it('404 for missing', async () => {
      const del = await request(app).delete(
        '/api/admin/pages/00000000-0000-0000-0000-000000000000',
      )
      expect(del.status).toBe(404)
    })
  })
})
