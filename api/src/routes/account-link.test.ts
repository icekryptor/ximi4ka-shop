import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { CustomerSession } from '../entities/CustomerSession.js'
import { Order } from '../entities/Order.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'
import { issueEmailCode } from '../lib/account/emailCodes.js'
import { TelegramLoginBot, setLoginBotForTests } from '../lib/telegram/loginBot.js'
import {
  customerHeaders,
  loginAsCustomer,
  resetAccountTables,
  seedOrder,
  type CustomerAuth,
} from './testUtils.js'

describe('привязка способов входа', () => {
  let app: ReturnType<typeof createApp>
  let mailer: MemoryMailer
  const sent: Array<Record<string, unknown>> = []

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    mailer = new MemoryMailer()
    sent.length = 0
    setLoginBotForTests(
      new TelegramLoginBot({
        token: 'T',
        username: 'ximi4ka_bot',
        webhookSecret: 'S',
        fetch: async (_u, init) => {
          sent.push(JSON.parse(String(init?.body)))
          return new Response('{"ok":true,"result":true}', { status: 200 })
        },
      }),
    )
    app = createApp()
  })
  afterEach(() => {
    setMailerForTests(null)
    setLoginBotForTests(null)
  })

  const hook = (body: unknown) =>
    request(app)
      .post('/api/telegram/login-webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'S')
      .send(body)

  // Начинает привязку Telegram, проходит «Старт» и «Привязать» от пользователя 9.
  // Возвращает cookie опроса — её браузер шлёт вместе с cookie сессии.
  async function confirmTelegramLink(auth: CustomerAuth): Promise<string> {
    const start = await request(app)
      .post('/api/account/link/telegram/start')
      .set(customerHeaders(auth))
    expect(start.status).toBe(200)
    const nonce = new URL(start.body.data.deepLink).searchParams.get('start')!
    const poll = ([] as string[])
      .concat(start.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('ximi4ka_customer_tg_poll='))!
      .split(';')[0]
    await hook({
      message: {
        message_id: 1,
        chat: { id: 9, type: 'private' },
        from: { id: 9, username: 'me_tg' },
        text: `/start ${nonce}`,
      },
    })
    const markup = sent.at(-1)!.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
    }
    expect(markup.inline_keyboard[0][0].text).toBe('Привязать')
    await hook({
      callback_query: {
        id: 'c',
        from: { id: 9, username: 'me_tg' },
        data: markup.inline_keyboard[0][0].callback_data,
      },
    })
    return poll
  }

  it('смена email через код: email записан, заказы на новый адрес подтянуты', async () => {
    const order = await seedOrder({ customerEmail: 'new@b.ru' })
    const auth = await loginAsCustomer(app, 'old@b.ru', mailer)
    await request(app)
      .post('/api/account/link/email/start')
      .set(customerHeaders(auth))
      .send({ email: 'new@b.ru' })
      .expect(204)
    await request(app)
      .post('/api/account/link/email/verify')
      .set(customerHeaders(auth))
      .send({ email: 'new@b.ru', code: mailer.lastCodeFor('new@b.ru') })
      .expect(200)
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'new@b.ru' })
    expect(await AppDataSource.getRepository(Customer).count()).toBe(1)
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })).customerId,
    ).toBe(me.id)
  })

  it('email другого аккаунта — слияние: заказы переезжают, второй удалён, его сессии мертвы', async () => {
    const otherAuth = await loginAsCustomer(app, 'other@b.ru', mailer)
    const repo = AppDataSource.getRepository(Customer)
    const other = await repo.findOneByOrFail({ email: 'other@b.ru' })
    await repo.update({ id: other.id }, { telegramId: 77, phone: '+7900' })
    const otherOrder = await seedOrder({ customerId: other.id })

    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const me = await repo.findOneByOrFail({ email: 'me@b.ru' })
    // На other@b.ru код выдавался меньше минуты назад — /link/email/start
    // ответил бы 429. Выпускаем код напрямую «через минуту».
    const issued = await issueEmailCode('other@b.ru', new Date(Date.now() + 61_000))
    if (!issued.ok) throw new Error('код не выпустился')
    await request(app)
      .post('/api/account/link/email/verify')
      .set(customerHeaders(auth))
      .send({ email: 'other@b.ru', code: issued.code })
      .expect(200)

    expect(await repo.findOneBy({ id: other.id })).toBeNull()
    const merged = await repo.findOneByOrFail({ id: me.id })
    expect(merged.email).toBe('other@b.ru')
    expect(merged.telegramId).toBe(77)
    expect(merged.phone).toBe('+7900')
    expect(
      (await AppDataSource.getRepository(Order).findOneByOrFail({ id: otherOrder.id })).customerId,
    ).toBe(me.id)
    expect(
      await AppDataSource.getRepository(CustomerSession).countBy({ customerId: other.id }),
    ).toBe(0)
    const dead = await request(app).post('/api/account/auth/logout').set(customerHeaders(otherAuth))
    expect(dead.status).toBe(401)
  })

  it('привязка Telegram: опрос из той же сессии — ok, telegram_id у текущего', async () => {
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const poll = await confirmTelegramLink(auth)
    const status = await request(app)
      .get('/api/account/auth/telegram/status')
      .set('Cookie', `${auth.cookie}; ${poll}`)
    expect(status.body.data.status).toBe('ok')
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'me@b.ru' })
    expect(me.telegramId).toBe(9)
    expect(me.telegramUsername).toBe('me_tg')
  })

  it('Telegram уже у другого аккаунта — слияние', async () => {
    const tgOnly = await AppDataSource.getRepository(Customer).save({ telegramId: 9, name: 'Иван' })
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const poll = await confirmTelegramLink(auth)
    await request(app)
      .get('/api/account/auth/telegram/status')
      .set('Cookie', `${auth.cookie}; ${poll}`)
      .expect(200)
    const repo = AppDataSource.getRepository(Customer)
    expect(await repo.findOneBy({ id: tgOnly.id })).toBeNull()
    const me = await repo.findOneByOrFail({ email: 'me@b.ru' })
    expect(me).toMatchObject({ telegramId: 9, name: 'Иван' })
  })

  it('опрос привязки без сессии (или из чужой) не привязывает', async () => {
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const poll = await confirmTelegramLink(auth)
    const status = await request(app).get('/api/account/auth/telegram/status').set('Cookie', poll)
    expect(status.body.data.status).toBe('expired')
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'me@b.ru' })
    expect(me.telegramId).toBeNull()
  })

  it('отвязать единственный способ входа нельзя — 409; второй можно', async () => {
    const auth = await loginAsCustomer(app, 'me@b.ru', mailer)
    const r1 = await request(app).post('/api/account/email/unlink').set(customerHeaders(auth))
    expect(r1.status).toBe(409)
    expect(r1.body.error.code).toBe('last_login_method')
    await AppDataSource.getRepository(Customer).update({ email: 'me@b.ru' }, { telegramId: 1 })
    const r2 = await request(app).post('/api/account/telegram/unlink').set(customerHeaders(auth))
    expect(r2.status).toBe(204)
    const me = await AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'me@b.ru' })
    expect(me.telegramId).toBeNull()
  })

  it('привязка без сессии — 401', async () => {
    const res = await request(app).post('/api/account/link/email/start').send({ email: 'a@b.ru' })
    expect(res.status).toBe(401)
  })
})
