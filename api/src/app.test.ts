import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'
import { TelegramLoginBot, setLoginBotForTests } from './lib/telegram/loginBot.js'
import {
  markPollerStarted,
  markPollerOk,
  resetLoginPollerHealth,
} from './lib/telegram/loginPoller.js'

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const app = createApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe('здоровье бота входа', () => {
  const pollingBot = () =>
    new TelegramLoginBot({ token: 'T', username: 'ximi4ka_bot', polling: true })
  beforeEach(() => {
    setLoginBotForTests(pollingBot())
    resetLoginPollerHealth()
  })
  afterEach(() => {
    setLoginBotForTests(null)
    resetLoginPollerHealth()
  })

  it('/api/health/telegram: 200, пока опрос не запущен или свежий', async () => {
    const app = createApp()
    expect((await request(app).get('/api/health/telegram')).status).toBe(200)
    markPollerStarted()
    markPollerOk()
    const res = await request(app).get('/api/health/telegram')
    expect(res.status).toBe(200)
    expect(res.body.polling).toBe(true)
  })

  it('/api/health/telegram: 503, если удачных опросов нет дольше порога', async () => {
    markPollerStarted(Date.now() - 10 * 60_000)
    const res = await request(createApp()).get('/api/health/telegram')
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
  })

  it('/health остаётся 200 даже когда Telegram недоступен', async () => {
    markPollerStarted(Date.now() - 10 * 60_000)
    expect((await request(createApp()).get('/health')).status).toBe(200)
  })

  it('auth/config: бот на вебхуке (опрос не запущен) остаётся доступным', async () => {
    setLoginBotForTests(
      new TelegramLoginBot({ token: 'T', username: 'ximi4ka_bot', webhookSecret: 's' }),
    )
    const res = await request(createApp()).get('/api/account/auth/config')
    expect(res.body.data.telegram).toBe(true)
  })

  it('auth/config: Telegram скрыт, пока опрос не работает, и возвращается, когда ожил', async () => {
    const app = createApp()
    markPollerStarted(Date.now() - 10 * 60_000)
    const down = await request(app).get('/api/account/auth/config')
    expect(down.body.data.telegram).toBe(false)
    expect(down.body.data.telegramBot).toBeNull()
    markPollerOk()
    const up = await request(app).get('/api/account/auth/config')
    expect(up.body.data.telegram).toBe(true)
    expect(up.body.data.telegramBot).toBe('ximi4ka_bot')
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
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000')
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
