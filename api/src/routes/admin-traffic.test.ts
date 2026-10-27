import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { TrafficSourcesResponse, TrafficStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, loginAsEditor, type AdminAuth } from './testUtils.js'

async function seedSource(day: string, source: string, visits: number, engine = '') {
  await AppDataSource.query(
    `INSERT INTO traffic_sources_daily (day, source, search_engine, visits, users, bounce_rate, page_depth)
     VALUES ($1, $2, $3, $4, $4, 10, 2)`,
    [day, source, engine, visits],
  )
}

describe('GET /api/admin/traffic', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth
  const savedEnv = { ...process.env }

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
    auth = await loginAsAdmin(app)
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE traffic_sources_daily, landing_pages_daily, search_stats_sync_runs',
    )
  })
  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('без сессии — 401, редактору — 403', async () => {
    expect((await request(app).get('/api/admin/traffic/status')).status).toBe(401)
    const editor = await loginAsEditor(app)
    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')
      .set(authHeaders(editor))
    expect(res.status).toBe(403)
    expect(res.body.data).toBeUndefined()
  })

  it('неверный период — 400', async () => {
    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-26&to=2026-10-20')
      .set(authHeaders(auth))
    expect(res.status).toBe(400)
  })

  it('пустые таблицы — нули и пустые списки, не ошибка', async () => {
    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    const data = res.body.data as TrafficSourcesResponse
    expect(data).toMatchObject({
      totalVisits: 0,
      prevTotalVisits: 0,
      sources: [],
      engines: [],
      weeks: [],
    })
    expect(data).toMatchObject({ prevFrom: '2026-10-13', prevTo: '2026-10-19' })
  })

  it('источники за период и прошлый период; разбивка поисковиков не входит в итог', async () => {
    await seedSource('2026-10-20', 'organic', 30)
    await seedSource('2026-10-20', 'organic', 20, 'yandex')
    await seedSource('2026-10-20', 'organic', 10, 'google')
    await seedSource('2026-10-21', 'direct', 15)
    await seedSource('2026-10-14', 'organic', 12)
    await seedSource('2026-10-14', 'organic', 12, 'yandex')
    await seedSource('2026-10-01', 'direct', 99)

    const res = await request(app)
      .get('/api/admin/traffic/sources?from=2026-10-20&to=2026-10-26')
      .set(authHeaders(auth))
    const data = res.body.data as TrafficSourcesResponse

    expect(data.totalVisits).toBe(45)
    expect(data.prevTotalVisits).toBe(12)
    expect(data.sources).toEqual([
      { source: 'organic', visits: 30, prevVisits: 12 },
      { source: 'direct', visits: 15, prevVisits: 0 },
    ])
    expect(data.engines).toEqual([
      { engine: 'yandex', visits: 20, prevVisits: 12 },
      { engine: 'google', visits: 10, prevVisits: 0 },
    ])
    expect(data.weeks).toEqual([
      { weekStart: '2026-10-19', visitsBySource: { organic: 30, direct: 15 } },
    ])
  })

  it('даты отдаются строками без сдвига пояса', async () => {
    await seedSource('2026-10-20', 'direct', 1)
    process.env.SEARCH_STATS_SYNC_ENABLED = 'true'
    process.env.YANDEX_STATS_OAUTH_TOKEN = 't'
    const res = await request(app).get('/api/admin/traffic/status').set(authHeaders(auth))
    const data = res.body.data as TrafficStatus
    expect(data).toMatchObject({
      configured: true,
      dataSince: '2026-10-20',
      dataUntil: '2026-10-20',
    })
    expect(data.runs.map((r) => r.source)).toEqual(['metrika', 'webmaster'])
  })

  it('статус без флага — configured false, ответ не содержит токена', async () => {
    process.env.YANDEX_STATS_OAUTH_TOKEN = 'y0_SECRET_IN_ENV'
    delete process.env.SEARCH_STATS_SYNC_ENABLED
    const res = await request(app).get('/api/admin/traffic/status').set(authHeaders(auth))
    expect(res.body.data).toMatchObject({ configured: false, dataSince: null, dataUntil: null })
    expect(JSON.stringify(res.body)).not.toContain('y0_SECRET_IN_ENV')
  })
})
