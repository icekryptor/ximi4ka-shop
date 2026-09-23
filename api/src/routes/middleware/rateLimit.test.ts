import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { rateLimit } from './rateLimit.js'

function appWith(limit: number, windowMs: number, now: () => number) {
  const app = express()
  app.use(rateLimit({ limit, windowMs, now }))
  app.get('/', (_req, res) => res.json({ ok: true }))
  return app
}

describe('rateLimit', () => {
  it('пропускает до лимита и отвечает 429 сверх него', async () => {
    const app = appWith(2, 60_000, () => 0)
    expect((await request(app).get('/')).status).toBe(200)
    expect((await request(app).get('/')).status).toBe(200)
    const blocked = await request(app).get('/')
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('rate_limited')
    expect(blocked.headers['retry-after']).toBe('60')
  })

  it('обнуляет счётчик в новом окне', async () => {
    let now = 0
    const app = appWith(1, 60_000, () => now)
    expect((await request(app).get('/')).status).toBe(200)
    expect((await request(app).get('/')).status).toBe(429)
    now = 60_001
    expect((await request(app).get('/')).status).toBe(200)
  })
})
