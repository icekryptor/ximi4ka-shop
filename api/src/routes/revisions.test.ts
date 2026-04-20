import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'
import { EntityRevision } from '../entities/EntityRevision.js'

// Truncating entity_revisions here too keeps assertions of exact row counts
// stable. Other test files truncate their own entity tables but leave
// revisions behind — harmless because tests always use fresh UUIDs.
async function truncateAll(): Promise<void> {
  await AppDataSource.query(
    'TRUNCATE entity_revisions, products, product_images, product_categories, product_category_links, pages, admin_sessions, admin_users RESTART IDENTITY CASCADE',
  )
}

describe('Revision routes', () => {
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
    await truncateAll()
    auth = await loginAsAdmin(app)
  })

  it('records a revision on product create', async () => {
    const {
      body: {
        data: { id },
      },
    } = await request(app)
      .post('/api/admin/products')
      .set(authHeaders(auth))
      .send({ slug: 'rev-p', name: 'Orig', priceRub: 100 })

    const revs = await AppDataSource.getRepository(EntityRevision).find({
      where: { entityType: 'product', entityId: id },
    })
    expect(revs).toHaveLength(1)
    expect(revs[0].editedBy).toBeTruthy()
    expect(revs[0].snapshot).toMatchObject({ name: 'Orig', priceRub: 100 })
  })

  it('records an additional revision on product update (prior state)', async () => {
    const {
      body: {
        data: { id },
      },
    } = await request(app)
      .post('/api/admin/products')
      .set(authHeaders(auth))
      .send({ slug: 'rev-u', name: 'Orig', priceRub: 100 })
    await request(app)
      .patch(`/api/admin/products/${id}`)
      .set(authHeaders(auth))
      .send({ name: 'Updated', priceRub: 200 })

    const revs = await AppDataSource.getRepository(EntityRevision).find({
      where: { entityType: 'product', entityId: id },
      order: { editedAt: 'ASC' },
    })
    expect(revs).toHaveLength(2)
    // first = create snapshot; second = prior state captured before update,
    // still showing the original name
    expect(revs[0].snapshot).toMatchObject({ name: 'Orig' })
    expect(revs[1].snapshot).toMatchObject({ name: 'Orig', priceRub: 100 })
  })

  it('restores a product to an older revision and captures current state first', async () => {
    const {
      body: {
        data: { id },
      },
    } = await request(app)
      .post('/api/admin/products')
      .set(authHeaders(auth))
      .send({ slug: 'rev-r', name: 'Alpha', priceRub: 100 })
    await request(app)
      .patch(`/api/admin/products/${id}`)
      .set(authHeaders(auth))
      .send({ name: 'Beta', priceRub: 222 })

    // Revisions so far: [create Alpha], [prior-state Alpha before update].
    const revRepo = AppDataSource.getRepository(EntityRevision)
    const before = await revRepo.find({
      where: { entityType: 'product', entityId: id },
      order: { editedAt: 'ASC' },
    })
    expect(before).toHaveLength(2)
    const firstRev = before[0]

    const restoreRes = await request(app)
      .post(`/api/admin/revisions/${firstRev.id}/restore`)
      .set(authHeaders(auth))
    expect(restoreRes.status).toBe(200)
    expect(restoreRes.body.data).toEqual({ entityType: 'product', entityId: id })

    // Product is now back to Alpha.
    const getRes = await request(app)
      .get(`/api/admin/products/${id}`)
      .set(authHeaders(auth))
    expect(getRes.body.data.name).toBe('Alpha')
    expect(getRes.body.data.priceRub).toBe(100)

    // Restore itself should have snapshotted the current (Beta) state,
    // so total revisions = 3.
    const after = await revRepo.find({
      where: { entityType: 'product', entityId: id },
      order: { editedAt: 'ASC' },
    })
    expect(after).toHaveLength(3)
    expect(after[2].snapshot).toMatchObject({ name: 'Beta', priceRub: 222 })
  })

  it('records revisions on page update', async () => {
    const {
      body: {
        data: { id },
      },
    } = await request(app)
      .post('/api/admin/pages')
      .set(authHeaders(auth))
      .send({ slug: 'rev-pg', title: 'Orig' })
    await request(app)
      .patch(`/api/admin/pages/${id}`)
      .set(authHeaders(auth))
      .send({ title: 'Updated' })

    const revs = await AppDataSource.getRepository(EntityRevision).find({
      where: { entityType: 'page', entityId: id },
    })
    expect(revs).toHaveLength(2)
  })

  it('records revisions on category update', async () => {
    const {
      body: {
        data: { id },
      },
    } = await request(app)
      .post('/api/admin/categories')
      .set(authHeaders(auth))
      .send({ slug: 'rev-c', name: 'Orig' })
    await request(app)
      .patch(`/api/admin/categories/${id}`)
      .set(authHeaders(auth))
      .send({ name: 'Updated' })

    const revs = await AppDataSource.getRepository(EntityRevision).find({
      where: { entityType: 'product_category', entityId: id },
    })
    expect(revs).toHaveLength(2)
  })

  it('lists revisions newest-first with editorEmail populated', async () => {
    const {
      body: {
        data: { id },
      },
    } = await request(app)
      .post('/api/admin/products')
      .set(authHeaders(auth))
      .send({ slug: 'rev-list', name: 'Orig', priceRub: 100 })
    await request(app)
      .patch(`/api/admin/products/${id}`)
      .set(authHeaders(auth))
      .send({ name: 'Second' })

    const res = await request(app)
      .get(`/api/admin/revisions/entity/product/${id}`)
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    // Newest first: we expect the 2 timestamps to be descending.
    const [a, b] = res.body.data as Array<{ editedAt: string; editorEmail: string | null }>
    expect(new Date(a.editedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(b.editedAt).getTime(),
    )
    expect(a.editorEmail).toBe('admin@test.local')
    expect(b.editorEmail).toBe('admin@test.local')
    expect(res.body.pagination).toEqual({ limit: 20, offset: 0, total: 2 })
  })

  it('returns 404 for restoring an unknown revision id', async () => {
    const res = await request(app)
      .post('/api/admin/revisions/00000000-0000-0000-0000-000000000000/restore')
      .set(authHeaders(auth))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('revision_not_found')
  })

  it('requires auth (401 without cookie)', async () => {
    const res = await request(app).get(
      '/api/admin/revisions/entity/product/00000000-0000-0000-0000-000000000000',
    )
    expect(res.status).toBe(401)
  })

  it('requires CSRF on mutations (403 without X-CSRF-Token)', async () => {
    const res = await request(app)
      .post('/api/admin/revisions/00000000-0000-0000-0000-000000000000/restore')
      .set({ Cookie: `${auth.sessionCookie}; ${auth.csrfCookie}` })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('csrf_failed')
  })
})
