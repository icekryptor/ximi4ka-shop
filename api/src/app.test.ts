import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const app = createApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe('CORS', () => {
  // Pin WEB_ORIGIN so the assertions hold regardless of the ambient dev .env
  // (local dev may point WEB_ORIGIN at a non-default port, e.g. :3020).
  let prevOrigin: string | undefined
  beforeEach(() => {
    prevOrigin = process.env.WEB_ORIGIN
    process.env.WEB_ORIGIN = 'http://localhost:3000'
  })
  afterEach(() => {
    if (prevOrigin === undefined) delete process.env.WEB_ORIGIN
    else process.env.WEB_ORIGIN = prevOrigin
  })

  it('allows the configured web origin with credentials', async () => {
    const app = createApp()
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('responds to CORS preflight with allowed methods', async () => {
    const app = createApp()
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })
})
