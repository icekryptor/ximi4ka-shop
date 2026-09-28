import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CustomerSession } from '../entities/CustomerSession.js'
import { hashSessionToken } from './middleware/requireAdminAuth.js'
import { resetAccountTables } from './testUtils.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'

async function sessionFor(customerId: string, overrides: Partial<CustomerSession> = {}) {
  const raw = `tok-${Math.random()}`
  const repo = AppDataSource.getRepository(CustomerSession)
  await repo.save(
    repo.create({
      tokenHash: hashSessionToken(raw),
      customerId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      ...overrides,
    }),
  )
  return `ximi4ka_customer_session=${raw}; ximi4ka_customer_csrf=csrf1`
}

describe('сессия покупателя', () => {
  let app: ReturnType<typeof createApp>
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  it('GET /auth/config: почта вне прода включена, бот без токена выключен', async () => {
    setMailerForTests(new MemoryMailer())
    const res = await request(app).get('/api/account/auth/config')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ email: true, telegram: false, telegramBot: null })
  })

  it('logout без сессии — 401', async () => {
    const res = await request(app).post('/api/account/auth/logout')
    expect(res.status).toBe(401)
  })

  it('logout без CSRF — 403', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const cookie = await sessionFor(c.id)
    const res = await request(app).post('/api/account/auth/logout').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('logout отзывает сессию и чистит cookie', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const cookie = await sessionFor(c.id)
    const res = await request(app)
      .post('/api/account/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', 'csrf1')
    expect(res.status).toBe(204)
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(setCookie.some((v) => v.startsWith('ximi4ka_customer_session=;'))).toBe(true)
    const s = await AppDataSource.getRepository(CustomerSession).findOneByOrFail({
      customerId: c.id,
    })
    expect(s.revokedAt).not.toBeNull()
  })

  it('истёкшая и отозванная сессии не работают, админская cookie — тоже', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const expired = await sessionFor(c.id, { expiresAt: new Date(Date.now() - 1000) })
    const revoked = await sessionFor(c.id, { revokedAt: new Date() })
    for (const cookie of [expired, revoked, 'ximi4ka_shop_session=whatever']) {
      const res = await request(app)
        .post('/api/account/auth/logout')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'csrf1')
      expect(res.status).toBe(401)
    }
  })
})
