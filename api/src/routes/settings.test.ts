import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'

// SiteSettings is a singleton — we never truncate it across tests (the
// migration seeds the row), but we DO reset it to default values between
// tests so assertions aren't order-dependent. TRUNCATE on admin sessions /
// users is still needed because loginAsAdmin recreates them each test.
describe('Site settings', () => {
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
      'TRUNCATE admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    // Reset the singleton so each test starts from defaults. We keep the row
    // rather than deleting it, to mirror production behaviour.
    await AppDataSource.query(`
      UPDATE site_settings SET
        metrika_id = NULL,
        ga4_id = NULL,
        robots_txt = 'User-agent: *\nAllow: /',
        llms_txt = '',
        yandex_webmaster_verification = NULL,
        google_site_verification = NULL,
        yml_shop_name = NULL,
        yml_company = NULL,
        yml_url = NULL,
        yandex_pay_enabled = false,
        yandex_pay_mode = 'sandbox'
      WHERE id = 'default'
    `)
    auth = await loginAsAdmin(app)
  })

  it('GET /api/admin/settings returns the singleton with defaults', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      id: 'default',
      metrikaId: null,
      ga4Id: null,
      robotsTxt: expect.stringContaining('User-agent'),
      llmsTxt: '',
      yandexPayEnabled: false,
      yandexPayMode: 'sandbox',
    })
  })

  it('PATCH /api/admin/settings updates values and returns the fresh row', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({
        metrikaId: '12345678',
        ga4Id: 'G-ABCDEF',
        robotsTxt: 'User-agent: *\nDisallow: /admin',
        llmsTxt: '# Ximi4ka\nChemistry kits for kids.',
        yandexWebmasterVerification: 'abc123',
        googleSiteVerification: 'def456',
        ymlShopName: 'Ximi4ka',
        ymlCompany: 'Ximi4ka LLC',
        ymlUrl: 'https://ximi4ka.example.com',
        yandexPayEnabled: true,
        yandexPayMode: 'production',
      })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      metrikaId: '12345678',
      ga4Id: 'G-ABCDEF',
      yandexPayEnabled: true,
      yandexPayMode: 'production',
      ymlUrl: 'https://ximi4ka.example.com',
    })

    // Persistence round-trip: re-GET to ensure the values actually landed.
    const reGet = await request(app)
      .get('/api/admin/settings')
      .set(authHeaders(auth))
    expect(reGet.body.data.metrikaId).toBe('12345678')
    expect(reGet.body.data.ymlCompany).toBe('Ximi4ka LLC')
  })

  it('PATCH rejects an invalid yandexPayMode with 400 validation_error', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({ yandexPayMode: 'live' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })

  it('PATCH rejects a malformed ymlUrl with 400 validation_error', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({ ymlUrl: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })

  it('GET /api/public/settings returns the public subset only', async () => {
    // Seed some admin-only fields to prove they're NOT leaked.
    await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({
        metrikaId: 'M-PUBLIC',
        ymlShopName: 'Ximi4ka-private',
        yandexPayEnabled: true,
      })
      .expect(200)

    const res = await request(app).get('/api/public/settings')
    expect(res.status).toBe(200)
    // Public fields present:
    expect(res.body.data).toMatchObject({
      metrikaId: 'M-PUBLIC',
      ga4Id: null,
      robotsTxt: expect.any(String),
      llmsTxt: expect.any(String),
      yandexWebmasterVerification: null,
      googleSiteVerification: null,
    })
    // Admin-only / payment / YML fields NOT present — important because this
    // endpoint is CDN-cacheable and would otherwise leak store-admin config
    // to every visitor.
    expect(res.body.data.yandexPayEnabled).toBeUndefined()
    expect(res.body.data.yandexPayMode).toBeUndefined()
    expect(res.body.data.ymlShopName).toBeUndefined()
    expect(res.body.data.ymlCompany).toBeUndefined()
    expect(res.body.data.ymlUrl).toBeUndefined()
  })

  it('GET /api/public/settings sets a 60s Cache-Control header', async () => {
    const res = await request(app).get('/api/public/settings')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=60')
  })

  it('GET /api/admin/settings requires authentication', async () => {
    const res = await request(app).get('/api/admin/settings')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('auth_required')
  })

  it('PATCH /api/admin/settings requires CSRF token', async () => {
    // Send the session cookie only — no CSRF header.
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', auth.sessionCookie)
      .send({ metrikaId: 'X' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('csrf_failed')
  })

  it('GET /api/public/settings/robots.txt returns plain text', async () => {
    await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({ robotsTxt: 'User-agent: *\nDisallow: /admin\nSitemap: /sitemap.xml' })
      .expect(200)

    const res = await request(app).get('/api/public/settings/robots.txt')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/plain/)
    // Body is the raw text (not JSON-wrapped) — crawlers expect this verbatim.
    expect(res.text).toBe(
      'User-agent: *\nDisallow: /admin\nSitemap: /sitemap.xml',
    )
  })

  it('GET /api/public/settings/llms.txt returns plain text (empty by default)', async () => {
    const res = await request(app).get('/api/public/settings/llms.txt')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/plain/)
    expect(res.text).toBe('')
  })
})
