import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, loginAsEditor } from './testUtils.js'

const PATH = '/api/admin/cloudpayments/checkout-preview'

const setCloud = (over: Partial<SiteSettings> = {}) =>
  AppDataSource.getRepository(SiteSettings).save({
    id: 'default',
    cloudpaymentsEnabled: true,
    cloudpaymentsMode: 'test',
    cloudpaymentsSurchargePercent: 8,
    ...over,
  })

describe('GET /api/admin/cloudpayments/checkout-preview', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', 'secret_test')
    await setCloud()
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await setCloud({
      cloudpaymentsEnabled: false,
      cloudpaymentsMode: 'test',
      cloudpaymentsSurchargePercent: 0,
    })
  })

  it('без сессии — 401', async () => {
    const res = await request(app).get(PATH)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('auth_required')
  })

  it('режим «Тест» на production — процент надбавки; ответ не кешируется публично', async () => {
    const auth = await loginAsAdmin(app)
    vi.stubEnv('NODE_ENV', 'production')
    const res = await request(app).get(PATH).set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: { surchargePercent: 8 } })
    expect(res.headers['cache-control'] ?? '').not.toMatch(/public/)
  })

  it('любая роль админки: редактору тоже', async () => {
    const auth = await loginAsEditor(app)
    const res = await request(app).get(PATH).set(authHeaders(auth))
    expect(res.body).toEqual({ data: { surchargePercent: 8 } })
  })

  it('режим «Боевой», рубильник выключен или нет ключей — null', async () => {
    const auth = await loginAsAdmin(app)
    await setCloud({ cloudpaymentsMode: 'live' })
    expect((await request(app).get(PATH).set(authHeaders(auth))).body).toEqual({ data: null })
    await setCloud({ cloudpaymentsEnabled: false })
    expect((await request(app).get(PATH).set(authHeaders(auth))).body).toEqual({ data: null })
    await setCloud()
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', '')
    expect((await request(app).get(PATH).set(authHeaders(auth))).body).toEqual({ data: null })
  })
})
