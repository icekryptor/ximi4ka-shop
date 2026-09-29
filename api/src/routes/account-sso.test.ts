import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { SsoAuthCode } from '../entities/SsoAuthCode.js'
import { mergeCustomers } from '../lib/account/customers.js'
import { getSsoClient, issueSsoCode, setSsoClientsForTests } from '../lib/account/sso.js'
import { loginAsCustomer, resetAccountTables } from './testUtils.js'

const SECRET = 'learn-secret-0123456789abcdef0123456789'
const CALLBACK = 'https://learn.ximi4ka.ru/api/auth/ximi4ka/callback'
const STATE = 'state_0123456789abcdef'

function authorizeUrl(overrides: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    client_id: 'learn',
    redirect_uri: CALLBACK,
    state: STATE,
    ...overrides,
  })
  return `/api/account/sso/authorize?${q.toString()}`
}

function token(body: Record<string, string>) {
  return {
    client_id: 'learn',
    client_secret: SECRET,
    redirect_uri: CALLBACK,
    ...body,
  }
}

describe('ximi4ka ID (SSO для learn)', () => {
  let app: ReturnType<typeof createApp>
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    setSsoClientsForTests([
      { id: 'learn', secret: SECRET, redirectUris: [CALLBACK] },
      { id: 'other', secret: `${SECRET}-other`, redirectUris: [CALLBACK] },
    ])
    app = createApp()
  })
  afterEach(() => {
    setSsoClientsForTests(null)
  })

  it('authorize: чужой клиент, чужой адрес возврата или кривой state — 400 без редиректа', async () => {
    for (const url of [
      authorizeUrl({ client_id: 'unknown' }),
      authorizeUrl({ redirect_uri: 'https://evil.example/cb' }),
      authorizeUrl({ redirect_uri: `${CALLBACK}/../../evil` }),
      authorizeUrl({ state: 'short' }),
    ]) {
      const res = await request(app).get(url)
      expect(res.status).toBe(400)
      expect(res.headers.location).toBeUndefined()
    }
  })

  it('authorize без сессии — на страницу входа магазина с возвратом сюда же', async () => {
    const res = await request(app).get(authorizeUrl())
    expect(res.status).toBe(302)
    const location = new URL(res.headers.location, 'https://new.ximi4ka.ru')
    expect(location.pathname).toBe('/account/login')
    expect(location.searchParams.get('next')).toBe(authorizeUrl())
  })

  it('вошёл — код в адресе возврата, обмен отдаёт покупателя, повторный обмен — 400', async () => {
    const auth = await loginAsCustomer(app, 'buyer@test.local')
    const res = await request(app).get(authorizeUrl()).set('Cookie', auth.cookie)
    expect(res.status).toBe(302)
    expect(res.headers['cache-control']).toBe('no-store')
    const location = new URL(res.headers.location)
    expect(`${location.origin}${location.pathname}`).toBe(CALLBACK)
    expect(location.searchParams.get('state')).toBe(STATE)
    const code = location.searchParams.get('code')!
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const exchange = await request(app).post('/api/account/sso/token').send(token({ code }))
    expect(exchange.status).toBe(200)
    const customer = await AppDataSource.getRepository(Customer).findOneByOrFail({
      email: 'buyer@test.local',
    })
    expect(exchange.body.data).toEqual({
      customer: {
        id: customer.id,
        email: 'buyer@test.local',
        telegramId: null,
        telegramUsername: null,
        name: null,
      },
      formerIds: [],
    })

    const again = await request(app).post('/api/account/sso/token').send(token({ code }))
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('invalid_grant')
  })

  it('token: неверный секрет — 401, код не сгорает', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const code = await issueSsoCode('learn', CALLBACK, c.id)
    const bad = await request(app)
      .post('/api/account/sso/token')
      .send(token({ code, client_secret: 'wrong' }))
    expect(bad.status).toBe(401)
    expect(bad.body.error.code).toBe('invalid_client')
    const ok = await request(app).post('/api/account/sso/token').send(token({ code }))
    expect(ok.status).toBe(200)
  })

  it('token: код другого клиента, другой адрес возврата или истёкший — invalid_grant', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const forOther = await issueSsoCode('other', CALLBACK, c.id)
    const r1 = await request(app)
      .post('/api/account/sso/token')
      .send(token({ code: forOther }))
    expect(r1.status).toBe(400)

    const code = await issueSsoCode('learn', CALLBACK, c.id)
    const r2 = await request(app)
      .post('/api/account/sso/token')
      .send(token({ code, redirect_uri: `${CALLBACK}?x=1` }))
    expect(r2.status).toBe(400)

    const expired = await issueSsoCode('learn', CALLBACK, c.id, new Date(Date.now() - 120_000))
    const r3 = await request(app)
      .post('/api/account/sso/token')
      .send(token({ code: expired }))
    expect(r3.status).toBe(400)
    expect(r3.body.error.code).toBe('invalid_grant')
  })

  it('в базе только хэш кода', async () => {
    const c = await AppDataSource.getRepository(Customer).save({ email: 'a@b.ru' })
    const code = await issueSsoCode('learn', CALLBACK, c.id)
    const row = await AppDataSource.getRepository(SsoAuthCode).findOneByOrFail({
      customerId: c.id,
    })
    expect(row.codeHash).not.toBe(code)
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('после слияний обмен отдаёт прежние id — цепочка не рвётся', async () => {
    const repo = AppDataSource.getRepository(Customer)
    const a = await repo.save({ telegramId: 111 })
    const b = await repo.save({ email: 'b@b.ru' })
    const c = await repo.save({ email: 'c@c.ru' })
    await AppDataSource.transaction((em) => mergeCustomers(em, b.id, c.id))
    await AppDataSource.transaction((em) => mergeCustomers(em, a.id, b.id))

    const code = await issueSsoCode('learn', CALLBACK, a.id)
    const res = await request(app).post('/api/account/sso/token').send(token({ code }))
    expect(res.status).toBe(200)
    expect(res.body.data.customer.id).toBe(a.id)
    expect(res.body.data.customer.email).toBe('b@b.ru')
    expect([...res.body.data.formerIds].sort()).toEqual([b.id, c.id].sort())
  })

  it('клиенты из окружения: короткий секрет или пустой список адресов — клиент выключен', () => {
    setSsoClientsForTests(null)
    const saved = { ...process.env }
    try {
      process.env.SSO_LEARN_CLIENT_SECRET = 'short'
      process.env.SSO_LEARN_REDIRECT_URIS = CALLBACK
      expect(getSsoClient('learn')).toBeNull()

      process.env.SSO_LEARN_CLIENT_SECRET = SECRET
      process.env.SSO_LEARN_REDIRECT_URIS = ' '
      expect(getSsoClient('learn')).toBeNull()

      process.env.SSO_LEARN_REDIRECT_URIS = `${CALLBACK}, http://localhost:3000/api/auth/ximi4ka/callback`
      expect(getSsoClient('learn')).toEqual({
        id: 'learn',
        secret: SECRET,
        redirectUris: [CALLBACK, 'http://localhost:3000/api/auth/ximi4ka/callback'],
      })
      // Незнакомый код клиенту не даёт хода, даже если в окружении что-то есть.
      process.env.SSO_EVIL_CLIENT_SECRET = SECRET
      process.env.SSO_EVIL_REDIRECT_URIS = CALLBACK
      expect(getSsoClient('evil')).toBeNull()
    } finally {
      process.env = saved
    }
  })
})
