import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Redirect } from '../entities/Redirect.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'

describe('Admin redirects CRUD', () => {
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
      'TRUNCATE redirects, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  it('creates, fetches, updates, and deletes a redirect', async () => {
    const create = await request(app)
      .post('/api/admin/redirects')
      .set(authHeaders(auth))
      .send({ fromPath: '/old', toPath: '/new', statusCode: 301 })
    expect(create.status).toBe(201)
    expect(create.body.data).toMatchObject({
      fromPath: '/old',
      toPath: '/new',
      statusCode: 301,
      hitCount: 0,
    })
    const id = create.body.data.id as string

    const get = await request(app)
      .get(`/api/admin/redirects/${id}`)
      .set(authHeaders(auth))
    expect(get.status).toBe(200)
    expect(get.body.data.fromPath).toBe('/old')

    const patch = await request(app)
      .patch(`/api/admin/redirects/${id}`)
      .set(authHeaders(auth))
      .send({ toPath: '/newer', statusCode: 302 })
    expect(patch.status).toBe(200)
    expect(patch.body.data.toPath).toBe('/newer')
    expect(patch.body.data.statusCode).toBe(302)

    const del = await request(app)
      .delete(`/api/admin/redirects/${id}`)
      .set(authHeaders(auth))
    expect(del.status).toBe(204)

    const gone = await request(app)
      .get(`/api/admin/redirects/${id}`)
      .set(authHeaders(auth))
    expect(gone.status).toBe(404)
  })

  it('returns 409 on duplicate from_path', async () => {
    await request(app)
      .post('/api/admin/redirects')
      .set(authHeaders(auth))
      .send({ fromPath: '/dup', toPath: '/a' })
      .expect(201)

    const dup = await request(app)
      .post('/api/admin/redirects')
      .set(authHeaders(auth))
      .send({ fromPath: '/dup', toPath: '/b' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('from_path_conflict')
  })

  it('rejects reserved prefixes in from_path', async () => {
    for (const p of ['/admin', '/admin/users', '/api/foo', '/uploads/x', '/_next/static']) {
      const res = await request(app)
        .post('/api/admin/redirects')
        .set(authHeaders(auth))
        .send({ fromPath: p, toPath: '/' })
      expect(res.status).toBe(400)
    }
  })

  it('rejects missing auth (401)', async () => {
    const res = await request(app)
      .post('/api/admin/redirects')
      .send({ fromPath: '/x', toPath: '/y' })
    expect(res.status).toBe(401)
  })

  it('rejects missing CSRF on mutation (403)', async () => {
    const res = await request(app)
      .post('/api/admin/redirects')
      .set('Cookie', `${auth.sessionCookie}; ${auth.csrfCookie}`)
      // no X-CSRF-Token header
      .send({ fromPath: '/x', toPath: '/y' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('csrf_failed')
  })

  it('returns 404 for unknown id on PATCH and DELETE', async () => {
    const notExist = '00000000-0000-0000-0000-000000000000'
    const patch = await request(app)
      .patch(`/api/admin/redirects/${notExist}`)
      .set(authHeaders(auth))
      .send({ toPath: '/x' })
    expect(patch.status).toBe(404)

    const del = await request(app)
      .delete(`/api/admin/redirects/${notExist}`)
      .set(authHeaders(auth))
    expect(del.status).toBe(404)
  })
})

describe('Admin redirects list', () => {
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
      'TRUNCATE redirects, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)

    // Seed three redirects with distinct hit counts.
    const repo = AppDataSource.getRepository(Redirect)
    await repo.save([
      repo.create({ fromPath: '/a', toPath: '/x', statusCode: 301, hitCount: 5 }),
      repo.create({ fromPath: '/b', toPath: '/y', statusCode: 301, hitCount: 10 }),
      repo.create({ fromPath: '/c', toPath: '/z', statusCode: 302, hitCount: 2 }),
    ])
  })

  it('sorts by hit_count DESC by default', async () => {
    const res = await request(app)
      .get('/api/admin/redirects')
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data.map((r: { fromPath: string }) => r.fromPath)).toEqual([
      '/b',
      '/a',
      '/c',
    ])
  })

  it('sorts by hit_count ASC', async () => {
    const res = await request(app)
      .get('/api/admin/redirects?sort=hits_asc')
      .set(authHeaders(auth))
    expect(res.body.data.map((r: { fromPath: string }) => r.fromPath)).toEqual([
      '/c',
      '/a',
      '/b',
    ])
  })

  it('sorts by from_path ASC', async () => {
    const res = await request(app)
      .get('/api/admin/redirects?sort=from_asc')
      .set(authHeaders(auth))
    expect(res.body.data.map((r: { fromPath: string }) => r.fromPath)).toEqual([
      '/a',
      '/b',
      '/c',
    ])
  })

  it('filters by q on from_path or to_path', async () => {
    const byFrom = await request(app)
      .get('/api/admin/redirects?q=%2Fa')
      .set(authHeaders(auth))
    expect(byFrom.body.data).toHaveLength(1)
    expect(byFrom.body.data[0].fromPath).toBe('/a')

    const byTo = await request(app)
      .get('/api/admin/redirects?q=%2Fy')
      .set(authHeaders(auth))
    expect(byTo.body.data).toHaveLength(1)
    expect(byTo.body.data[0].toPath).toBe('/y')
  })
})

