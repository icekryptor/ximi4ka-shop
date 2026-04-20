import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { AppDataSource } from '../config/dataSource.js'
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
      'TRUNCATE admin_sessions, admin_users RESTART IDENTITY CASCADE',
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

    // Trim the leading "/uploads/" segment to derive the on-disk path.
    const rel = res.body.data.url.replace(/^\/uploads\//, '')
    const onDisk = await readFile(path.join(UPLOADS_DIR, rel))
    expect(onDisk.length).toBeGreaterThan(0)
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
