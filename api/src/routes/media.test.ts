import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { access, readFile, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { AppDataSource } from '../config/dataSource.js'
import { Media } from '../entities/Media.js'
import { createApp } from '../app.js'
import { UPLOADS_DIR } from '../lib/storage/index.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'

// Generate a real JPEG buffer: sharp's metadata parse needs valid pixel data,
// so we synthesize a tiny 4x4 JPEG rather than hand-rolling bytes.
async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer()
}

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()
}

const YEAR = String(new Date().getUTCFullYear())
const YEAR_DIR = path.join(UPLOADS_DIR, YEAR)

describe('POST /api/admin/media/upload', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    await rm(YEAR_DIR, { recursive: true, force: true })
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE media, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  it('accepts a valid JPEG, returns url, writes file to disk', async () => {
    const buf = await makeJpeg()
    const res = await request(app)
      .post('/api/admin/media/upload')
      .set(authHeaders(auth))
      .attach('file', buf, { filename: 'hello.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      mimeType: 'image/jpeg',
      width: 4,
      height: 4,
    })
    expect(typeof res.body.data.url).toBe('string')
    expect(res.body.data.url.startsWith('/uploads/')).toBe(true)
    // Upload now persists a DB row and echoes its id.
    expect(typeof res.body.data.id).toBe('string')

    // Trim the leading "/uploads/" segment to derive the on-disk path.
    const rel = res.body.data.url.replace(/^\/uploads\//, '')
    const onDisk = await readFile(path.join(UPLOADS_DIR, rel))
    expect(onDisk.length).toBeGreaterThan(0)

    // And a matching Media row should exist.
    const row = await AppDataSource.getRepository(Media).findOneBy({
      id: res.body.data.id,
    })
    expect(row).not.toBeNull()
    expect(row?.url).toBe(res.body.data.url)
    expect(row?.filename).toBe(res.body.data.filename)
    expect(row?.mimeType).toBe('image/jpeg')
  })

  it('rejects without auth (401)', async () => {
    const buf = await makeJpeg()
    const res = await request(app)
      .post('/api/admin/media/upload')
      .attach('file', buf, { filename: 'x.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(401)
  })

  it('rejects without CSRF (403)', async () => {
    const buf = await makeJpeg()
    const res = await request(app)
      .post('/api/admin/media/upload')
      .set('Cookie', `${auth.sessionCookie}; ${auth.csrfCookie}`)
      // no X-CSRF-Token header
      .attach('file', buf, { filename: 'x.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('csrf_failed')
  })

  it('rejects text/plain with invalid_file_type', async () => {
    const res = await request(app)
      .post('/api/admin/media/upload')
      .set(authHeaders(auth))
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_file_type')
  })

  it('rejects oversized file (>10MB) with file_too_large', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0x00)
    const res = await request(app)
      .post('/api/admin/media/upload')
      .set(authHeaders(auth))
      .attach('file', big, {
        filename: 'huge.jpg',
        contentType: 'image/jpeg',
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('file_too_large')
  })

  it('slugifies Cyrillic filenames', async () => {
    const buf = await makePng()
    const res = await request(app)
      .post('/api/admin/media/upload')
      .set(authHeaders(auth))
      .attach('file', buf, {
        filename: 'Тестовая картинка.png',
        contentType: 'image/png',
      })
    expect(res.status).toBe(200)
    expect(res.body.data.url).toMatch(/testovaya-kartinka/)
  })

  it('appends a suffix on filename collision', async () => {
    const buf = await makeJpeg()
    const first = await request(app)
      .post('/api/admin/media/upload')
      .set(authHeaders(auth))
      .attach('file', buf, {
        filename: 'collide.jpg',
        contentType: 'image/jpeg',
      })
    const second = await request(app)
      .post('/api/admin/media/upload')
      .set(authHeaders(auth))
      .attach('file', buf, {
        filename: 'collide.jpg',
        contentType: 'image/jpeg',
      })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(first.body.data.url).not.toBe(second.body.data.url)
  })
})

// Helper: upload a small JPEG with the given filename, return response body.
async function uploadOne(
  app: ReturnType<typeof createApp>,
  auth: AdminAuth,
  filename: string,
  buf: Buffer,
  contentType = 'image/jpeg',
): Promise<{ id: string; url: string; filename: string }> {
  const res = await request(app)
    .post('/api/admin/media/upload')
    .set(authHeaders(auth))
    .attach('file', buf, { filename, contentType })
  if (res.status !== 200) {
    throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.data
}

describe('GET /api/admin/media', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    await rm(YEAR_DIR, { recursive: true, force: true })
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE media, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  it('returns uploads newest first with pagination envelope', async () => {
    const jpeg = await makeJpeg()
    const first = await uploadOne(app, auth, 'alpha.jpg', jpeg)
    // Small delay not needed — created_at is populated with now() at insert
    // time; TypeORM's save sets it before returning. Uploads are serialized.
    const second = await uploadOne(app, auth, 'beta.jpg', jpeg)

    const res = await request(app)
      .get('/api/admin/media')
      .set(authHeaders(auth))

    expect(res.status).toBe(200)
    expect(res.body.pagination).toEqual({ limit: 40, offset: 0, total: 2 })
    expect(res.body.data).toHaveLength(2)
    // Newest first — beta uploaded second should be index 0.
    expect(res.body.data[0].id).toBe(second.id)
    expect(res.body.data[1].id).toBe(first.id)
  })

  it('filters by filename substring via q', async () => {
    const jpeg = await makeJpeg()
    await uploadOne(app, auth, 'kitten.jpg', jpeg)
    await uploadOne(app, auth, 'puppy.jpg', jpeg)

    const res = await request(app)
      .get('/api/admin/media?q=kitten')
      .set(authHeaders(auth))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].filename).toMatch(/kitten/)
  })

  it('filters by mimePrefix', async () => {
    const jpeg = await makeJpeg()
    const png = await makePng()
    await uploadOne(app, auth, 'a.jpg', jpeg, 'image/jpeg')
    await uploadOne(app, auth, 'b.png', png, 'image/png')

    const res = await request(app)
      .get('/api/admin/media?mimePrefix=image/')
      .set(authHeaders(auth))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    // And a prefix that matches nothing returns empty.
    const none = await request(app)
      .get('/api/admin/media?mimePrefix=video/')
      .set(authHeaders(auth))
    expect(none.status).toBe(200)
    expect(none.body.data).toHaveLength(0)
    expect(none.body.pagination.total).toBe(0)
  })

  it('rejects without auth (401)', async () => {
    const res = await request(app).get('/api/admin/media')
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/admin/media/:id', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    await rm(YEAR_DIR, { recursive: true, force: true })
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE media, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  it('removes DB row and on-disk file, returns 204', async () => {
    const jpeg = await makeJpeg()
    const uploaded = await uploadOne(app, auth, 'todelete.jpg', jpeg)
    const rel = uploaded.url.replace(/^\/uploads\//, '')
    const onDiskPath = path.join(UPLOADS_DIR, rel)
    // Sanity: file exists before delete.
    await access(onDiskPath)

    const res = await request(app)
      .delete(`/api/admin/media/${uploaded.id}`)
      .set(authHeaders(auth))

    expect(res.status).toBe(204)
    const row = await AppDataSource.getRepository(Media).findOneBy({
      id: uploaded.id,
    })
    expect(row).toBeNull()
    await expect(access(onDiskPath)).rejects.toThrow()
  })

  it('returns 404 media_not_found for unknown id', async () => {
    const res = await request(app)
      .delete('/api/admin/media/00000000-0000-0000-0000-000000000000')
      .set(authHeaders(auth))

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('media_not_found')
  })

  it('still deletes DB row when on-disk file is already missing', async () => {
    const jpeg = await makeJpeg()
    const uploaded = await uploadOne(app, auth, 'orphan.jpg', jpeg)
    const rel = uploaded.url.replace(/^\/uploads\//, '')
    const onDiskPath = path.join(UPLOADS_DIR, rel)
    // Manually remove the file first to simulate a filesystem drift.
    await unlink(onDiskPath)

    const res = await request(app)
      .delete(`/api/admin/media/${uploaded.id}`)
      .set(authHeaders(auth))

    expect(res.status).toBe(204)
    const row = await AppDataSource.getRepository(Media).findOneBy({
      id: uploaded.id,
    })
    expect(row).toBeNull()
  })

  it('rejects without auth (401)', async () => {
    const res = await request(app).delete(
      '/api/admin/media/00000000-0000-0000-0000-000000000000',
    )
    expect(res.status).toBe(401)
  })
})