describe('Admin redirects CSV import', () => {
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
      'TRUNCATE redirects, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  it('imports a valid CSV with header, inserting rows', async () => {
    const csv = [
      'from_path,to_path,status_code',
      '/a,/x,301',
      '/b,/y,302',
      '/c,/z',
    ].join('\n')
    const res = await request(app)
      .post('/api/admin/redirects/import-csv')
      .set(authHeaders(auth))
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'redirects.csv',
        contentType: 'text/csv',
      })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      inserted: 3,
      updated: 0,
      skipped: 0,
    })
    expect(res.body.data.errors).toHaveLength(0)

    const rows = await AppDataSource.getRepository(Redirect).find({
      order: { fromPath: 'ASC' },
    })
    expect(rows).toHaveLength(3)
    expect(rows[2]).toMatchObject({ fromPath: '/c', toPath: '/z', statusCode: 301 })
  })

  it('collects per-row errors but imports valid rows', async () => {
    const csv = [
      'from_path,to_path,status_code',
      '/good,/x,301',
      // missing to_path
      '/bad,,301',
      // invalid status_code
      '/worse,/y,999',
      // reserved prefix
      '/admin/panel,/y,301',
    ].join('\n')
    const res = await request(app)
      .post('/api/admin/redirects/import-csv')
      .set(authHeaders(auth))
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'redirects.csv',
        contentType: 'text/csv',
      })
    expect(res.status).toBe(200)
    expect(res.body.data.inserted).toBe(1)
    expect(res.body.data.skipped).toBe(3)
    expect(res.body.data.errors).toHaveLength(3)
  })

  it('upserts: existing from_path is updated, new rows inserted, hit_count preserved', async () => {
    const repo = AppDataSource.getRepository(Redirect)
    // Seed an existing redirect with some hit count.
    await repo.save(
      repo.create({
        fromPath: '/existing',
        toPath: '/old-target',
        statusCode: 301,
        hitCount: 42,
      }),
    )
    const csv = [
      'from_path,to_path,status_code',
      '/existing,/new-target,302',
      '/new1,/x,301',
      '/new2,/y,301',
    ].join('\n')
    const res = await request(app)
      .post('/api/admin/redirects/import-csv')
      .set(authHeaders(auth))
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'r.csv',
        contentType: 'text/csv',
      })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ inserted: 2, updated: 1, skipped: 0 })

    const updated = await repo.findOneBy({ fromPath: '/existing' })
    expect(updated?.toPath).toBe('/new-target')
    expect(updated?.statusCode).toBe(302)
    // The critical invariant: hit_count is preserved across re-import.
    expect(updated?.hitCount).toBe(42)
  })

  it('rejects an empty CSV with 400', async () => {
    const res = await request(app)
      .post('/api/admin/redirects/import-csv')
      .set(authHeaders(auth))
      .attach('file', Buffer.from('', 'utf8'), {
        filename: 'empty.csv',
        contentType: 'text/csv',
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('empty_csv')
  })

  it('rejects CSV import without auth', async () => {
    const csv = '/a,/b,301'
    const res = await request(app)
      .post('/api/admin/redirects/import-csv')
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'r.csv',
        contentType: 'text/csv',
      })
    expect(res.status).toBe(401)
  })
})

describe('Public redirects routes', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE redirects RESTART IDENTITY CASCADE')
  })

  it('lists all redirects with Cache-Control public, max-age=60', async () => {
    const repo = AppDataSource.getRepository(Redirect)
    await repo.save([
      repo.create({ fromPath: '/a', toPath: '/x', statusCode: 301, hitCount: 0 }),
      repo.create({ fromPath: '/b', toPath: '/y', statusCode: 302, hitCount: 0 }),
    ])
    const res = await request(app).get('/api/public/redirects')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=60')
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      fromPath: '/a',
      toPath: '/x',
      statusCode: 301,
    })
    // Response shape intentionally doesn't leak hit_count — it's admin-only.
    expect(res.body.data[0]).not.toHaveProperty('hitCount')
  })

  it('hit endpoint increments hit_count and returns 204', async () => {
    const repo = AppDataSource.getRepository(Redirect)
    const saved = await repo.save(
      repo.create({ fromPath: '/a', toPath: '/x', statusCode: 301, hitCount: 0 }),
    )

    const first = await request(app).post(`/api/public/redirects/${saved.id}/hit`)
    expect(first.status).toBe(204)
    const second = await request(app).post(`/api/public/redirects/${saved.id}/hit`)
    expect(second.status).toBe(204)

    const after = await repo.findOneByOrFail({ id: saved.id })
    expect(after.hitCount).toBe(2)
  })

  it('hit endpoint on unknown id still returns 204 (fire-and-forget)', async () => {
    const res = await request(app).post(
      '/api/public/redirects/00000000-0000-0000-0000-000000000000/hit',
    )
    expect(res.status).toBe(204)
  })
})
