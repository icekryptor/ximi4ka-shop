import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CustomerEmailCode } from '../entities/CustomerEmailCode.js'
import { Order } from '../entities/Order.js'
import { MemoryMailer, setMailerForTests, type Mailer } from '../lib/mail/mailer.js'
import { issueEmailCode } from '../lib/account/emailCodes.js'
import { customerAuthFrom, resetAccountTables, seedOrder } from './testUtils.js'

const EMAIL = 'ivan@example.com'

describe('вход по email', () => {
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
    mailer = new MemoryMailer()
    setMailerForTests(mailer)
    app = createApp()
  })
  afterEach(() => setMailerForTests(null))

  const start = (email = EMAIL) =>
    request(app).post('/api/account/auth/email/start').send({ email })
  const verify = (code: string, email = EMAIL) =>
    request(app).post('/api/account/auth/email/verify').send({ email, code })

  it('код приходит на почту, вход создаёт покупателя и сессию', async () => {
    expect((await start(' Ivan@Example.com ')).status).toBe(204)
    const code = mailer.lastCodeFor(EMAIL)!
    expect(code).toMatch(/^\d{6}$/)
    // Тема письма не должна содержать код (final-fix-brief item 3) — он есть
    // только в теле, откуда его и читает lastCodeFor.
    const sent = mailer.sent.at(-1)!
    expect(sent.subject).toBe('Код для входа на ximi4ka.ru')
    expect(sent.subject).not.toContain(code)
    const res = await verify(code, 'IVAN@example.com')
    expect(res.status).toBe(200)
    customerAuthFrom(res.headers['set-cookie'])
    const c = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: EMAIL })
    expect(c.lastLoginAt).not.toBeNull()
  })

  it('повторный вход — тот же покупатель', async () => {
    await start()
    await verify(mailer.lastCodeFor(EMAIL)!)
    // Второй код раньше 60 с не дадут — выпускаем его в обход лимита.
    const issued = await issueEmailCode(EMAIL, new Date(Date.now() + 61_000))
    if (!issued.ok) throw new Error('не выпустился')
    await verify(issued.code)
    expect(await AppDataSource.getRepository(Customer).count()).toBe(1)
  })

  it('чаще раза в минуту — 429 с Retry-After', async () => {
    await start()
    const res = await start()
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('code_too_soon')
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('больше 5 писем в час — 429', async () => {
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) {
      const r = await issueEmailCode(EMAIL, new Date(t0 + i * 61_000))
      expect(r.ok).toBe(true)
    }
    const sixth = await issueEmailCode(EMAIL, new Date(t0 + 5 * 61_000))
    expect(sixth).toMatchObject({ ok: false, reason: 'hourly_limit' })
  })

  it('неверный код — оставшиеся попытки; после 5 ошибок верный уже не принимается', async () => {
    await start()
    const code = mailer.lastCodeFor(EMAIL)!
    const wrong = code === '000000' ? '111111' : '000000'
    const first = await verify(wrong)
    expect(first.status).toBe(400)
    expect(first.body.error).toMatchObject({ code: 'invalid_code', details: { attemptsLeft: 4 } })
    for (let i = 0; i < 4; i++) await verify(wrong)
    const late = await verify(code)
    expect(late.status).toBe(400)
    expect(late.body.error.code).toBe('code_expired')
  })

  it('истёкший и использованный код не работают', async () => {
    await start()
    const code = mailer.lastCodeFor(EMAIL)!
    expect((await verify(code)).status).toBe(200)
    expect((await verify(code)).body.error.code).toBe('code_expired')

    await AppDataSource.getRepository(CustomerEmailCode).clear()
    const issued = await issueEmailCode(EMAIL, new Date(Date.now() - 11 * 60_000))
    if (!issued.ok) throw new Error('не выпустился')
    expect((await verify(issued.code)).body.error.code).toBe('code_expired')
  })

  it('подтягивает старые заказы с тем же email, пустой email и чужие не трогает', async () => {
    const mine = await seedOrder({ customerEmail: 'Ivan@Example.com' })
    const guestEmpty = await seedOrder({ customerEmail: '' })
    const other = await seedOrder({ customerEmail: 'petr@example.com' })
    const alreadyOwned = AppDataSource.getRepository(Customer).create({ email: 'x@y.ru' })
    await AppDataSource.getRepository(Customer).save(alreadyOwned)
    const taken = await seedOrder({ customerEmail: EMAIL, customerId: alreadyOwned.id })

    await start()
    await verify(mailer.lastCodeFor(EMAIL)!)
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: EMAIL })
    const orders = AppDataSource.getRepository(Order)
    expect((await orders.findOneByOrFail({ id: mine.id })).customerId).toBe(me.id)
    expect((await orders.findOneByOrFail({ id: guestEmpty.id })).customerId).toBeNull()
    expect((await orders.findOneByOrFail({ id: other.id })).customerId).toBeNull()
    expect((await orders.findOneByOrFail({ id: taken.id })).customerId).toBe(alreadyOwned.id)
  })

  it('SMTP упал — 502, неудачный код не блокирует повторную отправку', async () => {
    // Ruling 1: этот путь логирует console.error — глушим и проверяем вызов.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken: Mailer = { send: async () => Promise.reject(new Error('ECONNREFUSED')) }
    setMailerForTests(broken)
    expect((await start()).status).toBe(502)
    expect(errorSpy).toHaveBeenCalled()
    setMailerForTests(mailer)
    expect((await start()).status).toBe(204)
    expect(mailer.lastCodeFor(EMAIL)).toMatch(/^\d{6}$/)
    errorSpy.mockRestore()
  })

  it('почта не настроена — 503', async () => {
    setMailerForTests(null)
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await start()
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('email_login_unavailable')
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('битый email — 400', async () => {
    expect((await start('not-an-email')).status).toBe(400)
  })
})
