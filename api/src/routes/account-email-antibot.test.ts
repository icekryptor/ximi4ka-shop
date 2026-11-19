import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import {
  MemoryMailer,
  resetMailHealthForTests,
  setMailerForTests,
  type Mailer,
} from '../lib/mail/mailer.js'
import { createLoginChallenge } from '../lib/account/altcha.js'
import { altchaFor, resetAccountTables } from './testUtils.js'

// Защита входа по коду от ботов (17.11.2026): с 29.10 скрипты подставляли в форму
// чужие адреса, жертвы жаловались на спам, и Яндекс отключил ящику SMTP. Письмо с
// кодом теперь уходит только после решённой в браузере задачи ALTCHA, а сверху
// стоит общий потолок писем в час.
describe('вход по email: защита от ботов', () => {
  let app: ReturnType<typeof createApp>
  let mailer: MemoryMailer
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    resetMailHealthForTests()
    mailer = new MemoryMailer()
    setMailerForTests(mailer)
    app = createApp()
  })
  afterEach(() => {
    setMailerForTests(null)
    resetMailHealthForTests()
    vi.unstubAllEnvs()
  })

  const start = (body: Record<string, unknown>) =>
    request(app).post('/api/account/auth/email/start').send(body)
  const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64')

  it('отдаёт подписанную задачу, которую нельзя кешировать', async () => {
    const res = await request(app).get('/api/account/auth/email/challenge')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toContain('no-store')
    expect(res.body.data.parameters.algorithm).toBe('PBKDF2/SHA-256')
    expect(res.body.data.parameters.expiresAt).toBeGreaterThan(Date.now() / 1000)
    expect(typeof res.body.data.signature).toBe('string')
  })

  it('без решения задачи письмо не уходит', async () => {
    const res = await start({ email: 'victim@example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('captcha_required')
    expect(mailer.sent).toHaveLength(0)
  })

  it('мусор вместо решения — отказ', async () => {
    const res = await start({ email: 'victim@example.com', altcha: 'not-base64-json' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('captcha_failed')
    expect(mailer.sent).toHaveLength(0)
  })

  it('неверное решение подписанной задачи — отказ', async () => {
    const { body } = await request(app).get('/api/account/auth/email/challenge')
    const altcha = encode({
      challenge: body.data,
      solution: { counter: 1, derivedKey: '00'.repeat(32) },
    })
    const res = await start({ email: 'victim@example.com', altcha })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('captcha_failed')
  })

  it('решённая задача — код уходит', async () => {
    const res = await start({ email: 'ivan@example.com', altcha: await altchaFor(app) })
    expect(res.status).toBe(204)
    expect(mailer.lastCodeFor('ivan@example.com')).toMatch(/^\d{6}$/)
  })

  it('одно решение нельзя использовать дважды', async () => {
    const altcha = await altchaFor(app)
    expect((await start({ email: 'a@example.com', altcha })).status).toBe(204)
    const again = await start({ email: 'b@example.com', altcha })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('captcha_failed')
    expect(mailer.lastCodeFor('b@example.com')).toBeNull()
  })

  it('просроченная задача не принимается', async () => {
    const old = await createLoginChallenge(new Date(Date.now() - 11 * 60_000))
    const { solveChallenge } = await import('altcha-lib')
    const { deriveKey } = await import('altcha-lib/algorithms/pbkdf2')
    const solution = await solveChallenge({ challenge: old, deriveKey })
    const res = await start({
      email: 'late@example.com',
      altcha: encode({ challenge: old, solution }),
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('captcha_failed')
  })

  it('общий потолок писем в час: сверх него — 429 и запись в лог', async () => {
    vi.stubEnv('EMAIL_CODES_GLOBAL_PER_HOUR', '2')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const email of ['a@example.com', 'b@example.com']) {
        expect((await start({ email, altcha: await altchaFor(app) })).status).toBe(204)
      }
      const third = await start({ email: 'c@example.com', altcha: await altchaFor(app) })
      expect(third.status).toBe(429)
      expect(third.body.error.code).toBe('email_login_busy')
      expect(mailer.lastCodeFor('c@example.com')).toBeNull()
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('с одного IP — не больше 10 запросов кода в час', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await start({ email: `x${i}@example.com` })).status).toBe(400)
    }
    const res = await start({ email: 'x10@example.com', altcha: await altchaFor(app) })
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('rate_limited')
  })

  it('SMTP отказал во входе — форма прячет вход по почте, удачная отправка возвращает', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const authError = Object.assign(new Error('Invalid login: 525 5.7.13 Error: SMTP disabled'), {
        code: 'EAUTH',
      })
      const broken: Mailer = { send: async () => Promise.reject(authError) }
      setMailerForTests(broken)
      expect((await start({ email: 'a@example.com', altcha: await altchaFor(app) })).status).toBe(
        502,
      )
      const cfg = await request(app).get('/api/account/auth/config')
      expect(cfg.body.data.email).toBe(false)

      setMailerForTests(mailer)
      expect((await start({ email: 'a@example.com', altcha: await altchaFor(app) })).status).toBe(
        204,
      )
      expect((await request(app).get('/api/account/auth/config')).body.data.email).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('отказ по конкретному адресу (EENVELOPE) почту целиком не выключает', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const rcptError = Object.assign(new Error('550 mailbox unavailable'), { code: 'EENVELOPE' })
      setMailerForTests({ send: async () => Promise.reject(rcptError) })
      expect(
        (await start({ email: 'nobody@example.com', altcha: await altchaFor(app) })).status,
      ).toBe(502)
      expect((await request(app).get('/api/account/auth/config')).body.data.email).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
