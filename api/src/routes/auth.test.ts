import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import argon2 from 'argon2'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { AdminUser } from '../entities/AdminUser.js'
import { AdminSession } from '../entities/AdminSession.js'
import { hashSessionToken } from './middleware/requireAdminAuth.js'

const EMAIL = 'admin@test.local'
const PASSWORD = 'test-password'

function parseCookies(raw: string[] | string | undefined): string[] {
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

function findCookie(cookies: string[], name: string): string | undefined {
  return cookies.find((c) => c.startsWith(`${name}=`))
}

function extractValue(cookie: string | undefined, name: string): string | undefined {
  if (!cookie) return undefined
  const m = cookie.match(new RegExp(`${name}=([^;]+)`))
  return m ? m[1] : undefined
}

describe('Auth routes', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE admin_sessions, admin_users RESTART IDENTITY CASCADE')
    const repo = AppDataSource.getRepository(AdminUser)
    await repo.save(
      repo.create({
        email: EMAIL,
        passwordHash: await argon2.hash(PASSWORD),
        role: 'admin',
      }),
    )
  })

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials and sets session + csrf cookies', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ email: EMAIL, role: 'admin' })
      expect(res.body.data.id).toBeTruthy()

      const cookies = parseCookies(res.headers['set-cookie'])
      const session = findCookie(cookies, 'ximi4ka_shop_session')
      const csrf = findCookie(cookies, 'ximi4ka_shop_csrf')
      expect(session).toBeTruthy()
      expect(csrf).toBeTruthy()
      expect(session).toMatch(/HttpOnly/i)
      expect(csrf).not.toMatch(/HttpOnly/i)
      expect(session).toMatch(/SameSite=Lax/i)
      expect(csrf).toMatch(/SameSite=Lax/i)
    })

    it('rejects wrong password with 401 invalid_credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'nope' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('invalid_credentials')
    })

    it('rejects unknown email with 401 invalid_credentials (same code)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@test.local', password: PASSWORD })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('invalid_credentials')
      // Must NOT leak account existence — message must match the wrong-password
      // response byte-for-byte.
      const wrongPw = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'definitely-wrong' })
      expect(wrongPw.status).toBe(401)
      expect(res.body.error.message).toBe(wrongPw.body.error.message)
      expect(res.body.error.code).toBe(wrongPw.body.error.code)
    })

    it('rejects malformed body with 400 validation_error', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email' })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('validation_error')
    })

    it('runs argon2.verify on unknown-email path (timing parity)', async () => {
      const start = Date.now()
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nope@test.local', password: PASSWORD })
      const unknownMs = Date.now() - start

      const start2 = Date.now()
      await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'wrong-password' })
      const wrongPwMs = Date.now() - start2

      // Argon2 verify takes meaningful time; if the unknown-email path skipped
      // verify entirely it would be orders of magnitude faster.
      expect(unknownMs).toBeGreaterThan(20)
      // And they should be in the same ballpark — allow a wide ratio because
      // CI timing varies.
      const ratio = Math.max(unknownMs, wrongPwMs) / Math.max(1, Math.min(unknownMs, wrongPwMs))
      expect(ratio).toBeLessThan(10)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns 401 without cookie', async () => {
      const res = await request(app).get('/api/auth/me')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('auth_required')
    })

    it('returns user with valid session cookie', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      const cookies = parseCookies(login.headers['set-cookie'])
      const sessionCookie = findCookie(cookies, 'ximi4ka_shop_session')!

      const res = await request(app).get('/api/auth/me').set('Cookie', sessionCookie)
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ email: EMAIL, role: 'admin' })
    })

    it('returns 401 with invalid cookie value', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'ximi4ka_shop_session=not-a-real-token')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('auth_required')
    })

    it('returns 401 with expired session', async () => {
      // Insert a session row directly with past expiresAt.
      const userRepo = AppDataSource.getRepository(AdminUser)
      const user = await userRepo.findOneByOrFail({ email: EMAIL })
      const sessionRepo = AppDataSource.getRepository(AdminSession)
      const rawToken = 'expired-token-value'
      await sessionRepo.save(
        sessionRepo.create({
          tokenHash: hashSessionToken(rawToken),
          adminUserId: user.id,
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: null,
          createdIp: null,
          userAgent: null,
        }),
      )
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `ximi4ka_shop_session=${rawToken}`)
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('auth_required')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('revokes session and clears cookies', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      const cookies = parseCookies(login.headers['set-cookie'])
      const sessionCookie = findCookie(cookies, 'ximi4ka_shop_session')!
      const csrfCookie = findCookie(cookies, 'ximi4ka_shop_csrf')!
      const csrfToken = extractValue(csrfCookie, 'ximi4ka_shop_csrf')!
      const rawSessionToken = extractValue(sessionCookie, 'ximi4ka_shop_session')!

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `${sessionCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
      expect(logoutRes.status).toBe(200)

      // Confirm revokedAt was set in the DB.
      const sessionRepo = AppDataSource.getRepository(AdminSession)
      const stored = await sessionRepo.findOneByOrFail({
        tokenHash: hashSessionToken(rawSessionToken),
      })
      expect(stored.revokedAt).not.toBeNull()

      // Clear-cookie headers should be in the response.
      const clearCookies = parseCookies(logoutRes.headers['set-cookie'])
      expect(clearCookies.some((c) => c.startsWith('ximi4ka_shop_session='))).toBe(true)
      expect(clearCookies.some((c) => c.startsWith('ximi4ka_shop_csrf='))).toBe(true)
    })

    it('after logout, /me with same cookie returns 401', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      const cookies = parseCookies(login.headers['set-cookie'])
      const sessionCookie = findCookie(cookies, 'ximi4ka_shop_session')!
      const csrfCookie = findCookie(cookies, 'ximi4ka_shop_csrf')!
      const csrfToken = extractValue(csrfCookie, 'ximi4ka_shop_csrf')!

      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `${sessionCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)

      const me = await request(app).get('/api/auth/me').set('Cookie', sessionCookie)
      expect(me.status).toBe(401)
      expect(me.body.error.code).toBe('auth_required')
    })

    it('rejects logout without session with 401', async () => {
      const res = await request(app).post('/api/auth/logout')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('auth_required')
    })
  })

  describe('CSRF protection on admin routes', () => {
    it('rejects POST /api/admin/products without session → 401', async () => {
      const res = await request(app)
        .post('/api/admin/products')
        .send({ slug: 'x', name: 'X', priceRub: 100 })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('auth_required')
    })

    it('rejects POST /api/admin/products with session but no CSRF header → 403', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      const cookies = parseCookies(login.headers['set-cookie'])
      const sessionCookie = findCookie(cookies, 'ximi4ka_shop_session')!
      const csrfCookie = findCookie(cookies, 'ximi4ka_shop_csrf')!

      const res = await request(app)
        .post('/api/admin/products')
        .set('Cookie', `${sessionCookie}; ${csrfCookie}`)
        .send({ slug: 'x', name: 'X', priceRub: 100 })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('csrf_failed')
    })

    it('accepts POST /api/admin/products with session + matching CSRF header', async () => {
      // Clean products table first so the create won't collide.
      await AppDataSource.query(
        'TRUNCATE products, product_images, product_category_links RESTART IDENTITY CASCADE',
      )
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      const cookies = parseCookies(login.headers['set-cookie'])
      const sessionCookie = findCookie(cookies, 'ximi4ka_shop_session')!
      const csrfCookie = findCookie(cookies, 'ximi4ka_shop_csrf')!
      const csrfToken = extractValue(csrfCookie, 'ximi4ka_shop_csrf')!

      const res = await request(app)
        .post('/api/admin/products')
        .set('Cookie', `${sessionCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ slug: 'csrf-ok', name: 'C', priceRub: 100 })
      expect(res.status).toBe(201)
      expect(res.body.data.slug).toBe('csrf-ok')
    })

    it('rejects POST /api/admin/products with session + wrong CSRF header → 403', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
      const cookies = parseCookies(login.headers['set-cookie'])
      const sessionCookie = findCookie(cookies, 'ximi4ka_shop_session')!
      const csrfCookie = findCookie(cookies, 'ximi4ka_shop_csrf')!

      const res = await request(app)
        .post('/api/admin/products')
        .set('Cookie', `${sessionCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', 'not-the-real-token')
        .send({ slug: 'x', name: 'X', priceRub: 100 })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('csrf_failed')
    })
  })
})
