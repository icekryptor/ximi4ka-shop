import { describe, it, expect } from 'vitest'
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
