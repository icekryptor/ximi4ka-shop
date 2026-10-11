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
