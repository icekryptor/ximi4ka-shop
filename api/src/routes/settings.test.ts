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
        yml_currency = 'RUB',
        yml_delivery_note = NULL,
        yandex_pay_enabled = false,
        yandex_pay_mode = 'sandbox',
        header_promo_text = NULL,
        trust_strip_items = '[]'::jsonb,
        testimonials = '[]'::jsonb
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
      headerPromoText: null,
      trustStripItems: [],
      testimonials: [],
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
        ymlCurrency: 'RUR',
        ymlDeliveryNote: 'Самовывоз бесплатно',
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
      ymlCurrency: 'RUR',
      ymlDeliveryNote: 'Самовывоз бесплатно',
    })

    // Persistence round-trip: re-GET to ensure the values actually landed.
    const reGet = await request(app)
      .get('/api/admin/settings')
      .set(authHeaders(auth))
    expect(reGet.body.data.metrikaId).toBe('12345678')
    expect(reGet.body.data.ymlCompany).toBe('Ximi4ka LLC')
    expect(reGet.body.data.ymlCurrency).toBe('RUR')
  })

  it('PATCH rejects an invalid ymlCurrency with 400 validation_error', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({ ymlCurrency: 'USD' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
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

  it('GET /api/public/settings exposes public analytics/SEO + YML shop metadata', async () => {
    // Seed the full public-visible settings surface plus an admin-only one
    // (yandexPayEnabled) to prove the payment toggle is still NOT leaked.
    await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({
        metrikaId: 'M-PUBLIC',
        ymlShopName: 'Ximi4ka',
        ymlCompany: 'Ximi4ka LLC',
        ymlUrl: 'https://ximi4ka.example.com',
        ymlCurrency: 'RUB',
        ymlDeliveryNote: 'Доставка по России — 3-7 дней',
        yandexPayEnabled: true,
      })
      .expect(200)

    const res = await request(app).get('/api/public/settings')
    expect(res.status).toBe(200)
    // Public fields present, including YML shop metadata — these describe
    // the shop externally and are the same data Yandex sees in the feed.
    expect(res.body.data).toMatchObject({
      metrikaId: 'M-PUBLIC',
      ga4Id: null,
      robotsTxt: expect.any(String),
      llmsTxt: expect.any(String),
      yandexWebmasterVerification: null,
      googleSiteVerification: null,
      ymlShopName: 'Ximi4ka',
      ymlCompany: 'Ximi4ka LLC',
      ymlUrl: 'https://ximi4ka.example.com',
      ymlCurrency: 'RUB',
      ymlDeliveryNote: 'Доставка по России — 3-7 дней',
    })
    // Payment toggle / mode stay admin-only; leaking them would change the
    // checkout UX conditionally based on config visible to every visitor.
    expect(res.body.data.yandexPayEnabled).toBeUndefined()
    expect(res.body.data.yandexPayMode).toBeUndefined()
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

  // --- Marketing fields (homepage redesign): header promo + trust strip + testimonials ---

  it('PATCH accepts headerPromoText + trustStripItems + testimonials and round-trips them', async () => {
    const patch = {
      headerPromoText: 'Бесплатная доставка от 3000 ₽',
      trustStripItems: [
        { icon: '🚚', label: 'Доставка по России' },
        { icon: '🔒', label: 'Безопасная оплата' },
      ],
      testimonials: [
        {
          quote: 'Сын в восторге, всё работает!',
          author: 'Анна',
          location: 'Москва',
          rating: 5,
        },
        {
          quote: 'Качественный набор, рекомендую',
          author: 'Иван',
          location: 'СПб',
        },
      ],
    }
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send(patch)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject(patch)

    // Round-trip via a fresh GET — proves the values landed in the row.
    const reGet = await request(app)
      .get('/api/admin/settings')
      .set(authHeaders(auth))
    expect(reGet.body.data.headerPromoText).toBe('Бесплатная доставка от 3000 ₽')
    expect(reGet.body.data.trustStripItems).toHaveLength(2)
    expect(reGet.body.data.testimonials).toHaveLength(2)
    expect(reGet.body.data.testimonials[0].rating).toBe(5)
    // Optional `rating` survives as undefined / missing for the 2nd entry.
    expect(reGet.body.data.testimonials[1].rating).toBeUndefined()
  })

  it('PATCH rejects trustStripItems missing label with 400 validation_error', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({ trustStripItems: [{ icon: '🚚' }] })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })

  it('PATCH rejects testimonials with rating > 5 with 400 validation_error', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({
        testimonials: [
          { quote: 'Great', author: 'A', location: 'Москва', rating: 6 },
        ],
      })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })

  it('GET /api/public/settings exposes the three marketing fields after PATCH', async () => {
    await request(app)
      .patch('/api/admin/settings')
      .set(authHeaders(auth))
      .send({
        headerPromoText: 'Промо-текст',
        trustStripItems: [{ icon: '⭐', label: 'Гарантия качества' }],
        testimonials: [
          {
            quote: 'Отличный набор',
            author: 'Мария',
            location: 'Казань',
            rating: 4,
          },
        ],
      })
      .expect(200)

    const res = await request(app).get('/api/public/settings')
    expect(res.status).toBe(200)
    expect(res.body.data.headerPromoText).toBe('Промо-текст')
    expect(res.body.data.trustStripItems).toEqual([
      { icon: '⭐', label: 'Гарантия качества' },
    ])
    expect(res.body.data.testimonials).toEqual([
      {
        quote: 'Отличный набор',
        author: 'Мария',
        location: 'Казань',
        rating: 4,
      },
    ])
  })

  it('GET /api/admin/settings returns the three marketing fields with default empty arrays / null', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data.headerPromoText).toBeNull()
    expect(res.body.data.trustStripItems).toEqual([])
    expect(res.body.data.testimonials).toEqual([])
  })
})
