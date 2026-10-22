import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'

const VISITOR = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
const valid = {
  type: 'add_to_cart',
  visitorId: VISITOR,
  path: '/product/kit',
  meta: { product_id: 'p1', quantity: 2 },
}

async function rows(): Promise<Array<Record<string, unknown>>> {
  return AppDataSource.query(
    'SELECT type, visitor_id, path, meta FROM analytics_events ORDER BY occurred_at',
  )
}

describe('POST /api/public/events', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE analytics_events')
    app = createApp()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('сохраняет событие и отвечает 204', async () => {
    const res = await request(app).post('/api/public/events').send(valid)
    expect(res.status).toBe(204)
    expect(await rows()).toEqual([
      {
        type: 'add_to_cart',
        visitor_id: VISITOR,
        path: '/product/kit',
        meta: { product_id: 'p1', quantity: 2 },
      },
    ])
  })

  it('meta необязателен', async () => {
    const { meta: _meta, ...noMeta } = valid
    expect((await request(app).post('/api/public/events').send(noMeta)).status).toBe(204)
    expect((await rows())[0]).toMatchObject({ meta: null })
  })

  it('принимает полевую метрику web_vital с компактной meta', async () => {
    const meta = {
      name: 'INP',
      value: 312,
      rating: 'poor',
      navigationType: 'navigate',
      target: 'button.lj-btn.lj-btn-outline',
      type: 'pointerup',
      inputDelay: 48,
      processing: 190,
      presentation: 74,
      loadState: 'complete',
      scriptUrl: '/_next/static/chunks/app.js',
      scriptInvoker: 'BUTTON.onclick',
      scriptDuration: 176,
    }
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, type: 'web_vital', path: '/catalog', meta })
    expect(res.status).toBe(204)
    expect(await rows()).toEqual([
      { type: 'web_vital', visitor_id: VISITOR, path: '/catalog', meta },
    ])
  })

  it('чужой тип события — 400, ничего не пишется', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, type: 'purchase' })
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('visitorId не uuid — 400', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, visitorId: 'abc' })
    expect(res.status).toBe(400)
  })

  it('пустое тело — 400', async () => {
    expect((await request(app).post('/api/public/events').send({})).status).toBe(400)
  })

  it('meta не объект — 400', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, meta: 'text' })
    expect(res.status).toBe(400)
  })

  it('слишком большой meta — 400', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, meta: { blob: 'x'.repeat(2000) } })
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('длинный path обрезается до 300 символов', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, path: `/${'a'.repeat(1000)}` })
    expect(res.status).toBe(204)
    const [row] = await rows()
    expect((row.path as string).length).toBe(300)
  })

  it('NUL в path — 400, а не 500', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, path: '/a\u0000b' })
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('NUL в строке meta — 400, а не 500', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, meta: { note: 'a\u0000b' } })
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('одиночный суррогат в meta — 400, а не 500', async () => {
    // JSON.stringify даёт для одиночного суррогата escape \ud83d, который jsonb не принимает.
    const res = await request(app)
      .post('/api/public/events')
      .set('Content-Type', 'application/json')
      .send(
        '{"type":"add_to_cart","visitorId":"' +
          VISITOR +
          '","path":"/p","meta":{"note":"\\ud83d"}}',
      )
    expect(res.status).toBe(400)
    expect(await rows()).toHaveLength(0)
  })

  it('эмодзи в meta принимается и сохраняется', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, meta: { note: '🧪' } })
    expect(res.status).toBe(204)
    expect((await rows())[0]).toMatchObject({ meta: { note: '🧪' } })
  })

  it('обрезка path не рвёт суррогатную пару на границе', async () => {
    // 299 символов + эмодзи (2 code unit): slice(0, 300) оставил бы половину пары.
    const path = `/${'a'.repeat(298)}🧪${'b'.repeat(700)}`
    const res = await request(app)
      .post('/api/public/events')
      .send({ ...valid, path })
    expect(res.status).toBe(204)
    const stored = (await rows())[0].path as string
    expect(stored.length).toBeLessThanOrEqual(300)
    expect(stored).not.toMatch(/[\ud800-\udfff\ufffd]/)
    expect(stored).toBe(`/${'a'.repeat(298)}`)
  })

  it('бот по User-Agent: 204, но событие не пишется', async () => {
    const res = await request(app)
      .post('/api/public/events')
      .set('User-Agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
      .send(valid)
    expect(res.status).toBe(204)
    expect(await rows()).toHaveLength(0)
  })

  it('лимит частоты: после порога 429', async () => {
    vi.stubEnv('EVENTS_RATE_LIMIT', '2')
    const limited = createApp()
    expect((await request(limited).post('/api/public/events').send(valid)).status).toBe(204)
    expect((await request(limited).post('/api/public/events').send(valid)).status).toBe(204)
    const blocked = await request(limited).post('/api/public/events').send(valid)
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('rate_limited')
  })
})
